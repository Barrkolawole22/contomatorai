// backend/src/routes/bulk-content.routes.ts
import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import bulkSchedulerService from '../services/bulk-scheduler.service';
import { AIModel } from '../services/ai.service';
import logger from '../config/logger';

const router = express.Router();

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * POST /api/bulk-content/generate-and-schedule
 * 
 * Generate multiple articles and schedule them
 * This is your main endpoint for bulk operations
 */
router.post('/generate-and-schedule', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { entries, options } = req.body;

    // Validation
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({
        success: false,
        message: 'entries array is required and cannot be empty'
      });
      return;
    }

    if (!options || !options.siteId) {
      res.status(400).json({
        success: false,
        message: 'options.siteId is required'
      });
      return;
    }

    // Limit to 20 articles per batch
    if (entries.length > 20) {
      res.status(400).json({
        success: false,
        message: 'Maximum 20 articles per batch. Please split into smaller batches.'
      });
      return;
    }

    // Validate each entry has required fields
    for (const entry of entries) {
      if (!entry.keyword || typeof entry.keyword !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Each entry must have a "keyword" field'
        });
        return;
      }
    }

    logger.info(`📦 Bulk generation request from user ${userId}: ${entries.length} articles`);

    // Start bulk generation
    const result = await bulkSchedulerService.bulkGenerateAndSchedule(
      userId,
      entries,
      options
    );

    res.json({
      success: true,
      data: result,
      message: `Bulk generation complete: ${result.successful}/${result.total} successful`
    });

  } catch (error: any) {
    logger.error('Bulk generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate content in bulk'
    });
  }
});

/**
 * POST /api/bulk-content/generate
 * 
 * Generate multiple articles without scheduling (all as drafts)
 * Simpler version for just generation
 */
router.post('/generate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { keywords, options } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      res.status(400).json({
        success: false,
        message: 'keywords array is required and cannot be empty'
      });
      return;
    }

    if (!options || !options.siteId) {
      res.status(400).json({
        success: false,
        message: 'options.siteId is required'
      });
      return;
    }

    if (keywords.length > 20) {
      res.status(400).json({
        success: false,
        message: 'Maximum 20 keywords per batch'
      });
      return;
    }

    logger.info(`📦 Simple bulk generation from user ${userId}: ${keywords.length} keywords`);

    const result = await bulkSchedulerService.bulkGenerate(userId, keywords, options);

    res.json({
      success: true,
      data: result,
      message: `Generated ${result.successful}/${result.total} articles`
    });

  } catch (error: any) {
    logger.error('Simple bulk generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate content'
    });
  }
});

/**
 * POST /api/bulk-content/estimate
 * 
 * Estimate credits needed for bulk operation
 */
router.post('/estimate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { 
      count, 
      wordCount = 1500, 
      model = 'groq' 
    } = req.body;

    if (!count || count <= 0) {
      res.status(400).json({
        success: false,
        message: 'count must be a positive number'
      });
      return;
    }

    const estimatedCredits = bulkSchedulerService.estimateBulkCredits(
      count,
      wordCount,
      model as AIModel
    );

    res.json({
      success: true,
      data: {
        count,
        wordCount,
        model,
        estimatedCredits,
        creditsPerArticle: estimatedCredits / count
      }
    });

  } catch (error: any) {
    logger.error('Estimation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to estimate credits'
    });
  }
});

/**
 * GET /api/bulk-content/progress/:operationId
 * 
 * Get progress of bulk operation (for real-time updates)
 */
router.get('/progress/:operationId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { operationId } = req.params;
    const progress = bulkSchedulerService.getProgress(operationId);

    if (!progress) {
      res.status(404).json({
        success: false,
        message: 'Operation not found or already completed'
      });
      return;
    }

    res.json({
      success: true,
      data: progress
    });

  } catch (error: any) {
    logger.error('Progress check error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get progress'
    });
  }
});

export default router;