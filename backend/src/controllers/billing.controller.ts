// backend/src/controllers/billing.controller.ts
import { Request, Response } from 'express';
import axios from 'axios';
import User from '../models/user.model';
import SubscriptionPlan from '../models/subscriptionPlan.model';
import CreditPackage from '../models/creditPackage.model';
import logger from '../config/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const paystackAPI = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
});

const formatUserResponse = (userData: any) => {
  let userPlan = 'free';
  if (userData.subscriptionPlan && userData.subscriptionPlan !== 'free') {
    userPlan = userData.subscriptionPlan;
  } else if (userData.subscription?.plan) {
    userPlan = userData.subscription.plan;
  } else if (userData.subscriptionStatus) {
    userPlan = userData.subscriptionStatus;
  }

  return {
    id: userData._id.toString(),
    email: userData.email,
    name: userData.name,
    role: userData.role || 'user',
    isAdmin: ['admin', 'super_admin'].includes(userData.role),

    wordCredits: userData.wordCredits || 0,
    subscriptionWordBalance: userData.subscriptionWordBalance || 0,
    topupWordBalance: userData.topupWordBalance || 0,
    subscriptionRenewalDate: userData.subscriptionRenewalDate,
    preferredCurrency: userData.preferredCurrency || 'NGN',
    subscriptionPlan: userData.subscriptionPlan || 'free',
    totalWordsUsed: userData.totalWordsUsed || 0,
    currentMonthUsage: userData.currentMonthUsage || 0,

    // Legacy compatibility
    credits: userData.credits || userData.wordCredits || 0,
    usageCredits: userData.wordCredits || 0,
    creditUsage: userData.currentMonthUsage || 0,

    status: userData.status || 'active',
    emailVerified: userData.emailVerified || false,
    createdAt: userData.createdAt?.toISOString() || new Date().toISOString(),
    lastLogin: userData.lastLogin?.toISOString() || undefined,

    plan: userPlan,
    subscriptionStatus: userData.subscriptionStatus || userPlan,
    maxCredits: userData.wordCredits || 0,

    avatar: userData.avatar,
    phone: userData.phone,
    location: userData.location,
    company: userData.company,
    bio: userData.bio,
    timezone: userData.timezone,
    language: userData.language,

    preferences: userData.preferences,

    security: userData.security
      ? {
          twoFactorEnabled: userData.security.twoFactorEnabled || false,
          lastPasswordChange: userData.security.lastPasswordChange?.toISOString(),
          loginHistory: userData.security.loginHistory
            ?.slice(0, 5)
            .map((entry: any) => ({
              ip: entry.ip,
              location: entry.location,
              timestamp: entry.timestamp?.toISOString(),
              device: entry.device,
            })) || [],
        }
      : undefined,

    subscription: userData.subscription,
  };
};

