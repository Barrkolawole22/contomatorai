// backend/src/controllers/auth.controller.ts - ENHANCED WITH WORD CREDITS & EMAIL
import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions, JwtPayload as JwtPayloadBase } from 'jsonwebtoken';
import User, { IUser } from '../models/user.model';
import { env } from '../config/env';
import logger from '../config/logger';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import emailService from '../services/email.service';

// Enhanced interface for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// Type definitions for better type safety
interface JwtPayload extends JwtPayloadBase {
  userId: string;
}

// ENHANCED: Updated UserResponse interface for word credits
interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  isAdmin: boolean;
  
  // Word-based billing system
  wordCredits: number;
  totalWordsUsed: number;
  currentMonthUsage: number;
  
  // Legacy compatibility
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
  
  // Profile information
  avatar?: string;
  phone?: string;
  location?: string;
  company?: string;
  bio?: string;
  timezone?: string;
  language?: string;
  
  // User preferences
  preferences?: any;
  
  // Security information (sanitized)
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
  
  // Subscription details
  subscription?: any;
}

// Utility function to generate JWT token with proper error handling
const generateToken = (payload: { userId: string }): string => {
  const secret = env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  const options: SignOptions = {
    expiresIn: (env.JWT_EXPIRES_IN || '7d') as any,
    algorithm: 'HS256',
    issuer: 'content-automation-app',
  };

  try {
    return jwt.sign(payload, secret, options);
  } catch (error) {
    throw new Error(`JWT signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// FIXED: formatUserResponse function with proper plan extraction
const formatUserResponse = (user: any): UserResponse => {
  console.log('Formatting user response for:', user.email, 'Word Credits:', user.wordCredits);
  
  // FIXED: Proper plan extraction
  let userPlan = 'free';
  if (user.subscription?.plan) {
    userPlan = user.subscription.plan;
  } else if (user.subscriptionStatus) {
    userPlan = user.subscriptionStatus;
  }
  
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    isAdmin: ['admin', 'super_admin'].includes(user.role),
    
    // Word-based billing
    wordCredits: user.wordCredits || 0,
    totalWordsUsed: user.totalWordsUsed || 0,
    currentMonthUsage: user.currentMonthUsage || 0,
    
    // Legacy compatibility
    credits: user.credits || user.wordCredits || 0,
    usageCredits: user.wordCredits || 0,
    creditUsage: user.currentMonthUsage || 0,
    
    status: user.status || 'active',
    emailVerified: user.emailVerified || false,
    createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
    lastLogin: user.lastLogin?.toISOString() || undefined,
    
    // FIXED: Use the properly extracted plan
    plan: userPlan,
    subscriptionStatus: user.subscriptionStatus || userPlan,
    maxCredits: user.wordCredits || 0,
    
    // Profile information
    avatar: user.avatar,
    phone: user.phone,
    location: user.location,
    company: user.company,
    bio: user.bio,
    timezone: user.timezone,
    language: user.language,
    
    // User preferences
    preferences: user.preferences,
    
    // Security information (sanitized)
    security: user.security ? {
      twoFactorEnabled: user.security.twoFactorEnabled || false,
      lastPasswordChange: user.security.lastPasswordChange?.toISOString(),
      loginHistory: user.security.loginHistory?.slice(0, 5).map((entry: any) => ({
        ip: entry.ip,
        location: entry.location,
        timestamp: entry.timestamp?.toISOString(),
        device: entry.device
      })) || []
    } : undefined,
    
    // Subscription details
    subscription: user.subscription
  };
};

// NEW: Deduct word credits endpoint
export const deductWordCredits = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { wordCount } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!wordCount || wordCount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid word count is required'
      });
    }

    console.log(`Processing word credit deduction: ${wordCount} words for user ${userId}`);

    // Find user and check current word credits
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has sufficient word credits
    if (user.wordCredits < wordCount) {
      console.log(`Insufficient word credits. Available: ${user.wordCredits}, Required: ${wordCount}`);
      return res.status(400).json({
        success: false,
        message: 'Insufficient word credits',
        data: {
          available: user.wordCredits,
          required: wordCount,
          shortage: wordCount - user.wordCredits
        }
      });
    }

    // Get current date for monthly usage tracking
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Reset monthly usage if we're in a new month
    const lastUsageDate = user.lastUsageDate || new Date(0);
    const isNewMonth = lastUsageDate.getMonth() !== currentMonth || 
                      lastUsageDate.getFullYear() !== currentYear;

    if (isNewMonth) {
      user.currentMonthUsage = 0;
    }

    // Update user word credits and usage
    user.wordCredits -= wordCount;
    user.totalWordsUsed = (user.totalWordsUsed || 0) + wordCount;
    user.currentMonthUsage = (user.currentMonthUsage || 0) + wordCount;
    user.lastUsageDate = now;

    await user.save();

    console.log(`Word credits deducted successfully. New balance: ${user.wordCredits}`);

    return res.status(200).json({
      success: true,
      message: 'Word credits deducted successfully',
      wordCredits: user.wordCredits,
      totalWordsUsed: user.totalWordsUsed,
      currentMonthUsage: user.currentMonthUsage,
      deductedWords: wordCount
    });

  } catch (error: any) {
    console.error('Deduct word credits error:', error);
    logger.error('Deduct word credits error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to deduct word credits',
      error: error.message
    });
  }
};

// NEW: Add word credits endpoint (for admin or payment processing)
export const addWordCredits = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { wordCount, reason } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!wordCount || wordCount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid word count is required'
      });
    }

    console.log(`Adding ${wordCount} word credits to user ${userId}. Reason: ${reason || 'Not specified'}`);

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add word credits
    user.wordCredits = (user.wordCredits || 0) + wordCount;
    await user.save();

    console.log(`Word credits added successfully. New balance: ${user.wordCredits}`);

    return res.status(200).json({
      success: true,
      message: 'Word credits added successfully',
      wordCredits: user.wordCredits,
      addedWords: wordCount,
      reason: reason || 'Credits added'
    });

  } catch (error: any) {
    console.error('Add word credits error:', error);
    logger.error('Add word credits error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add word credits',
      error: error.message
    });
  }
};

// NEW: Get word credit status endpoint
export const getWordCreditStatus = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate usage statistics
    const totalCreditsEverHad = (user.wordCredits || 0) + (user.totalWordsUsed || 0);
    const usagePercentage = totalCreditsEverHad > 0 ? 
      ((user.totalWordsUsed || 0) / totalCreditsEverHad) * 100 : 0;

    return res.status(200).json({
      success: true,
      data: {
        wordCredits: user.wordCredits || 0,
        totalWordsUsed: user.totalWordsUsed || 0,
        currentMonthUsage: user.currentMonthUsage || 0,
        usagePercentage: Math.round(usagePercentage * 100) / 100,
        plan: user.subscriptionStatus || 'free',
        lastUsageDate: user.lastUsageDate?.toISOString()
      }
    });

  } catch (error: any) {
    console.error('Get word credit status error:', error);
    logger.error('Get word credit status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get word credit status',
      error: error.message
    });
  }
};

// TEMPORARY - Create admin user (for testing only)
export const createAdmin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // Input validation
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
        errors: {
          ...((!name) && { name: 'Name is required' }),
          ...((!email) && { email: 'Email is required' }),
          ...((!password) && { password: 'Password is required' }),
          ...((!confirmPassword) && { confirmPassword: 'Confirm password is required' })
        }
      });
    }

    // Password confirmation validation
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
        errors: {
          confirmPassword: 'Passwords do not match'
        }
      });
    }

    // Password strength validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: [{
          field: 'password',
          message: 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
          value: password
        }],
        details: {
          password: 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
        }
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists' 
      });
    }

    // Create admin user with word credits
    const adminUser = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      role: 'admin',
      credits: 1000,
      wordCredits: 10000,
      emailVerified: true,
      status: 'active'
    });

    await adminUser.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: adminUser._id, 
        email: adminUser.email,
        role: adminUser.role 
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      token,
      user: formatUserResponse(adminUser)
    });

  } catch (error: any) {
    console.error('Admin creation error:', error);
    logger.error('Admin creation error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error during admin creation',
      error: error.message 
    });
  }
};

// TEMPORARY - Convert existing user to admin
export const makeAdmin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (!existingUser) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { 
        role: 'admin',
        wordCredits: Math.max(existingUser.wordCredits || 0, 10000)
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    return res.json({
      success: true,
      message: 'User promoted to admin successfully',
      user: formatUserResponse(user)
    });

  } catch (error: any) {
    console.error('Admin promotion error:', error);
    logger.error('Admin promotion error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error during admin promotion',
      error: error.message 
    });
  }
};

// Google OAuth callback handler
export const googleCallback = (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;

    if (!user) {
      logger.error('Google callback: User object was not found on req.');
      return res.redirect(`${env.FRONTEND_URL}/login?error=google-auth-failed`);
    }

    const token = generateToken({ userId: user._id.toString() });

    logger.info(`Google login success, redirecting user: ${user.email}`);
    return res.redirect(`${env.FRONTEND_URL}/oauth/callback?token=${token}`);

  } catch (error: any) {
    logger.error('Google callback error:', error);
    return res.redirect(`${env.FRONTEND_URL}/login?error=internal-server-error`);
  }
};

// Twitter OAuth callback handler
export const twitterCallback = (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;

    if (!user) {
      logger.error('Twitter callback: User object was not found on req.');
      return res.redirect(`${env.FRONTEND_URL}/login?error=twitter-auth-failed`);
    }

    const token = generateToken({ userId: user._id.toString() });

    logger.info(`Twitter login success, redirecting user: ${user.email || user.twitterUsername}`);
    return res.redirect(`${env.FRONTEND_URL}/oauth/callback?token=${token}`);

  } catch (error: any) {
    logger.error('Twitter callback error:', error);
    return res.redirect(`${env.FRONTEND_URL}/login?error=internal-server-error`);
  }
};

// ENHANCED: Register with word credits
export const register = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ 
        success: false,
        message: 'Email, password, and name are required' 
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email format' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters long' 
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.password) {
         return res.status(409).json({ 
          success: false,
          message: 'Email already registered' 
        });
      }
      if (existingUser.googleId) {
         return res.status(409).json({ 
          success: false,
          message: 'This email is linked to a Google account. Please use "Sign in with Google".' 
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
      wordCredits: 1000,
      emailVerified: false
    });
    
    await newUser.save();

    try {
      const verificationToken = newUser.generateEmailVerificationToken();
      await newUser.save();
      
      emailService.sendVerificationEmail(newUser.email, verificationToken)
        .catch(err => logger.error('Failed to send verification email on register:', err));

    } catch (emailError) {
      logger.error('Failed to generate token or send email:', emailError);
    }

    const token = jwt.sign(
      { 
        userId: newUser._id.toString(),
        email: newUser.email,
        role: newUser.role 
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userResponse = formatUserResponse(newUser);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email to verify your account.',
      token,
      user: userResponse,
    });
  } catch (error) {
    console.error('Registration error:', error);
    logger.error('Registration error:', error);
    
    if (error instanceof Error && 'code' in error && (error as any).code === 11000) {
      return res.status(409).json({ 
        success: false,
        message: 'Email already registered' 
      });
    }

    return res.status(500).json({ 
      success: false,
      message: 'Registration failed',
      ...(process.env.NODE_ENV === 'development' && { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    });
  }
};

// FIXED: Enhanced login with better user data
export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password +credits +wordCredits +totalWordsUsed +currentMonthUsage +status +emailVerified +lastLogin');
      
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({ 
        success: false,
        message: 'Account is not active' 
      });
    }
    
    if (!user.password && user.googleId) {
      return res.status(401).json({
        success: false,
        message: 'This account uses Google Sign-In. Please use the "Sign in with Google" button.'
      });
    }

    if (!user.emailVerified) {
      return res.status(401).json({
        success: false,
        message: 'Email not verified. Please check your inbox for a verification link.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    await user.updateLastLogin();

    const token = jwt.sign(
      { 
        userId: user._id.toString(),
        email: user.email,
        role: user.role 
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userResponse = formatUserResponse(user);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: userResponse,
    });
  } catch (error) {
    console.error('Login error:', error);
    logger.error('Login error:', error);

    return res.status(500).json({ 
      success: false,
      message: 'Login failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// FIXED: Get current user profile with comprehensive error handling
export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    console.log('Profile request received');
    console.log('req.user:', req.user);
    
    const userId = req.user?.id;
    
    if (!userId) {
      console.log('No userId found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        code: 'NO_USER_ID'
      });
    }

    console.log('Fetching user with ID:', userId);

    const user = await User.findById(userId)
      .select('+credits +wordCredits +totalWordsUsed +currentMonthUsage +status +emailVerified +lastLogin +createdAt +role +name +email');
    
    if (!user) {
      console.log('User not found in database');
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    console.log('User found:', {
      id: user._id,
      email: user.email,
      name: user.name,
      wordCredits: user.wordCredits,
      role: user.role
    });

    const userResponse = formatUserResponse(user);

    console.log('Formatted response:', userResponse);

    return res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Get profile error:', error);
    logger.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })
    });
  }
};

// Update user profile
export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { name, email } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!name && !email) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (name or email) is required'
      });
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      const existingUser = await User.findOne({ 
        email: email.toLowerCase(), 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Email already taken'
        });
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase();

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: formatUserResponse(user)
    });
  } catch (error) {
    console.error('Update profile error:', error);
    logger.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Change password
export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    logger.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

// Forgot password
export const forgotPassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    if (process.env.NODE_ENV === 'development') {
      console.log('Password reset token:', resetToken);
    }

    try {
      emailService.sendPasswordResetEmail(user.email, resetToken)
        .catch(err => logger.error('Failed to send password reset email:', err));
    } catch (emailError) {
      logger.error('Failed to send password reset email:', emailError);
    }

    return res.status(200).json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    logger.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;
    
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    logger.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

// Verify email
export const verifyEmail = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    logger.error('Email verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify email'
    });
  }
};

// Resend verification email
export const resendVerification = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    let userEmail = req.body.email;
    let user;
    
    if (userId) {
       user = await User.findById(userId);
    } else if (userEmail) {
       user = await User.findOne({ email: userEmail.toLowerCase() });
    } else {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated and no email provided'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    if (process.env.NODE_ENV === 'development') {
      console.log('Email verification token:', verificationToken);
    }

    try {
      await emailService.sendVerificationEmail(user.email, verificationToken);
    } catch (emailError) {
      logger.error('Failed to resend verification email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification email sent successfully',
      ...(process.env.NODE_ENV === 'development' && { verificationToken })
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    logger.error('Resend verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
};

// Token verification utility
const verifyTokenUtil = (token: string): JwtPayload => {
  const secret = env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  try {
    const decoded = jwt.verify(token, secret as string) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Refresh token utility
export const refreshToken = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ 
        success: false,
        message: 'Token is required' 
      });
    }

    const decoded = verifyTokenUtil(token);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const payload = { userId: user._id.toString() };
    const newToken = generateToken(payload);

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token: newToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    logger.error('Token refresh error:', error);
    
    let message = 'Token refresh failed';
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        message = 'Token has expired';
      } else if (error.message.includes('Invalid')) {
        message = 'Invalid token provided';
      }
    }
    
    return res.status(401).json({ 
      success: false,
      message 
    });
  }
};

// Logout utility
export const logout = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    logger.error('Logout error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Logout failed' 
    });
  }
};

export { generateToken, verifyTokenUtil as verifyToken, formatUserResponse };

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
  createAdmin, 
  makeAdmin,
  deductWordCredits,
  addWordCredits,
  getWordCreditStatus
};

export default authController;