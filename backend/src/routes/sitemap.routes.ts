// backend/src/routes/sitemap.routes.ts - WITH RE-ENRICHMENT ENDPOINT
import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import sitemapCrawlerService from '../services/sitemap-crawler.service';
import SitemapUrl from '../models/sitemap-url.model';
import Site from '../models/site.model';
import logger from '../config/logger';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// ✅ POST /api/sitemap/:siteId/crawl - Crawl a specific site
router.post('/:siteId/crawl', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId } = req.params;
    
    // Verify site belongs to user
    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Site not found or unauthorized'
      });
      return;
    }
    
    logger.info(`Starting sitemap crawl for site ${siteId} by user ${userId}`);
    const urlCount = await sitemapCrawlerService.crawlSite(siteId);

    res.json({
      success: true,
      message: `Successfully crawled ${urlCount} URLs`,
      data: { urlCount, siteId }
    });
  } catch (error: any) {
    logger.error('Sitemap crawl error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to crawl sitemap'
    });
  }
});

// ✅ NEW: POST /api/sitemap/:siteId/enrich - Re-enrich metadata for existing URLs
router.post('/:siteId/enrich', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId } = req.params;
    const { force = false } = req.body; // Optional: force re-enrich all URLs
    
    // Verify site belongs to user
    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Site not found or unauthorized'
      });
      return;
    }
    
    logger.info(`Starting metadata enrichment for site ${siteId} by user ${userId}`);
    
    // Call the enrichment service
    const enrichedCount = await sitemapCrawlerService.enrichUrlMetadata(siteId, force);

    res.json({
      success: true,
      message: `Successfully enriched ${enrichedCount} URLs with titles, descriptions, and keywords`,
      data: { enrichedCount, siteId }
    });
  } catch (error: any) {
    logger.error('URL enrichment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to enrich URLs'
    });
  }
});

// ✅ NEW: POST /api/sitemap/add-url - Manually add URL to sitemap
router.post('/add-url', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId, url, title, description, keywords, priority } = req.body;

    if (!siteId || !url) {
      res.status(400).json({
        success: false,
        message: 'siteId and url are required'
      });
      return;
    }

    // Verify site belongs to user
    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Site not found or unauthorized'
      });
      return;
    }

    const result = await sitemapCrawlerService.addUrl({
      siteId,
      url,
      title,
      description,
      keywords,
      priority
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Add URL error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add URL'
    });
  }
});

// ✅ GET /api/sitemap/urls - Get all indexed URLs with filters
router.get('/urls', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId, status, search, page = 1, limit = 100 } = req.query;

    // Build query
    const query: any = {};
    
    if (siteId) {
      // Verify site belongs to user
      const site = await Site.findOne({ _id: siteId, owner: userId });
      if (!site) {
        res.status(403).json({
          success: false,
          message: 'Site not found or unauthorized'
        });
        return;
      }
      query.siteId = siteId;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { url: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { keywords: { $in: [new RegExp(search as string, 'i')] } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const [urls, total] = await Promise.all([
      SitemapUrl.find(query)
        .sort({ crawledAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SitemapUrl.countDocuments(query)
    ]);

    // Transform data to match frontend interface
    const transformedUrls = urls.map(url => ({
      id: url._id.toString(),
      siteId: url.siteId.toString(),
      url: url.url,
      title: url.title || '',
      description: url.description || '',
      keywords: url.keywords || [],
      status: url.status,
      lastCrawled: url.crawledAt.toISOString(),
      responseTime: url.responseTime,
      statusCode: url.statusCode,
      priority: url.priority,
      changeFreq: url.changeFreq
    }));

    res.json({
      success: true,
      data: transformedUrls,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    logger.error('Get indexed URLs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get indexed URLs'
    });
  }
});

// ✅ GET /api/sitemap/urls/:urlId - Get specific URL
router.get('/urls/:urlId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { urlId } = req.params;
    const urlDoc = await SitemapUrl.findById(urlId).lean();

    if (!urlDoc) {
      res.status(404).json({
        success: false,
        message: 'URL not found'
      });
      return;
    }

    // Verify site belongs to user
    const site = await Site.findOne({ _id: urlDoc.siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to access this URL'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: urlDoc._id.toString(),
        siteId: urlDoc.siteId.toString(),
        url: urlDoc.url,
        title: urlDoc.title,
        description: urlDoc.description,
        keywords: urlDoc.keywords,
        status: urlDoc.status,
        lastCrawled: urlDoc.crawledAt.toISOString(),
        responseTime: urlDoc.responseTime,
        statusCode: urlDoc.statusCode,
        priority: urlDoc.priority,
        changeFreq: urlDoc.changeFreq
      }
    });
  } catch (error: any) {
    logger.error('Get URL error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get URL'
    });
  }
});

