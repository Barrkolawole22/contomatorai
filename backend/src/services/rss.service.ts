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

/**
 * Google News RSS links are encoded redirect URLs that axios cannot follow
 * because they use a JS/HTML redirect rather than HTTP 301/302.
 *
 * Strategy 1: Check item.guid — Google sometimes puts the real URL there.
 * Strategy 2: Check the <source url="..."> attribute in the raw feed item.
 * Strategy 3: Follow the redirect by fetching the Google News URL and
 *             reading the final Location from the response chain, or
 *             parsing the canonical link from the HTML response.
 * Strategy 4: Fall back to the original link (scraper will get 1 word, but
 *             the pipeline will skip it via the MIN_CONTEXT_WORDS check).
 */
async function resolveGoogleNewsUrl(googleNewsUrl: string, rawItem: any): Promise<string> {
  // Strategy 1: guid sometimes contains the real URL directly
  if (rawItem.guid && rawItem.guid.startsWith('http') && !rawItem.guid.includes('news.google.com')) {
    return rawItem.guid;
  }

  // Strategy 2: source url attribute (present in some GNews feeds)
  if (rawItem.source?.url && !rawItem.source.url.includes('news.google.com')) {
    return rawItem.source.url;
  }

  // Strategy 3: Fetch the Google News page and extract canonical/redirect URL
  try {
    const response = await axios.get(googleNewsUrl, {
      timeout: 8000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      validateStatus: () => true, // don't throw on any status
    });

    const html: string = response.data || '';

    // Look for canonical link tag
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    if (canonicalMatch && !canonicalMatch[1].includes('news.google.com')) {
      logger.info(`Resolved via canonical: ${canonicalMatch[1]}`);
      return canonicalMatch[1];
    }

    // Look for meta refresh redirect
    const metaRefreshMatch = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i);
    if (metaRefreshMatch) {
      const redirectUrl = metaRefreshMatch[1].trim();
      if (!redirectUrl.includes('news.google.com')) {
        logger.info(`Resolved via meta-refresh: ${redirectUrl}`);
        return redirectUrl;
      }
    }

    // Look for window.location or data-n-au attribute (Google News specific)
    const dataAttrMatch = html.match(/data-n-au="([^"]+)"/);
    if (dataAttrMatch) {
      logger.info(`Resolved via data-n-au: ${dataAttrMatch[1]}`);
      return dataAttrMatch[1];
    }

    // Check if axios followed redirects to a non-Google URL
    const finalUrl: string = response.request?.res?.responseUrl || '';
    if (finalUrl && !finalUrl.includes('news.google.com')) {
      logger.info(`Resolved via redirect chain: ${finalUrl}`);
      return finalUrl;
    }
  } catch (err: any) {
    logger.warn(`Could not resolve Google News URL ${googleNewsUrl}: ${err.message}`);
  }

  // Strategy 4: return original — scraper will fail, pipeline will skip via MIN_CONTEXT_WORDS
  return googleNewsUrl;
}

function isGoogleNewsUrl(url: string): boolean {
  return url.includes('news.google.com');
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

      // Resolve the real article URL if this is a Google News redirect link
      let articleUrl = item.link;
      if (isGoogleNewsUrl(item.link)) {
        articleUrl = await resolveGoogleNewsUrl(item.link, item);
        if (articleUrl !== item.link) {
          logger.info(`Resolved Google News URL: ${item.title.substring(0, 50)} -> ${articleUrl}`);
        }
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