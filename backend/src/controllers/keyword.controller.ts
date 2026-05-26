import { Request, Response } from 'express';
import axios from 'axios';
import Keyword from '../models/keyword.model';
import logger from '../config/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export class KeywordController {

  // ── Google Autocomplete (free, no API key) ────────────────────────────────
  private async fetchGoogleAutocomplete(keyword: string): Promise<string[]> {
    try {
      const response = await axios.get('http://suggestqueries.google.com/complete/search', {
        params: { client: 'firefox', q: keyword },
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 5000,
      });
      if (Array.isArray(response.data) && response.data.length > 1) {
        return response.data[1] || [];
      }
      return [];
    } catch (error) {
      logger.error('Google Autocomplete error:', error);
      return [];
    }
  }

  // ── Infer search intent from keyword patterns ─────────────────────────────
  private inferIntent(keyword: string): string {
    const kw = keyword.toLowerCase();
    if (/\b(buy|price|cost|cheap|order|purchase|deal|discount|shop)\b/.test(kw)) return 'transactional';
    if (/\b(best|top|review|vs|compare|alternative|difference)\b/.test(kw)) return 'commercial';
    if (/\b(login|sign in|website|official|download|app)\b/.test(kw)) return 'navigational';
    return 'informational';
  }

  // POST /api/keywords/research
  researchKeywords = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const { keyword, seedKeyword, country = 'US', language = 'en' } = req.body;
      const targetKeyword = (seedKeyword || keyword)?.trim().toLowerCase();

      if (!targetKeyword) { res.status(400).json({ success: false, error: 'Keyword is required' }); return; }

      // Return cached result if exists
      const existing = await Keyword.findOne({ keyword: targetKeyword, userId });
      if (existing) {
        res.status(200).json({
          success: true,
          fromHistory: true,
          data: [this.formatKeyword(existing)],
          message: 'Retrieved from history',
        });
        return;
      }

      // Fetch real suggestions from Google Autocomplete
      logger.info(`Fetching Google Autocomplete suggestions for: "${targetKeyword}"`);
      const suggestions = await this.fetchGoogleAutocomplete(targetKeyword);

      const allKeywords = [...new Set([targetKeyword, ...suggestions].map(k => k.toLowerCase()))].slice(0, 20);

      const keywordDocs = allKeywords.map(kw => ({
        keyword: kw,
        volume: null,       // No fake data — real volume requires a paid API
        difficulty: null,
        cpc: null,
        searchIntent: this.inferIntent(kw),
        source: 'ai_suggested',
        userId,
        status: 'used',
        metadata: {
          country,
          language,
          relatedKeywords: [],
          researchDate: new Date(),
          suggestedBy: 'google_autocomplete',
        },
      }));

      let saved: any[] = [];
      try {
        saved = await Keyword.insertMany(keywordDocs, { ordered: false });
      } catch (err: any) {
        if (err.code === 11000 && err.insertedDocs) {
          saved = err.insertedDocs;
        } else {
          throw err;
        }
      }

      if (!saved || saved.length === 0) {
        const existingDocs = await Keyword.find({ keyword: { $in: allKeywords }, userId }).sort({ createdAt: -1 });
        res.status(200).json({
          success: true,
          fromHistory: true,
          data: existingDocs.map(k => this.formatKeyword(k)),
          message: 'Retrieved from history',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: saved.map(k => this.formatKeyword(k)),
        suggestionsFound: suggestions.length,
        message: `Found ${saved.length} keyword suggestions via Google Autocomplete.`,
        notice: 'Search volume, difficulty, and CPC data requires a paid tool like Ahrefs or SEMrush. Shown values are not available.',
      });

    } catch (error: any) {
      logger.error('Error in researchKeywords:', error);
      if (error.code === 11000) {
        res.status(200).json({ success: true, data: [], message: 'Keywords already in history.' });
        return;
      }
      res.status(500).json({ success: false, message: 'Failed to research keywords' });
    }
  };

  // GET /api/keywords
  getKeywordHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const skip = (page - 1) * limit;

      const [keywords, total] = await Promise.all([
        Keyword.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Keyword.countDocuments({ userId }),
      ]);

      res.status(200).json({
        success: true,
        data: keywords.map(k => this.formatKeyword(k)),
        pagination: { current: page, total: Math.ceil(total / limit), count: keywords.length },
      });
    } catch (error: any) {
      logger.error('Error in getKeywordHistory:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch keyword history' });
    }
  };

  // GET /api/keywords/suggestions
  getKeywordSuggestions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const target = (req.query.seedKeyword || req.query.keyword) as string;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!target) { res.status(400).json({ success: false, error: 'Seed keyword is required' }); return; }

      const suggestions = await this.fetchGoogleAutocomplete(target.trim());

      res.status(200).json({
        success: true,
        data: { suggestions: suggestions.slice(0, limit) },
      });
    } catch (error: any) {
      logger.error('Error in getKeywordSuggestions:', error);
      res.status(500).json({ success: false, error: 'Failed to get keyword suggestions' });
    }
  };

  // GET /api/keywords/stats
  getKeywordStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const totalKeywords = await Keyword.countDocuments({ userId });

      res.status(200).json({
        success: true,
        data: { totalKeywords },
      });
    } catch (error: any) {
      logger.error('Error in getKeywordStats:', error);
      res.status(500).json({ success: false, error: 'Failed to get keyword stats' });
    }
  };

  // GET /api/keywords/:keywordId
  getKeywordById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const keyword = await Keyword.findOne({ _id: req.params.keywordId, userId });
      if (!keyword) { res.status(404).json({ success: false, message: 'Not found' }); return; }

      res.status(200).json({ success: true, data: this.formatKeyword(keyword) });
    } catch (error: any) {
      logger.error('Error in getKeywordById:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch keyword' });
    }
  };

  // DELETE /api/keywords/:keywordId
  deleteKeywordResearch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const keyword = await Keyword.findOneAndDelete({ _id: req.params.keywordId, userId });
      if (!keyword) { res.status(404).json({ success: false, message: 'Not found' }); return; }

      res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error: any) {
      logger.error('Error in deleteKeywordResearch:', error);
      res.status(500).json({ success: false, message: 'Failed to delete keyword research' });
    }
  };

  // GET /api/keywords/:keywordId/export
  exportKeywords = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

      const keywords = await Keyword.find({ userId }).sort({ createdAt: -1 });

      const csv = [
        'Keyword,Intent,Source,Created',
        ...keywords.map(k =>
          `"${k.keyword}","${k.searchIntent || ''}","${k.metadata?.suggestedBy || 'google_autocomplete'}","${k.createdAt?.toISOString()}"`
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=keywords.csv');
      res.send(csv);
    } catch (error: any) {
      logger.error('Error in exportKeywords:', error);
      res.status(500).json({ success: false, error: 'Failed to export keywords' });
    }
  };

  // POST /api/keywords/trends — removed fake data, returns honest response
  analyzeKeywordTrends = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    res.status(200).json({
      success: false,
      message: 'Trend analysis requires a paid data provider (e.g. Google Trends API or SEMrush). This feature is not yet available.',
    });
  };

  // GET /api/keywords/competitor — removed fake data, returns honest response
  getCompetitorKeywords = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    res.status(200).json({
      success: false,
      message: 'Competitor keyword analysis requires a paid data provider (e.g. Ahrefs or SEMrush). This feature is not yet available.',
    });
  };

  // ── Shared formatter ──────────────────────────────────────────────────────
  private formatKeyword(k: any) {
    return {
      id: k._id.toString(),
      keyword: k.keyword,
      term: k.keyword,
      intent: k.searchIntent,
      volume: null,
      difficulty: null,
      cpc: null,
      status: k.status,
      createdAt: k.createdAt?.toISOString(),
      updatedAt: k.updatedAt?.toISOString(),
      userId: k.userId,
    };
  }
}

export const keywordController = new KeywordController();