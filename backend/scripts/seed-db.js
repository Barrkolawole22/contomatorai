require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    await mongoose.connect(mongoURI);
    
    console.log('Connected to MongoDB for seeding');
    
    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    
    const testUser = {
      email: 'test@contentautomation.com',
      password: hashedPassword,
      name: 'Test User',
      role: 'user',
      usageCredits: 50
    };
    
    await mongoose.connection.collection('users').deleteOne({ email: testUser.email });
    const user = await mongoose.connection.collection('users').insertOne(testUser);
    
    console.log('✓ Test user created:', testUser.email);
    
    // Create sample content
    const sampleContent = [
      {
        userId: user.insertedId,
        title: 'Getting Started with AI Content Generation',
        content: 'This is a sample blog post about AI content generation...',
        excerpt: 'Learn how to get started with AI content generation',
        keywords: ['AI', 'content generation', 'automation'],
        metaTitle: 'Getting Started with AI Content Generation',
        metaDescription: 'Complete guide to AI content generation',
        slug: 'getting-started-ai-content-generation',
        type: 'blog',
        tone: 'professional',
        readingTime: 5,
        wordCount: 1000,
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        userId: user.insertedId,
        title: 'Advanced SEO Techniques for 2024',
        content: 'This is a draft post about advanced SEO techniques...',
        excerpt: 'Advanced SEO strategies for modern websites',
        keywords: ['SEO', '2024', 'optimization'],
        metaTitle: 'Advanced SEO Techniques for 2024',
        metaDescription: 'Latest SEO techniques and strategies',
        slug: 'advanced-seo-techniques-2024',
        type: 'blog',
        tone: 'professional',
        readingTime: 8,
        wordCount: 1500,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    await mongoose.connection.collection('contents').insertMany(sampleContent);
    console.log('✓ Sample content created');
    
    console.log('✅ Database seeding completed successfully');
    console.log('Test credentials:');
    console.log('Email: test@contentautomation.com');
    console.log('Password: testpassword123');
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;