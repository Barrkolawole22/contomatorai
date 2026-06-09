// backend/src/models/user.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

interface LoginHistoryEntry {
  ip: string;
  location: string;
  timestamp: Date;
  device: string;
  userAgent?: string;
}

interface WordUsageEntry {
  date: Date;
  wordsUsed: number;
  contentId?: string;
  operation: 'generation' | 'edit' | 'bulk_generation';
}

interface WordPackagePurchase {
  packageId: string;
  packageName: string;
  wordsIncluded: number;
  amountPaid: number;
  currency: string;
  purchaseDate: Date;
  paystackReference?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
}

type PlanName =
  | 'free'
  | 'basic'
  | 'pro'
  | 'agency'
  | 'enterprise'
  | 'starter'
  | 'professional'
  | 'premium';

export interface IUser extends Document {
  email: string;
  password?: string;
  name: string;
  role: 'user' | 'admin' | 'super_admin' | 'moderator';
  status: 'active' | 'inactive' | 'suspended';

  googleId?: string;
  twitterId?: string;
  twitterUsername?: string;

  wordCredits: number;
  totalWordsUsed: number;
  currentMonthUsage: number;

  preferredCurrency: 'USD' | 'NGN';
  subscriptionPlan: PlanName;
  subscriptionWordBalance: number;
  topupWordBalance: number;
  subscriptionRenewalDate?: Date;

  wordUsageHistory: WordUsageEntry[];
  wordPackagePurchases: WordPackagePurchase[];

  credits: number;

  resetPasswordToken?: string;
  resetPasswordExpiry?: Date;

  emailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;

  avatar?: string;
  hasSeenTour?: boolean;
  timezone?: string;
  language?: string;
  phone?: string;
  location?: string;
  company?: string;
  bio?: string;

  lastLogin?: Date;
  loginCount: number;
  lastUsageDate?: Date;

  subscriptionStatus?: PlanName;
  subscriptionId?: string;
  subscriptionExpiry?: Date;

  byoApiEnabled?: boolean;
  apiKeys?: {
    anthropic?: string;
    gemini?: string;
  };

  security: {
    twoFactorEnabled: boolean;
    lastPasswordChange: Date;
    loginHistory: LoginHistoryEntry[];
    twoFactorSecret?: string;
    backupCodes?: string[];
  };

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
    analyticsTracking?: boolean;
    dataSharing?: boolean;
    cookiePreferences?: boolean;
  };

  subscription?: {
    plan: PlanName;
    status: 'active' | 'inactive' | 'cancelled' | 'past_due';
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    expiresAt?: Date;
    cancelAtPeriodEnd?: boolean;
  };

  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidatePassword: string): Promise<boolean>;
  generatePasswordResetToken(): string;
  generateEmailVerificationToken(): string;
  updateLastLogin(): Promise<void>;
  hasWordCredits(wordsNeeded?: number): boolean;
  deductWordCredits(wordsUsed: number, contentId?: string, operation?: string): Promise<boolean>;
  addWordCredits(wordsToAdd: number, packageInfo?: any): Promise<void>;
  resetSubscriptionWords(newBalance: number): Promise<void>;
  getWordUsageStats(timeframe?: 'day' | 'week' | 'month' | 'all'): any;
  resetMonthlyUsage(): Promise<void>;
  hasCredits(): boolean;
  deductCredits(amount: number): Promise<boolean>;
  addCredits(amount: number): Promise<void>;
  addLoginHistory(ip: string, userAgent: string, location?: string): Promise<void>;
  parseUserAgent(userAgent: string): string;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const WordUsageSchema = new Schema(
  {
    date: { type: Date, default: Date.now },
    wordsUsed: { type: Number, required: true, min: 0 },
    contentId: { type: String },
    operation: {
      type: String,
      enum: ['generation', 'edit', 'bulk_generation'],
      default: 'generation',
    },
  },
  { _id: false }
);

const WordPackagePurchaseSchema = new Schema(
  {
    packageId: { type: String, required: true },
    packageName: { type: String, required: true },
    wordsIncluded: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'NGN' },
    purchaseDate: { type: Date, default: Date.now },
    paystackReference: { type: String },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
  },
  { _id: false }
);

const LoginHistorySchema = new Schema(
  {
    ip: { type: String, required: true },
    location: { type: String, default: 'Unknown' },
    timestamp: { type: Date, default: Date.now },
    device: { type: String, default: 'Unknown' },
    userAgent: { type: String },
  },
  { _id: false }
);

