// backend/src/routes/wordpress.routes.ts - FIXED USER ROUTES
import express from 'express';
import wordpressController from '../controllers/wordpress.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// All WordPress routes are protected (regular users)
router.use(authMiddleware);

// Site management
router.post('/', wordpressController.addSite);
router.get('/', wordpressController.getSites);  // This returns user's sites already
router.get('/:id', wordpressController.getSiteById);
router.put('/:id', wordpressController.updateSite);
router.delete('/:id', wordpressController.deleteSite);

// Site operations
router.post('/:id/sync', wordpressController.syncTaxonomies);
router.post('/:id/test', wordpressController.testConnection);
router.get('/:id/posts', wordpressController.getRecentPosts);

export default router;