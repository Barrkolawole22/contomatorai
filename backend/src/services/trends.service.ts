import NewsAPI from 'newsapi';
import { env } from '../config/env';
import logger from '../config/logger';

let _newsapi: InstanceType<typeof NewsAPI> | null = null;

const getNewsAPI = () => {
  const key = env.NEWS_API_KEY || process.env.NEWS_API_KEY;
  if (!key) {
    throw new Error('NEWS_API_KEY is not configured');
  }
  if (!_newsapi) {
    _newsapi = new NewsAPI(key);
  }
  return _newsapi;
};

export class TrendsService {
  async fetchTrendingTopics(
    niche: string,
    maxTopics: number = 5
  ): Promise<Array<{ title: string; description: string }>> {
    try {
      const response = await getNewsAPI().v2.topHeadlines({
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