// backend/src/services/rss.service.ts
import Parser from 'rss-parser';
import logger from '../config/logger';

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

const CATEGORY_FEEDS: Record<string, string> = {
  business: 'https://feeds.reuters.com/reuters/businessNews',
  technology: 'https://feeds.reuters.com/reuters/technologyNews',
  health: 'https://feeds.reuters.com/reuters/healthNews',
  science: 'https://feeds.reuters.com/reuters/scienceNews',
  sports: 'https://feeds.reuters.com/reuters/sportsNews',
  general: 'https://news.google.com/rss?hl=en&gl=US&ceid=US:en',
};

const CATEGORIES = Object.keys(CATEGORY_FEEDS);

const parser = new Parser({ timeout: 10000 });

function buildGoogleNewsUrl(keyword: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=en&gl=US&ceid=US:en`;
}

function isWithin48Hours(pubDate: string): boolean {
  if (!pubDate) return true;
  const published = new Date(pubDate).getTime();
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  return published >= cutoff;
}

export class RSSService {
  async fetchItems(keyword: string, limit = 5): Promise<RSSItem[]> {
    const isCategory = CATEGORIES.includes(keyword.toLowerCase());
    const primaryUrl = isCategory
      ? CATEGORY_FEEDS[keyword.toLowerCase()]
      : buildGoogleNewsUrl(keyword);

    try {
      const items = await this._parseFeed(primaryUrl, limit);
      if (items.length > 0) return items;
      throw new Error('No items returned from primary feed');
    } catch (err: any) {
      logger.warn(`RSS primary feed failed for "${keyword}": ${err.message} — trying Google News fallback`);
      try {
        return await this._parseFeed(buildGoogleNewsUrl(keyword), limit);
      } catch (fallbackErr: any) {
        logger.error(`RSS fallback also failed for "${keyword}": ${fallbackErr.message}`);
        return [];
      }
    }
  }

  private async _parseFeed(url: string, limit: number): Promise<RSSItem[]> {
    const feed = await parser.parseURL(url);
    const items: RSSItem[] = [];

    for (const item of feed.items || []) {
      if (!item.title || !item.link) continue;
      if (!isWithin48Hours(item.pubDate || '')) continue;

      items.push({
        title: item.title,
        link: item.link,
        description: item.contentSnippet || item.summary || '',
        pubDate: item.pubDate || '',
        source: feed.title || url,
      });

      if (items.length >= limit) break;
    }

    logger.info(`RSS: fetched ${items.length} item(s) from ${url}`);
    return items;
  }
}

export default new RSSService();