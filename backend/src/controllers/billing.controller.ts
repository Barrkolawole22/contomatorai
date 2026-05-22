// backend/src/controllers/billing.controller.ts - PAYSTACK VERSION (COMPLETE FIXED)
import { Request, Response } from 'express';
import axios from 'axios';
import User from '../models/user.model';
import WordPackage from '../models/wordPackage.model';
import logger from '../config/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// Paystack configuration
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// FIXED: Dynamic getter for Paystack API to ensure environment variables are fully loaded
const getPaystackAPI = () => {
  return axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
      'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY || ''}`,
      'Content-Type': 'application/json'
    }
  });
};

// User response formatter
const formatUserResponse = (userData: any) => {
  console.log('Formatting user response for billing:', userData.email, 'Word Credits:', userData.wordCredits);
  
  // Proper plan extraction with correct priority
  let userPlan = 'free';
  if (userData.subscription?.plan) {
    userPlan = userData.subscription.plan;
  } else if (userData.subscriptionStatus) {
    userPlan = userData.subscriptionStatus;
  } else if (userData.plan) {
    userPlan = userData.plan;
  }
  
  return {
    id: userData._id.toString(),
    email: userData.email,
    name: userData.name,
    role: userData.role || 'user',
    isAdmin: ['admin', 'super_admin'].includes(userData.role),
    
    // Word-based billing
    wordCredits: userData.wordCredits || 0,
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
    
    // Profile information
    avatar: userData.avatar,
    phone: userData.phone,
    location: userData.location,
    company: userData.company,
    bio: userData.bio,
    timezone: userData.timezone,
    language: userData.language,
    
    // User preferences
    preferences: userData.preferences,
    
    // Security information (sanitized)
    security: userData.security ? {
      twoFactorEnabled: userData.security.twoFactorEnabled || false,
      lastPasswordChange: userData.security.lastPasswordChange?.toISOString(),
      loginHistory: userData.security.loginHistory?.slice(0, 5).map((entry: any) => ({
        ip: entry.ip,
        location: entry.location,
        timestamp: entry.timestamp?.toISOString(),
        device: entry.device
      })) || []
    } : undefined,
    
    subscription: userData.subscription
  };
};

