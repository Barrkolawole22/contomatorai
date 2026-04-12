// backend/src/routes/api.routes.ts - Updated with Notifications
import express from 'express';
import authRoutes from './auth.routes';
import wordpressRoutes from './wordpress.routes';
import oauthRoutes from './oauth.routes';
import contentRoutes from './content.routes';
import schedulerRoutes from './scheduler.routes';
import sitemapRoutes from './sitemap.routes';
import sitesRoutes from './sites.routes';
import bulkContentRoutes from './bulk-content.routes';
import notificationRoutes from './notifications.routes'; 
import settingsRoutes from './settings.routes';

const router = express.Router();

// Authentication routes
router.use('/auth', authRoutes);

// WordPress integration
router.use('/wordpress', wordpressRoutes);

// OAuth routes
router.use('/oauth', oauthRoutes);

// Content management
router.use('/content', contentRoutes);

// Scheduling
router.use('/scheduler', schedulerRoutes);

// Sitemap management
router.use('/sitemap', sitemapRoutes);

// Sites management
router.use('/sites', sitesRoutes);

// Bulk content generation and scheduling
router.use('/bulk-content', bulkContentRoutes);

// ✅ NEW: Notifications
router.use('/notifications', notificationRoutes);

// Settings
router.use('/settings', settingsRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '2.0.0'
  });
});

// 404 handler for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.originalUrl}`
  });
});

export default router;