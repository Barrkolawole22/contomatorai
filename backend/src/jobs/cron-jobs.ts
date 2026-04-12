// backend/src/jobs/cron-jobs.ts
import cron from 'node-cron';
import schedulerService from '../services/scheduler.service';
import sitemapCrawlerService from '../services/sitemap-crawler.service';
import logger from '../config/logger';

/**
 * Initialize all cron jobs
 */
export function initializeCronJobs(): void {
  logger.info('Initializing cron jobs...');

  // Check for scheduled posts every minute
  cron.schedule('* * * * *', async () => {
    try {
      logger.info('Running scheduled posts check...');
      await schedulerService.processScheduledPosts();
    } catch (error: any) {
      logger.error('Error in scheduled posts cron:', error);
    }
  });

  // Crawl all sitemaps daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Running daily sitemap crawl...');
      await sitemapCrawlerService.crawlAllSites();
    } catch (error: any) {
      logger.error('Error in sitemap crawl cron:', error);
    }
  });

  logger.info('✅ Cron jobs initialized');
  logger.info('- Scheduled posts check: Every minute');
  logger.info('- Sitemap crawl: Daily at 2 AM');
}

/**
 * Manual trigger for testing
 */
export async function triggerScheduledPostsCheck(): Promise<void> {
  logger.info('Manually triggering scheduled posts check...');
  await schedulerService.processScheduledPosts();
}

export async function triggerSitemapCrawl(): Promise<void> {
  logger.info('Manually triggering sitemap crawl...');
  await sitemapCrawlerService.crawlAllSites();
}