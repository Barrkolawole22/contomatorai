// backend/src/models/user.model.ts - FIXED VERSION
import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// Login history interface
interface LoginHistoryEntry {
  ip: string;
  location: string;
  timestamp: Date;
  device: string;
  userAgent?: string;
}

// Word usage tracking interface
interface WordUsageEntry {
  date: Date;
  wordsUsed: number;
  contentId?: string;
  operation: 'generation' | 'edit' | 'bulk_generation';
}

// Word package purchase interface
interface WordPackagePurchase {
  packageId: string;
  packageName: string;
  wordsIncluded: number;
  amountPaid: number;
  currency: string;
  purchaseDate: Date;
  stripePaymentIntentId?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
}

export interface IUser extends Document {
  email: string;
  password?: string; // <-- MADE PASSWORD OPTIONAL
  name: string;
  role: 'user' | 'admin' | 'super_admin' | 'moderator';
  status: 'active' | 'inactive' | 'suspended';
  
  googleId?: string; // <-- ADDED GOOGLE ID
  twitterId?: string; // Twitter OAuth ID
  twitterUsername?: string; // Twitter username

  // ENHANCED: Word-based billing system
  wordCredits: number;
  totalWordsUsed: number;
  currentMonthUsage: number;
  
  // Word usage tracking
  wordUsageHistory: WordUsageEntry[];
  wordPackagePurchases: WordPackagePurchase[];
  
  // Legacy credits for backward compatibility
  credits: number;
  
  // Password reset fields
  resetPasswordToken?: string;
  resetPasswordExpiry?: Date;
  
  // Email verification fields
  emailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  
  // Profile fields
  avatar?: string;
  timezone?: string;
  language?: string;
  phone?: string;
  location?: string;
  company?: string;
  bio?: string;
  
  // Usage tracking
  lastLogin?: Date;
  loginCount: number;
  lastUsageDate?: Date; // FIX: Added for monthly usage tracking
  
  // Subscription/billing
  subscriptionStatus?: 'free' | 'basic' | 'premium' | 'enterprise';
  subscriptionId?: string;
  subscriptionExpiry?: Date;
  
  // BYOAPI settings (for future feature)
  byoApiEnabled?: boolean;
  apiKeys?: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
  };
  
  // Security tracking
  security: {
    twoFactorEnabled: boolean;
    lastPasswordChange: Date;
    loginHistory: LoginHistoryEntry[];
    twoFactorSecret?: string;
    backupCodes?: string[];
  };
  
  // Comprehensive preferences
  preferences: {
    emailNotifications: boolean;
    marketingEmails: boolean;
    defaultTone: string;
    defaultWordCount: number;
    website?: string;
    pushNotifications: boolean;
    weeklyReports: boolean;
    creditAlerts: boolean;
    articleUpdates: boolean;
    securityAlerts: boolean;
    contentUpdates: boolean;
    theme: 'system' | 'light' | 'dark';
    defaultContentType: 'blog' | 'article' | 'social' | 'email' | 'product' | 'landing';
    autoSave: boolean;
    wordCountDisplay: boolean;
    apiKey?: string;
    rateLimit: number;
    webhookUrl?: string;
    enableWebhooks: boolean;
    bio?: string;
    company?: string;
    location?: string;
    lastPasswordChange?: Date;
    twoFactorEnabled?: boolean;
  };
  
  // Subscription details
  subscription?: {
    plan: 'free' | 'starter' | 'professional' | 'enterprise';
    status: 'active' | 'inactive' | 'cancelled' | 'past_due';
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    expiresAt?: Date;
    cancelAtPeriodEnd?: boolean;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generatePasswordResetToken(): string;
  generateEmailVerificationToken(): string;
  updateLastLogin(): Promise<void>;
  hasWordCredits(wordsNeeded?: number): boolean;
  deductWordCredits(wordsUsed: number, contentId?: string, operation?: string): Promise<boolean>;
  addWordCredits(wordsToAdd: number, packageInfo?: any): Promise<void>;
  getWordUsageStats(timeframe?: 'day' | 'week' | 'month' | 'all'): any;
  resetMonthlyUsage(): Promise<void>;
  hasCredits(): boolean;
  deductCredits(amount: number): Promise<boolean>;
  addCredits(amount: number): Promise<void>;
  addLoginHistory(ip: string, userAgent: string, location?: string): Promise<void>;
  parseUserAgent(userAgent: string): string;
}

