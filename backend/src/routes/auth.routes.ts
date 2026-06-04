// backend/src/routes/auth.routes.ts
import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  authRateLimitMiddleware,
  passwordResetRateLimitMiddleware,
  emailVerificationRateLimitMiddleware,
} from '../middleware/rateLimit.middleware';
import {
  registerValidation,
  loginValidation,
  refreshTokenValidation,
  changePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  updateProfileValidation,
  resendVerificationValidation,
} from '../validations/auth.validation';
import { changePassword as profileChangePassword } from '../controllers/profile.controller';
import passport from 'passport';
import { env } from '../config/env';

const router = Router();

// ── Public routes ─────────────────────────────────────────────────────────────

router.post('/register', authRateLimitMiddleware, registerValidation, validateRequest, authController.register);
router.post('/login', authRateLimitMiddleware, loginValidation, validateRequest, authController.login);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${env.FRONTEND_URL}/login?error=google-auth-failed`,
    session: false,
  }),
  authController.googleCallback
);

// Twitter OAuth
router.get('/twitter', passport.authenticate('twitter', { session: false }));
router.get(
  '/twitter/callback',
  passport.authenticate('twitter', {
    failureRedirect: `${env.FRONTEND_URL}/login?error=twitter-auth-failed`,
    session: false,
  }),
  authController.twitterCallback
);

router.post('/refresh', refreshTokenValidation, validateRequest, authController.refreshToken);
router.post('/forgot-password', passwordResetRateLimitMiddleware, forgotPasswordValidation, validateRequest, authController.forgotPassword);
router.post('/reset-password', resetPasswordValidation, validateRequest, authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', emailVerificationRateLimitMiddleware, resendVerificationValidation, validateRequest, authController.resendVerification);

// ── Protected routes ──────────────────────────────────────────────────────────

router.use(authMiddleware);

router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.get('/me', authController.getProfile);
router.put('/profile', updateProfileValidation, validateRequest, authController.updateProfile);

router.put('/change-password', changePasswordValidation, validateRequest, profileChangePassword);
router.post('/change-password', changePasswordValidation, validateRequest, profileChangePassword);

// Word credit operations
router.post('/deduct-credits', authController.deductWordCredits);
router.get('/credit-status', authController.getWordCreditStatus);

// Admin-only: add credits to any user
router.post('/add-credits', adminMiddleware, authController.addWordCredits);

export default router;