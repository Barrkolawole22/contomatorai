// backend/src/controllers/settings.controller.ts - CORRECTED FOR YOUR USER MODEL
import { Request, Response } from 'express';
import User from '../models/user.model';
import logger from '../config/logger';
import crypto from 'crypto';

interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
    id?: string;
    email: string;
    name: string;
    role: string;
  };
}

// Get all user settings
export const getSettings = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;

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

    // Format comprehensive settings response using your structured preferences
    const settings = {
      profile: {
        name: user.name,
        email: user.email,
        bio: user.preferences?.bio || '',
        website: user.preferences?.website || '',
        company: user.preferences?.company || '',
        location: user.preferences?.location || '',
        avatar: user.avatar || ''
      },
      security: {
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.preferences?.twoFactorEnabled || false,
        lastPasswordChange: user.preferences?.lastPasswordChange || user.updatedAt
      },
      notifications: {
        emailNotifications: user.preferences?.emailNotifications ?? true,
        pushNotifications: user.preferences?.pushNotifications ?? false,
        weeklyReports: user.preferences?.weeklyReports ?? true,
        creditAlerts: user.preferences?.creditAlerts ?? true,
        articleUpdates: user.preferences?.articleUpdates ?? false,
        marketingEmails: user.preferences?.marketingEmails ?? false
      },
      preferences: {
        theme: user.preferences?.theme || 'system',
        language: user.language || 'en',
        timezone: user.timezone || 'America/Los_Angeles',
        defaultContentType: user.preferences?.defaultContentType || 'blog',
        autoSave: user.preferences?.autoSave ?? true,
        wordCountDisplay: user.preferences?.wordCountDisplay ?? true
      },
      api: {
        apiKey: user.preferences?.apiKey || generateApiKey(),
        rateLimit: user.preferences?.rateLimit || 100,
        webhookUrl: user.preferences?.webhookUrl || '',
        enableWebhooks: user.preferences?.enableWebhooks ?? false
      }
    };

    return res.status(200).json({
      success: true,
      message: 'Settings retrieved successfully',
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    logger.error('Get settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve settings'
    });
  }
};

// Update profile settings
export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { name, email, bio, website, company, location } = req.body;

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

    // Update basic fields
    if (name) user.name = name.trim();
    if (email) user.email = email.toLowerCase();

    // Update preferences using your structured model
    if (bio !== undefined) user.preferences.bio = bio;
    if (website !== undefined) user.preferences.website = website;
    if (company !== undefined) user.preferences.company = company;
    if (location !== undefined) user.preferences.location = location;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        name: user.name,
        email: user.email,
        bio: user.preferences.bio || '',
        website: user.preferences.website || '',
        company: user.preferences.company || '',
        location: user.preferences.location || ''
      }
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

// Update notification settings
export const updateNotifications = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const {
      emailNotifications,
      pushNotifications,
      weeklyReports,
      creditAlerts,
      articleUpdates,
      marketingEmails
    } = req.body;

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

    // Update notification preferences using your structured model
    if (emailNotifications !== undefined) user.preferences.emailNotifications = emailNotifications;
    if (pushNotifications !== undefined) user.preferences.pushNotifications = pushNotifications;
    if (weeklyReports !== undefined) user.preferences.weeklyReports = weeklyReports;
    if (creditAlerts !== undefined) user.preferences.creditAlerts = creditAlerts;
    if (articleUpdates !== undefined) user.preferences.articleUpdates = articleUpdates;
    if (marketingEmails !== undefined) user.preferences.marketingEmails = marketingEmails;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Notification settings updated successfully'
    });
  } catch (error) {
    console.error('Update notifications error:', error);
    logger.error('Update notifications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update notification settings'
    });
  }
};

// Update application preferences
export const updatePreferences = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const {
      theme,
      language,
      timezone,
      defaultContentType,
      autoSave,
      wordCountDisplay
    } = req.body;

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

    // Update basic fields
    if (language) user.language = language;
    if (timezone) user.timezone = timezone;

    // Update preferences using your structured model
    if (theme !== undefined) user.preferences.theme = theme;
    if (defaultContentType !== undefined) user.preferences.defaultContentType = defaultContentType;
    if (autoSave !== undefined) user.preferences.autoSave = autoSave;
    if (wordCountDisplay !== undefined) user.preferences.wordCountDisplay = wordCountDisplay;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    logger.error('Update preferences error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update preferences'
    });
  }
};

// Update API settings
export const updateApiSettings = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { rateLimit, webhookUrl, enableWebhooks, regenerateApiKey } = req.body;

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

    // Update API preferences using your structured model
    if (rateLimit !== undefined) user.preferences.rateLimit = Math.max(1, Math.min(1000, rateLimit));
    if (webhookUrl !== undefined) user.preferences.webhookUrl = webhookUrl;
    if (enableWebhooks !== undefined) user.preferences.enableWebhooks = enableWebhooks;
    
    // Regenerate API key if requested
    if (regenerateApiKey) {
      user.preferences.apiKey = generateApiKey();
    } else if (!user.preferences.apiKey) {
      user.preferences.apiKey = generateApiKey();
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'API settings updated successfully',
      data: {
        apiKey: user.preferences.apiKey,
        rateLimit: user.preferences.rateLimit,
        webhookUrl: user.preferences.webhookUrl,
        enableWebhooks: user.preferences.enableWebhooks
      }
    });
  } catch (error) {
    console.error('Update API settings error:', error);
    logger.error('Update API settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update API settings'
    });
  }
};

// Change password
export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Input validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All password fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match'
      });
    }

    // Password strength validation
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    // Find user and include password field
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password and track change using your structured model
    user.password = newPassword;
    user.preferences.lastPasswordChange = new Date();
    
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

// Export user data
export const exportData = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { format = 'json' } = req.query;

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

    // Prepare export data (remove sensitive fields)
    const exportData = {
      profile: {
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        credits: user.credits,
        language: user.language,
        timezone: user.timezone,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        loginCount: user.loginCount
      },
      preferences: user.preferences || {},
      exportedAt: new Date().toISOString(),
      exportFormat: format
    };

    // Set appropriate headers based on format
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="user-data.csv"');
      // Simple CSV conversion
      const csvData = Object.entries(exportData.profile)
        .map(([key, value]) => `${key},${value}`)
        .join('\n');
      return res.send(csvData);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="user-data.json"');
      return res.json({
        success: true,
        data: exportData
      });
    }
  } catch (error) {
    console.error('Export data error:', error);
    logger.error('Export data error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export data'
    });
  }
};

// Delete account
export const deleteAccount = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { confirmPassword } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password confirmation required'
      });
    }

    // Find user and verify password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isPasswordValid = await user.comparePassword(confirmPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Password confirmation failed'
      });
    }

    // Soft delete - mark as inactive instead of hard delete
    user.status = 'inactive';
    user.email = `deleted_${Date.now()}_${user.email}`;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    logger.error('Delete account error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
};

// Helper function to generate API key
const generateApiKey = (): string => {
  return `sk-${crypto.randomBytes(32).toString('hex')}`;
};

export default {
  getSettings,
  updateProfile,
  updateNotifications,
  updatePreferences,
  updateApiSettings,
  changePassword,
  exportData,
  deleteAccount
};