// backend/src/controllers/settings.controller.ts
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

const generateApiKey = (): string => `sk-${crypto.randomBytes(32).toString('hex')}`;

// ── GET ALL SETTINGS ─────────────────────────────────────────────────────────
export const getSettings = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // FIX: generate API key once and persist it — don't regenerate on every load
    if (!user.preferences?.apiKey) {
      user.preferences.apiKey = generateApiKey();
      await user.save();
    }

    const settings = {
      profile: {
        name:     user.name,
        email:    user.email,
        bio:      user.preferences?.bio      || '',
        website:  user.preferences?.website  || '',
        company:  user.preferences?.company  || '',
        location: user.preferences?.location || '',
        avatar:   user.avatar || '',
      },
      security: {
        emailVerified:      user.emailVerified,
        twoFactorEnabled:   user.preferences?.twoFactorEnabled   || false,
        lastPasswordChange: user.preferences?.lastPasswordChange || user.updatedAt,
      },
      notifications: {
        emailNotifications: user.preferences?.emailNotifications ?? true,
        pushNotifications:  user.preferences?.pushNotifications  ?? false,
        weeklyReports:      user.preferences?.weeklyReports      ?? true,
        creditAlerts:       user.preferences?.creditAlerts       ?? true,
        articleUpdates:     user.preferences?.articleUpdates     ?? false,
        marketingEmails:    user.preferences?.marketingEmails    ?? false,
      },
      preferences: {
        theme:              user.preferences?.theme              || 'system',
        language:           user.language                        || 'en',
        timezone:           user.timezone                        || 'America/Los_Angeles',
        defaultContentType: user.preferences?.defaultContentType || 'blog',
        autoSave:           user.preferences?.autoSave           ?? true,
        wordCountDisplay:   user.preferences?.wordCountDisplay   ?? true,
      },
      api: {
        apiKey:         user.preferences.apiKey,
        rateLimit:      user.preferences?.rateLimit      || 100,
        webhookUrl:     user.preferences?.webhookUrl     || '',
        enableWebhooks: user.preferences?.enableWebhooks ?? false,
      },
      // FIX: include privacy so the frontend can load persisted values
      privacy: {
        analyticsTracking: user.preferences?.analyticsTracking ?? true,
        dataSharing:       user.preferences?.dataSharing       ?? false,
        cookiePreferences: user.preferences?.cookiePreferences ?? true,
      },
    };

    return res.status(200).json({ success: true, message: 'Settings retrieved successfully', data: settings });
  } catch (error) {
    logger.error('Get settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve settings' });
  }
};

// ── UPDATE PROFILE ───────────────────────────────────────────────────────────
export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { name, email, bio, website, company, location } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (name)              user.name  = name.trim();
    if (email)             user.email = email.toLowerCase();
    if (bio      !== undefined) user.preferences.bio      = bio;
    if (website  !== undefined) user.preferences.website  = website;
    if (company  !== undefined) user.preferences.company  = company;
    if (location !== undefined) user.preferences.location = location;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        name:     user.name,
        email:    user.email,
        bio:      user.preferences.bio      || '',
        website:  user.preferences.website  || '',
        company:  user.preferences.company  || '',
        location: user.preferences.location || '',
      },
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

// ── UPDATE NOTIFICATIONS ─────────────────────────────────────────────────────
export const updateNotifications = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { emailNotifications, pushNotifications, weeklyReports, creditAlerts, articleUpdates, marketingEmails } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (emailNotifications !== undefined) user.preferences.emailNotifications = emailNotifications;
    if (pushNotifications  !== undefined) user.preferences.pushNotifications  = pushNotifications;
    if (weeklyReports      !== undefined) user.preferences.weeklyReports      = weeklyReports;
    if (creditAlerts       !== undefined) user.preferences.creditAlerts       = creditAlerts;
    if (articleUpdates     !== undefined) user.preferences.articleUpdates     = articleUpdates;
    if (marketingEmails    !== undefined) user.preferences.marketingEmails    = marketingEmails;

    await user.save();

    return res.status(200).json({ success: true, message: 'Notification settings updated successfully' });
  } catch (error) {
    logger.error('Update notifications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update notification settings' });
  }
};

