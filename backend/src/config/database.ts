// backend/src/config/database.ts
import mongoose from 'mongoose';
import logger from './logger';
import { seedBillingData } from '../scripts/seedBilling';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/content-automation';

    await mongoose.connect(mongoURI);

    logger.info('MongoDB connected successfully');

    // Run billing seed after connection (safe — upserts, never destructive)
    await seedBillingData();
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;