// backend/src/routes/admin-wordpress.routes.ts
import express from 'express';
import adminWordpressController from '../controllers/admin-wordpress.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

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