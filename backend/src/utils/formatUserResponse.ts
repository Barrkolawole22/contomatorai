// backend/src/utils/formatUserResponse.ts
// Single source of truth for the user response shape sent to the frontend.
// Previously duplicated (with minor differences) in auth.controller.ts and
// billing.controller.ts. Import from here in both.

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  isAdmin: boolean;

  wordCredits: number;
  totalWordsUsed: number;
  currentMonthUsage: number;

  // Legacy compatibility fields
  credits: number;
  usageCredits: number;
  creditUsage: number;

  status: string;
  emailVerified: boolean;
  createdAt: string;
  lastLogin?: string;

  plan: string;
  subscriptionStatus: string;
  maxCredits: number;

  avatar?: string;
  hasSeenTour?: boolean;
  phone?: string;
  location?: string;
  company?: string;
  bio?: string;
  timezone?: string;
  language?: string;

  preferences?: any;

  security?: {
    twoFactorEnabled: boolean;
    lastPasswordChange?: string;
    loginHistory: Array<{
      ip: string;
      location: string;
      timestamp: string;
      device: string;
    }>;
  };

  subscription?: any;
}

export const formatUserResponse = (user: any): UserResponse => {
  let userPlan = 'free';
  if (user?.subscription?.plan) {
    userPlan = user.subscription.plan;
  } else if (user?.subscriptionStatus) {
    userPlan = user.subscriptionStatus;
  } else if (user?.plan) {
    userPlan = user.plan;
  }

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    isAdmin: ['admin', 'super_admin'].includes(user.role),

    wordCredits: user.wordCredits || 0,
    totalWordsUsed: user.totalWordsUsed || 0,
    currentMonthUsage: user.currentMonthUsage || 0,

    credits: user.credits || user.wordCredits || 0,
    usageCredits: user.wordCredits || 0,
    creditUsage: user.currentMonthUsage || 0,

    status: user.status || 'active',
    emailVerified: user.emailVerified || false,
    createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
    lastLogin: user.lastLogin?.toISOString() || undefined,

    plan: userPlan,
    subscriptionStatus: user.subscriptionStatus || userPlan,
    maxCredits: user.wordCredits || 0,

    avatar: user.avatar,
    hasSeenTour: user.hasSeenTour || false,
    phone: user.phone,
    location: user.location,
    company: user.company,
    bio: user.bio,
    timezone: user.timezone,
    language: user.language,

    preferences: user.preferences,

    security: user.security
      ? {
          twoFactorEnabled: user.security.twoFactorEnabled || false,
          lastPasswordChange: user.security.lastPasswordChange?.toISOString(),
          loginHistory: (user.security.loginHistory || [])
            .slice(0, 5)
            .map((entry: any) => ({
              ip: entry.ip,
              location: entry.location,
              timestamp: entry.timestamp?.toISOString(),
              device: entry.device,
            })),
        }
      : undefined,

    subscription: user.subscription,
  };
};
