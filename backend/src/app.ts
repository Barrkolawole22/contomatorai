// backend/src/app.ts - FIXED with Bulk Content Routes
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { env, isDevelopment } from './config/env';
import logger from './config/logger';
import sitesRoutes from './routes/sites.routes';

// Import routes
import authRoutes from './routes/auth.routes';
import contentRoutes from './routes/content.routes';
import wordpressRoutes from './routes/wordpress.routes';
import keywordRoutes from './routes/keyword.routes';
import settingsRoutes from './routes/settings.routes';
import adminRoutes from './routes/admin.routes';
import profileRoutes from './routes/profile.routes';
import billingRoutes from './routes/billing.routes';

// Import sitemap and scheduler routes
import sitemapRoutes from './routes/sitemap.routes';
import schedulerRoutes from './routes/scheduler.routes';
import bulkContentRoutes from './routes/bulk-content.routes';

// Import notifications routes
import notificationRoutes from './routes/notifications.routes';

// Import admin-specific routes
import adminWordpressRoutes from './routes/admin-wordpress.routes';
import adminSystemRoutes from './routes/admin-system.routes';
import adminSettingsRoutes from './routes/admin-settings.routes';

// === ADD FOR OAUTH ===
import passport from 'passport';
import session from 'express-session';
import './config/passport.config';
// ============================

