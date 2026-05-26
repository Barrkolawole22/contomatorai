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

export type PipelineCountry = 'NG' | 'US' | 'GB' | 'AU' | 'CA' | 'ZA' | 'IN' | 'Global';

// ─── In-memory feed cache (30 min TTL) ────────────────────────────────────────
interface CacheEntry { items: any[]; fetchedAt: number; }
const FEED_CACHE = new Map<string, CacheEntry>();
const FEED_CACHE_TTL_MS = 30 * 60 * 1000;
function getCachedFeed(url: string): any[] | null {
  const entry = FEED_CACHE.get(url);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > FEED_CACHE_TTL_MS) { FEED_CACHE.delete(url); return null; }
  return entry.items;
}
function setCachedFeed(url: string, items: any[]): void {
  FEED_CACHE.set(url, { items, fetchedAt: Date.now() });
}

// ─── Country config ───────────────────────────────────────────────────────────
// Each country has:
//   geo: Google News gl/ceid params
//   registry: country-specific outlet feeds (topic-specific only — no general feeds)
//   fallback: broader feeds used only when registry is thin
const COUNTRY_CONFIG: Record<PipelineCountry, {
  gl: string;
  ceid: string;
  registry: string[];
  fallback: string[];
}> = {
  NG: {
    gl: 'NG', ceid: 'NG:en',
    registry: [
      'https://www.premiumtimesng.com/feed',
      'https://punchng.com/feed/',
      'https://guardian.ng/feed/',
      'https://thenationonlineng.net/feed/',
      'https://www.vanguardngr.com/feed/',
      'https://dailypost.ng/feed/',
      'https://businessday.ng/feed/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
      'https://www.aljazeera.com/xml/rss/all.xml',
    ],
  },
  US: {
    gl: 'US', ceid: 'US:en',
    registry: [
      'https://feeds.npr.org/1001/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
      'https://feeds.washingtonpost.com/rss/national',
      'https://feeds.reuters.com/reuters/topNews',
      'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
    ],
    fallback: [
      'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    ],
  },
  GB: {
    gl: 'GB', ceid: 'GB:en',
    registry: [
      'https://feeds.bbci.co.uk/news/uk/rss.xml',
      'https://www.theguardian.com/uk/rss',
      'https://feeds.skynews.com/feeds/rss/uk.xml',
      'https://www.telegraph.co.uk/rss.xml',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  AU: {
    gl: 'AU', ceid: 'AU:en',
    registry: [
      'https://www.abc.net.au/news/feed/51120/rss.xml',
      'https://feeds.smh.com.au/rssheadlines/breaking.xml',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  CA: {
    gl: 'CA', ceid: 'CA:en',
    registry: [
      'https://rss.cbc.ca/lineup/topstories.xml',
      'https://globalnews.ca/feed/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  ZA: {
    gl: 'ZA', ceid: 'ZA:en',
    registry: [
      'https://www.dailymaverick.co.za/feed/',
      'https://ewn.co.za/RSS%20Feeds/Latest%20News',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
    ],
  },
  IN: {
    gl: 'IN', ceid: 'IN:en',
    registry: [
      'https://feeds.feedburner.com/ndtvnews-top-stories',
      'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
    ],
  },
  Global: {
    gl: 'US', ceid: 'US:en',
    registry: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.aljazeera.com/xml/rss/all.xml',
      'https://rss.dw.com/rdf/rss-en-all',
      'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
      'https://feeds.reuters.com/reuters/topNews',
    ],
    fallback: [],
  },
};

// ─── Topic registry — category-specific feeds only ────────────────────────────
// Used as a supplement when country registry alone doesn't hit the target.
const TOPIC_REGISTRY: Record<string, string[]> = {
  education: [
    'https://feeds.bbci.co.uk/news/education/rss.xml',
    'https://www.theguardian.com/education/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml',
    'https://www.insidehighered.com/rss.xml',
  ],
  law: [
    'https://www.theguardian.com/law/rss',
    'https://www.lawfaremedia.org/rss.xml',
    'https://abovethelaw.com/feed/',
  ],
  politics: [
    'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
    'https://www.theguardian.com/politics/rss',
  ],
  finance: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    'https://www.theguardian.com/business/rss',
    'https://www.ft.com/?format=rss',
  ],
  technology: [
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
  ],
  health: [
    'https://feeds.bbci.co.uk/news/health/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
    'https://www.theguardian.com/society/rss',
  ],
  business: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
  ],
  sports: [
    'https://feeds.bbci.co.uk/sport/rss.xml',
    'https://www.theguardian.com/sport/rss',
    'https://www.espn.com/espn/rss/news',
  ],
  entertainment: [
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    'https://variety.com/feed/',
  ],
};

// ─── Google News topic section feeds ─────────────────────────────────────────
const GOOGLE_TOPIC_FEEDS: Record<string, string> = {
  education:     'https://news.google.com/rss/headlines/section/topic/EDUCATION?hl=en&gl=US&ceid=US:en',
  politics:      'https://news.google.com/rss/headlines/section/topic/NATION?hl=en&gl=US&ceid=US:en',
  finance:       'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en&gl=US&ceid=US:en',
  technology:    'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en&gl=US&ceid=US:en',
  health:        'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en&gl=US&ceid=US:en',
  business:      'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en&gl=US&ceid=US:en',
  sports:        'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en&gl=US&ceid=US:en',
  entertainment: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en&gl=US&ceid=US:en',
};

// ─── Topic detection from relevance topics + niches ───────────────────────────
const TOPIC_ALIASES: Record<string, string> = {
  'education': 'education', 'school': 'education', 'academic': 'education',
  'learning': 'education', 'exam': 'education', 'university': 'education',
  'law': 'law', 'legal': 'law', 'court': 'law', 'crime': 'law', 'justice': 'law',
  'politics': 'politics', 'political': 'politics', 'government': 'politics', 'election': 'politics',
  'finance': 'finance', 'financial': 'finance', 'money': 'finance', 'economy': 'finance',
  'investment': 'finance', 'crypto': 'finance', 'banking': 'finance', 'forex': 'finance',
  'technology': 'technology', 'tech': 'technology', 'software': 'technology', 'ai': 'technology',
  'health': 'health', 'medical': 'health', 'wellness': 'health', 'fitness': 'health', 'medicine': 'health',
  'business': 'business', 'commerce': 'business', 'entrepreneurship': 'business', 'marketing': 'business',
  'sports': 'sports', 'sport': 'sports', 'football': 'sports', 'basketball': 'sports',
  'entertainment': 'entertainment', 'music': 'entertainment', 'movies': 'entertainment', 'film': 'entertainment',
};

function detectTopic(relevanceTopics: string[], niches: string[]): string {
  const combined = [...relevanceTopics, ...niches].join(' ').toLowerCase();
  for (const [alias, topic] of Object.entries(TOPIC_ALIASES)) {
    if (combined.includes(alias)) return topic;
  }
  return 'general';
}

// ─── URL builders ─────────────────────────────────────────────────────────────
function buildGoogleNewsUrl(query: string, gl: string, ceid: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=${gl}&ceid=${ceid}`;
}

function buildCombinedQuery(niche: string, relevanceTopics: string[]): string {
  if (relevanceTopics.length === 0) return niche;
  return `${niche} ${relevanceTopics[0]}`.trim();
}

// ─── Google News base64 URL decoder ──────────────────────────────────────────
function decodeGoogleNewsBase64Url(encodedUrl: string): string | null {
  try {
    const match = encodedUrl.match(/\/articles\/(CBMi[A-Za-z0-9+/=_-]+)/);
    if (!match) return null;
    const decoded = Buffer.from(
      match[1].replace('CBMi', '').replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');
    const urlMatch = decoded.match(/https?:\/\/[^\s\x00-\x1f"<>]+/);
    if (urlMatch && !urlMatch[0].includes('news.google.com')) return urlMatch[0];
  } catch { /* fall through */ }
  return null;
}

async function resolveGoogleNewsUrl(googleUrl: string, rawItem: any): Promise<string> {
  const decoded = decodeGoogleNewsBase64Url(googleUrl);
  if (decoded) return decoded;
  if (rawItem.guid?.startsWith('http') && !rawItem.guid.includes('news.google.com')) return rawItem.guid;
  if (rawItem.source?.url && !rawItem.source.url.includes('news.google.com')) return rawItem.source.url;
  try {
    const response = await axios.get(googleUrl, {
      timeout: 8000, maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      validateStatus: () => true,
    });
    const html: string = response.data || '';
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    if (canonical && !canonical[1].includes('news.google.com')) return canonical[1];
    const dataAttr = html.match(/data-n-au="([^"]+)"/);
    if (dataAttr) return dataAttr[1];
    const finalUrl: string = response.request?.res?.responseUrl || '';
    if (finalUrl && !finalUrl.includes('news.google.com')) return finalUrl;
  } catch (err: any) {
    logger.warn(`RSS: could not resolve Google News URL: ${err.message}`);
  }
  return googleUrl;
}

function isGoogleNewsUrl(url: string): boolean { return url.includes('news.google.com'); }
function isWithinWindow(pubDate: string, hours = 24): boolean {
  if (!pubDate) return true;
  return new Date(pubDate).getTime() >= Date.now() - hours * 60 * 60 * 1000;
}

const parser = new Parser({ timeout: 10000 });

export class RSSService {

  private async _fetchRaw(url: string): Promise<any[]> {
    const cached = getCachedFeed(url);
    if (cached) { logger.info(`RSS: cache hit (${url})`); return cached; }
    try {
      const feed = await parser.parseURL(url);
      const items = feed.items || [];
      setCachedFeed(url, items);
      logger.info(`RSS: fetched ${items.length} item(s) from ${url}`);
      return items;
    } catch (err: any) {
      logger.warn(`RSS: feed failed (${url}): ${err.message}`);
      return [];
    }
  }

  private async _shape(raw: any, source: string): Promise<RSSItem | null> {
    if (!raw.title || !raw.link) return null;
    let link = raw.link;
    if (isGoogleNewsUrl(link)) link = await resolveGoogleNewsUrl(link, raw);
    return {
      title: raw.title,
      link,
      description: raw.contentSnippet || raw.summary || '',
      pubDate: raw.pubDate || '',
      source,
    };
  }

  // Step 1: country registry feeds — all specific to the configured country ──
  private async _fetchCountryRegistry(
    country: PipelineCountry,
    windowHours: number,
    limit: number
  ): Promise<RSSItem[]> {
    const cfg = COUNTRY_CONFIG[country] || COUNTRY_CONFIG.Global;
    const feeds = [...cfg.registry, ...cfg.fallback];
    logger.info(`RSS: step 1 — ${feeds.length} country feeds for "${country}"`);

    const results = await Promise.allSettled(
      feeds.map(url => this._fetchRaw(url).then(items => ({ url, items })))
    );

    const seen = new Set<string>();
    const pool: RSSItem[] = [];

    for (const result of results) {
      if (result.status === 'rejected') continue;
      const { url, items } = result.value;
      const hostname = new URL(url).hostname;
      for (const raw of items) {
        if (!isWithinWindow(raw.pubDate || '', windowHours)) continue;
        const key = (raw.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);
        const shaped = await this._shape(raw, hostname);
        if (shaped) pool.push(shaped);
        if (pool.length >= limit) break;
      }
      if (pool.length >= limit) break;
    }

    logger.info(`RSS: step 1 country registry → ${pool.length} items`);
    return pool;
  }

  // Step 2: topic feed + keyword searches scoped to the configured country ───
  private async _fetchSupplement(
    country: PipelineCountry,
    topic: string,
    niches: string[],
    relevanceTopics: string[],
    windowHours: number,
    limit: number,
    existingKeys: Set<string>
  ): Promise<RSSItem[]> {
    const cfg = COUNTRY_CONFIG[country] || COUNTRY_CONFIG.Global;
    const pool: RSSItem[] = [];
    const seen = new Set(existingKeys);

    const addItem = async (raw: any, source: string): Promise<boolean> => {
      if (!raw.title || !raw.link) return false;
      if (!isWithinWindow(raw.pubDate || '', windowHours)) return false;
      const key = (raw.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      const shaped = await this._shape(raw, source);
      if (shaped) { pool.push(shaped); return true; }
      return false;
    };

    // 2a. Topic-specific registry feeds (if topic is known)
    const topicFeeds = TOPIC_REGISTRY[topic] || [];
    if (topicFeeds.length > 0) {
      logger.info(`RSS: step 2a — topic feeds for "${topic}"`);
      const results = await Promise.allSettled(topicFeeds.map(url => this._fetchRaw(url).then(items => ({ url, items }))));
      for (const result of results) {
        if (result.status === 'rejected') continue;
        for (const raw of result.value.items) {
          await addItem(raw, new URL(result.value.url).hostname);
          if (pool.length >= limit) return pool;
        }
      }
    }

    // 2b. Google News topic section feed
    const topicFeedUrl = GOOGLE_TOPIC_FEEDS[topic];
    if (topicFeedUrl && pool.length < limit) {
      logger.info(`RSS: step 2b — Google News topic feed "${topic}"`);
      const items = await this._fetchRaw(topicFeedUrl);
      for (const raw of items) {
        await addItem(raw, 'Google News');
        if (pool.length >= limit) return pool;
      }
    }

    // 2c. Combined keyword search scoped to country's geo
    if (pool.length < limit) {
      logger.info(`RSS: step 2c — keyword searches for niches (gl=${cfg.gl})`);
      const queries = niches.map(niche => buildCombinedQuery(niche, relevanceTopics));
      const results = await Promise.allSettled(
        queries.map(q => this._fetchRaw(buildGoogleNewsUrl(q, cfg.gl, cfg.ceid)).then(items => ({ q, items })))
      );
      for (const result of results) {
        if (result.status === 'rejected') continue;
        logger.info(`RSS: step 2c query "${result.value.q}" → ${result.value.items.length} raw items`);
        for (const raw of result.value.items) {
          await addItem(raw, 'Google News');
          if (pool.length >= limit) return pool;
        }
      }
    }

    return pool;
  }

  // ── Main public method ─────────────────────────────────────────────────────
  async fetchItemsForNiches(
    niches: string[],
    totalLimit = 10,
    windowHours = 24,
    relevanceTopics: string[] = [],
    country: PipelineCountry = 'Global',
  ): Promise<RSSItem[]> {
    if (!niches || niches.length === 0) return [];

    const topic = detectTopic(relevanceTopics, niches);
    logger.info(`RSS: country="${country}", topic="${topic}", niches=[${niches.join(', ')}]`);

    // Step 1: country registry
    const registry = await this._fetchCountryRegistry(country, windowHours, totalLimit);
    if (registry.length >= totalLimit) {
      return registry
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
        .slice(0, totalLimit);
    }

    // Step 2: supplement
    const remaining = totalLimit - registry.length;
    const existingKeys = new Set(
      registry.map(i => i.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60))
    );
    logger.info(`RSS: step 1 gave ${registry.length}/${totalLimit} — running step 2`);

    const supplement = await this._fetchSupplement(
      country, topic, niches, relevanceTopics, windowHours, remaining, existingKeys
    );

    const combined = [...registry, ...supplement];

    // Step 3: widen window to 72h if still empty
    if (combined.length === 0 && windowHours <= 24) {
      logger.warn(`RSS: nothing in ${windowHours}h window — retrying with 72h`);
      return this.fetchItemsForNiches(niches, totalLimit, 72, relevanceTopics, country);
    }

    return combined
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, totalLimit);
  }

  getReutersFeedUrl(): string {
    return 'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en&gl=US';
  }
}

export default new RSSService();