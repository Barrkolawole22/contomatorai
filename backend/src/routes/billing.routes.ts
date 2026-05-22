// backend/src/routes/billing.routes.ts
console.log('📦 Loading billing routes...');

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import billingController from '../controllers/billing.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { body, query } from 'express-validator';

const router = Router();

// ── Webhook (no auth — must be registered before authMiddleware) ──────────────
router.post('/webhook', billingController.handlePaystackWebhook.bind(billingController));

// ── Auth required for all routes below ───────────────────────────────────────
router.use(authMiddleware);

// Validation schemas
const initializeTransactionValidation = [
  body('planId')
    .optional()
    .isString()
    .withMessage('planId must be a string'),
  body('packageId')
    .optional()
    .isString()
    .withMessage('packageId must be a string'),
  body('currency')
    .optional()
    .isIn(['USD', 'NGN'])
    .withMessage('Currency must be USD or NGN'),
  body()
    .custom((_, { req }) => {
      if (!req.body.planId && !req.body.packageId) {
        throw new Error('planId or packageId is required');
      }
      return true;
    }),
];

const verifyTransactionValidation = [
  body('reference')
    .notEmpty()
    .withMessage('Transaction reference is required')
    .isString()
    .withMessage('Transaction reference must be a string'),
];

const updateCurrencyValidation = [
  body('currency')
    .notEmpty()
    .withMessage('Currency is required')
    .isIn(['USD', 'NGN'])
    .withMessage('Currency must be USD or NGN'),
];

const usageAnalyticsValidation = [
  query('timeframe')
    .optional()
    .isIn(['day', 'week', 'month', 'all'])
    .withMessage('Timeframe must be one of: day, week, month, all'),
];

// GET  /api/billing/packages
router.get('/packages', billingController.getWordPackages.bind(billingController));

// GET  /api/billing/info
router.get('/info', billingController.getBillingInfo.bind(billingController));

// GET  /api/billing/plan
router.get('/plan', billingController.getUserPlan.bind(billingController));

// GET  /api/billing/refresh
router.get('/refresh', billingController.refreshUserData.bind(billingController));

// GET  /api/billing/usage-analytics
router.get(
  '/usage-analytics',
  usageAnalyticsValidation,
  validateRequest,
  billingController.getUsageAnalytics.bind(billingController)
);

// POST /api/billing/initialize-transaction
router.post(
  '/initialize-transaction',
  initializeTransactionValidation,
  validateRequest,
  billingController.initializeTransaction.bind(billingController)
);

// POST /api/billing/verify-transaction
router.post(
  '/verify-transaction',
  verifyTransactionValidation,
  validateRequest,
  billingController.verifyTransaction.bind(billingController)
);

// PATCH /api/billing/currency
router.patch(
  '/currency',
  updateCurrencyValidation,
  validateRequest,
  billingController.updateCurrency.bind(billingController)
);

console.log('✅ Billing routes loaded successfully');

export default router;
