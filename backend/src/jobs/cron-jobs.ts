import cron, { ScheduledTask } from 'node-cron';
import schedulerService from '../services/scheduler.service';
import sitemapCrawlerService from '../services/sitemap-crawler.service';
import autonomousPipelineService from '../services/autonomous-pipeline.service';
import PipelineConfig, { IPipelineConfig } from '../models/pipelineConfig.model';
import logger from '../config/logger';

const SCHEDULE_MAP: Record<string, string> = {
  hourly:      '0 * * * *',
  twice_daily: '0 6,18 * * *',
  daily:       '0 8 * * *',
  weekly:      '0 8 * * 1',
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
    logger.info(`🤖 Pipeline cron fired: ${configId} (schedule: ${config.schedule})`);
    try {
      await autonomousPipelineService.runPipeline(configId);
    } catch (error: any) {
      logger.error(`Pipeline cron error for ${configId}:`, error.message);
    }
  });

  pipelineTasks.set(configId, task);
  logger.info(`📅 Pipeline cron scheduled: ${configId} @ ${config.schedule} (${cronExpr})`);
}

export function cancelPipelineCron(configId: string): void {
  const task = pipelineTasks.get(configId);
  if (task) {
    task.stop();
    pipelineTasks.delete(configId);
    logger.info(`🛑 Pipeline cron cancelled: ${configId}`);
  }
}

export async function rescheduleAllPipelines(): Promise<void> {
  logger.info('🔄 Rescheduling all pipeline crons...');
  pipelineTasks.forEach((task, id) => {
    task.stop();
    logger.info(`🛑 Stopped pipeline cron: ${id}`);
  });
  pipelineTasks.clear();
  await initializePipelineCrons();
}

async function initializePipelineCrons(): Promise<void> {
  try {
    const activeConfigs = await PipelineConfig.find({ isActive: true });
    logger.info(`🤖 Scheduling ${activeConfigs.length} active pipeline cron(s)...`);
    for (const config of activeConfigs) {
      schedulePipelineCron(config);
    }
  } catch (error: any) {
    logger.error('Failed to initialize pipeline crons:', error.message);
  }
}

export function initializeCronJobs(): void {
  logger.info('Initializing cron jobs...');

  cron.schedule('* * * * *', async () => {
    try {
      logger.info('Running scheduled posts check...');
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

  initializePipelineCrons();

  logger.info('✅ Cron jobs initialized');
  logger.info('- Scheduled posts check: Every minute');
  logger.info('- Sitemap crawl: Daily at 2 AM');
  logger.info('- Pipeline crons: Per active config schedule');
}

export async function triggerScheduledPostsCheck(): Promise<void> {
  logger.info('Manually triggering scheduled posts check...');
  await schedulerService.processScheduledPosts();
}

export async function triggerSitemapCrawl(): Promise<void> {
  logger.info('Manually triggering sitemap crawl...');
  await sitemapCrawlerService.crawlAllSites();
}