// backend/src/app.ts
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
import scraperRoutes from './routes/scraper.routes';
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

// Import knowledgebase routes
import knowledgebaseRoutes from './routes/knowledgebase.routes';

// Import pipeline routes
import pipelineRoutes from './routes/pipeline.routes';

// Import support routes
import supportRoutes from './routes/support.routes';

// OAuth
import passport from 'passport';
import session from 'express-session';
import './config/passport.config';

import { Express } from 'express';
const app: Express = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// ===== ENSURE UPLOAD DIRECTORIES EXIST =====
const ensureUploadDirs = () => {
  const uploadDirs = [
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../uploads/avatars'),
    path.join(__dirname, '../uploads/content'),
    path.join(__dirname, '../uploads/temp'),
    path.join(__dirname, '../uploads/knowledgebase'),
  ];

  uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created upload directory: ${dir}`);
    }
  });
};

ensureUploadDirs();

// ===== SECURITY MIDDLEWARE =====
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// OPTIONS pre-flight with full CORS config (not open cors())
app.options('*', cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = env.CORS_ORIGIN.split(',');
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (isDevelopment() && origin.includes('localhost')) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));

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
  },
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
    return (
      req.path === '/health' ||
      req.path.startsWith('/uploads') ||
      req.path === '/billing/webhook'
    );
  },
});

app.use('/api', limiter);

// ===== PAYSTACK WEBHOOK RAW BODY MIDDLEWARE =====
app.use('/api/billing/webhook', express.raw({
  type: 'application/json',
  limit: '1mb',
}));

// ===== BODY PARSING MIDDLEWARE =====
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buffer) => {
    (req as any).rawBody = buffer;
  },
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

// ===== SESSION (MUST BE BEFORE PASSPORT) =====
if (!env.SESSION_SECRET) {
  if (env.NODE_ENV === 'production') {
    logger.error('FATAL: SESSION_SECRET is not set. Cannot start in production without a secure session secret.');
    process.exit(1);
  } else {
    logger.warn('SESSION_SECRET is not defined. Using insecure default — NOT SAFE FOR PRODUCTION.');
  }
}
app.use(session({
  secret: env.SESSION_SECRET || 'dev_only_insecure_session_secret_do_not_use_in_prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
  },
}));

// ===== PASSPORT =====
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
      notifications: true,
      knowledgebase: true,
      pipelines: true,
      support: true,
    },
    uploads: {
      directory: path.join(__dirname, '../uploads'),
      accessible: fs.existsSync(path.join(__dirname, '../uploads')),
    },
  });
});

// ===== API ROUTES =====
// User-facing routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/wordpress', wordpressRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/keywords', keywordRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/sitemap', sitemapRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/bulk-content', bulkContentRoutes);
app.use('/api/knowledgebase', knowledgebaseRoutes);
app.use('/api/pipelines', pipelineRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/support', supportRoutes);

// FIX: Scraper routes moved to AFTER session and passport initialization.
app.use('/api/scraper', scraperRoutes);

// Admin routes — must come after user routes to avoid conflicts
app.use('/api/admin/wordpress', adminWordpressRoutes);
app.use('/api/admin/system', adminSystemRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin', adminRoutes);

// ===== ROOT ROUTE =====
app.get('/', (_req, res) => {
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
      knowledgebase: '/api/knowledgebase',
      pipelines: '/api/pipelines',
      notifications: '/api/notifications',
      support: '/api/support',
      health: '/api/health',
      scraper: '/api/scraper',
    },
    adminEndpoints: {
      wordpress: '/api/admin/wordpress',
      system: '/api/admin/system',
      settings: '/api/admin/settings',
      users: '/api/admin/users',
      dashboard: '/api/admin/dashboard',
    },
    billing: {
      packages: '/api/billing/packages',
      info: '/api/billing/info',
      initializeTransaction: '/api/billing/initialize-transaction',
      verifyTransaction: '/api/billing/verify-transaction',
      analytics: '/api/billing/usage-analytics',
      webhook: '/api/billing/webhook',
    },
  });
});

// ===== 404 HANDLER =====
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ===== ERROR HANDLING MIDDLEWARE =====
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction): void => {
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
    res.status(400).json({ success: false, message: 'Invalid ID format' });
    return;
  }

  if (err.code === 11000) {
    res.status(409).json({ success: false, message: 'Duplicate entry' });
    return;
  }

  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({ success: false, message: 'CORS policy violation' });
    return;
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ success: false, message: 'File too large. Maximum size is 10MB.' });
    return;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({ success: false, message: 'Unexpected file field.' });
    return;
  }

  if (err.type === 'PaystackSignatureVerificationError') {
    res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    return;
  }

  res.status(err.status || 500).json({
    success: false,
    message: isDevelopment() ? err.message : 'Internal server error',
    ...(isDevelopment() && { stack: err.stack }),
  });
});

export default app;
