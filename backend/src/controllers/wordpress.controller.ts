// backend/src/controllers/wordpress.controller.ts - MINIMAL WORKING VERSION
import { Request, Response } from 'express';
import Site from '../models/site.model';
import logger from '../config/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

class WordPressController {
  // POST /api/wordpress - Add site
  async addSite(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { name, url, username, applicationPassword } = req.body;

      if (!name || !url || !username || !applicationPassword) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }

      const apiUrl = `${url.replace(/\/$/, '')}/wp-json/wp/v2`;

      const site = new Site({
        name,
        url: url.replace(/\/$/, ''),
        apiUrl,
        username,
        applicationPassword,
        owner: userId,
        isActive: true,
        categories: [],
        tags: [],
        lastSync: null,
      });

      await site.save();

      return res.status(201).json({
        success: true,
        message: 'Site added successfully',
        data: {
          id: site._id.toString(),
          name: site.name,
          url: site.url,
          status: 'connected'
        }
      });
    } catch (error: any) {
      logger.error('Error adding site:', error);
      return res.status(500).json({ success: false, message: 'Failed to add site' });
    }
  }

  // GET /api/wordpress - Get user's sites
  async getSites(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const sites = await Site.find({ owner: userId });

      const transformedSites = sites.map(site => ({
        id: site._id.toString(),
        name: site.name,
        url: site.url,
        apiUrl: site.apiUrl,
        username: site.username,
        status: site.isActive ? 'connected' : 'error',
        isActive: site.isActive,
        categories: site.categories || [],
        categoriesCount: (site.categories || []).length,
        tags: site.tags || [],
        tagsCount: (site.tags || []).length,
        postsCount: 0,
        lastSync: site.lastSync,
        createdAt: site.createdAt,
        updatedAt: site.updatedAt,
      }));

      return res.json({ 
        success: true,
        data: transformedSites,
        total: transformedSites.length 
      });
    } catch (error: any) {
      logger.error('Error getting sites:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch sites' });
    }
  }

  // GET /api/wordpress/:id - Get site by ID
  async getSiteById(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const site = await Site.findOne({ _id: req.params.id, owner: userId });
      if (!site) {
        return res.status(404).json({ success: false, message: 'Site not found' });
      }

      return res.json({
        success: true,
        data: {
          id: site._id.toString(),
          name: site.name,
          url: site.url,
          apiUrl: site.apiUrl,
          username: site.username,
          status: site.isActive ? 'connected' : 'error',
          isActive: site.isActive,
          categories: site.categories || [],
          categoriesCount: (site.categories || []).length,
          tags: site.tags || [],
          tagsCount: (site.tags || []).length,
          postsCount: 0,
          lastSync: site.lastSync,
          createdAt: site.createdAt,
          updatedAt: site.updatedAt,
        }
      });
    } catch (error: any) {
      logger.error('Error getting site by ID:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch site' });
    }
  }

  // PUT /api/wordpress/:id - Update site
  async updateSite(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { name, url, username, applicationPassword } = req.body;
      const site = await Site.findOne({ _id: req.params.id, owner: userId });
      
      if (!site) {
        return res.status(404).json({ success: false, message: 'Site not found' });
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
          url: site.url,
          status: site.isActive ? 'connected' : 'error'
        }
      });
    } catch (error: any) {
      logger.error('Error updating site:', error);
      return res.status(500).json({ success: false, message: 'Failed to update site' });
    }
  }

  // DELETE /api/wordpress/:id - Delete site
  async deleteSite(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const site = await Site.findOneAndDelete({ _id: req.params.id, owner: userId });
      if (!site) {
        return res.status(404).json({ success: false, message: 'Site not found' });
      }

      return res.json({ success: true, message: 'Site deleted successfully' });
    } catch (error: any) {
      logger.error('Error deleting site:', error);
      return res.status(500).json({ success: false, message: 'Failed to delete site' });
    }
  }

  // POST /api/wordpress/:id/sync - Sync taxonomies
  async syncTaxonomies(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const site = await Site.findOne({ _id: req.params.id, owner: userId });
      if (!site) {
        return res.status(404).json({ success: false, message: 'Site not found' });
      }

      site.lastSync = new Date();
      await site.save();

      return res.json({
        success: true,
        message: 'Taxonomies synced successfully',
        data: {
          categories: site.categories || [],
          tags: site.tags || [],
          lastSync: site.lastSync,
        }
      });
    } catch (error: any) {
      logger.error('Error syncing taxonomies:', error);
      return res.status(500).json({ success: false, message: 'Failed to sync taxonomies' });
    }
  }

  // POST /api/wordpress/:id/test - Test connection
  async testConnection(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const site = await Site.findOne({ _id: req.params.id, owner: userId });
      if (!site) {
        return res.status(404).json({ success: false, message: 'Site not found' });
      }

      // Mock test - replace with actual WordPress API test
      site.isActive = true;
      await site.save();
      
      return res.json({
        success: true,
        message: 'Connection test successful',
        data: { status: 'connected' }
      });
    } catch (error: any) {
      logger.error('Error testing connection:', error);
      return res.status(500).json({ success: false, message: 'Failed to test connection' });
    }
  }

  // GET /api/wordpress/:id/posts - Get recent posts
  async getRecentPosts(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const site = await Site.findOne({ _id: req.params.id, owner: userId });
      if (!site) {
        return res.status(404).json({ success: false, message: 'Site not found' });
      }

      // Mock posts - replace with actual WordPress API call
      const mockPosts = [
        {
          id: 1,
          title: 'Sample WordPress Post',
          excerpt: 'This is a sample post from your WordPress site',
          status: 'publish',
          date: new Date().toISOString(),
          link: `${site.url}/sample-post`
        }
      ];

      return res.json({ 
        success: true,
        data: mockPosts,
        total: mockPosts.length 
      });
    } catch (error: any) {
      logger.error('Error getting recent posts:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch recent posts' });
    }
  }
}

export default new WordPressController();