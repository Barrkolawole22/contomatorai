// backend/src/services/trends.service.ts
import NewsAPI from 'newsapi';
import { env } from '../config/env';
import logger from '../config/logger';

const newsapi = new NewsAPI(env.NEWS_API_KEY || process.env.NEWS_API_KEY || '');

export class TrendsService {
  async fetchTrendingTopics(
    niche: string,
    maxTopics: number = 5
  ): Promise<Array<{ title: string; description: string }>> {
    try {
      const response = await newsapi.v2.topHeadlines({
        q: niche,
        language: 'en',
        pageSize: maxTopics,
        sortBy: 'relevancy',
      });

      if (response.status !== 'ok') {
        throw new Error('NewsAPI error: ' + response.status);
      }

      const topics = response.articles.map((article: any) => ({
        title: article.title,
        description: article.description || '',
      }));

      logger.info(`Fetched ${topics.length} trends for niche "${niche}"`);
      return topics;
    } catch (error: any) {
      logger.error(`Trends fetch failed: ${error.message}`);
      throw error;
    }
  }
}

export default new TrendsService();