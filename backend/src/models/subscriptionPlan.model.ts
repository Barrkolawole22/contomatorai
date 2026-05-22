// backend/src/models/subscriptionPlan.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IPriceEntry {
  amount: number;       // in smallest currency unit (kobo / cents)
  formatted: string;
}

export interface ISubscriptionPlan extends Document {
  planId: 'free' | 'basic' | 'pro' | 'agency';
  name: string;
  description: string;
  wordsPerMonth: number;
  prices: {
    USD: IPriceEntry;
    NGN: IPriceEntry;
  };
  features: string[];
  autonomousPipeline: boolean;
  knowledgebaseDocs: number;   // -1 = unlimited
  isActive: boolean;
  isPopular: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
      enum: ['free', 'basic', 'pro', 'agency'],
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    wordsPerMonth: { type: Number, required: true, min: 0 },
    prices: {
      USD: {
        amount: { type: Number, required: true },
        formatted: { type: String, required: true },
      },
      NGN: {
        amount: { type: Number, required: true },
        formatted: { type: String, required: true },
      },
    },
    features: [{ type: String }],
    autonomousPipeline: { type: Boolean, default: false },
    knowledgebaseDocs: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isPopular: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const SubscriptionPlan: Model<ISubscriptionPlan> =
  mongoose.models.SubscriptionPlan ||
  mongoose.model<ISubscriptionPlan>('SubscriptionPlan', SubscriptionPlanSchema);

export default SubscriptionPlan;
