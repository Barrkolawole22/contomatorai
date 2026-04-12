import mongoose from 'mongoose';
import { env } from '../config/env';
import { seedWordPackages } from '../seeders/wordPackages.seeder';

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    console.log('Starting seeder...');
    await seedWordPackages();
    
    console.log('✅ Seeding completed successfully');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

run();