// ✅ PUT /api/sitemap/urls/:urlId - Update URL metadata
router.put('/urls/:urlId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { urlId } = req.params;
    const { title, description, keywords, status } = req.body;

    // Get URL and verify ownership
    const urlDoc = await SitemapUrl.findById(urlId);
    if (!urlDoc) {
      res.status(404).json({
        success: false,
        message: 'URL not found'
      });
      return;
    }

    // Verify site belongs to user
    const site = await Site.findOne({ _id: urlDoc.siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to update this URL'
      });
      return;
    }

    const updatedUrl = await SitemapUrl.findByIdAndUpdate(
      urlId,
      {
        $set: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(keywords !== undefined && { keywords }),
          ...(status !== undefined && { status })
        }
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'URL updated successfully',
      data: updatedUrl
    });
  } catch (error: any) {
    logger.error('Update URL error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update URL'
    });
  }
});

// ✅ DELETE /api/sitemap/urls/:urlId - Delete a URL
router.delete('/urls/:urlId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { urlId } = req.params;

    // Get URL and verify ownership
    const urlDoc = await SitemapUrl.findById(urlId);
    if (!urlDoc) {
      res.status(404).json({
        success: false,
        message: 'URL not found'
      });
      return;
    }

    // Verify site belongs to user
    const site = await Site.findOne({ _id: urlDoc.siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this URL'
      });
      return;
    }

    await SitemapUrl.findByIdAndDelete(urlId);

    res.json({
      success: true,
      message: 'URL deleted successfully'
    });
  } catch (error: any) {
    logger.error('Delete URL error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete URL'
    });
  }
});

// ✅ POST /api/sitemap/urls/bulk - Bulk update URLs
router.post('/urls/bulk', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { urlIds, action } = req.body;

    if (!urlIds || !Array.isArray(urlIds) || urlIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'urlIds array is required'
      });
      return;
    }

    // Verify all URLs belong to user's sites
    const urlDocs = await SitemapUrl.find({ _id: { $in: urlIds } });
    const siteIds = [...new Set(urlDocs.map(u => u.siteId.toString()))];
    
    const userSites = await Site.find({ 
      _id: { $in: siteIds }, 
      owner: userId 
    });

    if (userSites.length !== siteIds.length) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to modify some URLs'
      });
      return;
    }

    let result;
    
    switch (action) {
      case 'activate':
        result = await SitemapUrl.updateMany(
          { _id: { $in: urlIds } },
          { $set: { status: 'active' } }
        );
        break;
      
      case 'deactivate':
        result = await SitemapUrl.updateMany(
          { _id: { $in: urlIds } },
          { $set: { status: 'inactive' } }
        );
        break;
      
      case 'delete':
        result = await SitemapUrl.deleteMany({ _id: { $in: urlIds } });
        break;
      
      default:
        res.status(400).json({
          success: false,
          message: 'Invalid action. Use: activate, deactivate, or delete'
        });
        return;
    }

    res.json({
      success: true,
      message: `Bulk ${action} completed`,
      data: {
        modifiedCount: result.modifiedCount || result.deletedCount,
        urlIds
      }
    });
  } catch (error: any) {
    logger.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform bulk operation'
    });
  }
});

