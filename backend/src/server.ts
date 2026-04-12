import mongoose from 'mongoose';
import app from './app';
import { env } from './config/env';
import logger from './config/logger';

// ✅ NEW: Import cron jobs for scheduler and sitemap crawler
import { initializeCronJobs } from './jobs/cron-jobs';

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
    
    // ✅ NEW: Initialize cron jobs after database connection
    try {
      initializeCronJobs();
      logger.info('✅ Cron jobs initialized successfully');
      logger.info('   - Scheduled posts check: Every minute');
      logger.info('   - Sitemap crawl: Daily at 2 AM');
    } catch (cronError) {
      logger.error('❌ Failed to initialize cron jobs:', cronError);
      // Don't exit - server can still run without cron jobs
    }
    
    // Start the server
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });
    
    // ✅ INCREASED TIMEOUTS FOR CONTENT GENERATION
    server.timeout = 300000; // 5 minutes (was 2 minutes)
    server.keepAliveTimeout = 300000; // 5 minutes
    server.headersTimeout = 310000; // Slightly higher than keepAliveTimeout

    logger.info('Server timeouts configured: 5 minutes for long-running operations');

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err: Error) => {
      logger.error('Unhandled Rejection:', err);
      server.close(() => {
        process.exit(1);
      });
    });

    // Graceful shutdown handlers
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

// Start the application
startServer();