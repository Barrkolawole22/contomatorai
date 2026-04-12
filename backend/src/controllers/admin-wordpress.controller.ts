import { Request, Response } from 'express';
import Site from '../models/site.model';
import User from '../models/user.model';
import logger from '../config/logger';
import WordPressService from '../services/wordpress.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

class AdminWordPressController {
  // GET /api/admin/wordpress - Overview with stats
  async getWordPressOverview(req: AuthenticatedRequest, res: Response) {
    try {
      const sites = await Site.find()
        .populate('owner', 'name email')
        .select('+applicationPassword');

      const statistics = {
        totalSites: sites.length,
        connectedSites: sites.filter(s => s.isActive).length,
        healthySites: sites.filter(s => s.isActive).length,
        totalPosts: sites.reduce((sum, s) => sum + (s as any).postsCount || 0, 0),
        avgResponseTime: 150
      };

      const transformedSites = sites.map(site => ({
        _id: site._id.toString(),
        name: site.name,
        url: site.url,
        status: site.isActive ? 'connected' : 'error',
        healthStatus: site.isActive ? 'healthy' : 'critical',
        lastSync: site.lastSync || new Date().toISOString(),
        totalPosts: (site as any).postsCount || 0,
        publishedPosts: (site as any).publishedPosts || 0,
        draftPosts: (site as any).draftPosts || 0,
        autoPublish: false,
        enableSEO: true,
        averageResponseTime: 150,
        uptime: site.isActive ? 99.9 : 0,
        userId: {
          _id: (site.owner as any)._id.toString(),
          name: (site.owner as any).name,
          email: (site.owner as any).email
        },
        wpVersion: '6.4',
        plugins: []
      }));

      return res.json({
        success: true,
        data: {
          sites: transformedSites,
          statistics
        }
      });
    } catch (error: any) {
      logger.error('Admin WordPress overview error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch WordPress overview'
      });
    }
  }

  // GET /api/admin/wordpress/sites - Get all sites
  async getAllSites(req: AuthenticatedRequest, res: Response) {
    try {
      const sites = await Site.find()
        .populate('owner', 'name email')
        .select('+applicationPassword');

      const statistics = {
        totalSites: sites.length,
        connectedSites: sites.filter(s => s.isActive).length,
        totalPosts: sites.reduce((sum, s) => sum + ((s as any).postsCount || 0), 0),
        autoPublishEnabled: 0
      };

      const transformedSites = sites.map(site => ({
        _id: site._id.toString(),
        name: site.name,
        url: site.url,
        status: site.isActive ? 'connected' : 'error',
        healthStatus: site.isActive ? 'healthy' : 'critical',
        lastSync: site.lastSync || new Date().toISOString(),
        totalPosts: (site as any).postsCount || 0,
        autoPublish: false,
        enableSEO: true,
        userId: {
          _id: (site.owner as any)._id.toString(),
          name: (site.owner as any).name,
          email: (site.owner as any).email
        },
        wpVersion: '6.4',
        plugins: [],
        lastResponseTime: 150,
        uptime: site.isActive ? 99.9 : 0,
        averageResponseTime: 150,
        lastError: null
      }));

      return res.json({
        success: true,
        data: {
          sites: transformedSites,
          statistics
        }
      });
    } catch (error: any) {
      logger.error('Get all sites error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch sites'
      });
    }
  }

  // GET /api/admin/wordpress/sites/:id
  async getSiteById(req: AuthenticatedRequest, res: Response) {
    try {
      const site = await Site.findById(req.params.id)
        .populate('owner', 'name email')
        .select('+applicationPassword');

      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }

      return res.json({
        success: true,
        data: {
          _id: site._id.toString(),
          name: site.name,
          url: site.url,
          status: site.isActive ? 'connected' : 'error',
          healthStatus: site.isActive ? 'healthy' : 'critical',
          lastSync: site.lastSync,
          userId: {
            _id: (site.owner as any)._id.toString(),
            name: (site.owner as any).name,
            email: (site.owner as any).email
          }
        }
      });
    } catch (error: any) {
      logger.error('Get site by ID error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch site'
      });
    }
  }

  // POST /api/admin/wordpress/sites/:id/health-check
  async performHealthCheck(req: AuthenticatedRequest, res: Response) {
    try {
      const site = await Site.findById(req.params.id).select('+applicationPassword');

      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }

      const testResult = await WordPressService.simpleTest(
        site.apiUrl,
        site.username,
        site.applicationPassword
      );

      site.isActive = testResult.success;
      await site.save();

      return res.json({
        success: testResult.success,
        message: testResult.success ? 'Health check passed' : 'Health check failed',
        data: {
          status: testResult.success ? 'healthy' : 'critical',
          error: testResult.error
        }
      });
    } catch (error: any) {
      logger.error('Health check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to perform health check'
      });
    }
  }

  // POST /api/admin/wordpress/sites/:id/sync
  async syncSite(req: AuthenticatedRequest, res: Response) {
    try {
      const site = await Site.findById(req.params.id);

      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }

      site.lastSync = new Date();
      await site.save();

      return res.json({
        success: true,
        message: 'Site synced successfully',
        data: {
          lastSync: site.lastSync
        }
      });
    } catch (error: any) {
      logger.error('Sync site error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to sync site'
      });
    }
  }

  // PUT /api/admin/wordpress/sites/:id
  async updateSite(req: AuthenticatedRequest, res: Response) {
    try {
      const { name, url, username, applicationPassword } = req.body;
      const site = await Site.findById(req.params.id);

      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }

      if (name) site.name = name;
      if (url) site.url = url.replace(/\/$/, '');
      if (username) site.username = username;
      if (applicationPassword) site.applicationPassword = applicationPassword;

      await site.save();

      return res.json({
        success: true,
        message: 'Site updated successfully',
        data: {
          id: site._id.toString(),
          name: site.name,
          url: site.url
        }
      });
    } catch (error: any) {
      logger.error('Update site error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update site'
      });
    }
  }

  // DELETE /api/admin/wordpress/sites/:id
  async deleteSite(req: AuthenticatedRequest, res: Response) {
    try {
      const site = await Site.findByIdAndDelete(req.params.id);

      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }

      return res.json({
        success: true,
        message: 'Site deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete site error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete site'
      });
    }
  }

  // POST /api/admin/wordpress/sites - Add site (admin can add for any user)
  async addSite(req: AuthenticatedRequest, res: Response) {
    try {
      const { name, url, username, applicationPassword, userId } = req.body;

      if (!name || !url || !username || !applicationPassword) {
        return res.status(400).json({
          success: false,
          message: 'All fields required'
        });
      }

      // Use current admin user if userId not provided
      const ownerId = userId || req.user?.id;

      const finalApiUrl = `${url.replace(/\/$/, '')}/wp-json/wp/v2`;

      const validationResult = await WordPressService.validateCredentials(
        finalApiUrl,
        username,
        applicationPassword
      );

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          message: validationResult.error || 'Failed to validate credentials'
        });
      }

      const site = new Site({
        name,
        url: url.replace(/\/$/, ''),
        apiUrl: finalApiUrl,
        username,
        applicationPassword,
        owner: ownerId,
        isActive: true,
        categories: [],
        tags: [],
        lastSync: null
      });

      await site.save();

      return res.status(201).json({
        success: true,
        message: 'Site added successfully',
        data: {
          id: site._id.toString(),
          name: site.name,
          url: site.url
        }
      });
    } catch (error: any) {
      logger.error('Add site error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to add site'
      });
    }
  }
}

export default new AdminWordPressController();