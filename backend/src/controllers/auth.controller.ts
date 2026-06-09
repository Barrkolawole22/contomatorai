// backend/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import jwt, { SignOptions, JwtPayload as JwtPayloadBase } from 'jsonwebtoken';
import User, { IUser } from '../models/user.model';
import { env } from '../config/env';
import logger from '../config/logger';
import emailService from '../services/email.service';
import { formatUserResponse } from '../utils/formatUserResponse';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

interface JwtPayload extends JwtPayloadBase {
  userId: string;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

/**
 * Signs a JWT containing only { userId }.
 * Role and email are intentionally excluded: they should always be read
 * from the database in authMiddleware so stale token data cannot be used.
 */
export const generateToken = (payload: { userId: string }): string => {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  const options: SignOptions = {
    expiresIn: (env.JWT_EXPIRES_IN || '7d') as any,
    algorithm: 'HS256',
    issuer: 'content-automation-app',
  };

  return jwt.sign(payload, secret, options);
};

export const verifyTokenUtil = (token: string): JwtPayload => {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not defined in environment variables');

  try {
    return jwt.verify(token, secret as string) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw new Error('Token has expired');
    if (error instanceof jwt.JsonWebTokenError) throw new Error('Invalid token');
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// ─── Word credit endpoints ────────────────────────────────────────────────────

/**
 * Deducts word credits from the authenticated user.
 * Uses user.deductWordCredits() to respect the billing priority order
 * (subscription balance → topup balance → legacy balance).
 */
export const deductWordCredits = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { wordCount } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!wordCount || wordCount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid word count is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.hasWordCredits(wordCount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient word credits',
        data: {
          available: (user.subscriptionWordBalance || 0) + (user.topupWordBalance || 0) + (user.wordCredits || 0),
          required: wordCount,
        },
      });
    }

    const success = await user.deductWordCredits(wordCount);
    if (!success) {
      return res.status(400).json({ success: false, message: 'Failed to deduct word credits' });
    }

    return res.status(200).json({
      success: true,
      message: 'Word credits deducted successfully',
      wordCredits: user.wordCredits,
      subscriptionWordBalance: user.subscriptionWordBalance,
      topupWordBalance: user.topupWordBalance,
      totalWordsUsed: user.totalWordsUsed,
      currentMonthUsage: user.currentMonthUsage,
      deductedWords: wordCount,
    });
  } catch (error: any) {
    logger.error('Deduct word credits error:', error);
    return res.status(500).json({ success: false, message: 'Failed to deduct word credits' });
  }
};

/**
 * Adds word credits to a user account.
 * Requires admin role — protected by requireAdmin middleware on the route.
 */
export const addWordCredits = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { wordCount, reason } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!wordCount || wordCount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid word count is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.wordCredits = (user.wordCredits || 0) + wordCount;
    await user.save();

    logger.info(`Admin added ${wordCount} word credits to user ${userId}. Reason: ${reason || 'unspecified'}`);

    return res.status(200).json({
      success: true,
      message: 'Word credits added successfully',
      wordCredits: user.wordCredits,
      addedWords: wordCount,
      reason: reason || 'Credits added',
    });
  } catch (error: any) {
    logger.error('Add word credits error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add word credits' });
  }
};

export const getWordCreditStatus = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const totalCreditsEverHad = (user.wordCredits || 0) + (user.totalWordsUsed || 0);
    const usagePercentage =
      totalCreditsEverHad > 0 ? ((user.totalWordsUsed || 0) / totalCreditsEverHad) * 100 : 0;

    return res.status(200).json({
      success: true,
      data: {
        wordCredits: user.wordCredits || 0,
        totalWordsUsed: user.totalWordsUsed || 0,
        currentMonthUsage: user.currentMonthUsage || 0,
        usagePercentage: Math.round(usagePercentage * 100) / 100,
        plan: user.subscriptionStatus || 'free',
        lastUsageDate: user.lastUsageDate?.toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Get word credit status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get word credit status' });
  }
};

// ─── OAuth callbacks ──────────────────────────────────────────────────────────

export const googleCallback = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user) {
      logger.error('Google callback: user object missing on req');
      return res.redirect(`${env.FRONTEND_URL}/login?error=google-auth-failed`);
    }

    if (!user.emailVerified) {
      await User.findByIdAndUpdate(user._id, { emailVerified: true });
    }

    const token = generateToken({ userId: user._id.toString() });
    logger.info(`Google login success for user: ${user.email}`);
    return res.redirect(`${env.FRONTEND_URL}/callback?token=${token}`);
  } catch (error: any) {
    logger.error('Google callback error:', error);
    return res.redirect(`${env.FRONTEND_URL}/login?error=internal-server-error`);
  }
};

export const twitterCallback = (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user) {
      logger.error('Twitter callback: user object missing on req');
      return res.redirect(`${env.FRONTEND_URL}/login?error=twitter-auth-failed`);
    }

    const token = generateToken({ userId: user._id.toString() });
    logger.info(`Twitter login success for user: ${user.email || user.twitterUsername}`);
    return res.redirect(`${env.FRONTEND_URL}/callback?token=${token}`);
  } catch (error: any) {
    logger.error('Twitter callback error:', error);
    return res.redirect(`${env.FRONTEND_URL}/login?error=internal-server-error`);
  }
};

