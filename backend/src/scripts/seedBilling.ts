// backend/src/scripts/seedBilling.ts
import SubscriptionPlan from '../models/subscriptionPlan.model';
import CreditPackage from '../models/creditPackage.model';
import logger from '../config/logger';

// ─── Subscription plan definitions ───────────────────────────────────────────
const SUBSCRIPTION_PLANS = [
  {
    planId: 'free',
    name: 'Free',
    description: 'Get started with basic content generation',
    wordsPerMonth: 1000,
    prices: {
      USD: { amount: 0, formatted: 'Free' },
      NGN: { amount: 0, formatted: 'Free' },
    },
    features: [
      '1,000 words one-time',
      'Gemini Flash model only',
      'WordPress publishing',
      '1 knowledgebase doc',
      'Manual generation only',
    ],
    autonomousPipeline: false,
    knowledgebaseDocs: 1,
    isActive: true,
    isPopular: false,
  },
  {
    planId: 'basic',
    name: 'Basic',
    description: 'For individual content creators',
    wordsPerMonth: 30000,
    prices: {
      USD: { amount: 1900, formatted: '$19/mo' },
      NGN: { amount: 2500000, formatted: '₦25,000/mo' },
    },
    features: [
      '30,000 words/month',
      'Gemini Flash + Pro models',
      'WordPress publishing',
      'Knowledgebase (3 docs)',
      'Manual generation only',
    ],
    autonomousPipeline: false,
    knowledgebaseDocs: 3,
    isActive: true,
    isPopular: false,
  },
  {
    planId: 'pro',
    name: 'Pro',
    description: 'For serious content operations',
    wordsPerMonth: 100000,
    prices: {
      USD: { amount: 4900, formatted: '$49/mo' },
      NGN: { amount: 6500000, formatted: '₦65,000/mo' },
    },
    features: [
      '100,000 words/month',
      'All AI models (Flash, Pro, GPT-4o, Claude)',
      'WordPress publishing',
      'Knowledgebase (20 docs)',
      'Autonomous pipeline',
      'Bulk generation',
      'CSV calendar upload',
    ],
    autonomousPipeline: true,
    knowledgebaseDocs: 20,
    isActive: true,
    isPopular: true,
  },
  {
    planId: 'agency',
    name: 'Agency',
    description: 'For agencies and power users',
    wordsPerMonth: 300000,
    prices: {
      USD: { amount: 9900, formatted: '$99/mo' },
      NGN: { amount: 13000000, formatted: '₦130,000/mo' },
    },
    features: [
      '300,000 words/month',
      'All AI models',
      'Unlimited WordPress sites',
      'Unlimited knowledgebase docs',
      'Full autonomous pipeline',
      'Bulk generation',
      'Priority support',
      'White-label ready',
    ],
    autonomousPipeline: true,
    knowledgebaseDocs: -1,
    isActive: true,
    isPopular: false,
  },
];

// ─── Credit topup definitions ─────────────────────────────────────────────────
const CREDIT_PACKAGES = [
  {
    packageId: 'topup_small',
    name: 'Small Topup',
    description: 'Extra words, never expire',
    wordCount: 10000,
    prices: {
      USD: { amount: 900, formatted: '$9' },
      NGN: { amount: 1200000, formatted: '₦12,000' },
    },
    features: ['10,000 words', 'Never expires', 'All models'],
    isActive: true,
    isPopular: false,
  },
  {
    packageId: 'topup_medium',
    name: 'Medium Topup',
    description: 'Best value one-time pack',
    wordCount: 50000,
    prices: {
      USD: { amount: 2900, formatted: '$29' },
      NGN: { amount: 3800000, formatted: '₦38,000' },
    },
    features: ['50,000 words', 'Never expires', 'All models', '20% savings vs small'],
    isActive: true,
    isPopular: true,
  },
  {
    packageId: 'topup_large',
    name: 'Large Topup',
    description: 'For high volume needs',
    wordCount: 150000,
    prices: {
      USD: { amount: 6900, formatted: '$69' },
      NGN: { amount: 9000000, formatted: '₦90,000' },
    },
    features: ['150,000 words', 'Never expires', 'All models', '35% savings vs small'],
    isActive: true,
    isPopular: false,
  },
];

// ─── Main seed function ───────────────────────────────────────────────────────
export async function seedBillingData(): Promise<void> {
  try {
    // Seed subscription plans
    const planCount = await SubscriptionPlan.countDocuments();
    if (planCount === 0) {
      await SubscriptionPlan.insertMany(SUBSCRIPTION_PLANS);
      logger.info(`✅ Seeded ${SUBSCRIPTION_PLANS.length} subscription plans`);
    } else {
      // Upsert to keep data fresh without wiping history
      for (const plan of SUBSCRIPTION_PLANS) {
        await SubscriptionPlan.findOneAndUpdate(
          { planId: plan.planId },
          { $set: plan },
          { upsert: true }
        );
      }
      logger.info(`✅ Subscription plans up to date (${planCount} existing)`);
    }

    // Seed credit packages
    const pkgCount = await CreditPackage.countDocuments();
    if (pkgCount === 0) {
      await CreditPackage.insertMany(CREDIT_PACKAGES);
      logger.info(`✅ Seeded ${CREDIT_PACKAGES.length} credit packages`);
    } else {
      for (const pkg of CREDIT_PACKAGES) {
        await CreditPackage.findOneAndUpdate(
          { packageId: pkg.packageId },
          { $set: pkg },
          { upsert: true }
        );
      }
      logger.info(`✅ Credit packages up to date (${pkgCount} existing)`);
    }
  } catch (error: any) {
    logger.error('❌ Billing seed failed:', error);
    // Non-fatal — server continues
  }
}

export default seedBillingData;
