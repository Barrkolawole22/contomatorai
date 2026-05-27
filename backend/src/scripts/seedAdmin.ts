// backend/src/scripts/seedAdmin.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';
import User from '../models/user.model';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

async function seedAdmin() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌  MONGODB_URI not found in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅  Connected to MongoDB');

  const email = process.env.ADMIN_EMAIL || (await ask('Admin email: '));
  const password = process.env.ADMIN_PASSWORD || (await ask('Admin password: '));
  const name = process.env.ADMIN_NAME || (await ask('Admin name: '));
  rl.close();

  if (!email || !password || !name) {
    console.error('❌  Email, password, and name are all required');
    process.exit(1);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    if (['admin', 'super_admin'].includes(existing.role)) {
      console.log(`ℹ️   Admin already exists: ${existing.email} (role: ${existing.role})`);
    } else {
      existing.role = 'super_admin';
      existing.status = 'active';
      await existing.save();
      console.log(`✅  Existing user promoted to super_admin: ${existing.email}`);
    }
    await mongoose.disconnect();
    return;
  }

  const admin = new User({
    email,
    password,
    name,
    role: 'super_admin',
    status: 'active',
    emailVerified: true,
    wordCredits: 999999,
    subscriptionWordBalance: 999999,
    topupWordBalance: 0,
    credits: 10000,
    subscriptionPlan: 'enterprise',
    subscriptionStatus: 'enterprise',
    subscription: {
      plan: 'enterprise',
      status: 'active',
    },
    preferences: {
      emailNotifications: true,
      marketingEmails: false,
      defaultTone: 'professional',
      defaultWordCount: 1500,
      pushNotifications: false,
      weeklyReports: true,
      creditAlerts: true,
      articleUpdates: false,
      securityAlerts: true,
      contentUpdates: true,
      theme: 'system',
      defaultContentType: 'blog',
      autoSave: true,
      wordCountDisplay: true,
      rateLimit: 1000,
      enableWebhooks: false,
    },
    security: {
      twoFactorEnabled: false,
      lastPasswordChange: new Date(),
      loginHistory: [],
    },
  });

  await admin.save();
  console.log(`✅  Super admin created: ${admin.email}`);
  await mongoose.disconnect();
}

seedAdmin().catch((err) => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