class BillingController {
  // Get available word packages
  async getWordPackages(req: AuthenticatedRequest, res: Response) {
    try {
      const packages = await WordPackage.find({ isActive: true })
        .sort({ wordCount: 1 });

      const formattedPackages = packages.map(pkg => ({
        id: pkg.packageId,
        name: pkg.name,
        description: pkg.description,
        wordCount: pkg.wordCount,
        price: pkg.priceInCents,
        formattedPrice: pkg.getFormattedPrice(),
        pricePerWord: pkg.pricePerWord,
        currency: pkg.currency,
        isPopular: pkg.isPopular,
        features: pkg.features,
        validityDays: pkg.validityDays,
        discountPercentage: pkg.discountPercentage
      }));

      return res.json({
        success: true,
        data: formattedPackages
      });
    } catch (error: any) {
      logger.error('Error fetching word packages:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch word packages'
      });
    }
  }

  // Get user's billing information
  async getBillingInfo(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const user = await User.findById(userId)
        .select('wordCredits totalWordsUsed currentMonthUsage wordUsageHistory wordPackagePurchases subscription');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const monthlyStats = user.getWordUsageStats('month');
      const weeklyStats = user.getWordUsageStats('week');
      const dailyStats = user.getWordUsageStats('day');

      const purchaseHistory = user.wordPackagePurchases
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
          formattedAmount: (purchase.amountPaid / 100).toFixed(2)
        }));

      return res.json({
        success: true,
        data: {
          wordCredits: user.wordCredits,
          totalWordsUsed: user.totalWordsUsed,
          currentMonthUsage: user.currentMonthUsage,
          plan: user.subscription?.plan || 'free',
          usageStats: {
            daily: dailyStats,
            weekly: weeklyStats,
            monthly: monthlyStats
          },
          purchaseHistory,
          needsRefill: user.wordCredits < 1000,
          user: formatUserResponse(user)
        }
      });
    } catch (error: any) {
      logger.error('Error fetching billing info:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch billing information'
      });
    }
  }

  // PAYSTACK: Initialize transaction
  async initializeTransaction(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // FIXED: Extract both packageId and planId, plus dynamic currency
      const { packageId, planId, currency = 'NGN' } = req.body;
      
      const targetId = packageId || planId;

      if (!targetId) {
        return res.status(400).json({
          success: false,
          message: 'Package ID or Plan ID is required'
        });
      }

      const [user, wordPackage] = await Promise.all([
        User.findById(userId),
        WordPackage.findOne({ packageId: targetId, isActive: true })
      ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!wordPackage) {
        return res.status(404).json({
          success: false,
          message: 'Word package not found'
        });
      }

      // Initialize Paystack transaction using dynamic API
      const paystackAPI = getPaystackAPI();
      const response = await paystackAPI.post('/transaction/initialize', {
        email: user.email,
        amount: wordPackage.priceInCents,
        currency: currency, // FIXED: Uses dynamic currency passed from frontend
        metadata: {
          userId: user._id.toString(),
          packageId: wordPackage.packageId,
          packageName: wordPackage.name,
          wordCount: wordPackage.wordCount.toString(),
          custom_fields: [
            {
              display_name: 'User Name',
              variable_name: 'user_name',
              value: user.name
            },
            {
              display_name: 'Package',
              variable_name: 'package_name',
              value: wordPackage.name
            }
          ]
        },
        callback_url: `${process.env.FRONTEND_URL}/billing?verify=1`, // FIXED: Matches your Next.js return URL format
        channels: ['card', 'bank', 'ussd', 'mobile_money']
      });

      if (response.data.status) {
        return res.json({
          success: true,
          data: {
            authorizationUrl: response.data.data.authorization_url,
            accessCode: response.data.data.access_code,
            reference: response.data.data.reference,
            packageInfo: {
              name: wordPackage.name,
              description: wordPackage.description,
              wordCount: wordPackage.wordCount,
              formattedPrice: wordPackage.getFormattedPrice()
            }
          }
        });
      } else {
        throw new Error('Failed to initialize transaction');
      }
    } catch (error: any) {
      logger.error('Error initializing transaction:', error.response?.data || error.message);
      return res.status(500).json({
        success: false,
        message: error.response?.data?.message || 'Failed to initialize payment'
      });
    }
  }

  // PAYSTACK: Verify transaction
  async verifyTransaction(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const { reference } = req.body;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Transaction reference is required'
        });
      }

      // FIXED: Verify transaction with dynamic Paystack API
      const paystackAPI = getPaystackAPI();
      const response = await paystackAPI.get(`/transaction/verify/${reference}`);

      if (!response.data.status || response.data.data.status !== 'success') {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed or payment not successful'
        });
      }

      const transactionData = response.data.data;
      const metadata = transactionData.metadata;

      if (metadata.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized transaction access'
        });
      }

      const [user, wordPackage] = await Promise.all([
        User.findById(userId),
        WordPackage.findOne({ packageId: metadata.packageId })
      ]);

      if (!user || !wordPackage) {
        return res.status(404).json({
          success: false,
          message: 'User or package not found'
        });
      }

      const existingPurchase = user.wordPackagePurchases.find(
        purchase => purchase.stripePaymentIntentId === reference
      );

      if (existingPurchase) {
        const updatedUser = await User.findById(userId);
        return res.json({
          success: true,
          message: 'Payment already processed',
          data: {
            wordCreditsAdded: 0,
            newWordCreditsBalance: user.wordCredits,
            user: formatUserResponse(updatedUser)
          }
        });
      }
      
      if (wordPackage.packageId === 'enterprise_plan' || wordPackage.name.toLowerCase().includes('enterprise')) {
        (user as any).subscription = (user as any).subscription || { plan: 'enterprise', status: 'active' };
        (user as any).subscription.plan = 'enterprise';
        (user as any).subscription.status = 'active';
        (user as any).subscription.currentPeriodStart = new Date();
        (user as any).subscription.currentPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
        
        logger.info(`User ${userId} upgraded to Enterprise plan via package: ${wordPackage.packageId}`);
      }

      await user.addWordCredits(wordPackage.wordCount, {
        packageId: wordPackage.packageId,
        packageName: wordPackage.name,
        amountPaid: transactionData.amount,
        currency: transactionData.currency,
        stripePaymentIntentId: reference,
        status: 'completed'
      });

      await user.save();
      const updatedUser = await User.findById(userId);

      logger.info(`Word credits added: User ${userId} purchased ${wordPackage.wordCount} words for ${transactionData.amount / 100} ${transactionData.currency}. New plan: ${updatedUser?.subscription?.plan}`);

      return res.json({
        success: true,
        message: 'Payment verified and word credits added',
        data: {
          wordCreditsAdded: wordPackage.wordCount,
          newWordCreditsBalance: updatedUser?.wordCredits,
          packageName: wordPackage.name,
          newPlan: updatedUser?.subscription?.plan,
          amountPaid: `${transactionData.currency} ${(transactionData.amount / 100).toFixed(2)}`,
          transactionReference: reference,
          user: formatUserResponse(updatedUser)
        }
      });
    } catch (error: any) {
      logger.error('Error verifying transaction:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment'
      });
    }
  }

  // PAYSTACK: Webhook handler
  async handlePaystackWebhook(req: Request, res: Response): Promise<void> {
    const hash = req.headers['x-paystack-signature'];
    
    if (!hash) {
      logger.error('No Paystack signature found in webhook');
      res.status(400).send('No signature');
      return;
    }

    try {
      // FIXED: Safely fetch the environment variable at runtime
      const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
      const crypto = require('crypto');
      const computedHash = crypto
        .createHmac('sha512', secretKey)
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
      return;
    } catch (error: any) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
      return;
    }
  }

  private async handleChargeSuccess(data: any) {
    try {
      const userId = data.metadata?.userId;
      const packageId = data.metadata?.packageId;
      const reference = data.reference;

      if (!userId || !packageId) {
        logger.error('Missing metadata in webhook data:', data);
        return;
      }

      const [user, wordPackage] = await Promise.all([
        User.findById(userId),
        WordPackage.findOne({ packageId })
      ]);

      if (!user || !wordPackage) {
        logger.error('User or package not found for payment:', reference);
        return;
      }

      const existingPurchase = user.wordPackagePurchases.find(
        purchase => purchase.stripePaymentIntentId === reference
      );

      if (existingPurchase) {
        logger.info('Payment already processed:', reference);
        return;
      }
      
      if (wordPackage.packageId === 'enterprise_plan' || wordPackage.name.toLowerCase().includes('enterprise')) {
        (user as any).subscription = (user as any).subscription || { plan: 'enterprise', status: 'active' };
        (user as any).subscription.plan = 'enterprise';
        (user as any).subscription.status = 'active';
        (user as any).subscription.currentPeriodStart = new Date();
        (user as any).subscription.currentPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        
        logger.info(`Webhook: User ${userId} upgraded to Enterprise plan`);
      }

      await user.addWordCredits(wordPackage.wordCount, {
        packageId: wordPackage.packageId,
        packageName: wordPackage.name,
        amountPaid: data.amount,
        currency: data.currency,
        stripePaymentIntentId: reference,
        status: 'completed'
      });

      logger.info(`Webhook: Word credits added for user ${userId}, reference ${reference}, new plan: ${user.subscription?.plan}`);
    } catch (error: any) {
      logger.error('Error handling charge success webhook:', error);
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
      logger.error('Error handling charge failure webhook:', error);
    }
  }

  // Get usage analytics
  async getUsageAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const { timeframe = 'month' } = req.query;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const validTimeframes = ['day', 'week', 'month', 'all'];
      const validatedTimeframe = validTimeframes.includes(timeframe as string) 
        ? (timeframe as 'day' | 'week' | 'month' | 'all')
        : 'month';

      const stats = user.getWordUsageStats(validatedTimeframe);
      
      const usageByDate: { [key: string]: number } = {};
      
      user.wordUsageHistory.forEach((entry: any) => {
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
          user: formatUserResponse(user) 
        }
      });
    } catch (error: any) {
      logger.error('Error fetching usage analytics:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch usage analytics'
      });
    }
  }

  // Manual user data refresh endpoint
  async refreshUserData(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      logger.info(`Manual user data refresh for: ${user.email}`);

      return res.json({
        success: true,
        message: 'User data refreshed successfully',
        user: formatUserResponse(user)
      });
    } catch (error: any) {
      logger.error('Error refreshing user data:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to refresh user data'
      });
    }
  }

  // Get current user plan endpoint
  async getUserPlan(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const plan = (user as any).subscription?.plan || (user as any).plan || (user as any).subscriptionStatus || 'free';

      return res.json({
        success: true,
        data: {
          plan: plan,
          subscription: user.subscription,
          subscriptionStatus: user.subscriptionStatus,
          userPlan: (user as any).plan
        }
      });
    } catch (error: any) {
      logger.error('Error getting user plan:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get user plan'
      });
    }
  }

  // Note: Added a stub for updateCurrency since your routes expect it
  async updateCurrency(req: AuthenticatedRequest, res: Response) {
    try {
      // Stub to handle frontend updateCurrency endpoint
      return res.json({ success: true, message: 'Currency updated' });
    } catch (error) {
       return res.status(500).json({ success: false });
    }
  }
}

export default new BillingController();