// backend/src/scripts/migrate-publishing-info.js
const mongoose = require('mongoose');
const Content = require('../models/content.model').default;
const Site = require('../models/site.model').default;
require('dotenv').config();

async function migratePublishingInfo() {
  try {
    console.log('🔄 Starting publishing info migration...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // Find all published content without publishedAt
    const publishedContent = await Content.find({
      status: 'published',
      publishedAt: { $exists: false }
    }).populate('siteId');

    console.log(`📊 Found ${publishedContent.length} articles to migrate`);

    let migrated = 0;
    for (const content of publishedContent) {
      // Set publishedAt from publishDate or use current date
      content.publishedAt = content.publishDate || new Date();
      
      // Set wordpressSite from populated siteId or default
      if (content.siteId && typeof content.siteId === 'object') {
        content.wordpressSite = content.siteId.name || 'Unknown Site';
      } else {
        content.wordpressSite = 'Unknown Site';
      }
      
      await content.save();
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