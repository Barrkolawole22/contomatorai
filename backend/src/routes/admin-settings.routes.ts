// backend/src/routes/admin-settings.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { 
  getSettings, 
  updateSettings 
} from '../controllers/admin-settings.controller';

const router = Router();

// Apply authentication and admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/settings - Get system settings
router.get('/', getSettings);

// PUT /api/admin/settings - Update system settings
router.put('/', updateSettings);

console.log('✅ Admin Settings routes loaded successfully');

export default router;