import { Express } from "express";
const app: Express = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// ===== ENSURE UPLOAD DIRECTORIES EXIST =====
const ensureUploadDirs = () => {
  const uploadDirs = [
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../uploads/avatars'),
    path.join(__dirname, '../uploads/content'),
    path.join(__dirname, '../uploads/temp')
  ];
  
  uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created upload directory: ${dir}`);
    }
  });
};

// Initialize upload directories
ensureUploadDirs();

// ===== SECURITY MIDDLEWARE =====
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
    },
  },
}));

// ===== CORS CONFIGURATION =====
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = env.CORS_ORIGIN.split(',');
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    if (isDevelopment() && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.options('*', cors());

// ===== STATIC FILE SERVING FOR UPLOADS =====
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: isDevelopment() ? '0' : '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        res.setHeader('Content-Type', 'image/jpeg');
        break;
      case '.png':
        res.setHeader('Content-Type', 'image/png');
        break;
      case '.gif':
        res.setHeader('Content-Type', 'image/gif');
        break;
      case '.webp':
        res.setHeader('Content-Type', 'image/webp');
        break;
      default:
        break;
    }
  }
}));

// ===== RATE LIMITING =====
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === '/api/health' || 
           req.path.startsWith('/uploads') || 
           req.path === '/api/billing/webhook';
  },
});

app.use('/api', limiter);

// ===== PAYSTACK WEBHOOK RAW BODY MIDDLEWARE =====
app.use('/api/billing/webhook', express.raw({ 
  type: 'application/json',
  limit: '1mb'
}));

// ===== BODY PARSING MIDDLEWARE =====
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buffer) => {
    (req as any).rawBody = buffer;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ===== LOGGING MIDDLEWARE =====
if (isDevelopment()) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => {
        logger.http(message.trim());
      },
    },
  }));
}

// === SESSION CONFIGURATION (MUST BE BEFORE PASSPORT) ===
if (!env.SESSION_SECRET) {
  logger.warn('SESSION_SECRET is not defined in .env. Using a default (insecure) secret. THIS IS NOT SAFE FOR PRODUCTION.');
}
app.use(session({
  secret: env.SESSION_SECRET || 'please_set_a_secure_session_secret_in_env',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// === INITIALIZE PASSPORT ===
app.use(passport.initialize());
app.use(passport.session());

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    features: {
      wordBilling: process.env.ENABLE_WORD_BILLING === 'true',
      legacyCredits: process.env.ENABLE_LEGACY_CREDITS === 'true',
      byoApiEnabled: process.env.BYOAPI_FEATURE_ENABLED === 'true',
      sitemapCrawler: true,
      postScheduler: true,
      bulkContent: true,
      adminWordPress: true,
      adminSystem: true,
      adminSettings: true,
      notifications: true
    },
    uploads: {
      directory: path.join(__dirname, '../uploads'),
      accessible: fs.existsSync(path.join(__dirname, '../uploads'))
    }
  });
});

// ===== API ROUTES - ORGANIZED ORDER =====
// User-facing routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/sites', wordpressRoutes);
app.use('/api/wordpress', wordpressRoutes);
app.use('/api/keywords', keywordRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/sitemap', sitemapRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/bulk-content', bulkContentRoutes);

// Notifications routes
app.use('/api/notifications', notificationRoutes);

// Admin routes - MUST come after user routes to avoid conflicts
app.use('/api/admin/wordpress', adminWordpressRoutes);
app.use('/api/admin/system', adminSystemRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin', adminRoutes);

// Log route registration
logger.info('Routes registered:');
logger.info('  - /api/auth');
logger.info('  - /api/profile');
logger.info('  - /api/content');
logger.info('  - /api/sites');
logger.info('  - /api/wordpress');
logger.info('  - /api/keywords');
logger.info('  - /api/settings');
logger.info('  - /api/billing');
logger.info('  - /api/sitemap');
logger.info('  - /api/scheduler');
logger.info('  - /api/bulk-content');
logger.info('  - /api/notifications');
logger.info('  - /api/admin/wordpress');
logger.info('  - /api/admin/system');
logger.info('  - /api/admin/settings');
logger.info('  - /api/admin');

// ===== ROOT ROUTE =====
app.get('/', (req, res) => {
  res.json({
    message: 'Content Automation SaaS API',
    version: '1.0.0',
    status: 'running',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      profile: '/api/profile',
      content: '/api/content', 
      sites: '/api/sites',
      wordpress: '/api/wordpress',
      keywords: '/api/keywords',
      settings: '/api/settings',
      admin: '/api/admin',
      billing: '/api/billing',
      sitemap: '/api/sitemap',
      scheduler: '/api/scheduler',
      bulkContent: '/api/bulk-content',
      notifications: '/api/notifications',
      health: '/api/health',
    },
    adminEndpoints: {
      wordpress: '/api/admin/wordpress',
      system: '/api/admin/system',
      settings: '/api/admin/settings',
      users: '/api/admin/users',
      dashboard: '/api/admin/dashboard'
    },
    billing: {
      packages: '/api/billing/packages',
      info: '/api/billing/info',
      initializeTransaction: '/api/billing/initialize-transaction',
      verifyTransaction: '/api/billing/verify-transaction',
      analytics: '/api/billing/usage-analytics',
      webhook: '/api/billing/webhook'
    },
    bulkContent: {
      generateAndSchedule: '/api/bulk-content/generate-and-schedule',
      generate: '/api/bulk-content/generate',
      estimate: '/api/bulk-content/estimate',
      progress: '/api/bulk-content/progress/:operationId'
    },
    notifications: {
      list: '/api/notifications',
      unreadCount: '/api/notifications/unread-count',
      markAsRead: '/api/notifications/:id/read',
      markAllRead: '/api/notifications/mark-all-read',
      delete: '/api/notifications/:id'
    },
    sitemap: {
      crawl: '/api/sitemap/crawl/:siteId',
      stats: '/api/sitemap/stats/:siteId',
      findLinks: '/api/sitemap/find-links',
      clear: '/api/sitemap/:siteId'
    },
    scheduler: {
      schedule: '/api/scheduler/schedule',
      update: '/api/scheduler/update/:contentId',
      cancel: '/api/scheduler/:contentId',
      scheduled: '/api/scheduler/scheduled',
      calendar: '/api/scheduler/calendar',
      stats: '/api/scheduler/stats',
      bulkSchedule: '/api/scheduler/bulk-schedule'
    },
    uploads: {
      endpoint: '/uploads',
      avatars: '/uploads/avatars',
      content: '/uploads/content'
    }
  });
});

// ===== 404 HANDLER =====
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: [
      '/api/auth',
      '/api/profile',
      '/api/content',
      '/api/sites',
      '/api/wordpress',
      '/api/keywords',
      '/api/settings',
      '/api/admin',
      '/api/admin/wordpress',
      '/api/admin/system',
      '/api/admin/settings',
      '/api/billing',
      '/api/sitemap',
      '/api/scheduler',
      '/api/bulk-content',
      '/api/notifications'
    ]
  });
});

// ===== ERROR HANDLING MIDDLEWARE =====
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction): void => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: Object.values(err.errors).map((e: any) => e.message),
    });
    return;
  }

  if (err.name === 'CastError') {
    res.status(400).json({
      success: false,
      message: 'Invalid ID format',
    });
    return;
  }

  if (err.code === 11000) {
    res.status(409).json({
      success: false,
      message: 'Duplicate entry',
    });
    return;
  }

  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({
      success: false,
      message: 'CORS policy violation',
    });
    return;
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 10MB.',
    });
    return;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({
      success: false,
      message: 'Unexpected file field.',
    });
    return;
  }

  if (err.type === 'PaystackSignatureVerificationError') {
    res.status(400).json({
      success: false,
      message: 'Invalid webhook signature',
    });
    return;
  }

  res.status(err.status || 500).json({
    success: false,
    message: isDevelopment() ? err.message : 'Internal server error',
    ...(isDevelopment() && { stack: err.stack }),
  });
  return;
});

export default app;