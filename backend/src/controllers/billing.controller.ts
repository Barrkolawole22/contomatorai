// backend/src/controllers/billing.controller.ts
import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import User from '../models/user.model';
import SubscriptionPlan from '../models/subscriptionPlan.model';
import CreditPackage from '../models/creditPackage.model';
import logger from '../config/logger';
import { env } from '../config/env';
import { formatUserResponse } from '../utils/formatUserResponse';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Returns an Axios instance authorised with the Paystack secret key.
 * Throws early if the key is not configured so callers receive a clear
 * error instead of a silent Paystack 401.
 */
const getPaystackAPI = () => {
  const secretKey = env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured. Cannot make Paystack API calls.');
  }
  return axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  });
};

class BillingController {
  async getWordPackages(req: AuthenticatedRequest, res: Response) {
    try {
      const currency = (req.query.currency as string) || 'NGN';

      const [dbPlans, dbTopups] = await Promise.all([
        SubscriptionPlan.find({ isActive: true }),
        CreditPackage.find({ isActive: true }).sort({ wordCount: 1 }),
      ]);

      const subscriptionPlans = dbPlans.map(plan => {
        const priceObj = (plan as any).prices[currency] || (plan as any).prices['NGN'];
        return {
          id: (plan as any).planId,
          type: 'subscription',
          name: (plan as any).name,
          description: (plan as any).description,
          wordsPerMonth: (plan as any).wordsPerMonth,
          price: priceObj.amount,
          formattedPrice: priceObj.formatted,
          currency,
          features: (plan as any).features,
          isPopular: (plan as any).isPopular,
          autonomousPipeline: (plan as any).autonomousPipeline,
          knowledgebaseDocs: (plan as any).knowledgebaseDocs,
          allowedModels: [],
        };
      });

      const topupPackages = dbTopups.map(pkg => {
        const priceObj = (pkg as any).prices[currency] || (pkg as any).prices['NGN'];
        return {
          id: (pkg as any).packageId,
          type: 'topup',
          name: (pkg as any).name,
          description: (pkg as any).description,
          wordCount: (pkg as any).wordCount,
          price: priceObj.amount,
          formattedPrice: priceObj.formatted,
          currency,
          features: (pkg as any).features,
          isPopular: (pkg as any).isPopular,
        };
      });

      return res.json({ success: true, data: { subscriptionPlans, topupPackages } });
    } catch (error: any) {
      logger.error('Error fetching billing packages:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch billing packages' });
    }
  }

  async getBillingInfo(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await User.findById(userId).select(
        'wordCredits totalWordsUsed currentMonthUsage wordUsageHistory wordPackagePurchases subscription preferences'
      );
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const monthlyStats = user.getWordUsageStats('month');
      const weeklyStats = user.getWordUsageStats('week');
      const dailyStats = user.getWordUsageStats('day');

      const purchasesArray = user.wordPackagePurchases || [];
      const purchaseHistory = purchasesArray
        .filter(purchase => purchase.status === 'completed')
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
        .slice(0, 10)
        .map(purchase => ({
          id: purchase.packageId,
          packageName: purchase.packageName,
          wordsIncluded: purchase.wordsIncluded,
          amountPaid: purchase.amountPaid,
          currency: purchase.currency,
          purchaseDate: purchase.purchaseDate,
          formattedAmount: (purchase.amountPaid / 100).toFixed(2),
        }));

      return res.json({
        success: true,
        data: {
          wordCredits: user.wordCredits,
          totalWordsUsed: user.totalWordsUsed,
          currentMonthUsage: user.currentMonthUsage,
          plan: user.subscription?.plan || 'free',
          preferredCurrency: (user as any).preferences?.currency || 'NGN',
          usageStats: { daily: dailyStats, weekly: weeklyStats, monthly: monthlyStats },
          purchaseHistory,
          needsRefill: user.wordCredits < 1000,
          user: formatUserResponse(user),
        },
      });
    } catch (error: any) {
      logger.error('Error fetching billing info:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch billing information' });
    }
  }

  async initializeTransaction(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const { packageId, planId, currency = 'NGN' } = req.body;
      const targetId = packageId || planId;
      if (!targetId) {
        return res.status(400).json({ success: false, message: 'Package ID or Plan ID is required' });
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      let targetItem: any = await SubscriptionPlan.findOne({ planId: targetId, isActive: true });
      if (!targetItem) {
        targetItem = await CreditPackage.findOne({ packageId: targetId, isActive: true });
      }
      if (!targetItem) {
        return res.status(404).json({ success: false, message: 'Plan or package not found' });
      }

      const priceObj = targetItem.prices[currency] || targetItem.prices['NGN'];
      const priceInCents = priceObj.amount;
      const itemWordCount = targetItem.wordCount || targetItem.wordsPerMonth;

      let paystackAPI;
      try {
        paystackAPI = getPaystackAPI();
      } catch (keyError: any) {
        logger.error('Paystack key error:', keyError.message);
        return res.status(500).json({ success: false, message: 'Payment provider is not configured' });
      }

      const response = await paystackAPI.post('/transaction/initialize', {
        email: user.email,
        amount: priceInCents,
        currency,
        metadata: {
          userId: user._id.toString(),
          packageId: targetId,
          packageName: targetItem.name,
          wordCount: itemWordCount.toString(),
          custom_fields: [
            { display_name: 'User Name', variable_name: 'user_name', value: user.name },
            { display_name: 'Package', variable_name: 'package_name', value: targetItem.name },
          ],
        },
        callback_url: `${env.FRONTEND_URL}/dashboard/billing?verify=1`,
        channels: ['card', 'bank', 'ussd', 'mobile_money'],
      });

      if (response.data.status) {
        return res.json({
          success: true,
          data: {
            authorizationUrl: response.data.data.authorization_url,
            accessCode: response.data.data.access_code,
            reference: response.data.data.reference,
            packageInfo: {
              name: targetItem.name,
              description: targetItem.description,
              wordCount: itemWordCount,
              formattedPrice: priceObj.formatted,
            },
          },
        });
      } else {
        throw new Error('Failed to initialize transaction');
      }
    } catch (error: any) {
      logger.error('Error initializing transaction:', error.response?.data || error.message);
      return res.status(500).json({
        success: false,
        message: error.response?.data?.message || 'Failed to initialize payment',
      });
    }
  }

  async verifyTransaction(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const { reference } = req.body;
      if (!reference) {
        return res.status(400).json({ success: false, message: 'Transaction reference is required' });
      }

      let paystackAPI;
      try {
        paystackAPI = getPaystackAPI();
      } catch (keyError: any) {
        logger.error('Paystack key error:', keyError.message);
        return res.status(500).json({ success: false, message: 'Payment provider is not configured' });
      }

      let response;
      try {
        response = await paystackAPI.get(`/transaction/verify/${reference}`);
      } catch (apiError: any) {
        logger.error('Paystack API Error:', apiError.response?.data || apiError.message);
        return res.status(400).json({
          success: false,
          message: apiError.response?.data?.message || 'Failed to connect to Paystack verification API',
        });
      }

      if (!response.data.status) {
        return res.status(400).json({
          success: false,
          message: response.data.message || 'Payment verification failed',
        });
      }

      const transactionData = response.data.data;
      if (transactionData.status !== 'success') {
        return res.status(400).json({
          success: false,
          message: `Payment was not completed. Status is: ${transactionData.status}`,
        });
      }

      let metadata = transactionData.metadata;
      if (typeof metadata === 'string') {
        try { metadata = JSON.parse(metadata); } catch (e) { /* ignore */ }
      }

      if (!metadata || metadata.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized transaction access (metadata mismatch)',
        });
      }

      const user = await User.findById(userId);
      let targetItem: any = await SubscriptionPlan.findOne({ planId: metadata.packageId });
      if (!targetItem) {
        targetItem = await CreditPackage.findOne({ packageId: metadata.packageId });
      }
      if (!user || !targetItem) {
        return res.status(404).json({
          success: false,
          message: 'User or purchased package not found in database',
        });
      }

      const purchasesArray = user.wordPackagePurchases || [];
      const existingPurchase = purchasesArray.find(
        (purchase: any) => purchase.stripePaymentIntentId === reference
      );
      if (existingPurchase) {
        const updatedUser = await User.findById(userId);
        return res.json({
          success: true,
          message: 'Payment already processed',
          data: {
            wordCreditsAdded: 0,
            newWordCreditsBalance: user.wordCredits,
            user: formatUserResponse(updatedUser),
          },
        });
      }

      const isSubscriptionPlan = !!targetItem.planId;
      const targetId = targetItem.planId || targetItem.packageId;
      const itemWordCount = targetItem.wordCount || targetItem.wordsPerMonth;

      if (isSubscriptionPlan || targetItem.name.toLowerCase().includes('enterprise')) {
        const planName = targetItem.planId || 'enterprise';
        (user as any).subscription = (user as any).subscription || { status: 'active' };
        (user as any).subscription.plan = planName;
        (user as any).subscription.status = 'active';
        (user as any).subscription.currentPeriodStart = new Date();
        (user as any).subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      if (typeof user.addWordCredits === 'function') {
        await user.addWordCredits(itemWordCount, {
          packageId: targetId,
          packageName: targetItem.name,
          amountPaid: transactionData.amount,
          currency: transactionData.currency,
          stripePaymentIntentId: reference,
          status: 'completed',
        });
      } else {
        user.wordCredits = (user.wordCredits || 0) + itemWordCount;
        if (!user.wordPackagePurchases) user.wordPackagePurchases = [];
        user.wordPackagePurchases.push({
          packageId: targetId,
          packageName: targetItem.name,
          wordsIncluded: itemWordCount,
          amountPaid: transactionData.amount,
          currency: transactionData.currency,
          purchaseDate: new Date(),
          stripePaymentIntentId: reference,
          status: 'completed',
        });
        await user.save();
      }

      const updatedUser = await User.findById(userId);
      return res.json({
        success: true,
        message: 'Payment verified and word credits added',
        data: {
          wordCreditsAdded: itemWordCount,
          newWordCreditsBalance: updatedUser?.wordCredits,
          packageName: targetItem.name,
          newPlan: updatedUser?.subscription?.plan,
          amountPaid: `${transactionData.currency} ${(transactionData.amount / 100).toFixed(2)}`,
          transactionReference: reference,
          user: formatUserResponse(updatedUser),
        },
      });
    } catch (error: any) {
      logger.error('Error verifying transaction:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify payment',
      });
    }
  }

  /**
   * PAYSTACK WEBHOOK
   *
   * The route must be registered with express.raw() body parsing so that
   * req.body is a raw Buffer — do NOT run express.json() before this route.
   * The HMAC is computed directly over the Buffer, which matches what
   * Paystack signs. Calling JSON.stringify(Buffer) would produce the wrong
   * digest and every webhook would be rejected.
   */
  async handlePaystackWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
      res.status(400).send('No signature');
      return;
    }

    try {
      const secretKey = env.PAYSTACK_SECRET_KEY;
      if (!secretKey) {
        logger.error('Webhook received but PAYSTACK_SECRET_KEY is not configured');
        res.status(500).send('Payment provider not configured');
        return;
      }

      // req.body must be a Buffer (express.raw middleware on this route)
      const computedHash = crypto
        .createHmac('sha512', secretKey)
        .update(req.body as Buffer)
        .digest('hex');

      if (signature !== computedHash) {
        res.status(400).send('Invalid signature');
        return;
      }

      // Body is a Buffer here; parse it to JSON for the event data
      const event = JSON.parse((req.body as Buffer).toString('utf8'));

      switch (event.event) {
        case 'charge.success':
          await this.handleChargeSuccess(event.data);
          break;
        case 'charge.failed':
          await this.handleChargeFailed(event.data);
          break;
      }

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  private async handleChargeSuccess(data: any) {
    try {
      let metadata = data.metadata;
      if (typeof metadata === 'string') {
        try { metadata = JSON.parse(metadata); } catch (e) { /* ignore */ }
      }

      const userId = metadata?.userId;
      const packageId = metadata?.packageId;
      const reference = data.reference;

      if (!userId || !packageId) return;

      const user = await User.findById(userId);
      let targetItem: any = await SubscriptionPlan.findOne({ planId: packageId });
      if (!targetItem) {
        targetItem = await CreditPackage.findOne({ packageId });
      }
      if (!user || !targetItem) return;

      const purchasesArray = user.wordPackagePurchases || [];
      const existingPurchase = purchasesArray.find(
        (purchase: any) => purchase.stripePaymentIntentId === reference
      );
      if (existingPurchase) return;

      const isSubscriptionPlan = !!targetItem.planId;
      const targetId = targetItem.planId || targetItem.packageId;
      const itemWordCount = targetItem.wordCount || targetItem.wordsPerMonth;

      if (isSubscriptionPlan) {
        (user as any).subscription = (user as any).subscription || { status: 'active' };
        (user as any).subscription.plan = targetItem.planId;
        (user as any).subscription.status = 'active';
        (user as any).subscription.currentPeriodStart = new Date();
        (user as any).subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      if (typeof user.addWordCredits === 'function') {
        await user.addWordCredits(itemWordCount, {
          packageId: targetId,
          packageName: targetItem.name,
          amountPaid: data.amount,
          currency: data.currency,
          stripePaymentIntentId: reference,
          status: 'completed',
        });
      } else {
        user.wordCredits = (user.wordCredits || 0) + itemWordCount;
        if (!user.wordPackagePurchases) user.wordPackagePurchases = [];
        user.wordPackagePurchases.push({
          packageId: targetId,
          packageName: targetItem.name,
          wordsIncluded: itemWordCount,
          amountPaid: data.amount,
          currency: data.currency,
          purchaseDate: new Date(),
          stripePaymentIntentId: reference,
          status: 'completed',
        });
        await user.save();
      }
    } catch (error: any) {
      logger.error('Error handling charge success webhook:', error);
    }
  }

  private async handleChargeFailed(data: any) {
    try {
      let metadata = data.metadata;
      if (typeof metadata === 'string') {
        try { metadata = JSON.parse(metadata); } catch (e) { /* ignore */ }
      }

      const userId = metadata?.userId;
      const reference = data.reference;

      if (userId) {
        const user = await User.findById(userId);
        if (user && user.wordPackagePurchases) {
          const purchase = user.wordPackagePurchases.find(
            p => p.stripePaymentIntentId === reference
          );
          if (purchase) {
            purchase.status = 'failed';
            await user.save();
          }
        }
      }
    } catch (error: any) {
      logger.error('Error handling charge failure webhook:', error);
    }
  }

  async getUsageAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const { timeframe = 'month' } = req.query;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const validTimeframes = ['day', 'week', 'month', 'all'];
      const validatedTimeframe = validTimeframes.includes(timeframe as string)
        ? (timeframe as 'day' | 'week' | 'month' | 'all')
        : 'month';

      const stats = user.getWordUsageStats(validatedTimeframe);
      const usageByDate: { [key: string]: number } = {};

      const usageHistoryArray = user.wordUsageHistory || [];
      usageHistoryArray.forEach((entry: any) => {
        if (entry.date >= stats.startDate) {
          const dateKey = entry.date.toISOString().split('T')[0];
          usageByDate[dateKey] = (usageByDate[dateKey] || 0) + entry.wordsUsed;
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
          totalWordsUsed: user.totalWordsUsed,
          user: formatUserResponse(user),
        },
      });
    } catch (error: any) {
      logger.error('Error fetching usage analytics:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch usage analytics' });
    }
  }

  async refreshUserData(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      return res.json({
        success: true,
        message: 'User data refreshed successfully',
        user: formatUserResponse(user),
      });
    } catch (error: any) {
      logger.error('Error refreshing user data:', error);
      return res.status(500).json({ success: false, message: 'Failed to refresh user data' });
    }
  }

  async getUserPlan(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const plan =
        (user as any).subscription?.plan ||
        (user as any).plan ||
        (user as any).subscriptionStatus ||
        'free';

      return res.json({
        success: true,
        data: {
          plan,
          subscription: user.subscription,
          subscriptionStatus: user.subscriptionStatus,
          userPlan: (user as any).plan,
        },
      });
    } catch (error: any) {
      logger.error('Error getting user plan:', error);
      return res.status(500).json({ success: false, message: 'Failed to get user plan' });
    }
  }

  async updateCurrency(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { currency } = req.body;

      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      (user as any).preferences = (user as any).preferences || {};
      (user as any).preferences.currency = currency;
      await user.save();

      return res.json({ success: true, message: 'Currency updated successfully', currency });
    } catch (error: any) {
      logger.error('Error updating currency:', error);
      return res.status(500).json({ success: false, message: 'Failed to update currency' });
    }
  }
}

export default new BillingController();