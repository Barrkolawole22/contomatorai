// backend/src/config/env.ts - FIXED
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(5000),

  // Database Configuration
  MONGODB_URI: z.string().url('Invalid MongoDB URI').default('mongodb://localhost:27017/content-automation'),
  MONGODB_TEST_URI: z.string().url('Invalid MongoDB test URI').optional(),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long').optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Frontend Configuration
  FRONTEND_URL: z.string().url('Invalid frontend URL').default('http://localhost:3000'),

  // AI Service Configuration - FIXED: All optional now
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_MAX_TOKENS: z.coerce.number().positive().default(4000),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.8),

  // Gemini Configuration - FIXED: Optional
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-pro'),

  // Groq Configuration - FIXED: Optional
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

  // Hugging Face Configuration - FIXED: Optional
  HUGGINGFACE_API_KEY: z.string().optional(),
  HUGGINGFACE_MODEL: z.string().default('meta-llama/Meta-Llama-3.1-8B-Instruct'),

  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().positive().default(100),
  RATE_LIMIT_SKIP_FAILED_REQUESTS: z.coerce.boolean().default(false),

  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple', 'combined']).default('simple'),

  // WordPress Integration
  WORDPRESS_TEST_URL: z.string().url('Invalid WordPress URL').optional(),
  WORDPRESS_TEST_USERNAME: z.string().min(1).optional(),
  WORDPRESS_TEST_PASSWORD: z.string().min(1).optional(),
  WORDPRESS_PLUGIN_API_KEY: z.string().optional(),

  // Paystack Configuration
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),

  // Security Configuration
  SALT_WORK_FACTOR: z.coerce.number().min(8).max(15).default(12),
  CORS_ORIGIN: z.string().default('*'),
  SESSION_SECRET: z.string().min(32).optional(),

  // Email Configuration
  EMAIL_FROM: z.string().email('Invalid email address').optional(),
  EMAIL_FROM_NAME: z.string().optional().default('ContentAI Pro'), // <-- ADDED THIS LINE
  EMAIL_SERVICE: z.enum(['gmail', 'outlook', 'yahoo', 'custom']).optional(),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().min(1).max(65535).optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_SECURE: z.coerce.boolean().default(true),

  // === GOOGLE OAUTH ===
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // === TWITTER OAUTH ===
  TWITTER_CONSUMER_KEY: z.string().optional(), // <-- ADDED THIS
  TWITTER_CONSUMER_SECRET: z.string().optional(), // <-- ADDED THIS
  TWITTER_CALLBACK_URL: z.string().url().optional(), // <-- ADDED THIS

  // Redis Configuration
  REDIS_URL: z.string().url('Invalid Redis URL').optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).max(15).default(0),

  // File Upload Configuration
  MAX_FILE_SIZE: z.coerce.number().positive().default(10 * 1024 * 1024),
  UPLOAD_PATH: z.string().default('./uploads'),
  ALLOWED_FILE_TYPES: z.string().default('jpg,jpeg,png,pdf,doc,docx'),
  AVATAR_MAX_SIZE: z.coerce.number().positive().default(5 * 1024 * 1024),
  AVATAR_ALLOWED_TYPES: z.string().default('jpg,jpeg,png,gif,webp'),
  PRODUCTION_URL: z.string().url().optional(),

  // Monitoring & Analytics
  SENTRY_DSN: z.string().url('Invalid Sentry DSN').optional(),
  ANALYTICS_ID: z.string().optional(),

  // Feature Flags
  ENABLE_REGISTRATION: z.coerce.boolean().default(true),
  ENABLE_EMAIL_VERIFICATION: z.coerce.boolean().default(false),
  ENABLE_RATE_LIMITING: z.coerce.boolean().default(true),
  ENABLE_SWAGGER_DOCS: z.coerce.boolean().default(true),
  ENABLE_PROFILE_FEATURES: z.coerce.boolean().default(true),
  ENABLE_WORD_BILLING: z.coerce.boolean().default(true),
  ENABLE_LEGACY_CREDITS: z.coerce.boolean().default(true),
  BYOAPI_FEATURE_ENABLED: z.coerce.boolean().default(false),

  // Word Package Settings
  DEFAULT_FREE_WORD_CREDITS: z.coerce.number().default(5000),
  MINIMUM_WORD_CREDITS_ALERT: z.coerce.number().default(1000),

  // Admin Configuration
  ADMIN_EMAIL: z.string().email('Invalid admin email').optional(),
  ADMIN_PASSWORD: z.string().min(6, 'Admin password must be at least 6 characters').optional(),
  ENABLE_ADMIN_CREATION: z.coerce.boolean().default(true),
  ADMIN_PANEL_ENABLED: z.coerce.boolean().default(true),
  ADMIN_PANEL_PATH: z.string().default('/admin'),
  ADMIN_SESSION_TIMEOUT: z.coerce.number().positive().default(3600000),
});