// ─── Registration & login ─────────────────────────────────────────────────────

export const register = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'Email, password, and name are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.password) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }
      if (existingUser.googleId) {
        return res.status(409).json({
          success: false,
          message: 'This email is linked to a Google account. Please use "Sign in with Google".',
        });
      }
    }

    const newUser = new User({
      email: email.toLowerCase(),
      password,
      name: name.trim(),
      role: 'user',
      status: 'active',
      credits: 10,
      wordCredits: env.DEFAULT_FREE_WORD_CREDITS,
      emailVerified: false,
      hasSeenTour: false,
    });

    await newUser.save();

    try {
      const verificationToken = newUser.generateEmailVerificationToken();
      await newUser.save();
      emailService
        .sendVerificationEmail(newUser.email, verificationToken)
        .catch(err => logger.error('Failed to send verification email on register:', err));
    } catch (emailError) {
      logger.error('Failed to generate token or send verification email:', emailError);
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account before logging in.',
      requiresVerification: true,
    });
  } catch (error) {
    logger.error('Registration error:', error);

    if (error instanceof Error && 'code' in error && (error as any).code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    return res.status(500).json({
      success: false,
      message: 'Registration failed',
      ...(process.env.NODE_ENV === 'development' && {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    });
  }
};

export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password +credits +wordCredits +totalWordsUsed +currentMonthUsage +status +emailVerified +lastLogin +hasSeenTour'
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Account is not active' });
    }

    if (!user.password && user.googleId) {
      return res.status(401).json({
        success: false,
        message: 'This account uses Google Sign-In. Please use the "Sign in with Google" button.',
      });
    }

    if (!user.emailVerified) {
      return res.status(401).json({
        success: false,
        message: 'Email not verified. Please check your inbox for a verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    await user.updateLastLogin();

    // Only userId in the token — role is always read fresh from DB in authMiddleware
    const token = generateToken({ userId: user._id.toString() });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed',
      ...(process.env.NODE_ENV === 'development' && {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    });
  }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated', code: 'NO_USER_ID' });
    }

    const user = await User.findById(userId).select(
      '+credits +wordCredits +totalWordsUsed +currentMonthUsage +status +emailVerified +lastLogin +createdAt +role +name +email +hasSeenTour'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      user: formatUserResponse(user),
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
    });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { name, email, hasSeenTour } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!name && !email && hasSeenTour === undefined) {
      return res.status(400).json({ success: false, message: 'At least one field is required' });
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
      if (existingUser) {
        return res.status(409).json({ success: false, message: 'Email already taken' });
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase();
    if (hasSeenTour !== undefined) updateData.hasSeenTour = hasSeenTour;

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: formatUserResponse(user),
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

// ─── Password management ──────────────────────────────────────────────────────

export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Return generic response to avoid email enumeration
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
      });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    emailService
      .sendPasswordResetEmail(user.email, resetToken)
      .catch(err => logger.error('Failed to send password reset email:', err));

    return res.status(200).json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process password reset request' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    // NOTE: emailVerified is intentionally NOT set here.
    // Password reset and email verification are separate flows.

    await user.save();

    return res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

// ─── Email verification ───────────────────────────────────────────────────────

export const verifyEmail = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ success: false, message: 'Verification token is required' });

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;
    await user.save();

    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    logger.error('Email verification error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify email' });
  }
};

export const resendVerification = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const userEmail = req.body.email;
    let user;

    if (userId) {
      user = await User.findById(userId);
    } else if (userEmail) {
      user = await User.findOne({ email: userEmail.toLowerCase() });
    } else {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated and no email provided',
      });
    }

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified' });
    }

    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    try {
      await emailService.sendVerificationEmail(user.email, verificationToken);
    } catch (emailError) {
      logger.error('Failed to resend verification email:', emailError);
      return res.status(500).json({ success: false, message: 'Failed to send verification email' });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification email sent successfully',
      ...(process.env.NODE_ENV === 'development' && { verificationToken }),
    });
  } catch (error) {
    logger.error('Resend verification error:', error);
    return res.status(500).json({ success: false, message: 'Failed to resend verification email' });
  }
};

// ─── Token refresh & logout ───────────────────────────────────────────────────

export const refreshToken = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

    const decoded = verifyTokenUtil(token);

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const newToken = generateToken({ userId: user._id.toString() });

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token: newToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    logger.error('Token refresh error:', error);

    let message = 'Token refresh failed';
    if (error instanceof Error) {
      if (error.message.includes('expired')) message = 'Token has expired';
      else if (error.message.includes('Invalid')) message = 'Invalid token provided';
    }

    return res.status(401).json({ success: false, message });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    return res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export { verifyTokenUtil as verifyToken, formatUserResponse };

const authController = {
  register,
  login,
  googleCallback,
  twitterCallback,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  refreshToken,
  logout,
  getProfile,
  verifyToken: verifyTokenUtil,
  generateToken,
  formatUserResponse,
  deductWordCredits,
  addWordCredits,
  getWordCreditStatus,
};

export default authController;