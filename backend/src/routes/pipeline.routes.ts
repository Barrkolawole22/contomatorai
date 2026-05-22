// backend/src/routes/pipeline.routes.ts
import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import PipelineConfig from '../models/pipelineConfig.model';
import PipelineRun from '../models/pipelineRun.model';
import autonomousPipeline from '../services/autonomous-pipeline.service';
import { schedulePipelineCron, cancelPipelineCron } from '../jobs/cron-jobs';
import logger from '../config/logger';

const router = express.Router();
router.use(authMiddleware);

// POST /api/pipeline — create config and schedule cron if active
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await PipelineConfig.create({ ...req.body, userId });

    if (config.isActive) {
      schedulePipelineCron(config);
    }

    logger.info(`Pipeline created: ${config._id} (active: ${config.isActive})`);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/pipeline — list all configs for the authenticated user
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const configs = await PipelineConfig.find({ userId: req.user!.id });
    res.json({ success: true, data: configs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/pipeline/:id — update config and reschedule cron
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await PipelineConfig.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      req.body,
      { new: true }
    );

    if (!config) return res.status(404).json({ success: false, message: 'Not found' });

    // Always cancel the old job first, then reschedule only if active
    cancelPipelineCron(req.params.id);
    if (config.isActive) {
      schedulePipelineCron(config);
    }

    logger.info(`Pipeline updated: ${config._id} (active: ${config.isActive})`);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/pipeline/:id — cancel cron before deleting
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    cancelPipelineCron(req.params.id);
    await PipelineConfig.findOneAndDelete({ _id: req.params.id, userId: req.user!.id });
    logger.info(`Pipeline deleted: ${req.params.id}`);
    res.json({ success: true, message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/pipeline/:id/run — manual trigger
router.post('/:id/run', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await autonomousPipeline.runPipeline(req.params.id);
    res.json({ success: true, message: 'Pipeline run started' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/pipeline/:id/runs — run history
router.get('/:id/runs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const runs = await PipelineRun.find({ pipelineConfigId: req.params.id }).sort('-runAt');
    res.json({ success: true, data: runs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