const SecuritySchema = new Schema(
  {
    twoFactorEnabled: { type: Boolean, default: false },
    lastPasswordChange: { type: Date, default: Date.now },
    loginHistory: [LoginHistorySchema],
    twoFactorSecret: { type: String, select: false },
    backupCodes: [{ type: String, select: false }],
  },
  { _id: false }
);

const allowedPlans = [
  'free',
  'basic',
  'pro',
  'agency',
  'enterprise',
  'starter',
  'professional',
  'premium',
];

const SubscriptionSchema = new Schema(
  {
    plan: { type: String, enum: allowedPlans, default: 'free' },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'past_due'],
      default: 'inactive',
    },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    expiresAt: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── Main schema ──────────────────────────────────────────────────────────────

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
      required: false,
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    googleId: { type: String, unique: true, sparse: true },
    twitterId: { type: String, unique: true, sparse: true },
    twitterUsername: { type: String, sparse: true },

    role: {
      type: String,
      enum: { values: ['user', 'admin', 'super_admin', 'moderator'], message: 'Invalid role' },
      default: 'user',
    },
    status: {
      type: String,
      enum: { values: ['active', 'inactive', 'suspended'], message: 'Invalid status' },
      default: 'active',
    },

    wordCredits: { type: Number, default: 5000, min: [0, 'Word credits cannot be negative'], max: 10_000_000 },
    totalWordsUsed: { type: Number, default: 0, min: 0 },
    currentMonthUsage: { type: Number, default: 0, min: 0 },

    preferredCurrency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
    subscriptionPlan: { type: String, enum: allowedPlans, default: 'free' },
    subscriptionWordBalance: { type: Number, default: 0, min: 0 },
    topupWordBalance: { type: Number, default: 0, min: 0 },
    subscriptionRenewalDate: { type: Date, default: undefined },

    wordUsageHistory: [WordUsageSchema],
    wordPackagePurchases: [WordPackagePurchaseSchema],

    credits: { type: Number, default: 10, min: 0, max: 10000 },

    resetPasswordToken: { type: String, default: undefined },
    resetPasswordExpiry: { type: Date, default: undefined },

    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: undefined },
    emailVerificationExpiry: { type: Date, default: undefined },

    avatar: { type: String, default: undefined },
    hasSeenTour: { type: Boolean, default: false },
    timezone: { type: String, default: 'UTC' },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja'],
    },
    phone: { type: String, trim: true, maxlength: 20 },
    location: { type: String, trim: true, maxlength: 100 },
    company: { type: String, trim: true, maxlength: 100 },
    bio: { type: String, trim: true, maxlength: 500 },

    lastLogin: { type: Date, default: undefined },
    loginCount: { type: Number, default: 0, min: 0 },
    lastUsageDate: { type: Date, default: undefined },

    subscriptionStatus: { type: String, enum: allowedPlans, default: 'free' },
    subscriptionId: { type: String, default: undefined },
    subscriptionExpiry: { type: Date, default: undefined },

    byoApiEnabled: { type: Boolean, default: false },
    apiKeys: {
      anthropic: { type: String, select: false },
      gemini: { type: String, select: false },
    },

    security: {
      type: SecuritySchema,
      default: () => ({ twoFactorEnabled: false, lastPasswordChange: new Date(), loginHistory: [] }),
    },
    subscription: {
      type: SubscriptionSchema,
      default: () => ({ plan: 'free', status: 'inactive' }),
    },

    preferences: {
      emailNotifications: { type: Boolean, default: true },
      marketingEmails: { type: Boolean, default: false },
      defaultTone: {
        type: String,
        default: 'informative',
        enum: ['informative', 'conversational', 'professional', 'friendly', 'authoritative'],
      },
      defaultWordCount: { type: Number, default: 1500, min: 300, max: 5000 },
      website: {
        type: String,
        default: '',
        validate: {
          validator: (v: string) => !v || v.trim() === '' || /^https?:\/\/.+/.test(v),
          message: 'Website must be a valid URL',
        },
      },
      pushNotifications: { type: Boolean, default: false },
      weeklyReports: { type: Boolean, default: true },
      creditAlerts: { type: Boolean, default: true },
      articleUpdates: { type: Boolean, default: false },
      securityAlerts: { type: Boolean, default: true },
      contentUpdates: { type: Boolean, default: true },
      theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
      defaultContentType: {
        type: String,
        enum: ['blog', 'article', 'social', 'email', 'product', 'landing'],
        default: 'blog',
      },
      autoSave: { type: Boolean, default: true },
      wordCountDisplay: { type: Boolean, default: true },
      apiKey: { type: String, default: undefined },
      rateLimit: { type: Number, default: 100, min: 1, max: 1000 },
      webhookUrl: {
        type: String,
        default: '',
        validate: {
          validator: (v: string) => !v || v.trim() === '' || /^https?:\/\/.+/.test(v),
          message: 'Webhook URL must be a valid HTTP/HTTPS URL',
        },
      },
      enableWebhooks: { type: Boolean, default: false },
      bio: { type: String, default: '' },
      company: { type: String, default: '' },
      location: { type: String, default: '' },
      analyticsTracking: { type: Boolean, default: true },
      dataSharing: { type: Boolean, default: false },
      cookiePreferences: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.emailVerificationToken;
        delete ret.__v;
        if (ret.apiKeys) delete ret.apiKeys;
        if (ret.preferences?.apiKey) {
          ret.preferences.apiKey = ret.preferences.apiKey.substring(0, 12) + '...';
        }
        if (ret.security?.twoFactorSecret) delete ret.security.twoFactorSecret;
        if (ret.security?.backupCodes) delete ret.security.backupCodes;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

UserSchema.index({ googleId: 1 });
UserSchema.index({ twitterId: 1 });
UserSchema.index({ resetPasswordToken: 1 });
UserSchema.index({ emailVerificationToken: 1 });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ wordCredits: 1 });
UserSchema.index({ totalWordsUsed: 1 });
UserSchema.index({ subscriptionPlan: 1 });

