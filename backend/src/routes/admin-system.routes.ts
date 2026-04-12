// backend/src/routes/admin-system.routes.ts - UPDATED FOR FUNCTIONAL CONTROLLER
import express from 'express';
import * as adminSystemController from '../controllers/admin-system.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Authentication middleware
router.use(authMiddleware);

// Inline admin check middleware
router.use((req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
});

// System health and monitoring
router.get('/health', adminSystemController.getSystemHealth);
router.get('/monitoring', adminSystemController.getMonitoringData);
router.get('/logs', adminSystemController.getSystemLogs);
router.get('/config', adminSystemController.getSystemConfig);
router.put('/config', adminSystemController.updateSystemConfig);

export default router;