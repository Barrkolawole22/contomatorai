// backend/src/routes/billing.routes.ts - Word-Based Billing Routes (Paystack)
console.log('📦 Loading billing routes...');

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import billingController from '../controllers/billing.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { body, query } from 'express-validator';

const router = Router();

// Validation schemas
const createPaymentIntentValidation = [
  body('packageId')
    .notEmpty()
    .withMessage('Package ID is required')
    .isString()
    .withMessage('Package ID must be a string')
];

const verifyTransactionValidation = [
  body('reference')
    .notEmpty()
    .withMessage('Transaction reference is required')
    .isString()
    .withMessage('Transaction reference must be a string')
];

const usageAnalyticsValidation = [
  query('timeframe')
    .optional()
    .isIn(['day', 'week', 'month', 'all'])
    .withMessage('Timeframe must be one of: day, week, month, all')
];

// Apply authentication middleware to all routes except webhook
router.use('/webhook', (req, res, next) => {
  // Skip auth for webhook endpoint
  next();
});

router.use(authMiddleware);

// GET /api/billing/packages - Get available word packages
router.get('/packages', billingController.getWordPackages.bind(billingController));

// GET /api/billing/info - Get user's billing information
router.get('/info', billingController.getBillingInfo.bind(billingController));

// POST /api/billing/initialize-transaction - Initialize Paystack transaction
router.post(
  '/initialize-transaction',
  createPaymentIntentValidation,
  validateRequest,
  billingController.initializeTransaction.bind(billingController)
);

// POST /api/billing/verify-transaction - Verify Paystack transaction and add word credits
router.post(
  '/verify-transaction',
  verifyTransactionValidation,
  validateRequest,
  billingController.verifyTransaction.bind(billingController)
);

// GET /api/billing/usage-analytics - Get word usage analytics
router.get(
  '/usage-analytics',
  usageAnalyticsValidation,
  validateRequest,
  billingController.getUsageAnalytics.bind(billingController)
);

// POST /api/billing/webhook - Paystack webhook (no auth required)
router.post('/webhook', billingController.handlePaystackWebhook.bind(billingController));

console.log('✅ Billing routes loaded successfully');

export default router;