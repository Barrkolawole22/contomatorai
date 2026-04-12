// ENHANCED: src/routes/auth.routes.ts - Integrated with Profile System
import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { 
  authRateLimitMiddleware,
  passwordResetRateLimitMiddleware,
  emailVerificationRateLimitMiddleware 
} from '../middleware/rateLimit.middleware';
import { 
  registerValidation, 
  loginValidation, 
  refreshTokenValidation,
  changePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  updateProfileValidation,
  resendVerificationValidation
} from '../validations/auth.validation';

// Import profile controller for enhanced password management
import { changePassword as profileChangePassword } from '../controllers/profile.controller';

// === PASSPORT FOR OAUTH ===
import passport from 'passport';
import { env } from '../config/env';
// ==========================

const router = Router();

// ===== PUBLIC ROUTES WITH SPECIFIC RATE LIMITING =====

router.post('/register', 
  authRateLimitMiddleware,
  registerValidation,
  validateRequest,
  authController.register
);

router.post('/login', 
  authRateLimitMiddleware,
  loginValidation,
  validateRequest,
  authController.login
);

// ===== GOOGLE OAUTH ROUTES =====
router.get('/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false
  })
);

router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${env.FRONTEND_URL}/login?error=google-auth-failed`,
    session: false 
  }),
  authController.googleCallback
);

// ===== TWITTER OAUTH ROUTES =====
router.get('/twitter',
  passport.authenticate('twitter', {
    session: false
  })
);

router.get('/twitter/callback',
  passport.authenticate('twitter', {
    failureRedirect: `${env.FRONTEND_URL}/login?error=twitter-auth-failed`,
    session: false
  }),
  authController.twitterCallback
);
// ===============================

router.post('/refresh', 
  refreshTokenValidation,
  validateRequest,
  authController.refreshToken
);

router.post('/forgot-password', 
  passwordResetRateLimitMiddleware,
  forgotPasswordValidation,
  validateRequest,
  authController.forgotPassword
);

router.post('/reset-password', 
  resetPasswordValidation,
  validateRequest,
  authController.resetPassword
);

router.get('/verify-email/:token', 
  authController.verifyEmail
);

router.post('/resend-verification', 
  emailVerificationRateLimitMiddleware,
  resendVerificationValidation,
  validateRequest,
  authController.resendVerification
);

// TEMPORARY ADMIN ROUTES (remove in production)
router.post('/create-admin', 
  registerValidation,
  validateRequest,
  authController.createAdmin
);

router.post('/make-admin', 
  authController.makeAdmin
);

// ===== PROTECTED ROUTES =====
router.use(authMiddleware);

// Basic auth operations
router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.get('/me', authController.getProfile);

// Profile updates (using existing auth controller for backward compatibility)
router.put('/profile', 
  updateProfileValidation,
  validateRequest,
  authController.updateProfile
);

// ===== ENHANCED: Password change with improved security =====
router.put('/change-password', 
  changePasswordValidation,
  validateRequest,
  profileChangePassword
);

// BACKWARD COMPATIBILITY: Also support the original endpoint
router.post('/change-password', 
  changePasswordValidation,
  validateRequest,
  profileChangePassword
);

export default router;