let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Environment validation failed:');
  
  if (error instanceof z.ZodError) {
    error.errors.forEach((err) => {
      console.error(`  • ${err.path.join('.')}: ${err.message}`);
    });
  }
  
  console.error('\n💡 Please check your .env file and ensure all required variables are set correctly.');
  process.exit(1);
}

export { env };
export type EnvConfig = z.infer<typeof envSchema>;

export const isDevelopment = () => env.NODE_ENV === 'development';
export const isProduction = () => env.NODE_ENV === 'production';
export const isTest = () => env.NODE_ENV === 'test';

export const getDatabaseUri = () => {
  if (isTest() && env.MONGODB_TEST_URI) {
    return env.MONGODB_TEST_URI;
  }
  return env.MONGODB_URI;
};

export const isEmailConfigured = () => {
  return !!(env.EMAIL_FROM && env.EMAIL_SERVICE && env.EMAIL_USER && env.EMAIL_PASS);
};

export const isRedisConfigured = () => {
  return !!env.REDIS_URL;
};

export const isAdminConfigured = () => {
  return !!(env.ADMIN_EMAIL && env.ADMIN_PASSWORD);
};

export const getAdminConfig = () => ({
  email: env.ADMIN_EMAIL,
  password: env.ADMIN_PASSWORD,
  panelEnabled: env.ADMIN_PANEL_ENABLED,
  panelPath: env.ADMIN_PANEL_PATH,
  sessionTimeout: env.ADMIN_SESSION_TIMEOUT,
  enableCreation: env.ENABLE_ADMIN_CREATION,
});

export const getCORSConfig = () => ({
  origin: function (origin: any, callback: any) {
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
});

export const getRateLimitConfig = () => ({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const getJWTConfig = () => ({
  secret: env.JWT_SECRET,
  expiresIn: env.JWT_EXPIRES_IN,
  refreshSecret: env.JWT_REFRESH_SECRET,
  refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
});

if (isDevelopment()) {
  console.log('✅ Environment variables loaded successfully');
  console.log(`🚀 Server will run on port ${env.PORT}`);
  console.log(`🗄️  Database: ${getDatabaseUri()}`);
  console.log(`🌐 Frontend URL: ${env.FRONTEND_URL}`);
  console.log(`🤖 OpenAI API: ${env.OPENAI_API_KEY ? 'Configured ✓' : 'Not configured'}`);
  console.log(`⚡ Groq API: ${env.GROQ_API_KEY ? 'Configured ✓' : 'Not configured'}`);
  console.log(`🤗 Hugging Face API: ${env.HUGGINGFACE_API_KEY ? 'Configured ✓' : 'Not configured'}`);
  console.log(`💳 Paystack: ${env.PAYSTACK_SECRET_KEY ? 'Configured ✓' : 'Not configured'}`);
  console.log(`👨‍💼 Admin Panel: ${env.ADMIN_PANEL_ENABLED ? 'Enabled' : 'Disabled'}`);
}

export default env;