// ─── Hooks ────────────────────────────────────────────────────────────────────

UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

UserSchema.pre<IUser>('save', function (next) {
  if (this.lastUsageDate) {
    const now = new Date();
    const last = new Date(this.lastUsageDate);
    if (
      now.getMonth() !== last.getMonth() ||
      now.getFullYear() !== last.getFullYear()
    ) {
      this.currentMonthUsage = 0;
    }
  }
  next();
});

// ─── Instance methods ─────────────────────────────────────────────────────────

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch {
    throw new Error('Password comparison failed');
  }
};

UserSchema.methods.generatePasswordResetToken = function (): string {
  const token = randomBytes(32).toString('hex');
  this.resetPasswordToken = token;
  this.resetPasswordExpiry = new Date(Date.now() + 3_600_000);
  return token;
};

UserSchema.methods.generateEmailVerificationToken = function (): string {
  const token = randomBytes(32).toString('hex');
  this.emailVerificationToken = token;
  this.emailVerificationExpiry = new Date(Date.now() + 86_400_000);
  return token;
};

UserSchema.methods.updateLastLogin = async function (): Promise<void> {
  this.lastLogin = new Date();
  this.loginCount += 1;
  await this.save();
};

UserSchema.methods.addLoginHistory = async function (
  ip: string,
  userAgent: string,
  location?: string
): Promise<void> {
  const entry = {
    ip,
    location: location || 'Unknown',
    timestamp: new Date(),
    device: this.parseUserAgent(userAgent),
    userAgent,
  };
  if (!this.security.loginHistory) this.security.loginHistory = [];
  this.security.loginHistory.unshift(entry);
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
  const total =
    (this.subscriptionWordBalance || 0) +
    (this.topupWordBalance || 0) +
    (this.wordCredits || 0);
  return total >= wordsNeeded;
};

UserSchema.methods.deductWordCredits = async function (
  wordsUsed: number,
  contentId?: string,
  operation: string = 'generation'
): Promise<boolean> {
  const subscriptionBalance = this.subscriptionWordBalance || 0;
  const topupBalance = this.topupWordBalance || 0;
  const legacyBalance = this.wordCredits || 0;

  if (subscriptionBalance + topupBalance + legacyBalance < wordsUsed) return false;

  let remaining = wordsUsed;

  if (remaining > 0 && subscriptionBalance > 0) {
    const deduct = Math.min(remaining, subscriptionBalance);
    this.subscriptionWordBalance -= deduct;
    remaining -= deduct;
  }
  if (remaining > 0 && topupBalance > 0) {
    const deduct = Math.min(remaining, topupBalance);
    this.topupWordBalance -= deduct;
    remaining -= deduct;
  }
  if (remaining > 0 && legacyBalance > 0) {
    const deduct = Math.min(remaining, legacyBalance);
    this.wordCredits -= deduct;
    remaining -= deduct;
  }

  this.totalWordsUsed += wordsUsed;
  this.currentMonthUsage += wordsUsed;
  this.lastUsageDate = new Date();

  this.wordUsageHistory.push({
    date: new Date(),
    wordsUsed,
    contentId,
    operation: operation as any,
  });

  if (this.wordUsageHistory.length > 1000) {
    this.wordUsageHistory = this.wordUsageHistory.slice(-1000);
  }

  await this.save();
  return true;
};

