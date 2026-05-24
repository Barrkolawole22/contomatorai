// backend/src/services/rss.service.ts
import Parser from 'rss-parser';
import axios from 'axios';
import logger from '../config/logger';

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

const CATEGORY_FEEDS: Record<string, string> = {
  business:    'https://feeds.reuters.com/reuters/businessNews',
  technology:  'https://feeds.reuters.com/reuters/technologyNews',
  health:      'https://feeds.reuters.com/reuters/healthNews',
  science:     'https://feeds.reuters.com/reuters/scienceNews',
  sports:      'https://feeds.reuters.com/reuters/sportsNews',
  general:     'https://news.google.com/rss?hl=en&gl=US&ceid=US:en',
};

const CATEGORIES = Object.keys(CATEGORY_FEEDS);

const parser = new Parser({ timeout: 10000 });

function buildGoogleNewsUrl(keyword: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=en&gl=US&ceid=US:en`;
}

// Only fetch articles published within the last 4 hours
function isWithin4Hours(pubDate: string): boolean {
  if (!pubDate) return true;
  const published = new Date(pubDate).getTime();
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  return published >= cutoff;
}

async function resolveGoogleNewsUrl(googleNewsUrl: string, rawItem: any): Promise<string> {
  if (rawItem.guid && rawItem.guid.startsWith('http') && !rawItem.guid.includes('news.google.com')) {
    return rawItem.guid;
  }

  if (rawItem.source?.url && !rawItem.source.url.includes('news.google.com')) {
    return rawItem.source.url;
  }

  try {
    const response = await axios.get(googleNewsUrl, {
      timeout: 8000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      validateStatus: () => true,
    });

    const html: string = response.data || '';

    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    if (canonicalMatch && !canonicalMatch[1].includes('news.google.com')) {
      return canonicalMatch[1];
    }

    const dataAttrMatch = html.match(/data-n-au="([^"]+)"/);
    if (dataAttrMatch) return dataAttrMatch[1];

    const finalUrl: string = response.request?.res?.responseUrl || '';
    if (finalUrl && !finalUrl.includes('news.google.com')) return finalUrl;
  } catch (err: any) {
    logger.warn(`Could not resolve Google News URL: ${err.message}`);
  }

  return googleNewsUrl;
}

function isGoogleNewsUrl(url: string): boolean {
  return url.includes('news.google.com');
}

export class RSSService {
  /**
   * Fetch items for a single keyword/niche.
   */
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
      logger.warn(`RSS primary feed failed for "${keyword}": ${err.message} -- trying Google News fallback`);
      try {
        return await this._parseFeed(buildGoogleNewsUrl(keyword), limit);
      } catch (fallbackErr: any) {
        logger.error(`RSS fallback also failed for "${keyword}": ${fallbackErr.message}`);
        return [];
      }
    }
  }

  /**
   * Fetch items across multiple keywords, deduplicating by title.
   * Distributes the limit evenly across keywords.
   */
  async fetchItemsForNiches(niches: string[], totalLimit = 5): Promise<RSSItem[]> {
    if (!niches || niches.length === 0) return [];

    const perNiche = Math.max(1, Math.ceil(totalLimit / niches.length));
    const seen = new Set<string>();
    const allItems: RSSItem[] = [];

    for (const niche of niches) {
      try {
        const items = await this.fetchItems(niche.trim(), perNiche);
        for (const item of items) {
          // Deduplicate by normalised title
          const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
          if (!seen.has(key)) {
            seen.add(key);
            allItems.push(item);
          }
        }
      } catch (err: any) {
        logger.warn(`RSS fetch failed for niche "${niche}": ${err.message}`);
      }
    }

    // Sort by pubDate descending (most recent first) and cap at totalLimit
    return allItems
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, totalLimit);
  }

  private async _parseFeed(url: string, limit: number): Promise<RSSItem[]> {
    const feed = await parser.parseURL(url);
    const items: RSSItem[] = [];

    for (const item of feed.items || []) {
      if (!item.title || !item.link) continue;

      // Only include articles from the last 4 hours
      if (!isWithin4Hours(item.pubDate || '')) continue;

      let articleUrl = item.link;
      if (isGoogleNewsUrl(item.link)) {
        articleUrl = await resolveGoogleNewsUrl(item.link, item);
      }

      items.push({
        title: item.title,
        link: articleUrl,
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