// ✅ GET /api/sitemap/stats - Get statistics
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId } = req.query;

    if (siteId) {
      // Verify site belongs to user
      const site = await Site.findOne({ _id: siteId, owner: userId });
      if (!site) {
        res.status(403).json({
          success: false,
          message: 'Site not found or unauthorized'
        });
        return;
      }

      const stats = await sitemapCrawlerService.getCrawlStats(siteId as string);
      res.json({
        success: true,
        data: stats
      });
    } else {
      // Get overall stats across user's sites
      const userSites = await Site.find({ owner: userId }).select('_id');
      const siteIds = userSites.map(s => s._id);

      const [total, active, inactive, broken] = await Promise.all([
        SitemapUrl.countDocuments({ siteId: { $in: siteIds } }),
        SitemapUrl.countDocuments({ siteId: { $in: siteIds }, status: 'active' }),
        SitemapUrl.countDocuments({ siteId: { $in: siteIds }, status: 'inactive' }),
        SitemapUrl.countDocuments({ siteId: { $in: siteIds }, status: 'broken' })
      ]);

      res.json({
        success: true,
        data: {
          totalUrls: total,
          activeUrls: active,
          inactiveUrls: inactive,
          brokenUrls: broken
        }
      });
    }
  } catch (error: any) {
    logger.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get statistics'
    });
  }
});

// ✅ GET /api/sitemap/:siteId/status - Get crawl status for a site
router.get('/:siteId/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId } = req.params;

    // Verify site belongs to user
    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Site not found or unauthorized'
      });
      return;
    }

    const stats = await sitemapCrawlerService.getCrawlStats(siteId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Get crawl status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get crawl status'
    });
  }
});

// ✅ POST /api/sitemap/find-links - Find relevant internal links
router.post('/find-links', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId, keywords, limit = 5 } = req.body;

    if (!siteId || !keywords || !Array.isArray(keywords)) {
      res.status(400).json({
        success: false,
        message: 'siteId and keywords array are required'
      });
      return;
    }

    // Verify site belongs to user
    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Site not found or unauthorized'
      });
      return;
    }

    const links = await sitemapCrawlerService.findRelevantLinks(siteId, keywords, limit);

    res.json({
      success: true,
      data: links
    });
  } catch (error: any) {
    logger.error('Find links error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to find links'
    });
  }
});

// ✅ GET /api/sitemap/suggestions - Get internal link suggestions for keyword
router.get('/suggestions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { keyword, siteId } = req.query;

    if (!keyword || !siteId) {
      res.status(400).json({
        success: false,
        message: 'keyword and siteId parameters are required'
      });
      return;
    }

    // Verify site belongs to user
    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Site not found or unauthorized'
      });
      return;
    }

    const keywords = [keyword as string];
    const links = await sitemapCrawlerService.findRelevantLinks(
      siteId as string, 
      keywords, 
      10
    );

    res.json({
      success: true,
      data: links
    });
  } catch (error: any) {
    logger.error('Get suggestions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get suggestions'
    });
  }
});

// ✅ DELETE /api/sitemap/:siteId - Clear all URLs for a site
router.delete('/:siteId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId } = req.params;

    // Verify site belongs to user
    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) {
      res.status(403).json({
        success: false,
        message: 'Site not found or unauthorized'
      });
      return;
    }

    const deletedCount = await sitemapCrawlerService.clearSiteUrls(siteId);

    res.json({
      success: true,
      message: `Cleared ${deletedCount} URLs`,
      data: { deletedCount }
    });
  } catch (error: any) {
    logger.error('Clear URLs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to clear URLs'
    });
  }
});

export default router;