UserSchema.methods.addWordCredits = async function (
  wordsToAdd: number,
  packageInfo?: any
): Promise<void> {
  const type = packageInfo?.type;

  if (type === 'subscription') {
    this.subscriptionWordBalance = (this.subscriptionWordBalance || 0) + wordsToAdd;
  } else if (type === 'topup') {
    this.topupWordBalance = (this.topupWordBalance || 0) + wordsToAdd;
  } else {
    this.wordCredits = (this.wordCredits || 0) + wordsToAdd;
  }

  if (packageInfo) {
    this.wordPackagePurchases.push({
      packageId: packageInfo.packageId,
      packageName: packageInfo.packageName,
      wordsIncluded: wordsToAdd,
      amountPaid: packageInfo.amountPaid,
      currency: packageInfo.currency || 'NGN',
      purchaseDate: new Date(),
      paystackReference: packageInfo.paystackReference,
      status: packageInfo.status || 'completed',
    });
  }

  await this.save();
};

UserSchema.methods.resetSubscriptionWords = async function (newBalance: number): Promise<void> {
  this.subscriptionWordBalance = newBalance;
  this.subscriptionRenewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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

  const relevant = this.wordUsageHistory.filter((e: any) => e.date >= startDate);
  const totalWords = relevant.reduce((sum: number, e: any) => sum + e.wordsUsed, 0);

  return { totalWords, usageEntries: relevant.length, timeframe, startDate, endDate: now };
};

UserSchema.methods.resetMonthlyUsage = async function (): Promise<void> {
  this.currentMonthUsage = 0;
  await this.save();
};

UserSchema.methods.hasCredits = function (): boolean {
  return this.credits > 0;
};

UserSchema.methods.deductCredits = async function (amount: number = 1): Promise<boolean> {
  if (this.credits < amount) return false;
  this.credits -= amount;
  await this.save();
  return true;
};

UserSchema.methods.addCredits = async function (amount: number): Promise<void> {
  this.credits = Math.min(this.credits + amount, 10000);
  await this.save();
};

// ─── Statics ──────────────────────────────────────────────────────────────────

UserSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

UserSchema.statics.findActiveUsers = function () {
  return this.find({ status: 'active' });
};

UserSchema.statics.findUsersWithWordCredits = function () {
  return this.find({ wordCredits: { $gt: 0 }, status: 'active' });
};

// ─── Virtuals ─────────────────────────────────────────────────────────────────

UserSchema.virtual('displayName').get(function () {
  return this.name;
});

UserSchema.virtual('isAdmin').get(function () {
  return ['admin', 'super_admin'].includes(this.role);
});

UserSchema.virtual('hasActiveSubscription').get(function () {
  const plan = this.subscription?.plan || this.subscriptionStatus;
  if (!plan || plan === 'free') return false;
  if (this.subscription?.status === 'active') {
    if (this.subscription.currentPeriodEnd) {
      return this.subscription.currentPeriodEnd > new Date();
    }
    return true;
  }
  if (this.subscriptionExpiry) return this.subscriptionExpiry > new Date();
  return false;
});

UserSchema.virtual('wordCreditsStatus').get(function () {
  const subscriptionBalance = this.subscriptionWordBalance || 0;
  const topupBalance = this.topupWordBalance || 0;
  const legacyBalance = this.wordCredits || 0;
  const totalAvailable = subscriptionBalance + topupBalance + legacyBalance;

  return {
    current: legacyBalance,
    subscriptionBalance,
    topupBalance,
    totalAvailable,
    totalUsed: this.totalWordsUsed,
    monthUsed: this.currentMonthUsage,
    hasCredits: totalAvailable > 0,
    needsRefill: subscriptionBalance + topupBalance < 1000,
  };
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;