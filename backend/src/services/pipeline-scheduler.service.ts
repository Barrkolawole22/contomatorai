import cron, { ScheduledTask } from 'node-cron';
import PipelineConfig from '../models/pipelineConfig.model';
import autonomousPipeline from './autonomous-pipeline.service';
import logger from '../config/logger';

const jobs: Map<string, ScheduledTask> = new Map();

const scheduleMap: Record<string, string> = {
  hourly:      '0 * * * *',
  twice_daily: '0 */12 * * *',
  daily:       '0 0 * * *',
  weekly:      '0 0 * * 0',
};

function scheduleConfig(config: any) {
  const cronExpr = scheduleMap[config.schedule];
  if (!cronExpr) return;

  const job = cron.schedule(cronExpr, () => {
    logger.info(`Pipeline cron triggered for config ${config._id}`);
    autonomousPipeline.runPipeline(config._id.toString());
  });
  jobs.set(config._id.toString(), job);
}

export async function startPipelineScheduler() {
  const configs = await PipelineConfig.find({ isActive: true });
  configs.forEach(scheduleConfig);
  logger.info(`Pipeline scheduler started with ${configs.length} active configs`);
}

export function rescheduleConfig(config: any) {
  const id = config._id.toString();
  const existing = jobs.get(id);
  if (existing) existing.stop();
  scheduleConfig(config);
}

export function removeConfig(id: string) {
  const job = jobs.get(id);
  if (job) job.stop();
  jobs.delete(id);
}