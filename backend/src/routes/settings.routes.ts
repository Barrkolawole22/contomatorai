// backend/src/routes/settings.routes.ts - FIXED VERSION
import express from 'express';
import settingsController from '../controllers/settings.controller';

const router = express.Router();

// Simple auth middleware (inline) - replace with your actual middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// All settings routes require authentication
router.use(authenticateToken);

// Routes
router.get('/', settingsController.getSettings);
router.put('/profile', settingsController.updateProfile);
router.put('/notifications', settingsController.updateNotifications);
router.put('/preferences', settingsController.updatePreferences);
router.put('/api', settingsController.updateApiSettings);
router.post('/password', settingsController.changePassword);
router.get('/export', settingsController.exportData);
router.delete('/account', settingsController.deleteAccount);

export default router;