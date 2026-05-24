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

// ─── Category feeds (legacy support) ────────────────────────────────────────
const CATEGORY_FEEDS: Record<string, string> = {
  business:   'https://feeds.reuters.com/reuters/businessNews',
  technology: 'https://feeds.reuters.com/reuters/technologyNews',
  health:     'https://feeds.reuters.com/reuters/healthNews',
  science:    'https://feeds.reuters.com/reuters/scienceNews',
  sports:     'https://feeds.reuters.com/reuters/sportsNews',
  general:    'https://news.google.com/rss?hl=en&gl=US&ceid=US:en',
};

// ─── Regional outlet RSS feeds ───────────────────────────────────────────────
const NIGERIA_FEEDS: string[] = [
  'https://www.premiumtimesng.com/feed',
  'https://punchng.com/feed/',
  'https://guardian.ng/feed/',
  'https://thenationonlineng.net/feed/',
  'https://www.vanguardngr.com/feed/',
  'https://dailypost.ng/feed/',
];

const UK_FEEDS: string[] = [
  'https://feeds.bbci.co.uk/news/uk/rss.xml',
  'https://www.theguardian.com/uk/rss',
  'https://feeds.skynews.com/feeds/rss/uk.xml',
  'https://www.telegraph.co.uk/rss.xml',
];

const US_FEEDS: string[] = [
  'https://feeds.npr.org/1001/rss.xml',
  'https://feeds.reuters.com/reuters/topNews',
  'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
  'https://feeds.washingtonpost.com/rss/national',
];

const GLOBAL_FEEDS: string[] = [
  'https://feeds.reuters.com/reuters/topNews',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://rss.dw.com/rdf/rss-en-all',
];

// ─── Region detection ────────────────────────────────────────────────────────
type Region = 'nigeria' | 'uk' | 'us' | 'global';

const REGION_SIGNALS: Record<Region, string[]> = {
  nigeria: ['nigeria', 'nigerian', 'lagos', 'abuja', 'efcc', 'efcc arrest', 'naira', 'nba', 'inec'],
  uk:      ['uk', 'united kingdom', 'britain', 'british', 'metropolitan police', 'met police', 'england', 'wales', 'scotland'],
  us:      ['us ', 'u.s.', 'united states', 'american', 'fbi', 'federal', 'washington', 'supreme court ruling', 'doj'],
  global:  [],
};

function detectRegion(keyword: string): Region {
  const kw = keyword.toLowerCase();
  for (const region of ['nigeria', 'uk', 'us'] as Region[]) {
    if (REGION_SIGNALS[region].some(sig => kw.includes(sig))) return region;
  }
  return 'global';
}

function getRegionFeeds(region: Region): string[] {
  switch (region) {
    case 'nigeria': return NIGERIA_FEEDS;
    case 'uk':      return UK_FEEDS;
    case 'us':      return US_FEEDS;
    default:        return GLOBAL_FEEDS;
  }
}

// ─── Google News URL builder (region-aware) ───────────────────────────────────
function buildGoogleNewsUrl(keyword: string, region: Region): string {
  const geoMap: Record<Region, { hl: string; gl: string; ceid: string }> = {
    nigeria: { hl: 'en', gl: 'NG', ceid: 'NG:en' },
    uk:      { hl: 'en', gl: 'GB', ceid: 'GB:en' },
    us:      { hl: 'en', gl: 'US', ceid: 'US:en' },
    global:  { hl: 'en', gl: 'US', ceid: 'US:en' },
  };
  const { hl, gl, ceid } = geoMap[region];
  return `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

// ─── Time filter — default 24 hours, configurable ───────────────────────────
function isWithinWindow(pubDate: string, hours = 24): boolean {
  if (!pubDate) return true;
  const published = new Date(pubDate).getTime();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return published >= cutoff;
}

// ─── Google News URL resolver ─────────────────────────────────────────────────
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
    if (canonicalMatch && !canonicalMatch[1].includes('news.google.com')) return canonicalMatch[1];
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

const parser = new Parser({ timeout: 10000 });

export class RSSService {

  /**
   * Fetch items for a single keyword/niche.
   * Strategy: try regional outlet feeds first, fall back to Google News with correct geo.
   */
  async fetchItems(keyword: string, limit = 5, windowHours = 24): Promise<RSSItem[]> {
    const isCategory = Object.keys(CATEGORY_FEEDS).includes(keyword.toLowerCase());
    if (isCategory) {
      return this._parseFeed(CATEGORY_FEEDS[keyword.toLowerCase()], limit, windowHours);
    }

    const region = detectRegion(keyword);
    const regionalFeeds = getRegionFeeds(region);

    // Try each regional outlet feed, return first that yields results
    for (const feedUrl of regionalFeeds) {
      try {
        const items = await this._parseFeedFiltered(feedUrl, keyword, limit, windowHours);
        if (items.length > 0) {
          logger.info(`RSS: regional feed hit for "${keyword}" (${region}) from ${feedUrl}`);
          return items;
        }
      } catch (err: any) {
        logger.warn(`RSS: regional feed failed (${feedUrl}): ${err.message}`);
      }
    }

    // Fall back to Google News with correct geo-targeting
    logger.warn(`RSS: no regional results for "${keyword}" -- falling back to Google News (${region})`);
    const gnUrl = buildGoogleNewsUrl(keyword, region);
    try {
      const items = await this._parseFeed(gnUrl, limit, windowHours);
      if (items.length > 0) return items;
    } catch (err: any) {
      logger.error(`RSS: Google News fallback failed for "${keyword}": ${err.message}`);
    }

    // Last resort: widen time window to 72 hours
    logger.warn(`RSS: widening window to 72h for "${keyword}"`);
    try {
      return await this._parseFeed(gnUrl, limit, 72);
    } catch {
      return [];
    }
  }

  /**
   * Fetch items across multiple keywords, deduplicating by title.
   */
  async fetchItemsForNiches(niches: string[], totalLimit = 5, windowHours = 24): Promise<RSSItem[]> {
    if (!niches || niches.length === 0) return [];

    const perNiche = Math.max(1, Math.ceil(totalLimit / niches.length));
    const seen = new Set<string>();
    const allItems: RSSItem[] = [];

    for (const niche of niches) {
      try {
        const items = await this.fetchItems(niche.trim(), perNiche, windowHours);
        for (const item of items) {
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

    return allItems
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, totalLimit);
  }

  /**
   * Parse a feed and filter items by keyword relevance (for outlet feeds).
   */
  private async _parseFeedFiltered(
    url: string,
    keyword: string,
    limit: number,
    windowHours: number
  ): Promise<RSSItem[]> {
    const feed = await parser.parseURL(url);
    const kwWords = keyword.toLowerCase().split(/\s+/);
    const items: RSSItem[] = [];

    for (const item of feed.items || []) {
      if (!item.title || !item.link) continue;
      if (!isWithinWindow(item.pubDate || '', windowHours)) continue;

      const titleLower = item.title.toLowerCase();
      const descLower = (item.contentSnippet || item.summary || '').toLowerCase();
      const isRelevant = kwWords.some(w => titleLower.includes(w) || descLower.includes(w));
      if (!isRelevant) continue;

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

  /**
   * Parse a feed without keyword filtering (for Google News search URLs).
   */
  private async _parseFeed(url: string, limit: number, windowHours: number): Promise<RSSItem[]> {
    const feed = await parser.parseURL(url);
    const items: RSSItem[] = [];

    for (const item of feed.items || []) {
      if (!item.title || !item.link) continue;
      if (!isWithinWindow(item.pubDate || '', windowHours)) continue;

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