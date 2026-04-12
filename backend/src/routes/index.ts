// src/routes/index.ts - Main Routes Configuration
import { Router } from 'express';
import authRoutes from './auth.routes';
import wordpressRoutes from './wordpress.routes';
import contentRoutes from './content.routes';
import keywordRoutes from './keyword.routes';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Content Automation API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Public routes (no authentication required)
router.use('/auth', authRoutes);

// Protected routes (authentication required)
router.use('/sites', authMiddleware, wordpressRoutes); 
router.use('/wordpress', authMiddleware, wordpressRoutes);
router.use('/content', authMiddleware, contentRoutes);
router.use('/keywords', authMiddleware, keywordRoutes);

// Catch-all route for undefined endpoints
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

export default router;