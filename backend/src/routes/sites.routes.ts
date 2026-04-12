import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import Site from '../models/site.model';
import logger from '../config/logger';

const router = express.Router();

// Apply authentication to all routes
router.use(authMiddleware);

// GET /api/sites/user - Get user's sites
router.get('/user', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }

    const sites = await Site.find({ owner: userId })
      .select('name url isActive createdAt')
      .sort({ createdAt: -1 });

    const transformedSites = sites.map(site => ({
      id: site._id.toString(),
      name: site.name,
      url: site.url,
      isActive: site.isActive,
      createdAt: site.createdAt.toISOString()
    }));

    return res.json({
      success: true,
      data: transformedSites
    });
  } catch (error: any) {
    logger.error('Error fetching user sites:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to fetch sites' 
    });
  }
});

export default router;