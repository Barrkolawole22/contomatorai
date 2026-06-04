// backend/src/jobs/cron-jobs.ts
import cron, { ScheduledTask } from 'node-cron';
import schedulerService from '../services/scheduler.service';
import sitemapCrawlerService from '../services/sitemap-crawler.service';
import autonomousPipelineService from '../services/autonomous-pipeline.service';
import PipelineConfig, { IPipelineConfig } from '../models/pipelineConfig.model';
import logger from '../config/logger';

// NOTE: The content collection must have a compound index on
// { status: 1, scheduledPublishDate: 1 } to keep the every-minute
// processScheduledPosts query fast on Atlas M0. Add via:
//   ContentSchema.index({ status: 1, scheduledPublishDate: 1 });
// in content.model.ts if not already present.

const SCHEDULE_MAP: Record<string, string> = {
  hourly:          '0 * * * *',
  every_2_hours:   '0 */2 * * *',
  every_4_hours:   '0 */4 * * *',
  every_6_hours:   '0 */6 * * *',
  every_12_hours:  '0 */12 * * *',
  twice_daily:     '0 6,18 * * *',
  three_daily:     '0 7,13,19 * * *',
  daily:           '0 8 * * *',
  every_3_days:    '0 8 */3 * *',
  weekly:          '0 8 * * 1',
};

const pipelineTasks: Map<string, ScheduledTask> = new Map();

export function schedulePipelineCron(config: IPipelineConfig): void {
  const configId = config._id.toString();
  cancelPipelineCron(configId);

  const cronExpr = SCHEDULE_MAP[config.schedule];
  if (!cronExpr) {
    logger.warn(`Unknown pipeline schedule "${config.schedule}" for config ${configId} — not scheduled`);
    return;
  }

  const task = cron.schedule(cronExpr, async () => {
    logger.info(`Pipeline cron fired: ${configId} (schedule: ${config.schedule})`);
    try {
      await autonomousPipelineService.runPipeline(configId);
    } catch (error: any) {
      logger.error(`Pipeline cron error for ${configId}:`, error.message);
    }
  });

  pipelineTasks.set(configId, task);
  logger.info(`Pipeline cron scheduled: ${configId} @ ${config.schedule} (${cronExpr})`);
}

export function cancelPipelineCron(configId: string): void {
  const task = pipelineTasks.get(configId);
  if (task) {
    task.stop();
    pipelineTasks.delete(configId);
    logger.info(`Pipeline cron cancelled: ${configId}`);
  }
}

export async function rescheduleAllPipelines(): Promise<void> {
  logger.info('Rescheduling all pipeline crons...');
  pipelineTasks.forEach((task, id) => {
    task.stop();
    logger.info(`Stopped pipeline cron: ${id}`);
  });
  pipelineTasks.clear();
  await initializePipelineCrons();
}

/**
 * Queries the database for active pipeline configs and schedules a cron for each.
 * Must be awaited by callers so DB errors surface at startup instead of being
 * silently swallowed by a fire-and-forget call.
 */
async function initializePipelineCrons(): Promise<void> {
  try {
    const activeConfigs = await PipelineConfig.find({ isActive: true });
    logger.info(`Scheduling ${activeConfigs.length} active pipeline cron(s)...`);
    for (const config of activeConfigs) {
      schedulePipelineCron(config);
    }
  } catch (error: any) {
    logger.error('Failed to initialize pipeline crons:', error.message);
    throw error; // re-throw so the caller (server.ts) knows pipelines failed to schedule
  }
}

/**
 * Initializes all cron jobs and awaits pipeline scheduling.
 * Must be async so server.ts can await it and catch pipeline startup failures.
 */
export async function initializeCronJobs(): Promise<void> {
  logger.info('Initializing cron jobs...');

  // Every-minute check for scheduled posts.
  // Requires compound index { status: 1, scheduledPublishDate: 1 } on the
  // content collection to avoid a full collection scan on Atlas M0.
  cron.schedule('* * * * *', async () => {
    try {
      await schedulerService.processScheduledPosts();
    } catch (error: any) {
      logger.error('Error in scheduled posts cron:', error);
    }
  });

  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Running daily sitemap crawl...');
      await sitemapCrawlerService.crawlAllSites();
    } catch (error: any) {
      logger.error('Error in sitemap crawl cron:', error);
    }
  });

  // Awaited so pipeline scheduling failures are visible at startup.
  await initializePipelineCrons();

  logger.info('Cron jobs initialized');
  logger.info('  - Scheduled posts check: Every minute');
  logger.info('  - Sitemap crawl: Daily at 2 AM');
  logger.info('  - Pipeline crons: Per active config schedule');
}

export async function triggerScheduledPostsCheck(): Promise<void> {
  logger.info('Manually triggering scheduled posts check...');
  await schedulerService.processScheduledPosts();
}

export async function triggerSitemapCrawl(): Promise<void> {
  logger.info('Manually triggering sitemap crawl...');
  await sitemapCrawlerService.crawlAllSites();
}