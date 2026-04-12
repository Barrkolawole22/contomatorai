// backend/src/routes/admin-wordpress.routes.ts - FIXED
import express from 'express';
import adminWordpressController from '../controllers/admin-wordpress.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Authentication middleware
router.use(authMiddleware);

// Inline admin check middleware (until you create proper adminMiddleware)
router.use((req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
});

// WordPress admin endpoints
router.get('/', adminWordpressController.getWordPressOverview);
router.get('/sites', adminWordpressController.getAllSites);
router.get('/sites/:id', adminWordpressController.getSiteById);
router.post('/sites/:id/health-check', adminWordpressController.performHealthCheck);
router.post('/sites/:id/sync', adminWordpressController.syncSite);
router.put('/sites/:id', adminWordpressController.updateSite);
router.delete('/sites/:id', adminWordpressController.deleteSite);
router.post('/sites', adminWordpressController.addSite);

export default router;