// backend/scripts/migrate-publishing-info.js
const mongoose = require('mongoose');
require('dotenv').config();

async function migratePublishingInfo() {
  try {
    console.log('🔄 Starting publishing info migration...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    const db = mongoose.connection.db;
    const contentsCollection = db.collection('contents');
    const sitesCollection = db.collection('sites');

    // Find all published content without publishedAt
    const publishedContent = await contentsCollection.find({
      status: 'published',
      publishedAt: { $exists: false }
    }).toArray();

    console.log(`📊 Found ${publishedContent.length} articles to migrate`);

    if (publishedContent.length === 0) {
      console.log('✅ No articles need migration!');
      await mongoose.disconnect();
      process.exit(0);
    }

    let migrated = 0;
    for (const content of publishedContent) {
      const updateData = {
        publishedAt: content.publishDate || new Date()
      };
      
      // Try to get site name if siteId exists
      if (content.siteId) {
        const site = await sitesCollection.findOne({ _id: content.siteId });
        updateData.wordpressSite = site?.name || 'Unknown Site';
      } else {
        updateData.wordpressSite = 'Unknown Site';
      }
      
      await contentsCollection.updateOne(
        { _id: content._id },
        { $set: updateData }
      );
      
      migrated++;
      
      if (migrated % 10 === 0) {
        console.log(`⏳ Migrated ${migrated}/${publishedContent.length}...`);
      }
    }

    console.log(`✅ Successfully migrated ${migrated} articles`);
    console.log('✅ Migration complete!');

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
    process.exit(0);
  }
}

migratePublishingInfo();