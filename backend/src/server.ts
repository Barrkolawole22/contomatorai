import mongoose from 'mongoose';
import app from './app';
import { env } from './config/env';
import logger from './config/logger';
import { initializeCronJobs } from './jobs/cron-jobs';
import { seedBillingData } from './scripts/seedBilling';

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize and start server
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();

    // Seed billing data only when explicitly requested.
    // Set RUN_SEED_ON_STARTUP=true in .env for first-time setup only.
    // Never set this in production after initial deployment — it re-runs
    // on every restart otherwise, which wastes DB operations and can cause
    // unexpected overwrites.
    if (process.env.RUN_SEED_ON_STARTUP === 'true') {
      logger.info('RUN_SEED_ON_STARTUP=true — running billing seed...');
      await seedBillingData();
      logger.info('Billing seed complete.');
    }

    // Initialize cron jobs after database is ready.
    // Must be awaited because initializeCronJobs calls initializePipelineCrons
    // internally, which does a DB query (PipelineConfig.find()). Without await,
    // pipeline scheduling failures are silently swallowed on startup.
    try {
      await initializeCronJobs();
      logger.info('✅ Cron jobs initialized successfully');
      logger.info('   - Scheduled posts check: Every minute');
      logger.info('   - Sitemap crawl: Daily at 2 AM');
    } catch (cronError) {
      logger.error('❌ Failed to initialize cron jobs:', cronError);
      // Don't exit — server can still run without cron jobs
    }

    // Start the server
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });

    // Increased timeouts for content generation
    server.timeout = 300000;         // 5 minutes
    server.keepAliveTimeout = 300000;
    server.headersTimeout = 310000;  // Slightly higher than keepAliveTimeout

    logger.info('Server timeouts configured: 5 minutes for long-running operations');

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err: Error) => {
      logger.error('Unhandled Rejection:', err);
      server.close(() => {
        process.exit(1);
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      server.close(async () => {
        try {
          await mongoose.disconnect();
          logger.info('Database disconnected');
          logger.info('Process terminated');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
};

startServer();