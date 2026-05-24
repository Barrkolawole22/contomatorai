// backend/src/routes/knowledgebase.routes.ts
import express, { Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import knowledgebaseService from '../services/knowledgebase.service';
import logger from '../config/logger';

const router = express.Router();

// ─── Multer configuration ──────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req: any, _file, cb) => {
    const userId: string = req.user?.id || 'unknown';
    const dir = path.join(__dirname, '../../uploads/knowledgebase', userId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `${unique}-${safe}`);
  },
});

const fileFilter = (
  _req: express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowed = ['.docx', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .docx and .txt files are allowed'));
  }
};

const uploadDoc = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ─── Auth ─────────────────────────────────────────────────────────────────

router.use(authMiddleware);

// ─── Routes ───────────────────────────────────────────────────────────────

/**
 * POST /api/knowledgebase/upload
 */
router.post(
  '/upload',
  uploadDoc.single('document'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const { description } = req.body as { description?: string };
      const doc = await knowledgebaseService.uploadDocument(userId, req.file, description);

      res.status(201).json({
        success: true,
        data: doc,
        message: 'Document uploaded. Processing started — check status to confirm readiness.',
      });
    } catch (error: any) {
      logger.error('Knowledgebase upload error:', error);
      res.status(500).json({ success: false, message: error.message || 'Upload failed' });
    }
  }
);

/**
 * POST /api/knowledgebase/search
 * Preview the full text context that will be injected for selected docs.
 */
router.post('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { docIds } = req.body as { docIds?: string[] };

    if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
      res.status(400).json({ success: false, message: 'docIds array is required' });
      return;
    }

    const context = await knowledgebaseService.retrieveContext(userId, docIds);
    res.json({ success: true, data: { context, charCount: context.length } });
  } catch (error: any) {
    logger.error('Knowledgebase search error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/knowledgebase
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const docs = await knowledgebaseService.getDocuments(userId);
    res.json({ success: true, data: docs });
  } catch (error: any) {
    logger.error('List knowledgebase docs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/knowledgebase/:id
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const doc = await knowledgebaseService.getDocumentById(userId, req.params.id);
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    res.json({ success: true, data: doc });
  } catch (error: any) {
    logger.error('Get knowledgebase doc error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/knowledgebase/:id
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const deleted = await knowledgebaseService.deleteDocument(userId, req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error: any) {
    logger.error('Delete knowledgebase doc error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;