require('dotenv').config();
const mongoose = require('mongoose');

async function initializeDatabase() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    await mongoose.connect(mongoURI);
    
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Create indexes for better performance
    console.log('Creating database indexes...');
    
    // User collection indexes
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('users').createIndex({ createdAt: 1 });
      console.log('✓ User indexes created');
    } catch (error) {
      console.log('User indexes already exist');
    }
    
    // Content collection indexes
    try {
      await db.collection('contents').createIndex({ userId: 1 });
      await db.collection('contents').createIndex({ slug: 1 });
      await db.collection('contents').createIndex({ createdAt: -1 });
      await db.collection('contents').createIndex({ status: 1 });
      await db.collection('contents').createIndex({ type: 1 });
      await db.collection('contents').createIndex({ 
        title: 'text', 
        content: 'text', 
        keywords: 'text' 
      });
      console.log('✓ Content indexes created');
    } catch (error) {
      console.log('Content indexes already exist');
    }
    
    // Sites collection indexes
    try {
      await db.collection('sites').createIndex({ userId: 1 });
      await db.collection('sites').createIndex({ url: 1 });
      console.log('✓ Site indexes created');
    } catch (error) {
      console.log('Site indexes already exist');
    }
    
    console.log('✅ Database initialization completed successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;