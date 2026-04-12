// backend/scripts/verify-publishing-info.js
const mongoose = require('mongoose');
require('dotenv').config();

async function verifyPublishingInfo() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');

    const db = mongoose.connection.db;
    const contentsCollection = db.collection('contents');

    // Get one published article
    const article = await contentsCollection.findOne({ status: 'published' });

    if (!article) {
      console.log('❌ No published articles found');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('📄 Sample Published Article:');
    console.log('==========================');
    console.log('Title:', article.title);
    console.log('Status:', article.status);
    console.log('publishedAt:', article.publishedAt || '❌ MISSING');
    console.log('wordpressSite:', article.wordpressSite || '❌ MISSING');
    console.log('publishedUrl:', article.publishedUrl || '❌ MISSING');
    console.log('publishDate:', article.publishDate || 'N/A');
    console.log('siteId:', article.siteId || 'N/A');
    console.log('\n');

    // Count articles with new fields
    const withPublishedAt = await contentsCollection.countDocuments({
      status: 'published',
      publishedAt: { $exists: true, $ne: null }
    });

    const withWordpressSite = await contentsCollection.countDocuments({
      status: 'published',
      wordpressSite: { $exists: true, $ne: null }
    });

    const totalPublished = await contentsCollection.countDocuments({ status: 'published' });

    console.log('📊 Summary:');
    console.log('===========');
    console.log(`Total published: ${totalPublished}`);
    console.log(`With publishedAt: ${withPublishedAt} / ${totalPublished}`);
    console.log(`With wordpressSite: ${withWordpressSite} / ${totalPublished}`);

    if (withPublishedAt === totalPublished && withWordpressSite === totalPublished) {
      console.log('\n✅ All articles have publishing info!');
    } else {
      console.log('\n⚠️ Some articles missing publishing info');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

verifyPublishingInfo();