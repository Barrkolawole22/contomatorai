// backend/src/routes/pipeline.routes.ts
import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import PipelineConfig from '../models/pipelineConfig.model';
import PipelineRun from '../models/pipelineRun.model';
import Site from '../models/site.model';
import autonomousPipeline from '../services/autonomous-pipeline.service';
import { schedulePipelineCron, cancelPipelineCron } from '../jobs/cron-jobs';
import logger from '../config/logger';
import Parser from 'rss-parser';

const router = express.Router();
router.use(authMiddleware);

const rssParser = new Parser({ timeout: 8000 });

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'this', 'that', 'these', 'those', 'it', 'its',
  'how', 'what', 'why', 'when', 'where', 'who', 'which', 'new', 'top',
  'best', 'your', 'our', 'their', 'all', 'more', 'most', 'than', 'about',
]);

function extractNicheFromTitles(titles: string[]): string[] {
  const wordFreq: Record<string, number> = {};

  for (const title of titles) {
    const words = title.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && !STOP_WORDS.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }
  }

  return Object.entries(wordFreq)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
}

// GET /api/pipelines/suggest-niche?siteId=xxx
router.get('/suggest-niche', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { siteId } = req.query;

    if (!siteId) {
      res.status(400).json({ success: false, message: 'siteId is required' });
      return;
    }

    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) {
      res.status(404).json({ success: false, message: 'Site not found' });
      return;
    }

    const suggestions: string[] = [];

    // 1. Use synced WordPress categories if available
    if (site.categories && site.categories.length > 0) {
      const catNames = site.categories
        .map(c => c.name)
        .filter(n => n.toLowerCase() !== 'uncategorized')
        .slice(0, 5);
      suggestions.push(...catNames);
    }

    // 2. Fall back to RSS feed if no categories
    if (suggestions.length === 0) {
      try {
        const feedUrl = site.url.replace(/\/$/, '') + '/feed/';
        const feed = await rssParser.parseURL(feedUrl);
        const titles = (feed.items || []).slice(0, 15).map(i => i.title || '').filter(Boolean);
        const keywords = extractNicheFromTitles(titles);
        suggestions.push(...keywords);
        logger.info(`RSS niche detection for ${site.url}: found ${keywords.length} keywords`);
      } catch (rssErr: any) {
        logger.warn(`RSS niche detection failed for ${site.url}: ${rssErr.message}`);
      }
    }

    res.json({
      success: true,
      data: {
        suggestions,
        source: site.categories?.length > 0 ? 'categories' : 'rss',
        siteName: site.name,
      }
    });
  } catch (error: any) {
    logger.error('Suggest niche error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/pipelines
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await PipelineConfig.create({ ...req.body, userId });
    if (config.isActive) schedulePipelineCron(config);
    logger.info(`Pipeline created: ${config._id} (active: ${config.isActive})`);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/pipelines
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const configs = await PipelineConfig.find({ userId: req.user!.id });
    res.json({ success: true, data: configs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/pipelines/:id
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await PipelineConfig.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      req.body,
      { new: true }
    );
    if (!config) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    cancelPipelineCron(req.params.id);
    if (config.isActive) schedulePipelineCron(config);
    logger.info(`Pipeline updated: ${config._id} (active: ${config.isActive})`);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/pipelines/:id
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

// POST /api/pipelines/:id/trigger
router.post('/:id/trigger', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Ownership check: verify the pipeline belongs to the requesting user
    const config = await PipelineConfig.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!config) {
      res.status(404).json({ success: false, message: 'Pipeline not found' });
      return;
    }
    await autonomousPipeline.runPipeline(req.params.id);
    res.json({ success: true, message: 'Pipeline run started' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/pipelines/:id/runs
router.get('/:id/runs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Ownership check: verify the pipeline belongs to the requesting user
    const config = await PipelineConfig.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!config) {
      res.status(404).json({ success: false, message: 'Pipeline not found' });
      return;
    }
    const runs = await PipelineRun.find({ pipelineConfigId: req.params.id }).sort('-runAt');
    res.json({ success: true, data: runs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;