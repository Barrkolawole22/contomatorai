// backend/src/controllers/oauth.controller.ts
import { Request, Response } from 'express';
import OAuthService from '../services/oauth.service';
import Site from '../models/site.model';
import OAuthToken from '../models/oauth-token.model';
import logger from '../config/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

class OAuthController {
  /**
   * Initiate OAuth flow
   */
  async initiateOAuth(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { siteUrl, siteName } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      if (!siteUrl) {
        return res.status(400).json({
          success: false,
          message: 'Site URL is required'
        });
      }

      // Validate URL format
      try {
        new URL(siteUrl);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid URL format'
        });
      }

      const authUrl = OAuthService.generateAuthUrl(siteUrl, userId, { siteName });
      
      res.json({
        success: true,
        authUrl,
        message: 'OAuth flow initiated'
      });
    } catch (error: any) {
      logger.error('OAuth initiation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate OAuth flow'
      });
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(req: Request, res: Response) {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        logger.error('OAuth callback error:', { error, error_description });
        return res.redirect(`${process.env.FRONTEND_URL}/wordpress?oauth_error=${encodeURIComponent(error_description as string || error as string)}`);
      }

      if (!code || !state) {
        return res.redirect(`${process.env.FRONTEND_URL}/wordpress?oauth_error=Missing code or state parameter`);
      }

      // Verify state parameter
      let stateData;
      try {
        stateData = OAuthService.verifyState(state as string);
      } catch (error: any) {
        logger.error('Invalid state parameter:', error.message);
        return res.redirect(`${process.env.FRONTEND_URL}/wordpress?oauth_error=Invalid state parameter`);
      }

      const { userId, siteName } = stateData;
      const siteUrl = req.query.site_url as string || stateData.siteUrl;

      if (!siteUrl) {
        return res.redirect(`${process.env.FRONTEND_URL}/wordpress?oauth_error=Missing site URL`);
      }

      // Exchange code for tokens
      const tokenResponse = await OAuthService.exchangeCodeForToken(siteUrl, code as string);
      
      // Get user info
      const userInfo = await OAuthService.getUserInfo(siteUrl, tokenResponse.access_token);
      
      // Save tokens and site info
      await OAuthService.saveTokens(userId, { url: siteUrl, name: siteName }, tokenResponse, userInfo);

      // Redirect to success page
      res.redirect(`${process.env.FRONTEND_URL}/wordpress?oauth_success=true&site_name=${encodeURIComponent(siteName || userInfo.username + "'s Site")}`);
    } catch (error: any) {
      logger.error('OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/wordpress?oauth_error=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Get OAuth connections for user
   */
  async getConnections(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const connections = await OAuthToken.find({ userId, isActive: true })
        .populate('siteId')
        .sort({ createdAt: -1 });

      const formattedConnections = connections.map(conn => ({
        id: conn._id.toString(),
        siteId: conn.siteId._id.toString(),
        siteName: conn.siteName,
        siteUrl: conn.siteUrl,
        wpUserEmail: conn.wpUserEmail,
        wpUserRoles: conn.wpUserRoles,
        expiresAt: conn.expiresAt,
        createdAt: conn.createdAt,
        isActive: conn.isActive
      }));

      res.json({
        success: true,
        data: formattedConnections
      });
    } catch (error: any) {
      logger.error('Get connections error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get connections'
      });
    }
  }

  /**
   * Disconnect OAuth connection
   */
  async disconnect(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { connectionId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const connection = await OAuthToken.findOne({ 
        _id: connectionId, 
        userId 
      });

      if (!connection) {
        return res.status(404).json({
          success: false,
          message: 'Connection not found'
        });
      }

      connection.isActive = false;
      await connection.save();

      // Also update the corresponding site status
      await Site.findByIdAndUpdate(connection.siteId, { isActive: false });

      res.json({
        success: true,
        message: 'WordPress site disconnected successfully'
      });
    } catch (error: any) {
      logger.error('Disconnect error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disconnect'
      });
    }
  }

  /**
   * Test OAuth connection
   */
  async testConnection(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { siteUrl } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      if (!siteUrl) {
        return res.status(400).json({
          success: false,
          message: 'Site URL is required'
        });
      }

      const accessToken = await OAuthService.validateToken(userId, siteUrl);
      const userInfo = await OAuthService.getUserInfo(siteUrl, accessToken);

      res.json({
        success: true,
        message: 'OAuth connection is valid',
        user: userInfo
      });
    } catch (error: any) {
      logger.error('Test connection error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new OAuthController();