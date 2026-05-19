// backend/src/routes/bulk-content.routes.ts
import express, { Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import bulkSchedulerService from '../services/bulk-scheduler.service';
import aiService, { AIModel } from '../services/ai.service';
import logger from '../config/logger';

const router = express.Router();

// ─── CSV multer config ─────────────────────────────────────────────────────

const csvStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../../uploads/temp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    cb(null, `${unique}-${file.originalname.replace(/\s+/g, '_')}`);
  },
});

const csvFilter = (
  _req: express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.csv') {
    cb(null, true);
  } else {
    cb(new Error('Only .csv files are allowed'));
  }
};

const uploadCSVFile = multer({
  storage: csvStorage,
  fileFilter: csvFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

// ─── Auth ──────────────────────────────────────────────────────────────────

router.use(authMiddleware);

// ─── Helpers ───────────────────────────────────────────────────────────────

interface ParsedCSVRow {
  topic: string;
  keyword: string;
  tags?: string;
  publish_date?: string;
  doc_ids?: string;
  dos?: string;
  donts?: string;
}

interface NormalisedRow {
  topic: string;
  keyword: string;
  tags: string[];
  publishDate?: Date;
  docIds: string[];
  dos?: string;
  donts?: string;
  rowIndex: number;
}

function parseCSVFile(filePath: string): {
  rows: NormalisedRow[];
  errors: string[];
} {
  const raw = fs.readFileSync(filePath, 'utf-8');

  let records: ParsedCSVRow[];
  try {
    records = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as ParsedCSVRow[];
  } catch (err: any) {
    throw new Error(`CSV parsing failed: ${err.message}`);
  }

  const rows: NormalisedRow[] = [];
  const errors: string[] = [];

  records.forEach((record, idx) => {
    const rowNum = idx + 2; // +2 because row 1 is the header

    const topic = record.topic?.trim();
    const keyword = record.keyword?.trim();

    if (!topic) {
      errors.push(`Row ${rowNum}: missing "topic"`);
      return;
    }
    if (!keyword) {
      errors.push(`Row ${rowNum}: missing "keyword"`);
      return;
    }

    // Parse pipe-separated tags
    const tags = record.tags
      ? record.tags.split('|').map(t => t.trim()).filter(Boolean)
      : [];

    // Parse pipe-separated doc IDs
    const docIds = record.doc_ids
      ? record.doc_ids.split('|').map(d => d.trim()).filter(Boolean)
      : [];

    // Parse publish date — accept "YYYY-MM-DD HH:mm" or ISO strings
    let publishDate: Date | undefined;
    if (record.publish_date?.trim()) {
      const d = new Date(record.publish_date.trim());
      if (isNaN(d.getTime())) {
        errors.push(`Row ${rowNum}: invalid publish_date "${record.publish_date}" — use YYYY-MM-DD HH:mm or ISO format`);
      } else {
        publishDate = d;
      }
    }

    rows.push({
      topic,
      keyword,
      tags,
      publishDate,
      docIds,
      dos: record.dos?.trim() || undefined,
      donts: record.donts?.trim() || undefined,
      rowIndex: rowNum,
    });
  });

  return { rows, errors };
}

// ─── Existing endpoints ────────────────────────────────────────────────────

/**
 * POST /api/bulk-content/generate-and-schedule
 */
router.post('/generate-and-schedule', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { entries, options } = req.body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({
        success: false,
        message: 'entries array is required and cannot be empty',
      });
      return;
    }

    if (!options || !options.siteId) {
      res.status(400).json({ success: false, message: 'options.siteId is required' });
      return;
    }

    if (entries.length > 20) {
      res.status(400).json({
        success: false,
        message: 'Maximum 20 articles per batch. Please split into smaller batches.',
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.keyword || typeof entry.keyword !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Each entry must have a "keyword" field',
        });
        return;
      }
    }

    logger.info(`📋 Bulk generation request from user ${userId}: ${entries.length} articles`);

    const result = await bulkSchedulerService.bulkGenerateAndSchedule(userId, entries, options);

    res.json({
      success: true,
      data: result,
      message: `Bulk generation complete: ${result.successful}/${result.total} successful`,
    });
  } catch (error: any) {
    logger.error('Bulk generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate content in bulk',
    });
  }
});

/**
 * POST /api/bulk-content/generate
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
        message: 'keywords array is required and cannot be empty',
      });
      return;
    }

    if (!options || !options.siteId) {
      res.status(400).json({ success: false, message: 'options.siteId is required' });
      return;
    }

    if (keywords.length > 20) {
      res.status(400).json({ success: false, message: 'Maximum 20 keywords per batch' });
      return;
    }

    logger.info(`📋 Simple bulk generation from user ${userId}: ${keywords.length} keywords`);

    const result = await bulkSchedulerService.bulkGenerate(userId, keywords, options);

    res.json({
      success: true,
      data: result,
      message: `Generated ${result.successful}/${result.total} articles`,
    });
  } catch (error: any) {
    logger.error('Simple bulk generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate content',
    });
  }
});

/**
 * POST /api/bulk-content/estimate
 */
