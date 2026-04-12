import Keyword from '../models/keyword.model';
import User from '../models/user.model';
import AIService from './ai.service';
import { KeywordResearchRequest } from '../types/api.types';
import logger from '../config/logger';
import mongoose from 'mongoose';

export interface KeywordData {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  competition: 'low' | 'medium' | 'high';
  relatedKeywords: string[];
  questions: string[];
  longTailKeywords: string[];
}

export interface KeywordResearchResult {
  seedKeyword: string;
  totalKeywords: number;
  keywords: KeywordData[];
  suggestions: {
    lowCompetition: KeywordData[];
    highVolume: KeywordData[];
    longTail: KeywordData[];
    questions: string[];
  };
}

export class KeywordService {
  private aiService: any;

  constructor() {
    this.aiService = new (AIService as any)();
  }

  async researchKeywords(
    userId: string,
    params: KeywordResearchRequest
  ): Promise<KeywordResearchResult> {
    try {
      const user = await User.findById(userId);
      if (!user || user.credits <= 0) {
        throw new Error('Insufficient credits');
      }

      const keywordData = await this.aiService.researchKeywords(params);

      const keywordResearch = new Keyword({
        userId: new mongoose.Types.ObjectId(userId),
        seedKeyword: params.seedKeyword,
        keywords: (keywordData as any).keywords.map((kw: KeywordData) => ({
          keyword: kw.keyword,
          searchVolume: kw.searchVolume,
          difficulty: kw.difficulty,
          cpc: kw.cpc,
          competition: kw.competition,
        })),
        country: params.country || 'US',
        language: params.language || 'en',
        createdAt: new Date(),
      });

      await keywordResearch.save();

      user.credits -= 1;
      await user.save();

      logger.info(`Keyword research completed for user ${userId}: ${params.seedKeyword}`);

      return keywordData;
    } catch (error) {
      logger.error('Error researching keywords:', error);
      throw error;
    }
  }

  async getKeywordHistory(userId: string, params: { page?: number; limit?: number }) {
    try {
      const { page = 1, limit = 10 } = params;
      const skip = (page - 1) * limit;

      const total = await Keyword.countDocuments({ userId });
      const keywords = await Keyword.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const pages = Math.ceil(total / limit);

      return {
        data: keywords,
        pagination: {
          page,
          limit,
          total,
          pages,
          hasNext: page < pages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error('Error fetching keyword history:', error);
      throw error;
    }
  }

  async getKeywordById(userId: string, keywordId: string) {
    try {
      const keyword = await Keyword.findOne({ _id: keywordId, userId });
      if (!keyword) throw new Error('Keyword research not found');
      return keyword;
    } catch (error) {
      logger.error('Error fetching keyword by ID:', error);
      throw error;
    }
  }

  async deleteKeywordResearch(userId: string, keywordId: string): Promise<void> {
    try {
      const keyword = await Keyword.findOneAndDelete({ _id: keywordId, userId });
      if (!keyword) throw new Error('Keyword research not found');
      logger.info(`Keyword research deleted: ${keywordId}`);
    } catch (error) {
      logger.error('Error deleting keyword research:', error);
      throw error;
    }
  }

  async getKeywordSuggestions(seedKeyword: string, limit = 10): Promise<string[]> {
    try {
      return await this.aiService.getKeywordSuggestions(seedKeyword, limit);
    } catch (error) {
      logger.error('Error getting keyword suggestions:', error);
      throw error;
    }
  }

  async analyzeKeywordTrends(
    keywords: string[],
    timeframe: '7d' | '30d' | '90d' | '1y' = '30d'
  ) {
    try {
      const trends = keywords.map(keyword => ({
        keyword,
        trend: 'stable' as const,
        changePercent: Math.floor(Math.random() * 20) - 10,
        data: this.generateMockTrendData(timeframe),
      }));
      return { trends };
    } catch (error) {
      logger.error('Error analyzing keyword trends:', error);
      throw error;
    }
  }

  async getCompetitorKeywords(domain: string, limit = 50): Promise<KeywordData[]> {
    try {
      const mockKeywords: KeywordData[] = [];
      for (let i = 0; i < limit; i++) {
        mockKeywords.push({
          keyword: `competitor keyword ${i + 1}`,
          searchVolume: Math.floor(Math.random() * 10000),
          difficulty: Math.floor(Math.random() * 100),
          cpc: parseFloat((Math.random() * 5).toFixed(2)),
          competition: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as any,
          relatedKeywords: [],
          questions: [],
          longTailKeywords: [],
        });
      }
      return mockKeywords;
    } catch (error) {
      logger.error('Error getting competitor keywords:', error);
      throw error;
    }
  }

  async exportKeywords(userId: string, keywordId: string, format: 'csv' | 'json' = 'csv') {
    try {
      const keywordData = await this.getKeywordById(userId, keywordId);
      if (format === 'csv') return this.convertToCSV((keywordData as any).keywords);
      return JSON.stringify(keywordData, null, 2);
    } catch (error) {
      logger.error('Error exporting keywords:', error);
      throw error;
    }
  }

  async getKeywordStats(userId: string) {
    try {
      const [totalResearches, aggregateStats] = await Promise.all([
        Keyword.countDocuments({ userId }),
        Keyword.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: '$keywords' },
          {
            $group: {
              _id: null,
              totalKeywords: { $sum: 1 },
              averageSearchVolume: { $avg: '$keywords.searchVolume' },
              allKeywords: { $push: '$keywords' },
            },
          },
        ]).exec(),
      ]);

      const stats = aggregateStats[0] || {
        totalKeywords: 0,
        averageSearchVolume: 0,
        allKeywords: [],
      };

      const topKeywords = stats.allKeywords
        .sort((a: KeywordData, b: KeywordData) => b.searchVolume - a.searchVolume)
        .slice(0, 5)
        .map((kw: KeywordData) => ({
          keyword: kw.keyword,
          searchVolume: kw.searchVolume,
        }));

      return {
        totalResearches,
        totalKeywords: stats.totalKeywords,
        averageSearchVolume: Math.round(stats.averageSearchVolume || 0),
        topKeywords,
      };
    } catch (error) {
      logger.error('Error fetching keyword stats:', error);
      throw error;
    }
  }

  private generateMockTrendData(timeframe: string) {
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 365;
    const data = [];

    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        volume: Math.floor(Math.random() * 1000) + 500,
      });
    }

    return data;
  }

  private convertToCSV(keywords: KeywordData[]): string {
    const headers = ['Keyword', 'Search Volume', 'Difficulty', 'CPC', 'Competition'];
    const rows = keywords.map(kw => [
      kw.keyword,
      kw.searchVolume,
      kw.difficulty,
      kw.cpc,
      kw.competition,
    ]);
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}
