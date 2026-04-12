import { Router } from 'express';
import { keywordController } from '../controllers/keyword.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for keyword research (more expensive operations)
const keywordResearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 keyword research requests per windowMs
  message: {
    success: false,
    error: 'Too many keyword research requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for suggestions (lighter operations)
const suggestionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 suggestion requests per minute
  message: {
    success: false,
    error: 'Too many suggestion requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// All routes require authentication
router.use(authMiddleware);

// POST /api/keywords/research - Research keywords (uses credits)
router.post('/research', keywordResearchLimiter, keywordController.researchKeywords);

// GET /api/keywords - Get keyword research history
router.get('/', keywordController.getKeywordHistory);

// GET /api/keywords/stats - Get keyword statistics
router.get('/stats', keywordController.getKeywordStats);

// GET /api/keywords/suggestions - Get keyword suggestions (free, no credits)
router.get('/suggestions', suggestionLimiter, keywordController.getKeywordSuggestions);

// POST /api/keywords/trends - Analyze keyword trends
router.post('/trends', keywordController.analyzeKeywordTrends);

// GET /api/keywords/competitor - Get competitor keywords
router.get('/competitor', keywordController.getCompetitorKeywords);

// GET /api/keywords/:keywordId - Get specific keyword research
router.get('/:keywordId', keywordController.getKeywordById);

// DELETE /api/keywords/:keywordId - Delete keyword research
router.delete('/:keywordId', keywordController.deleteKeywordResearch);

// GET /api/keywords/:keywordId/export - Export keywords
router.get('/:keywordId/export', keywordController.exportKeywords);

export default router;