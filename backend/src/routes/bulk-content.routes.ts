// backend/src/routes/bulk-content.routes.ts
import express, { Response } from 'express';
import multer from 'multer';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import bulkSchedulerService from '../services/bulk-scheduler.service';
import { AIModel } from '../services/ai.service';
import logger from '../config/logger';

const router = express.Router();
router.use(authMiddleware);

// Multer config for CSV uploads (memory storage — no disk write needed)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// ---- CSV PARSER ----
interface CSVRow {
  topic: string;
  keyword: string;
  tags?: string;
  publish_date?: string;
  doc_ids?: string;
  dos?: string;
  donts?: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(content: string): { rows: CSVRow[]; errors: string[] } {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const errors: string[] = [];

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV must have a header row and at least one data row'] };
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });

    // Require at least keyword
    if (!row.keyword?.trim()) {
      errors.push(`Row ${i + 1}: missing required "keyword" field`);
      continue;
    }

    rows.push({
      topic: row.topic?.trim() || row.keyword?.trim(),
      keyword: row.keyword?.trim(),
      tags: row.tags?.trim() || undefined,
      publish_date: row.publish_date?.trim() || undefined,
      doc_ids: row.doc_ids?.trim() || undefined,
      dos: row.dos?.trim() || undefined,
      donts: row.donts?.trim() || undefined
    });
  }

  return { rows, errors };
}

/**
 * POST /api/bulk-content/generate-and-schedule
 */
router.post('/generate-and-schedule', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const { entries, options } = req.body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ success: false, message: 'entries array is required and cannot be empty' });
      return;
    }
    if (!options?.siteId) {
      res.status(400).json({ success: false, message: 'options.siteId is required' });
      return;
    }
    if (entries.length > 20) {
      res.status(400).json({ success: false, message: 'Maximum 20 articles per batch' });
      return;
    }
    for (const entry of entries) {
      if (!entry.keyword || typeof entry.keyword !== 'string') {
        res.status(400).json({ success: false, message: 'Each entry must have a "keyword" field' });
        return;
      }
    }

    logger.info(`Bulk generation request from user ${userId}: ${entries.length} articles`);
    const result = await bulkSchedulerService.bulkGenerateAndSchedule(userId, entries, options);

    res.json({
      success: true,
      data: result,
      message: `Bulk generation complete: ${result.successful}/${result.total} successful`
    });
  } catch (error: any) {
    logger.error('Bulk generation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate content in bulk' });
  }
});

/**
 * POST /api/bulk-content/generate
 */
router.post('/generate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const { keywords, options } = req.body;
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      res.status(400).json({ success: false, message: 'keywords array is required' });
      return;
    }
    if (!options?.siteId) {
      res.status(400).json({ success: false, message: 'options.siteId is required' });
      return;
    }
    if (keywords.length > 20) {
      res.status(400).json({ success: false, message: 'Maximum 20 keywords per batch' });
      return;
    }

    const result = await bulkSchedulerService.bulkGenerate(userId, keywords, options);
    res.json({ success: true, data: result, message: `Generated ${result.successful}/${result.total} articles` });
  } catch (error: any) {
    logger.error('Simple bulk generation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate content' });
  }
});

/**
 * POST /api/bulk-content/estimate
 */
router.post('/estimate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const { count, wordCount = 1500, model = 'groq' } = req.body;
    if (!count || count <= 0) {
      res.status(400).json({ success: false, message: 'count must be a positive number' });
      return;
    }

    const estimatedCredits = bulkSchedulerService.estimateBulkCredits(count, wordCount, model as AIModel);
    res.json({ success: true, data: { count, wordCount, model, estimatedCredits, creditsPerArticle: estimatedCredits / count } });
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
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const progress = bulkSchedulerService.getProgress(req.params.operationId);
    if (!progress) {
      res.status(404).json({ success: false, message: 'Operation not found or already completed' });
      return;
    }
    res.json({ success: true, data: progress });
  } catch (error: any) {
    logger.error('Progress check error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to get progress' });
  }
});

/**
 * POST /api/bulk-content/upload-csv
 * Accept CSV, parse it, return preview + estimated credits (no generation yet)
 */
router.post('/upload-csv', csvUpload.single('csv'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'CSV file is required (field name: csv)' });
      return;
    }

    const content = req.file.buffer.toString('utf-8');
    const { rows, errors } = parseCSV(content);

    if (rows.length === 0) {
      res.status(400).json({
        success: false,
        message: errors.length > 0 ? errors.join('; ') : 'No valid rows found in CSV'
      });
      return;
    }

    // Default credit estimate at 1x (groq, 1500 words) — frontend overrides with actual model
    const estimatedCredits = rows.length * 1500;

    logger.info(`CSV parsed for user ${userId}: ${rows.length} rows, ${errors.length} errors`);

    res.json({
      success: true,
      data: {
        rows,
        totalRows: rows.length,
        estimatedCredits,
        errors
      }
    });
  } catch (error: any) {
    logger.error('CSV upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to parse CSV' });
  }
});

/**
 * POST /api/bulk-content/execute-csv
 * Run generation for rows that came from CSV parse
 */
router.post('/execute-csv', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const { rows, options } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ success: false, message: 'rows array is required' });
      return;
    }
    if (!options?.siteId) {
      res.status(400).json({ success: false, message: 'options.siteId is required' });
      return;
    }
    if (rows.length > 50) {
      res.status(400).json({ success: false, message: 'Maximum 50 rows per CSV execution' });
      return;
    }

    // Map CSV rows to BulkGenerationEntry format
    const entries = rows.map((row: any) => ({
      keyword: row.keyword,
      topic: row.topic || row.keyword,
      scheduledDate: row.scheduledDate ? new Date(row.scheduledDate) : undefined,
      docIds: row.docIds?.length ? row.docIds : undefined,
      dos: row.dos || undefined,
      donts: row.donts || undefined,
      customPrompt: undefined,
      additionalContext: undefined
    }));

    logger.info(`CSV execute for user ${userId}: ${entries.length} entries`);
    const result = await bulkSchedulerService.bulkGenerateAndSchedule(userId, entries, options);

    res.json({
      success: true,
      data: result,
      message: `CSV generation complete: ${result.successful}/${result.total} successful`
    });
  } catch (error: any) {
    logger.error('CSV execute error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to execute CSV generation' });
  }
});

export default router;