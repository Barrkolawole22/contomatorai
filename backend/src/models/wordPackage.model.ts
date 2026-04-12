// backend/src/models/wordPackage.model.ts - Word Package Definitions (Paystack)
import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IWordPackage extends Document {
  packageId: string;
  name: string;
  description: string;
  wordCount: number;
  priceInCents: number;
  currency: string;
  pricePerWord: number;
  discountPercentage?: number;
  isActive: boolean;
  isPopular?: boolean;
  features: string[];
  validityDays?: number;
  
  createdAt: Date;
  updatedAt: Date;
  
  getFormattedPrice(): string;
  calculateDiscount(originalPrice: number): number;
}

const WordPackageSchema: Schema<IWordPackage> = new Schema<IWordPackage>(
  {
    packageId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Package name is required'],
      trim: true,
      maxlength: [100, 'Package name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Package description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    wordCount: {
      type: Number,
      required: [true, 'Word count is required'],
      min: [1000, 'Minimum word count is 1000'],
      max: [10000000, 'Maximum word count is 10 million'],
    },
    priceInCents: {
      type: Number,
      required: [true, 'Price is required'],
      min: [1, 'Minimum price is 1 kobo/cent'],
    },
    currency: {
      type: String,
      default: 'NGN',
      enum: ['USD', 'EUR', 'GBP', 'NGN'], // ✅ Added NGN for Paystack
    },
    pricePerWord: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPercentage: {
      type: Number,
      min: 0,
      max: 90,
      default: undefined,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    features: [{
      type: String,
      maxlength: [200, 'Feature description cannot exceed 200 characters'],
    }],
    validityDays: {
      type: Number,
      min: 1,
      default: undefined,
    },
  },
  { 
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Calculate price per word before saving
WordPackageSchema.pre<IWordPackage>('save', function (next) {
  this.pricePerWord = this.priceInCents / this.wordCount;
  next();
});

// Instance method to get formatted price
WordPackageSchema.methods.getFormattedPrice = function (): string {
  const price = this.priceInCents / 100;
  
  // Format based on currency
  const currencyFormats: { [key: string]: { locale: string; currency: string } } = {
    NGN: { locale: 'en-NG', currency: 'NGN' },
    USD: { locale: 'en-US', currency: 'USD' },
    EUR: { locale: 'en-EU', currency: 'EUR' },
    GBP: { locale: 'en-GB', currency: 'GBP' },
  };
  
  const format = currencyFormats[this.currency] || currencyFormats.NGN;
  
  return new Intl.NumberFormat(format.locale, {
    style: 'currency',
    currency: format.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

// Instance method to calculate discount
WordPackageSchema.methods.calculateDiscount = function (originalPrice: number): number {
  if (!this.discountPercentage) return 0;
  return Math.round((originalPrice * this.discountPercentage) / 100);
};

// Static method to get active packages
WordPackageSchema.statics.getActivePackages = function () {
  return this.find({ isActive: true }).sort({ wordCount: 1 });
};

// Static method to get package by ID
WordPackageSchema.statics.getByPackageId = function (packageId: string) {
  return this.findOne({ packageId, isActive: true });
};

const WordPackage: Model<IWordPackage> = mongoose.models.WordPackage || mongoose.model<IWordPackage>('WordPackage', WordPackageSchema);

export default WordPackage;