class BillingController {
  // GET /api/billing/packages
  async getWordPackages(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await User.findById(userId).select('preferredCurrency');
      const currency: 'USD' | 'NGN' = (user?.preferredCurrency as 'USD' | 'NGN') || 'NGN';

      const [plans, packages] = await Promise.all([
        SubscriptionPlan.find({ isActive: true }).sort({ wordsPerMonth: 1 }),
        CreditPackage.find({ isActive: true }).sort({ wordCount: 1 }),
      ]);

      const subscriptionPlans = plans.map(plan => ({
        id: plan._id.toString(),
        type: 'subscription',
        name: plan.name,
        description: plan.description,
        wordsPerMonth: plan.wordsPerMonth,
        price: plan.prices[currency].amount,
        formattedPrice: plan.prices[currency].formatted,
        currency,
        features: plan.features,
        isPopular: plan.isPopular,
        autonomousPipeline: plan.autonomousPipeline,
        knowledgebaseDocs: plan.knowledgebaseDocs,
      }));

      const topupPackages = packages.map(pkg => ({
        id: pkg._id.toString(),
        type: 'topup',
        name: pkg.name,
        description: pkg.description,
        wordCount: pkg.wordCount,
        price: pkg.prices[currency].amount,
        formattedPrice: pkg.prices[currency].formatted,
        currency,
        features: pkg.features,
        isPopular: pkg.isPopular,
      }));

      return res.json({
        success: true,
        data: { subscriptionPlans, topupPackages, currency },
      });
    } catch (error: any) {
      logger.error('Error fetching packages:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch packages' });
    }
  }

  // GET /api/billing/info
  async getBillingInfo(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await User.findById(userId).select(
        'wordCredits totalWordsUsed currentMonthUsage wordUsageHistory wordPackagePurchases subscription subscriptionPlan subscriptionWordBalance topupWordBalance subscriptionRenewalDate preferredCurrency'
      );

      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      let planName = 'Free';
      let wordsPerMonth = 0;
      let autonomousPipelineEnabled = false;

      if (user.subscriptionPlan && user.subscriptionPlan !== 'free') {
        const plan = await SubscriptionPlan.findOne({ planId: user.subscriptionPlan, isActive: true });
        if (plan) {
          planName = plan.name;
          wordsPerMonth = plan.wordsPerMonth;
          autonomousPipelineEnabled = plan.autonomousPipeline;
        }
      }

      const monthlyStats = user.getWordUsageStats('month');
      const weeklyStats = user.getWordUsageStats('week');
      const dailyStats = user.getWordUsageStats('day');

      const purchaseHistory = user.wordPackagePurchases
        .filter(p => p.status === 'completed')
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
        .slice(0, 10)
        .map(p => ({
          id: p.packageId,
          packageName: p.packageName,
          wordsIncluded: p.wordsIncluded,
          amountPaid: p.amountPaid,
          currency: p.currency,
          purchaseDate: p.purchaseDate,
          formattedAmount: (p.amountPaid / 100).toFixed(2),
        }));

      return res.json({
        success: true,
        data: {
          wordCredits: user.wordCredits,
          subscriptionWordBalance: user.subscriptionWordBalance || 0,
          topupWordBalance: user.topupWordBalance || 0,
          subscriptionRenewalDate: user.subscriptionRenewalDate,
          preferredCurrency: user.preferredCurrency || 'NGN',
          planName,
          wordsPerMonth,
          autonomousPipelineEnabled,
          totalWordsUsed: user.totalWordsUsed,
          currentMonthUsage: user.currentMonthUsage,
          plan: user.subscriptionPlan || 'free',
          usageStats: { daily: dailyStats, weekly: weeklyStats, monthly: monthlyStats },
          purchaseHistory,
          needsRefill:
            (user.subscriptionWordBalance || 0) + (user.topupWordBalance || 0) < 1000,
          user: formatUserResponse(user),
        },
      });
    } catch (error: any) {
      logger.error('Error fetching billing info:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch billing information' });
    }
  }

  // POST /api/billing/initialize-transaction
  async initializeTransaction(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const { planId, packageId, currency = 'NGN' } = req.body;

      if (!planId && !packageId) {
        return res.status(400).json({ success: false, message: 'planId or packageId is required' });
      }

      const validCurrencies = ['USD', 'NGN'];
      if (!validCurrencies.includes(currency)) {
        return res.status(400).json({ success: false, message: 'Currency must be USD or NGN' });
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      let amount: number;
      let itemName: string;
      let itemDescription: string;
      let type: 'subscription' | 'topup';
      let itemId: string;

      if (planId) {
        const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
        if (!plan) return res.status(404).json({ success: false, message: 'Subscription plan not found' });

        const priceEntry = plan.prices[currency as 'USD' | 'NGN'];
        if (!priceEntry) return res.status(400).json({ success: false, message: 'Currency not supported for this plan' });

        amount = priceEntry.amount;
        itemName = plan.name;
        itemDescription = plan.description;
        type = 'subscription';
        itemId = plan._id.toString();
      } else {
        const pkg = await CreditPackage.findOne({ _id: packageId, isActive: true });
        if (!pkg) return res.status(404).json({ success: false, message: 'Credit package not found' });

        const priceEntry = pkg.prices[currency as 'USD' | 'NGN'];
        if (!priceEntry) return res.status(400).json({ success: false, message: 'Currency not supported for this package' });

        amount = priceEntry.amount;
        itemName = pkg.name;
        itemDescription = pkg.description;
        type = 'topup';
        itemId = pkg._id.toString();
      }

      const response = await paystackAPI.post('/transaction/initialize', {
        email: user.email,
        amount,
        currency,
        metadata: {
          userId: user._id.toString(),
          type,
          ...(planId ? { planId: itemId } : { packageId: itemId }),
          custom_fields: [
            { display_name: 'User Name', variable_name: 'user_name', value: user.name },
            { display_name: 'Item', variable_name: 'item_name', value: itemName },
            { display_name: 'Type', variable_name: 'purchase_type', value: type },
          ],
        },
        callback_url: `${process.env.FRONTEND_URL}/dashboard/billing?verify=1`,
        channels: ['card', 'bank', 'ussd', 'mobile_money'],
      });

      if (!response.data.status) throw new Error('Failed to initialize Paystack transaction');

      return res.json({
        success: true,
        data: {
          authorizationUrl: response.data.data.authorization_url,
          accessCode: response.data.data.access_code,
          reference: response.data.data.reference,
          itemInfo: { name: itemName, description: itemDescription, type },
        },
      });
    } catch (error: any) {
      logger.error('Error initializing transaction:', error);
      return res.status(500).json({ success: false, message: 'Failed to initialize payment' });
    }
  }

  // POST /api/billing/verify-transaction
  async verifyTransaction(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const { reference } = req.body;
      if (!reference) return res.status(400).json({ success: false, message: 'Transaction reference is required' });

      const response = await paystackAPI.get(`/transaction/verify/${reference}`);

      if (!response.data.status || response.data.data.status !== 'success') {
        return res.status(400).json({ success: false, message: 'Payment verification failed or payment not successful' });
      }

      const transactionData = response.data.data;
      const metadata = transactionData.metadata;

      if (metadata.userId !== userId) {
        return res.status(403).json({ success: false, message: 'Unauthorized transaction access' });
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      // Idempotency check
      const alreadyProcessed = user.wordPackagePurchases.find(
        p => p.stripePaymentIntentId === reference
      );
      if (alreadyProcessed) {
        return res.json({
          success: true,
          message: 'Payment already processed',
          data: {
            wordCreditsAdded: 0,
            newWordCreditsBalance: user.wordCredits,
            user: formatUserResponse(user),
          },
        });
      }

      const txCurrency = transactionData.currency as 'USD' | 'NGN';

      if (metadata.type === 'subscription') {
        const plan = await SubscriptionPlan.findById(metadata.planId);
        if (!plan) return res.status(404).json({ success: false, message: 'Subscription plan not found' });

        // Record the purchase before resetting (resetSubscriptionWords calls save internally)
        user.wordPackagePurchases.push({
          packageId: plan.planId,
          packageName: plan.name,
          wordsIncluded: plan.wordsPerMonth,
          amountPaid: transactionData.amount,
          currency: txCurrency,
          purchaseDate: new Date(),
          stripePaymentIntentId: reference,
          status: 'completed',
        });
        user.subscriptionPlan = plan.planId;
        user.preferredCurrency = txCurrency;
        // Also add to legacy wordCredits for backward compat
        user.wordCredits = (user.wordCredits || 0) + plan.wordsPerMonth;
        await user.save();

        // resetSubscriptionWords sets subscriptionWordBalance and renewal date, then saves
        await user.resetSubscriptionWords(plan.wordsPerMonth);

        logger.info(`Subscription activated: User ${userId} -> ${plan.planId} (${plan.wordsPerMonth} words/mo)`);

        const updatedUser = await User.findById(userId);
        return res.json({
          success: true,
          message: 'Subscription activated',
          data: {
            wordCreditsAdded: plan.wordsPerMonth,
            newWordCreditsBalance: updatedUser?.wordCredits,
            planName: plan.name,
            transactionReference: reference,
            user: formatUserResponse(updatedUser),
          },
        });
      } else {
        // topup
        const pkg = await CreditPackage.findById(metadata.packageId);
        if (!pkg) return res.status(404).json({ success: false, message: 'Credit package not found' });

        user.preferredCurrency = txCurrency;
        await user.save();

        await user.addWordCredits(pkg.wordCount, {
          packageId: pkg.packageId,
          packageName: pkg.name,
          amountPaid: transactionData.amount,
          currency: txCurrency,
          stripePaymentIntentId: reference,
          status: 'completed',
          type: 'topup',
        });

        logger.info(`Topup added: User ${userId} -> ${pkg.wordCount} words`);

        const updatedUser = await User.findById(userId);
        return res.json({
          success: true,
          message: 'Credits added successfully',
          data: {
            wordCreditsAdded: pkg.wordCount,
            newWordCreditsBalance: updatedUser?.wordCredits,
            packageName: pkg.name,
            amountPaid: `${txCurrency} ${(transactionData.amount / 100).toFixed(2)}`,
            transactionReference: reference,
            user: formatUserResponse(updatedUser),
          },
        });
      }
    } catch (error: any) {
      logger.error('Error verifying transaction:', error);
      return res.status(500).json({ success: false, message: 'Failed to verify payment' });
    }
  }

  // PATCH /api/billing/currency
  async updateCurrency(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const { currency } = req.body;
      if (!['USD', 'NGN'].includes(currency)) {
        return res.status(400).json({ success: false, message: 'Currency must be USD or NGN' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { preferredCurrency: currency },
        { new: true }
      );

      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      logger.info(`Currency updated: User ${userId} -> ${currency}`);

      return res.json({
        success: true,
        message: 'Currency updated',
        data: { preferredCurrency: user.preferredCurrency, user: formatUserResponse(user) },
      });
    } catch (error: any) {
      logger.error('Error updating currency:', error);
      return res.status(500).json({ success: false, message: 'Failed to update currency' });
    }
  }

  // POST /api/billing/webhook — Paystack webhook (no auth)
  async handlePaystackWebhook(req: Request, res: Response): Promise<void> {
    const hash = req.headers['x-paystack-signature'];

    if (!hash) {
      logger.error('No Paystack signature in webhook');
      res.status(400).send('No signature');
      return;
    }

    try {
      const crypto = require('crypto');
      const computedHash = crypto
        .createHmac('sha512', PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== computedHash) {
        logger.error('Invalid Paystack webhook signature');
        res.status(400).send('Invalid signature');
        return;
      }

      const event = req.body;

      switch (event.event) {
        case 'charge.success':
          await this.handleChargeSuccess(event.data);
          break;
        case 'charge.failed':
          await this.handleChargeFailed(event.data);
          break;
        default:
          logger.info(`Unhandled webhook event: ${event.event}`);
      }

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  private async handleChargeSuccess(data: any) {
    try {
      const { userId, type, planId, packageId } = data.metadata || {};
      const reference = data.reference;

      if (!userId || !type) {
        logger.error('Missing metadata in webhook:', data.metadata);
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        logger.error(`Webhook: user not found for ${reference}`);
        return;
      }

      const alreadyProcessed = user.wordPackagePurchases.find(
        p => p.stripePaymentIntentId === reference
      );
      if (alreadyProcessed) {
        logger.info(`Webhook: already processed ${reference}`);
        return;
      }

      const txCurrency = data.currency as 'USD' | 'NGN';

      if (type === 'subscription') {
        const plan = await SubscriptionPlan.findById(planId);
        if (!plan) { logger.error(`Webhook: plan not found ${planId}`); return; }

        user.wordPackagePurchases.push({
          packageId: plan.planId,
          packageName: plan.name,
          wordsIncluded: plan.wordsPerMonth,
          amountPaid: data.amount,
          currency: txCurrency,
          purchaseDate: new Date(),
          stripePaymentIntentId: reference,
          status: 'completed',
        });
        user.subscriptionPlan = plan.planId;
        user.preferredCurrency = txCurrency;
        user.wordCredits = (user.wordCredits || 0) + plan.wordsPerMonth;
        await user.save();
        await user.resetSubscriptionWords(plan.wordsPerMonth);

        logger.info(`Webhook: subscription activated for user ${userId}, plan ${plan.planId}`);
      } else {
        const pkg = await CreditPackage.findById(packageId);
        if (!pkg) { logger.error(`Webhook: package not found ${packageId}`); return; }

        user.preferredCurrency = txCurrency;
        await user.save();
        await user.addWordCredits(pkg.wordCount, {
          packageId: pkg.packageId,
          packageName: pkg.name,
          amountPaid: data.amount,
          currency: txCurrency,
          stripePaymentIntentId: reference,
          status: 'completed',
          type: 'topup',
        });

        logger.info(`Webhook: topup added for user ${userId}, ${pkg.wordCount} words`);
      }
    } catch (error: any) {
      logger.error('Error handling charge.success webhook:', error);
    }
  }

  private async handleChargeFailed(data: any) {
    try {
      const userId = data.metadata?.userId;
      const reference = data.reference;

      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          const purchase = user.wordPackagePurchases.find(
            p => p.stripePaymentIntentId === reference
          );
          if (purchase) {
            purchase.status = 'failed';
            await user.save();
          }
        }
      }

      logger.info(`Payment failed for reference ${reference}`);
    } catch (error: any) {
      logger.error('Error handling charge.failed webhook:', error);
    }
  }

  // GET /api/billing/usage-analytics
  async getUsageAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const { timeframe = 'month' } = req.query;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const validTimeframes = ['day', 'week', 'month', 'all'];
      const validated = validTimeframes.includes(timeframe as string)
        ? (timeframe as 'day' | 'week' | 'month' | 'all')
        : 'month';

      const stats = user.getWordUsageStats(validated);

      const usageByDate: { [key: string]: number } = {};
      user.wordUsageHistory.forEach((entry: any) => {
        if (entry.date >= stats.startDate) {
          const key = entry.date.toISOString().split('T')[0];
          usageByDate[key] = (usageByDate[key] || 0) + entry.wordsUsed;
        }
      });

      const chartData = Object.entries(usageByDate)
        .map(([date, words]) => ({ date, words }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return res.json({
        success: true,
        data: {
          totalWords: stats.totalWords,
          usageEntries: stats.usageEntries,
          timeframe: stats.timeframe,
          chartData,
          currentCredits: user.wordCredits,
          subscriptionWordBalance: user.subscriptionWordBalance || 0,
          topupWordBalance: user.topupWordBalance || 0,
          totalWordsUsed: user.totalWordsUsed,
          user: formatUserResponse(user),
        },
      });
    } catch (error: any) {
      logger.error('Error fetching usage analytics:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch usage analytics' });
    }
  }

  // GET /api/billing/refresh
  async refreshUserData(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      return res.json({
        success: true,
        message: 'User data refreshed',
        user: formatUserResponse(user),
      });
    } catch (error: any) {
      logger.error('Error refreshing user data:', error);
      return res.status(500).json({ success: false, message: 'Failed to refresh user data' });
    }
  }

  // GET /api/billing/plan
  async getUserPlan(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      return res.json({
        success: true,
        data: {
          plan: user.subscriptionPlan || 'free',
          subscriptionWordBalance: user.subscriptionWordBalance || 0,
          topupWordBalance: user.topupWordBalance || 0,
          subscriptionRenewalDate: user.subscriptionRenewalDate,
          preferredCurrency: user.preferredCurrency || 'NGN',
        },
      });
    } catch (error: any) {
      logger.error('Error getting user plan:', error);
      return res.status(500).json({ success: false, message: 'Failed to get user plan' });
    }
  }
}

export default new BillingController();
