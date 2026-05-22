// backend/src/routes/scraper.routes.ts
import express, { Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import scraperService from '../services/scraper.service';
import logger from '../config/logger';

const router = express.Router();
router.use(authMiddleware);

router.post('/extract', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ success: false, message: 'URL is required' });
      return;
    }

    const data = await scraperService.extract(url);
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error(`Scraper error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;