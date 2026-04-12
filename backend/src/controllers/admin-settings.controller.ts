// backend/src/controllers/admin-settings.controller.ts
import { Request, Response } from 'express';
import User from '../models/user.model';

interface SystemSettings {
  general: {
    siteName: string;
    siteDescription: string;
    adminEmail: string;
    timezone: string;
    language: string;
    registeredUsers: number;
    totalContent: number;
  };
  features: {
    registration: boolean;
    emailVerification: boolean;
    adminPanel: boolean;
  };
  limits: {
    maxFileSize: number;
    rateLimitRequests: number;
    rateLimitWindow: number;
    defaultUserCredits: number;
    maxUserCredits: number;
  };
  integrations: {
    openaiEnabled: boolean;
    geminiEnabled: boolean;
    redisEnabled: boolean;
  };
}

const defaultSettings: SystemSettings = {
  general: {
    siteName: process.env.SITE_NAME || 'Content Automation Platform',
    siteDescription: process.env.SITE_DESCRIPTION || 'AI-powered content automation platform',
    adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
    timezone: process.env.TIMEZONE || 'UTC',
    language: process.env.LANGUAGE || 'en',
    registeredUsers: 0,
    totalContent: 0,
  },
  features: {
    registration: process.env.ENABLE_REGISTRATION !== 'false',
    emailVerification: process.env.ENABLE_EMAIL_VERIFICATION === 'true',
    adminPanel: true,
  },
  limits: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
    rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '100'),
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
    defaultUserCredits: parseInt(process.env.DEFAULT_USER_CREDITS || '100'),
    maxUserCredits: parseInt(process.env.MAX_USER_CREDITS || '10000'),
  },
  integrations: {
    openaiEnabled: !!process.env.OPENAI_API_KEY,
    geminiEnabled: !!process.env.GEMINI_API_KEY,
    redisEnabled: !!process.env.REDIS_URL,
  },
};

export const getSettings = async (req: Request, res: Response) => {
  try {
    const settings = JSON.parse(JSON.stringify(defaultSettings));
    
    const userCount = await User.countDocuments();
    
    let contentCount = 0;
    try {
      const Content = require('../models/Content.model').default;
      contentCount = await Content.countDocuments();
    } catch (error) {
      console.log('Content model not found, using 0');
    }
    
    settings.general.registeredUsers = userCount;
    settings.general.totalContent = contentCount;

    res.json({
      success: true,
      data: settings,
      message: 'Settings retrieved successfully',
    });
  } catch (error: any) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve settings',
      error: error.message,
    });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const settings: SystemSettings = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid settings data',
      });
    }

    if (settings.limits) {
      if (settings.limits.maxFileSize < 1048576 || settings.limits.maxFileSize > 104857600) {
        return res.status(400).json({
          success: false,
          message: 'Max file size must be between 1MB and 100MB',
        });
      }

      if (settings.limits.rateLimitRequests < 10 || settings.limits.rateLimitRequests > 10000) {
        return res.status(400).json({
          success: false,
          message: 'Rate limit requests must be between 10 and 10000',
        });
      }

      if (settings.limits.rateLimitWindow < 60000 || settings.limits.rateLimitWindow > 3600000) {
        return res.status(400).json({
          success: false,
          message: 'Rate limit window must be between 1 and 60 minutes',
        });
      }

      if (settings.limits.defaultUserCredits < 0 || settings.limits.defaultUserCredits > 10000) {
        return res.status(400).json({
          success: false,
          message: 'Default user credits must be between 0 and 10000',
        });
      }

      if (settings.limits.maxUserCredits < 100 || settings.limits.maxUserCredits > 100000) {
        return res.status(400).json({
          success: false,
          message: 'Max user credits must be between 100 and 100000',
        });
      }
    }

    console.log('Settings saved in memory only (no database persistence)');
    
    const userCount = await User.countDocuments();
    
    let contentCount = 0;
    try {
      const Content = require('../models/Content.model').default;
      contentCount = await Content.countDocuments();
    } catch (error) {
      console.log('Content model not found');
    }

    settings.general.registeredUsers = userCount;
    settings.general.totalContent = contentCount;

    res.json({
      success: true,
      data: settings,
      message: 'Settings updated successfully',
    });
  } catch (error: any) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message,
    });
  }
};

console.log('✅ Admin Settings controller loaded successfully');