// ... (WordUsageSchema, WordPackagePurchaseSchema, LoginHistorySchema, SecuritySchema, SubscriptionSchema remain unchanged) ...

// Word Usage Schema
const WordUsageSchema = new Schema({
  date: { type: Date, default: Date.now },
  wordsUsed: { type: Number, required: true, min: 0 },
  contentId: { type: String },
  operation: { 
    type: String, 
    enum: ['generation', 'edit', 'bulk_generation'],
    default: 'generation'
  }
}, { _id: false });

// Word Package Purchase Schema
const WordPackagePurchaseSchema = new Schema({
  packageId: { type: String, required: true },
  packageName: { type: String, required: true },
  wordsIncluded: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  purchaseDate: { type: Date, default: Date.now },
  stripePaymentIntentId: { type: String },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  }
}, { _id: false });

// Login History Schema
const LoginHistorySchema = new Schema({
  ip: { type: String, required: true },
  location: { type: String, default: 'Unknown' },
  timestamp: { type: Date, default: Date.now },
  device: { type: String, default: 'Unknown' },
  userAgent: { type: String }
}, { _id: false });

// Security Schema
const SecuritySchema = new Schema({
  twoFactorEnabled: { type: Boolean, default: false },
  lastPasswordChange: { type: Date, default: Date.now },
  loginHistory: [LoginHistorySchema],
  twoFactorSecret: { type: String, select: false },
  backupCodes: [{ type: String, select: false }]
}, { _id: false });

// Subscription Schema
const SubscriptionSchema = new Schema({
  plan: { 
    type: String, 
    enum: ['free', 'starter', 'professional', 'enterprise'], 
    default: 'free' 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'cancelled', 'past_due'], 
    default: 'inactive' 
  },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  expiresAt: { type: Date },
  cancelAtPeriodEnd: { type: Boolean, default: false }
}, { _id: false });


const UserSchema: Schema<IUser> = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      // User may not have a password if using Google OAuth
      required: false, // <-- CHANGED FROM TRUE
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    googleId: {
      type: String,
      unique: true,
    twitterId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple docs to have no twitterId
    },
    twitterUsername: {
      type: String,
      sparse: true,
    },
      sparse: true, // <-- Allows multiple docs to have no googleId
    },
    role: {
      type: String,
      enum: {
        values: ['user', 'admin', 'super_admin', 'moderator'],
        message: 'Role must be one of: user, admin, super_admin, moderator'
      },
      default: 'user',
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended'],
        message: 'Status must be one of: active, inactive, suspended'
      },
      default: 'active',
    },
    wordCredits: {
      type: Number,
      default: 5000,
      min: [0, 'Word credits cannot be negative'],
    },
    totalWordsUsed: {
      type: Number,
      default: 0,
      min: [0, 'Total words used cannot be negative'],
    },
    currentMonthUsage: {
      type: Number,
      default: 0,
      min: [0, 'Current month usage cannot be negative'],
    },
    wordUsageHistory: [WordUsageSchema],
    wordPackagePurchases: [WordPackagePurchaseSchema],
    credits: {
      type: Number,
      default: 10,
      min: [0, 'Credits cannot be negative'],
      max: [10000, 'Credits cannot exceed 10,000'],
    },
    resetPasswordToken: {
      type: String,
      default: undefined,
    },
    resetPasswordExpiry: {
      type: Date,
      default: undefined,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: undefined,
    },
    emailVerificationExpiry: {
      type: Date,
      default: undefined,
    },
    avatar: {
      type: String,
      default: undefined,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone number cannot exceed 20 characters']
    },
    location: {
      type: String,
      trim: true,
      maxlength: [100, 'Location cannot exceed 100 characters']
    },
    company: {
      type: String,
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters']
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio cannot exceed 500 characters']
    },
    lastLogin: {
      type: Date,
      default: undefined,
    },
    loginCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastUsageDate: { // FIX: Added field
      type: Date,
      default: undefined,
    },
    subscriptionStatus: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free',
    },
    subscriptionId: {
      type: String,
      default: undefined,
    },
    subscriptionExpiry: {
      type: Date,
      default: undefined,
    },
    byoApiEnabled: {
      type: Boolean,
      default: false,
    },
    apiKeys: {
      openai: { type: String, select: false },
      anthropic: { type: String, select: false },
      gemini: { type: String, select: false },
    },
    security: {
      type: SecuritySchema,
      default: () => ({
        twoFactorEnabled: false,
        lastPasswordChange: new Date(),
        loginHistory: []
      })
    },
    subscription: {
      type: SubscriptionSchema,
      default: () => ({
        plan: 'free',
        status: 'inactive'
      })
    },
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      marketingEmails: { type: Boolean, default: false },
      defaultTone: {
        type: String,
        default: 'informative',
        enum: ['informative', 'conversational', 'professional', 'friendly', 'authoritative'],
      },
      defaultWordCount: {
        type: Number,
        default: 1500,
        min: 300,
        max: 5000,
      },
      website: {
        type: String,
        default: '',
        validate: {
          validator: function(v: string) {
            if (!v || v.trim() === '') return true;
            return /^https?:\/\/.+/.test(v);
          },
          message: 'Website must be a valid URL'
        }
      },
      pushNotifications: { type: Boolean, default: false },
      weeklyReports: { type: Boolean, default: true },
      creditAlerts: { type: Boolean, default: true },
      articleUpdates: { type: Boolean, default: false },
      securityAlerts: { type: Boolean, default: true },
      contentUpdates: { type: Boolean, default: true },
      theme: {
        type: String,
        enum: ['system', 'light', 'dark'],
        default: 'system',
      },
      defaultContentType: {
        type: String,
        enum: ['blog', 'article', 'social', 'email', 'product', 'landing'],
        default: 'blog',
      },
      autoSave: { type: Boolean, default: true },
      wordCountDisplay: { type: Boolean, default: true },
      apiKey: { type: String, default: undefined },
      rateLimit: {
        type: Number,
        default: 100,
        min: 1,
        max: 1000,
      },
      webhookUrl: {
        type: String,
        default: '',
        validate: {
          validator: function(v: string) {
            if (!v || v.trim() === '') return true;
            return /^https?:\/\/.+/.test(v);
          },
          message: 'Webhook URL must be a valid HTTP/HTTPS URL'
        }
      },
      enableWebhooks: { type: Boolean, default: false },
      bio: { type: String, default: '' },
      company: { type: String, default: '' },
      location: { type: String, default: '' },
    },
  },
  { 
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.emailVerificationToken;
        delete ret.__v;
        if (ret.apiKeys) delete ret.apiKeys;
        if (ret.preferences?.apiKey) {
          ret.preferences.apiKey = ret.preferences.apiKey.substring(0, 12) + '...';
UserSchema.index({ twitterId: 1 }); // Index for Twitter OAuth
        }
        if (ret.security?.twoFactorSecret) delete ret.security.twoFactorSecret;
        if (ret.security?.backupCodes) delete ret.security.backupCodes;
        return ret;
      }
    }
  }
);

