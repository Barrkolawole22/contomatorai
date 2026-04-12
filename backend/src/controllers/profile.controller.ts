// backend/src/controllers/profile.controller.ts - FIXED VERSION
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import User from '../models/user.model';
import { AuthenticatedRequest } from '../middleware/auth.middleware'; // FIX: Import from middleware

// FIX: Added Promise<void> return type
export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.id)
      .select('-password -resetPasswordToken -emailVerificationToken')
      .populate('subscription')
      .lean();

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return; // FIX: Added return
    }

    if (!user.preferences) {
      user.preferences = {
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
        emailNotifications: true,
        pushNotifications: true,
        marketingEmails: false,
        securityAlerts: true,
        weeklyReports: true,
        contentUpdates: true
      } as any;
    }

    if (!user.security) {
      user.security = {
        twoFactorEnabled: false,
        lastPasswordChange: user.updatedAt || user.createdAt,
        loginHistory: []
      } as any;
    }

    res.json({
      success: true,
      data: user
    });
    return; // FIX: Added return
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
    return; // FIX: Added return
  }
};

// FIX: Added Promise<void> return type
export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { name, phone, location, company, bio, preferences, security, avatar } = req.body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;
    if (company !== undefined) updateData.company = company;
    if (bio !== undefined) updateData.bio = bio;
    if (avatar !== undefined) updateData.avatar = avatar;

    if (preferences) {
      updateData.preferences = preferences;
    }

    if (security) {
      updateData.security = {
        ...security,
        lastPasswordChange: undefined,
        loginHistory: undefined
      };
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        message: 'At least one field is required for update'
      });
      return; // FIX: Added return
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    )
    .select('-password -resetPasswordToken -emailVerificationToken')
    .populate('subscription')
    .lean();

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return; // FIX: Added return
    }

    res.json({
      success: true,
      data: updatedUser,
      message: 'Profile updated successfully'
    });
    return; // FIX: Added return
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
    return; // FIX: Added return
  }
};

// FIX: Added Promise<void> return type
export const uploadAvatar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const file = req.file;

    console.log('Avatar upload started for user:', userId);
    console.log('File details:', {
      filename: file?.filename,
      originalname: file?.originalname,
      mimetype: file?.mimetype,
      size: file?.size
    });

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'No file provided'
      });
      return; // FIX: Added return
    }

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return; // FIX: Added return
    }

    if (currentUser.avatar) {
      try {
        const oldFilename = currentUser.avatar.includes('/uploads/avatars/') 
          ? path.basename(currentUser.avatar)
          : currentUser.avatar;
        
        const oldAvatarPath = path.join(__dirname, '../../uploads/avatars', oldFilename);
        
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
          console.log('Removed old avatar:', oldAvatarPath);
        }
      } catch (error) {
        console.warn('Failed to remove old avatar:', error);
      }
    }

    const relativePath = `/uploads/avatars/${file.filename}`;
    
    console.log('Storing relative avatar path:', relativePath);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { avatar: relativePath },
      { new: true }
    )
    .select('-password -resetPasswordToken -emailVerificationToken')
    .lean();

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: 'User not found after update'
      });
      return; // FIX: Added return
    }

    console.log('Avatar upload successful:', {
      userId,
      relativePath,
      filename: file.filename
    });

    res.json({
      success: true,
      data: {
        avatar: relativePath,
        user: updatedUser
      },
      message: 'Avatar uploaded successfully'
    });
    return; // FIX: Added return
  } catch (error: any) {
    console.error('Avatar upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload avatar',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
    return; // FIX: Added return
  }
};

// FIX: Added Promise<void> return type
export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
      return; // FIX: Added return
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
      return; // FIX: Added return
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return; // FIX: Added return
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
      return; // FIX: Added return
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await User.findByIdAndUpdate(userId, {
      password: hashedPassword,
      'security.lastPasswordChange': new Date()
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    return; // FIX: Added return
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
    return; // FIX: Added return
  }
};

// FIX: Added Promise<void> return type
export const updatePreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const preferences = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { preferences },
      { new: true }
    )
    .select('-password -resetPasswordToken -emailVerificationToken')
    .lean();

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return; // FIX: Added return
    }

    res.json({
      success: true,
      data: updatedUser,
      message: 'Preferences updated successfully'
    });
    return; // FIX: Added return
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences'
    });
    return; // FIX: Added return
  }
};

// FIX: Added Promise<void> return type
export const getLoginHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { limit = 10, page = 1 } = req.query;

    const user = await User.findById(userId)
      .select('security.loginHistory')
      .lean();

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return; // FIX: Added return
    }

    const loginHistory = user.security?.loginHistory || [];
    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    const paginatedHistory = loginHistory
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        loginHistory: paginatedHistory,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: loginHistory.length,
          pages: Math.ceil(loginHistory.length / Number(limit))
        }
      }
    });
    return; // FIX: Added return
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch login history'
    });
    return; // FIX: Added return
  }
};

// FIX: Added Promise<void> return type
export const exportUserData = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    const user = await User.findById(userId)
      .select('-password -resetPasswordToken -emailVerificationToken')
      .lean();

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return; // FIX: Added return
    }

    const exportData = {
      user,
      exportedAt: new Date().toISOString(),
      format: 'JSON'
    };

    res.json({
      success: true,
      data: exportData,
      message: 'User data exported successfully'
    });
    return; // FIX: Added return
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export user data'
    });
    return; // FIX: Added return
  }
};

// FIX: Added Promise<void> return type
export const deleteAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { confirmPassword } = req.body;

    if (!confirmPassword) {
      res.status(400).json({
        success: false,
        message: 'Password confirmation is required to delete account'
      });
      return; // FIX: Added return
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return; // FIX: Added return
    }

    const isPasswordValid = await bcrypt.compare(confirmPassword, user.password);
    if (!isPasswordValid) {
      res.status(400).json({
        success: false,
        message: 'Password is incorrect'
      });
      return; // FIX: Added return
    }

    if (user.avatar) {
      const avatarPath = path.join(__dirname, '../../uploads/avatars', path.basename(user.avatar));
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }

    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
    return; // FIX: Added return
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
    return; // FIX: Added return
  }
};