import { Request, Response } from 'express';
import axios from 'axios';
import Keyword from '../models/keyword.model';
import User from '../models/user.model';
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
  // 🆕 Google Autocomplete API (Free, no API key needed)
  private async fetchGoogleAutocomplete(keyword: string): Promise<string[]> {
    try {
      const response = await axios.get('http://suggestqueries.google.com/complete/search', {
        params: {
          client: 'firefox',
          q: keyword
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 5000 // 5 second timeout
      });

      // Response format: [keyword, [suggestions]]
      if (Array.isArray(response.data) && response.data.length > 1) {
        return response.data[1] || [];
      }
      return [];
    } catch (error) {
      logger.error('Google Autocomplete error:', error);
      return []; // Fallback to empty array
    }
  }

  researchKeywords = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { keyword, seedKeyword, country = 'US', language = 'en' } = req.body;
      const targetKeyword = (seedKeyword || keyword)?.trim().toLowerCase();

      if (!targetKeyword || targetKeyword.length === 0) {
        res.status(400).json({ success: false, error: 'Keyword is required' });
        return;
      }

      // 🆕 Keyword research is now FREE - removed credit check

      // Check for existing keyword first
      const existingKeyword = await Keyword.findOne({
        keyword: targetKeyword,
        userId
      });

      if (existingKeyword) {
        // Return existing keyword data
        const keywordData = {
          id: existingKeyword._id.toString(),
          term: existingKeyword.keyword,
          keyword: existingKeyword.keyword,
          volume: existingKeyword.volume,
          difficulty: existingKeyword.difficulty,
          cpc: existingKeyword.cpc,
          competition: (existingKeyword.difficulty || 0) / 100,
          intent: existingKeyword.searchIntent,
          createdAt: existingKeyword.createdAt?.toISOString(),
          updatedAt: existingKeyword.updatedAt?.toISOString(),
          userId: existingKeyword.userId
        };

        res.status(200).json({
          success: true,
          data: [keywordData],
          message: 'Keyword research retrieved from history',
          fromHistory: true
        });
        return;
      }

      // 🆕 Try to fetch real suggestions from Google Autocomplete
      logger.info(`Fetching Google Autocomplete suggestions for: "${targetKeyword}"`);
      const suggestions = await this.fetchGoogleAutocomplete(targetKeyword);
      
      // Include the original keyword + suggestions, deduplicate, limit to 20 total
      const allKeywordsRaw = [targetKeyword, ...suggestions];
      const allKeywords = [...new Set(allKeywordsRaw.map(k => k.toLowerCase()))].slice(0, 20);
      
      // Generate data for all keywords
      const keywordDataList = allKeywords.map(kw => {
        const mockData = this.generateEnhancedMockData(kw);
        return {
          keyword: kw,
          volume: mockData.volume,
          difficulty: mockData.difficulty,
          cpc: mockData.cpc,
          searchIntent: mockData.intent,
          source: 'ai_suggested', // ✅ Use existing enum value
          userId,
          status: 'used',
          metadata: {
            country,
            language,
            relatedKeywords: [],
            researchDate: new Date(),
            suggestedBy: 'google_autocomplete' // Track source in metadata
          },
        };
      });

      // Save all keywords to database (skip duplicates)
      let savedKeywords;
      try {
        savedKeywords = await Keyword.insertMany(keywordDataList, { ordered: false });
      } catch (error: any) {
        // Handle duplicate key errors - some keywords may already exist
        if (error.code === 11000 && error.insertedDocs) {
          // insertMany with ordered:false continues after errors
          // Use the successfully inserted docs
          savedKeywords = error.insertedDocs;
          logger.info(`Inserted ${savedKeywords.length} new keywords, ${keywordDataList.length - savedKeywords.length} were duplicates`);
        } else {
          throw error; // Re-throw if not a duplicate error
        }
      }

      // If no keywords were saved (all duplicates), return existing ones
      if (!savedKeywords || savedKeywords.length === 0) {
        const existingKeywords = await Keyword.find({
          keyword: { $in: allKeywords },
          userId
        }).sort({ createdAt: -1 });

        const formattedData = existingKeywords.map(k => ({
          id: k._id.toString(),
          term: k.keyword,
          keyword: k.keyword,
          volume: k.volume,
          difficulty: k.difficulty,
          cpc: k.cpc,
          competition: (k.difficulty || 0) / 100,
          intent: k.searchIntent,
          createdAt: k.createdAt?.toISOString(),
          updatedAt: k.updatedAt?.toISOString(),
          userId: k.userId
        }));

        res.status(200).json({
          success: true,
          data: formattedData,
          message: 'Keyword research retrieved from history',
          fromHistory: true
        });
        return;
      }

      // 🆕 NO CREDIT DEDUCTION - research is free!

      // Format response to match frontend expectations
      const formattedData = savedKeywords.map(k => ({
        id: k._id.toString(),
        term: k.keyword,
        keyword: k.keyword,
        volume: k.volume,
        difficulty: k.difficulty,
        cpc: k.cpc,
        competition: (k.difficulty || 0) / 100,
        intent: k.searchIntent,
        createdAt: k.createdAt?.toISOString(),
        updatedAt: k.updatedAt?.toISOString(),
        userId: k.userId
      }));

      res.status(200).json({
        success: true,
        data: formattedData,
        message: 'Keyword research completed successfully',
        disclaimer: 'Note: Volume, difficulty, and CPC are estimates. For accurate data, use professional tools like Ahrefs or SEMrush.',
        suggestionsFound: suggestions.length
      });

    } catch (error: any) {
      logger.error('Error in researchKeywords:', error);
      
      // This should rarely happen now since we handle duplicates above
      if (error.code === 11000) {
        res.status(200).json({ 
          success: true, 
          data: [],
          message: 'Some keywords already exist in your history. Try searching for different terms.',
          code: 'DUPLICATE_KEYWORD'
        });
        return;
      }
      
      res.status(500).json({ 
        success: false, 
        message: 'Failed to research keywords',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  getKeywordHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const skip = (page - 1) * limit;

      const keywords = await Keyword.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Keyword.countDocuments({ userId });

      // Transform to match frontend expectations
      const transformedKeywords = keywords.map(k => ({
        id: k._id.toString(),
        term: k.keyword,
        keyword: k.keyword,
        volume: k.volume,
        difficulty: k.difficulty,
        cpc: k.cpc,
        competition: (k.difficulty || 0) / 100,
        intent: k.searchIntent,
        status: k.status,
        createdAt: k.createdAt?.toISOString(),
        updatedAt: k.updatedAt?.toISOString(),
        userId: k.userId
      }));

      res.status(200).json({
        success: true,
        data: transformedKeywords,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          count: transformedKeywords.length,
        }
      });
    } catch (error: any) {
      logger.error('Error in getKeywordHistory:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch keyword history' 
      });
    }
  };

  getKeywordById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { keywordId } = req.params;
      const keyword = await Keyword.findOne({ _id: keywordId, userId });

      if (!keyword) {
        res.status(404).json({ success: false, message: 'Keyword research not found' });
        return;
      }

      const keywordData = {
        id: keyword._id.toString(),
        term: keyword.keyword,
        keyword: keyword.keyword,
        volume: keyword.volume,
        difficulty: keyword.difficulty,
        cpc: keyword.cpc,
        competition: (keyword.difficulty || 0) / 100,
        intent: keyword.searchIntent,
        status: keyword.status,
        createdAt: keyword.createdAt?.toISOString(),
        updatedAt: keyword.updatedAt?.toISOString(),
        userId: keyword.userId,
        relatedKeywords: keyword.metadata?.relatedKeywords || [],
      };

      res.status(200).json({
        success: true,
        data: keywordData,
      });
    } catch (error: any) {
      logger.error('Error in getKeywordById:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch keyword research' });
    }
  };

  deleteKeywordResearch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { keywordId } = req.params;
      const keyword = await Keyword.findOneAndDelete({ _id: keywordId, userId });

      if (!keyword) {
        res.status(404).json({ success: false, message: 'Keyword research not found' });
        return;
      }

      res.status(200).json({ 
        success: true, 
        message: 'Keyword research deleted successfully' 
      });
    } catch (error: any) {
      logger.error('Error in deleteKeywordResearch:', error);
      res.status(500).json({ success: false, message: 'Failed to delete keyword research' });
    }
  };

  // Enhanced mock data generation (kept from original)
  private generateEnhancedMockData(keyword: string) {
    // Use keyword to generate consistent but varied data
    const hash = keyword.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Generate realistic search volume based on keyword characteristics
    let baseVolume = 1000;
    if (keyword.includes('how to')) baseVolume = 3000;
    if (keyword.includes('best')) baseVolume = 5000;
    if (keyword.includes('buy') || keyword.includes('price')) baseVolume = 2000;
    
    const volume = Math.floor((hash % baseVolume) + 500);
    const difficulty = Math.min(Math.floor((hash % 85) + 15), 100); // 15-100 range
    const cpc = Math.round(((hash % 400) + 50) / 100 * 100) / 100; // $0.50-$4.50 range
    
    // Determine intent based on keyword patterns
    let intent = 'informational';
    if (keyword.includes('buy') || keyword.includes('price') || keyword.includes('cost')) {
      intent = 'transactional';
    } else if (keyword.includes('best') || keyword.includes('vs') || keyword.includes('review')) {
      intent = 'commercial';
    } else if (keyword.includes('login') || keyword.includes('site:')) {
      intent = 'navigational';
    }
    
    return { volume, difficulty, cpc, intent };
  }

  // Keep existing helper methods
  private generateMockRelatedKeywords(seed: string): any[] {
    const variations = [
      `best ${seed}`,
      `${seed} tool`,
      `${seed} software`,
      `how to ${seed}`,
      `${seed} guide`,
      `${seed} tips`,
      `${seed} tutorial`,
      `free ${seed}`,
      `${seed} examples`,
      `${seed} strategy`
    ];

    return variations.slice(0, 6).map(kw => ({
      keyword: kw,
      volume: Math.floor(Math.random() * 3000) + 200,
      difficulty: Math.floor(Math.random() * 80) + 20,
      cpc: parseFloat((Math.random() * 3 + 0.5).toFixed(2)),
      searchIntent: 'informational',
    }));
  }

  getKeywordSuggestions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { seedKeyword, keyword } = req.query;
      const limit = parseInt(req.query.limit as string) || 10;

      const targetKeyword = seedKeyword || keyword;

      if (!targetKeyword || typeof targetKeyword !== 'string') {
        res.status(400).json({ success: false, error: 'Seed keyword is required' });
        return;
      }

      // 🆕 Try Google Autocomplete first
      const googleSuggestions = await this.fetchGoogleAutocomplete(targetKeyword.trim());
      
      if (googleSuggestions.length > 0) {
        res.status(200).json({
          success: true,
          data: { suggestions: googleSuggestions.slice(0, limit) },
        });
        return;
      }

      // Fallback to mock suggestions
      const suggestions = this.generateMockSuggestions(targetKeyword.trim(), limit);

      res.status(200).json({
        success: true,
        data: { suggestions },
      });
    } catch (error: any) {
      logger.error('Error in getKeywordSuggestions:', error);
      res.status(500).json({ success: false, error: 'Failed to get keyword suggestions' });
    }
  };

  private generateMockSuggestions(seed: string, limit: number): string[] {
    const suggestions = [
      `${seed} tool`,
      `${seed} software`,
      `${seed} platform`,
      `${seed} service`,
      `${seed} solution`,
      `best ${seed}`,
      `free ${seed}`,
      `${seed} tutorial`,
      `${seed} guide`,
      `${seed} tips`,
      `how to ${seed}`,
      `${seed} examples`,
      `${seed} strategy`,
      `${seed} benefits`,
      `${seed} features`
    ];

    return suggestions.slice(0, limit);
  }

  analyzeKeywordTrends = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { keywords, timeframe = '30d' } = req.body;

      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        res.status(400).json({ success: false, error: 'Keywords array is required' });
        return;
      }

      const trends = keywords.map((kw: string) => ({
        keyword: kw,
        trend: Math.random() > 0.5 ? 'up' : 'down',
        change: (Math.random() * 50 - 25).toFixed(1) + '%',
        volume: Math.floor(Math.random() * 5000) + 500,
      }));

      res.status(200).json({
        success: true,
        data: { trends, timeframe },
      });
    } catch (error: any) {
      logger.error('Error in analyzeKeywordTrends:', error);
      res.status(500).json({ success: false, error: 'Failed to analyze keyword trends' });
    }
  };

  getCompetitorKeywords = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { domain } = req.query;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!domain || typeof domain !== 'string') {
        res.status(400).json({ success: false, error: 'Domain is required' });
        return;
      }

      const keywords = this.generateMockCompetitorKeywords(domain, limit);

      res.status(200).json({
        success: true,
        data: { keywords },
      });
    } catch (error: any) {
      logger.error('Error in getCompetitorKeywords:', error);
      res.status(500).json({ success: false, error: 'Failed to get competitor keywords' });
    }
  };

  private generateMockCompetitorKeywords(domain: string, limit: number): any[] {
    const mockKeywords = [
      'content marketing',
      'seo tools',
      'blog automation',
      'content creation',
      'keyword research',
    ];

    return mockKeywords.slice(0, limit).map(kw => ({
      keyword: kw,
      volume: Math.floor(Math.random() * 10000) + 500,
      difficulty: Math.floor(Math.random() * 100),
      position: Math.floor(Math.random() * 10) + 1,
      traffic: Math.floor(Math.random() * 1000) + 50,
    }));
  }

  exportKeywords = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const keywords = await Keyword.find({ userId }).sort({ createdAt: -1 });

      const csv = [
        'Keyword,Volume,Difficulty,CPC,Intent,Created',
        ...keywords.map(k => 
          `"${k.keyword}",${k.volume},${k.difficulty},${k.cpc},"${k.searchIntent}","${k.createdAt?.toISOString()}"`
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=keywords.csv');
      res.send(csv);
    } catch (error: any) {
      logger.error('Error in exportKeywords:', error);
      res.status(500).json({ success: false, error: 'Failed to export keywords' });
    }
  };

  getKeywordStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const totalKeywords = await Keyword.countDocuments({ userId });
      const keywords = await Keyword.find({ userId });

      const avgDifficulty = keywords.length > 0
        ? keywords.reduce((sum, k) => sum + (k.difficulty || 0), 0) / keywords.length
        : 0;

      const avgVolume = keywords.length > 0
        ? keywords.reduce((sum, k) => sum + (k.volume || 0), 0) / keywords.length
        : 0;

      res.status(200).json({
        success: true,
        data: {
          totalKeywords,
          avgDifficulty: Math.round(avgDifficulty),
          avgVolume: Math.round(avgVolume),
        }
      });
    } catch (error: any) {
      logger.error('Error in getKeywordStats:', error);
      res.status(500).json({ success: false, error: 'Failed to get keyword stats' });
    }
  };
}

export const keywordController = new KeywordController();