router.post('/estimate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { count, wordCount = 1500, model = 'groq' } = req.body;

    if (!count || count <= 0) {
      res.status(400).json({ success: false, message: 'count must be a positive number' });
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
        creditsPerArticle: estimatedCredits / count,
      },
    });
  } catch (error: any) {
    logger.error('Estimation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to estimate credits' });
  }
});

/**
 * GET /api/bulk-content/progress/:operationId
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
        message: 'Operation not found or already completed',
      });
      return;
    }

    res.json({ success: true, data: progress });
  } catch (error: any) {
    logger.error('Progress check error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to get progress' });
  }
});

// ─── NEW: CSV endpoints ────────────────────────────────────────────────────

/**
 * POST /api/bulk-content/upload-csv
 *
 * Parse and preview a CSV content calendar without executing it.
 * Returns parsed rows + estimated credits so the user can confirm.
 */
router.post(
  '/upload-csv',
  uploadCSVFile.single('csv'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, message: 'No CSV file uploaded' });
        return;
      }

      const { wordCount = 1500, model = 'groq' } = req.body as {
        wordCount?: number;
        model?: AIModel;
      };

      let parseResult: { rows: NormalisedRow[]; errors: string[] };
      try {
        parseResult = parseCSVFile(req.file.path);
      } finally {
        // Always clean up temp file
        try {
          fs.unlinkSync(req.file.path);
        } catch (_) {
          /* ignore */
        }
      }

      const { rows, errors } = parseResult;

      if (rows.length === 0 && errors.length > 0) {
        res.status(400).json({
          success: false,
          message: 'CSV contains no valid rows',
          data: { errors },
        });
        return;
      }

      const estimatedCredits = bulkSchedulerService.estimateBulkCredits(
        rows.length,
        Number(wordCount),
        model as AIModel
      );

      // Shape rows for client preview — match frontend column expectations
      const previewRows = rows.map(r => ({
        topic: r.topic,
        keyword: r.keyword,
        tags: r.tags.length > 0 ? r.tags.join(' | ') : null,
        publish_date: r.publishDate?.toISOString() || null,
        doc_ids: r.docIds.length > 0 ? r.docIds.join(' | ') : null,
        dos: r.dos || null,
        donts: r.donts || null,
        rowIndex: r.rowIndex,
      }));

      res.json({
        success: true,
        data: {
          rows: previewRows,
          totalRows: rows.length,
          estimatedCredits,
          errors,
        },
      });
    } catch (error: any) {
      // Clean up temp file on unexpected error
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
      }
      logger.error('CSV upload error:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to parse CSV' });
    }
  }
);

/**
 * POST /api/bulk-content/execute-csv
 *
 * Execute a previously-parsed CSV result.
 * Body: { rows: ParsedRow[], options: { siteId, model, wordCount, tone, timezone } }
 */
router.post('/execute-csv', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { rows, options } = req.body as {
      rows: Array<{
        topic: string;
        keyword: string;
        tags?: string[];
        publishDate?: string | null;
        docIds?: string[];
        dos?: string | null;
        donts?: string | null;
      }>;
      options: {
        siteId: string;
        model?: AIModel;
        wordCount?: number;
        tone?: string;
        timezone?: string;
        [key: string]: any;
      };
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ success: false, message: 'rows array is required' });
      return;
    }

    if (!options?.siteId) {
      res.status(400).json({ success: false, message: 'options.siteId is required' });
      return;
    }

    if (rows.length > 50) {
      res.status(400).json({
        success: false,
        message: 'Maximum 50 rows per CSV execution. Split the CSV into smaller batches.',
      });
      return;
    }

    // Convert client rows into BulkGenerationEntry format
    const entries = rows.map(r => ({
      topic: r.topic,
      keyword: r.keyword,
      scheduledDate: r.publishDate ? new Date(r.publishDate) : undefined,
      docIds: r.docIds?.filter(Boolean) || [],
      dos: r.dos || undefined,
      donts: r.donts || undefined,
    }));

    logger.info(`📋 CSV execute request from user ${userId}: ${entries.length} articles`);

    const result = await bulkSchedulerService.bulkGenerateAndSchedule(userId, entries, options);

    res.json({
      success: true,
      data: result,
      message: `CSV execution complete: ${result.successful}/${result.total} articles generated`,
    });
  } catch (error: any) {
    logger.error('CSV execute error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to execute CSV content calendar',
    });
  }
});

export default router;