// Indexes
UserSchema.index({ googleId: 1 }); // <-- ADDED INDEX
UserSchema.index({ resetPasswordToken: 1 });
UserSchema.index({ emailVerificationToken: 1 });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ wordCredits: 1 });
UserSchema.index({ totalWordsUsed: 1 });

// Hash password before saving
UserSchema.pre<IUser>('save', async function (next) {
  // Only hash if password is provided and modified
  if (!this.isModified('password') || !this.password) { // <-- UPDATED THIS LINE
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// ... (Initialize defaults 'pre' hook remains unchanged) ...

// Instance methods
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) { // <-- ADDED CHECK
    return false;
  }
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// ... (Rest of the instance methods remain unchanged) ...

UserSchema.methods.generatePasswordResetToken = function (): string {
  const resetToken = randomBytes(32).toString('hex');
  this.resetPasswordToken = resetToken;
  this.resetPasswordExpiry = new Date(Date.now() + 3600000);
  return resetToken;
};

UserSchema.methods.generateEmailVerificationToken = function (): string {
  const verificationToken = randomBytes(32).toString('hex');
  this.emailVerificationToken = verificationToken;
  this.emailVerificationExpiry = new Date(Date.now() + 86400000);
  return verificationToken;
};

UserSchema.methods.updateLastLogin = async function (): Promise<void> {
  this.lastLogin = new Date();
  this.loginCount += 1;
  await this.save();
};

UserSchema.methods.addLoginHistory = async function (ip: string, userAgent: string, location?: string): Promise<void> {
  const loginEntry = {
    ip,
    location: location || 'Unknown',
    timestamp: new Date(),
    device: this.parseUserAgent(userAgent),
    userAgent
  };

  if (!this.security.loginHistory) {
    this.security.loginHistory = [];
  }
  
  this.security.loginHistory.unshift(loginEntry);
  this.security.loginHistory = this.security.loginHistory.slice(0, 20);
  
  this.lastLogin = new Date();
  this.loginCount += 1;
  await this.save();
};

UserSchema.methods.parseUserAgent = function (userAgent: string): string {
  if (!userAgent) return 'Unknown Device';
  if (userAgent.includes('Mobile')) return 'Mobile Device';
  if (userAgent.includes('Tablet')) return 'Tablet';
  if (userAgent.includes('Windows')) return 'Windows PC';
  if (userAgent.includes('Macintosh')) return 'Mac';
  if (userAgent.includes('Linux')) return 'Linux PC';
  if (userAgent.includes('Chrome')) return 'Chrome Browser';
  if (userAgent.includes('Firefox')) return 'Firefox Browser';
  if (userAgent.includes('Safari')) return 'Safari Browser';
  return 'Desktop Device';
};

UserSchema.methods.hasWordCredits = function (wordsNeeded: number = 1): boolean {
  return this.wordCredits >= wordsNeeded;
};

UserSchema.methods.deductWordCredits = async function (
  wordsUsed: number, 
  contentId?: string, 
  operation: string = 'generation'
): Promise<boolean> {
  if (this.wordCredits < wordsUsed) {
    return false;
  }
  
  this.wordCredits -= wordsUsed;
  this.totalWordsUsed += wordsUsed;
  this.currentMonthUsage += wordsUsed;
  
  this.wordUsageHistory.push({
    date: new Date(),
    wordsUsed,
    contentId,
    operation: operation as any
  });
  
  if (this.wordUsageHistory.length > 1000) {
    this.wordUsageHistory = this.wordUsageHistory.slice(-1000);
  }
  
  await this.save();
  return true;
};

UserSchema.methods.addWordCredits = async function (wordsToAdd: number, packageInfo?: any): Promise<void> {
  this.wordCredits += wordsToAdd;
  
  if (packageInfo) {
    this.wordPackagePurchases.push({
      packageId: packageInfo.packageId,
      packageName: packageInfo.packageName,
      wordsIncluded: wordsToAdd,
      amountPaid: packageInfo.amountPaid,
      currency: packageInfo.currency || 'USD',
      purchaseDate: new Date(),
      stripePaymentIntentId: packageInfo.stripePaymentIntentId,
      status: packageInfo.status || 'completed'
    });
  }
  
  await this.save();
};

UserSchema.methods.getWordUsageStats = function (timeframe: string = 'month') {
  const now = new Date();
  let startDate: Date;
  
  switch (timeframe) {
    case 'day':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      startDate = new Date(0);
  }
  
  const relevantUsage = this.wordUsageHistory.filter(
    (entry: any) => entry.date >= startDate
  );
  
  const totalWords = relevantUsage.reduce(
    (sum: number, entry: any) => sum + entry.wordsUsed, 0
  );
  
  return {
    totalWords,
    usageEntries: relevantUsage.length,
    timeframe,
    startDate,
    endDate: now
  };
};

UserSchema.methods.resetMonthlyUsage = async function (): Promise<void> {
  this.currentMonthUsage = 0;
  await this.save();
};

UserSchema.methods.hasCredits = function (): boolean {
  return this.credits > 0;
};

UserSchema.methods.deductCredits = async function (amount: number = 1): Promise<boolean> {
  if (this.credits < amount) {
    return false;
  }
  
  this.credits -= amount;
  await this.save();
  return true;
};

UserSchema.methods.addCredits = async function (amount: number): Promise<void> {
  this.credits += amount;
  if (this.credits > 10000) {
    this.credits = 10000;
  }
  await this.save();
};

UserSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

UserSchema.statics.findActiveUsers = function () {
  return this.find({ status: 'active' });
};

UserSchema.statics.findUsersWithWordCredits = function () {
  return this.find({ wordCredits: { $gt: 0 }, status: 'active' });
};

UserSchema.virtual('displayName').get(function () {
  return this.name;
});

UserSchema.virtual('isAdmin').get(function () {
  return ['admin', 'super_admin'].includes(this.role);
});

UserSchema.virtual('hasActiveSubscription').get(function () {
  if (this.subscriptionStatus === 'free') return true;
  if (!this.subscriptionExpiry) return false;
  return this.subscriptionExpiry > new Date();
});

UserSchema.virtual('wordCreditsStatus').get(function () {
  return {
    current: this.wordCredits,
    totalUsed: this.totalWordsUsed,
    monthUsed: this.currentMonthUsage,
    hasCredits: this.wordCredits > 0,
    needsRefill: this.wordCredits < 1000
  };
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;