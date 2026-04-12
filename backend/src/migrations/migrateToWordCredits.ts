// backend/src/migrations/migrateToWordCredits.ts - Database Migration Script
import mongoose from 'mongoose';
import User from '../models/user.model';
import WordPackage from '../models/wordPackage.model';
import { seedWordPackages } from '../seeders/wordPackages.seeder';
import logger from '../config/logger';

interface MigrationStats {
  usersProcessed: number;
  usersUpdated: number;
  packagesCreated: number;
  errors: string[];
}

export const migrateToWordCredits = async (): Promise<MigrationStats> => {
  const stats: MigrationStats = {
    usersProcessed: 0,
    usersUpdated: 0,
    packagesCreated: 0,
    errors: []
  };

  try {
    logger.info('Starting migration to word-based billing system...');

    // Step 1: Seed word packages
    logger.info('Step 1: Creating word packages...');
    await seedWordPackages();
    const packageCount = await WordPackage.countDocuments({ isActive: true });
    stats.packagesCreated = packageCount;
    logger.info(`Created ${packageCount} word packages`);

    // Step 2: Migrate existing users
    logger.info('Step 2: Migrating existing users to word credits...');
    
    const batchSize = 100;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const users = await User.find({})
        .select('credits wordCredits totalWordsUsed currentMonthUsage')
        .skip(skip)
        .limit(batchSize);

      if (users.length === 0) {
        hasMore = false;
        break;
      }

      const updatePromises = users.map(async (user) => {
        try {
          stats.usersProcessed++;

          // Only update users who don't already have word credits
          if (user.wordCredits === undefined || user.wordCredits === 0) {
            // Convert legacy credits to word credits (1 credit = 1500 words average)
            const legacyCredits = user.credits || 0;
            const convertedWordCredits = legacyCredits * 1500;
            
            // Set minimum free credits for existing users
            const finalWordCredits = Math.max(convertedWordCredits, 5000);

            // Update user with new word-based billing fields
            await User.findByIdAndUpdate(user._id, {
              wordCredits: finalWordCredits,
              totalWordsUsed: user.totalWordsUsed || 0,
              currentMonthUsage: user.currentMonthUsage || 0,
              wordUsageHistory: user.wordUsageHistory || [],
              wordPackagePurchases: user.wordPackagePurchases || []
            });

            stats.usersUpdated++;
            
            if (stats.usersUpdated % 50 === 0) {
              logger.info(`Migrated ${stats.usersUpdated} users...`);
            }
          }
        } catch (error: any) {
          stats.errors.push(`User ${user._id}: ${error.message}`);
          logger.error(`Error migrating user ${user._id}:`, error);
        }
      });

      await Promise.all(updatePromises);
      skip += batchSize;
    }

    // Step 3: Update database indexes
    logger.info('Step 3: Updating database indexes...');
    await User.collection.createIndex({ wordCredits: 1 });
    await User.collection.createIndex({ totalWordsUsed: 1 });
    await WordPackage.collection.createIndex({ packageId: 1 }, { unique: true });

    logger.info('Migration completed successfully!');
    logger.info(`Final stats: ${stats.usersProcessed} processed, ${stats.usersUpdated} updated, ${stats.packagesCreated} packages created`);
    
    if (stats.errors.length > 0) {
      logger.warn(`Migration completed with ${stats.errors.length} errors`);
    }

    return stats;

  } catch (error: any) {
    logger.error('Migration failed:', error);
    stats.errors.push(`Migration failed: ${error.message}`);
    throw error;
  }
};

// Rollback function (if needed)
export const rollbackWordCreditsMigration = async (): Promise<void> => {
  try {
    logger.info('Rolling back word credits migration...');

    // Remove word packages
    await WordPackage.deleteMany({});
    logger.info('Removed word packages');

    // Reset word credit fields for users (optional - keep data for safety)
    const result = await User.updateMany(
      {},
      {
        $unset: {
          wordUsageHistory: '',
          wordPackagePurchases: ''
        }
      }
    );

    logger.info(`Rollback completed. Updated ${result.modifiedCount} users`);
  } catch (error: any) {
    logger.error('Rollback failed:', error);
    throw error;
  }
};

// CLI script to run migration
export const runMigration = async (): Promise<void> => {
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/contentai_pro');
      logger.info('Connected to database for migration');
    }

    const stats = await migrateToWordCredits();
    
    console.log('\n=== Migration Results ===');
    console.log(`Users processed: ${stats.usersProcessed}`);
    console.log(`Users updated: ${stats.usersUpdated}`);
    console.log(`Word packages created: ${stats.packagesCreated}`);
    console.log(`Errors: ${stats.errors.length}`);
    
    if (stats.errors.length > 0) {
      console.log('\nErrors encountered:');
      stats.errors.forEach(error => console.log(`- ${error}`));
    }

    console.log('\nMigration completed successfully!');
    
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}