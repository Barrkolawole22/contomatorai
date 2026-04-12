// backend/src/types/user.types.ts - Updated to match your user model
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'super_admin' | 'moderator'; // Match your model
  credits: number; // Changed from usageCredits
  status: 'active' | 'inactive' | 'suspended';
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  loginCount: number;
}

export interface UserSettings {
  notifications?: {
    email: boolean;
    browser: boolean;
    contentGenerated: boolean;
    creditsLow: boolean;
    weeklyReport: boolean;
  };
  preferences?: {
    defaultTone: string;
    defaultWordCount: number;
    timezone: string;
    language: string;
  };
  billing?: {
    plan: 'free' | 'basic' | 'premium' | 'enterprise';
    billingCycle: 'monthly' | 'yearly';
    nextBillingDate?: Date;
    paymentMethod?: string;
  };
}

export interface UserUsage {
  creditsUsed: number;
  creditsRemaining: number;
  contentGenerated: number;
  keywordResearches: number;
  wordPressPublishes: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface UserActivity {
  action: string;
  resource: string;
  resourceId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export type UserRole = 'user' | 'admin' | 'super_admin' | 'moderator';

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  settings?: Partial<UserSettings>;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
