// backend/src/models/creditPackage.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ICreditPackage extends Document {
  packageId: string;
  name: string;
  description: string;
  wordCount: number;
  prices: {
    USD: { amount: number; formatted: string };
    NGN: { amount: number; formatted: string };
  };
  features: string[];
  isActive: boolean;
  isPopular: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CreditPackageSchema = new Schema<ICreditPackage>(
  {
    packageId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    wordCount: { type: Number, required: true, min: 1000 },
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
    isActive: { type: Boolean, default: true, index: true },
    isPopular: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const CreditPackage: Model<ICreditPackage> =
  mongoose.models.CreditPackage ||
  mongoose.model<ICreditPackage>('CreditPackage', CreditPackageSchema);

export default CreditPackage;