// ── UPDATE PREFERENCES ───────────────────────────────────────────────────────
export const updatePreferences = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { theme, language, timezone, defaultContentType, autoSave, wordCountDisplay } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (language)              user.language  = language;
    if (timezone)              user.timezone  = timezone;
    if (theme              !== undefined) user.preferences.theme              = theme;
    if (defaultContentType !== undefined) user.preferences.defaultContentType = defaultContentType;
    if (autoSave           !== undefined) user.preferences.autoSave           = autoSave;
    if (wordCountDisplay   !== undefined) user.preferences.wordCountDisplay   = wordCountDisplay;

    await user.save();

    return res.status(200).json({ success: true, message: 'Preferences updated successfully' });
  } catch (error) {
    logger.error('Update preferences error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update preferences' });
  }
};

// ── UPDATE PRIVACY ───────────────────────────────────────────────────────────
// FIX: new handler — privacy settings were previously unsaved
export const updatePrivacy = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { analyticsTracking, dataSharing, cookiePreferences } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (analyticsTracking !== undefined) user.preferences.analyticsTracking = analyticsTracking;
    if (dataSharing       !== undefined) user.preferences.dataSharing       = dataSharing;
    if (cookiePreferences !== undefined) user.preferences.cookiePreferences = cookiePreferences;

    await user.save();

    return res.status(200).json({ success: true, message: 'Privacy settings updated successfully' });
  } catch (error) {
    logger.error('Update privacy error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update privacy settings' });
  }
};

// ── UPDATE API SETTINGS ──────────────────────────────────────────────────────
export const updateApiSettings = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { rateLimit, webhookUrl, enableWebhooks, regenerateApiKey } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (rateLimit      !== undefined) user.preferences.rateLimit      = Math.max(1, Math.min(1000, rateLimit));
    if (webhookUrl     !== undefined) user.preferences.webhookUrl     = webhookUrl;
    if (enableWebhooks !== undefined) user.preferences.enableWebhooks = enableWebhooks;

    if (regenerateApiKey || !user.preferences.apiKey) {
      user.preferences.apiKey = generateApiKey();
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'API settings updated successfully',
      data: {
        apiKey:         user.preferences.apiKey,
        rateLimit:      user.preferences.rateLimit,
        webhookUrl:     user.preferences.webhookUrl,
        enableWebhooks: user.preferences.enableWebhooks,
      },
    });
  } catch (error) {
    logger.error('Update API settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update API settings' });
  }
};

// ── CHANGE PASSWORD ──────────────────────────────────────────────────────────
export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All password fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New passwords do not match' });
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
    user.preferences.lastPasswordChange = new Date();
    await user.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

// ── EXPORT DATA ──────────────────────────────────────────────────────────────
export const exportData = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { format = 'json' } = req.query;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const exportPayload = {
      profile: {
        name:          user.name,
        email:         user.email,
        role:          user.role,
        status:        user.status,
        emailVerified: user.emailVerified,
        credits:       user.credits,
        language:      user.language,
        timezone:      user.timezone,
        createdAt:     user.createdAt,
        lastLogin:     user.lastLogin,
        loginCount:    user.loginCount,
      },
      preferences:  user.preferences || {},
      exportedAt:   new Date().toISOString(),
      exportFormat: format,
    };

    if (format === 'csv') {
      // FIX: send a proper Buffer so Axios responseType:'blob' works correctly
      const csvRows = Object.entries(exportPayload.profile)
        .map(([key, value]) => `${key},${value ?? ''}`)
        .join('\n');
      const header = 'field,value\n';
      const csvString = header + csvRows;
      const buffer = Buffer.from(csvString, 'utf-8');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="user-data.csv"');
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
      return res as any;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="user-data.json"');
    return res.json({ success: true, data: exportPayload });
  } catch (error) {
    logger.error('Export data error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export data' });
  }
};

// ── DELETE ACCOUNT ───────────────────────────────────────────────────────────
export const deleteAccount = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { confirmPassword } = req.body;
    if (!confirmPassword) {
      return res.status(400).json({ success: false, message: 'Password confirmation required' });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isPasswordValid = await user.comparePassword(confirmPassword);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Password confirmation failed' });
    }

    // Soft delete
    user.status = 'inactive';
    user.email  = `deleted_${Date.now()}_${user.email}`;
    await user.save();

    return res.status(200).json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Delete account error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete account' });
  }
};

export default {
  getSettings,
  updateProfile,
  updateNotifications,
  updatePreferences,
  updatePrivacy,
  updateApiSettings,
  changePassword,
  exportData,
  deleteAccount,
};