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

// ─── Nigerian-specific signal words ──────────────────────────────────────────
// These always use keyword search with gl=NG — they never appear in
// generic Google News topic feeds.
const NIGERIAN_SIGNALS = new Set([
  'nigeria', 'nigerian', 'lagos', 'abuja', 'kano', 'ibadan', 'portharcourt',
  'naira', 'ngn', 'cbn', 'efcc', 'icpc', 'inec', 'nnpc', 'nbc', 'ncc',
  'jamb', 'waec', 'neco', 'utme', 'ssce', 'wassce', 'noun', 'asuu',
  'unilag', 'unn', 'oau', 'abu', 'uniben', 'futa', 'futo', 'lasu', 'lautech',
  'tinubu', 'buhari', 'nollywood', 'afrobeats', 'super eagles', 'super falcons',
  'npfl', 'bvn', 'nin', 'pvc',
]);
function isNigerianKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase().replace(/\s+/g, '');
  return [...NIGERIAN_SIGNALS].some(sig => kw.includes(sig.replace(/\s+/g, '')));
}

// ─── Registry: category-specific feeds only ───────────────────────────────────
// RULE: every URL here must publish ONLY that topic's content.
// General-purpose feeds (DW all, Al Jazeera all, NPR all) are excluded from
// specific topic registries — they contaminate the pool with off-topic articles.
// They live only in the fallback list below.
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
    'https://foreignpolicy.com/feed/',
  ],
  finance: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    'https://www.theguardian.com/business/rss',
    'https://www.marketwatch.com/rss/topstories',
    'https://feeds.cnbc.com/rss/cnbc/top-news-feed',
    'https://www.ft.com/?format=rss',
  ],
  technology: [
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    'https://www.theguardian.com/technology/rss',
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://www.wired.com/feed/rss',
  ],
  health: [
    'https://feeds.bbci.co.uk/news/health/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
    'https://www.theguardian.com/society/rss',
    'https://www.statnews.com/feed/',
    'https://www.medicalnewstoday.com/rss',
  ],
  business: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    'https://www.theguardian.com/business/rss',
    'https://www.ft.com/?format=rss',
    'https://feeds.cnbc.com/rss/cnbc/top-news-feed',
  ],
  sports: [
    'https://feeds.bbci.co.uk/sport/rss.xml',
    'https://www.theguardian.com/sport/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
    'https://www.espn.com/espn/rss/news',
    'https://www.goal.com/feeds/en/news',
    'https://feeds.skynews.com/feeds/rss/sports.xml',
  ],
  entertainment: [
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    'https://www.theguardian.com/culture/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml',
    'https://variety.com/feed/',
    'https://deadline.com/feed/',
    'https://www.hollywoodreporter.com/feed/',
  ],
};

// Broad fallback feeds — used when no topic is matched or as last resort
const GENERAL_FEEDS = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://rss.dw.com/rdf/rss-en-all',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'https://feeds.npr.org/1001/rss.xml',
  'https://www.theguardian.com/world/rss',
];

// ─── Google News topic section feeds ─────────────────────────────────────────
// Pre-categorised by Google — reliable for broad topics.
const GOOGLE_TOPIC_FEEDS: Record<string, string> = {
  education:     'https://news.google.com/rss/headlines/section/topic/EDUCATION?hl=en&gl=US&ceid=US:en',
  politics:      'https://news.google.com/rss/headlines/section/topic/NATION?hl=en&gl=US&ceid=US:en',
  finance:       'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en&gl=US&ceid=US:en',
  technology:    'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en&gl=US&ceid=US:en',
  health:        'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en&gl=US&ceid=US:en',
  business:      'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en&gl=US&ceid=US:en',
  sports:        'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en&gl=US&ceid=US:en',
  entertainment: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en&gl=US&ceid=US:en',
  world:         'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en&gl=US&ceid=US:en',
};

// ─── Topic detection from relevanceTopics + niches ───────────────────────────
// Maps user's broad relevance topics (set on the pipeline form) to a known
// topic key. Falls back to 'general' if nothing matches.
const TOPIC_ALIASES: Record<string, string> = {
  // Education
  'education': 'education', 'school': 'education', 'academic': 'education',
  'learning': 'education', 'exam': 'education', 'university': 'education',
  // Law
  'law': 'law', 'legal': 'law', 'court': 'law', 'crime': 'law',
  'justice': 'law', 'legislation': 'law',
  // Politics
  'politics': 'politics', 'political': 'politics', 'government': 'politics',
  'election': 'politics', 'policy': 'politics',
  // Finance
  'finance': 'finance', 'financial': 'finance', 'money': 'finance',
  'economy': 'finance', 'investment': 'finance', 'crypto': 'finance',
  'banking': 'finance', 'trading': 'finance', 'forex': 'finance',
  // Technology
  'technology': 'technology', 'tech': 'technology', 'software': 'technology',
  'ai': 'technology', 'startup': 'technology', 'digital': 'technology',
  'cybersecurity': 'technology', 'programming': 'technology',
  // Health
  'health': 'health', 'medical': 'health', 'wellness': 'health',
  'fitness': 'health', 'nutrition': 'health', 'diet': 'health',
  'mental health': 'health', 'medicine': 'health',
  // Business
  'business': 'business', 'commerce': 'business', 'entrepreneurship': 'business',
  'marketing': 'business', 'ecommerce': 'business', 'retail': 'business',
  // Sports
  'sports': 'sports', 'sport': 'sports', 'football': 'sports',
  'basketball': 'sports', 'soccer': 'sports', 'athletics': 'sports',
  // Entertainment
  'entertainment': 'entertainment', 'music': 'entertainment', 'movies': 'entertainment',
  'film': 'entertainment', 'celebrity': 'entertainment', 'gaming': 'entertainment',
  'culture': 'entertainment', 'arts': 'entertainment',
};

function detectTopic(relevanceTopics: string[], niches: string[]): string {
  const combined = [...relevanceTopics, ...niches].join(' ').toLowerCase();
  for (const [alias, topic] of Object.entries(TOPIC_ALIASES)) {
    if (combined.includes(alias)) {
      logger.info(`RSS: detected topic "${topic}" from [${[...relevanceTopics, ...niches].join(', ')}]`);
      return topic;
    }
  }
  logger.info(`RSS: no topic match — using general feeds`);
  return 'general';
}

// ─── URL builders ─────────────────────────────────────────────────────────────
// Combined query: "niche relevanceTopic" — narrows Google News without hardcoding.
// e.g. niche="Books" + topic="Education" → "Books Education"
// e.g. niche="Recipes" + topic="Health" → "Recipes Health"
function buildCombinedQuery(niche: string, relevanceTopics: string[]): string {
  if (relevanceTopics.length === 0) return niche;
  // Use just the first relevance topic to keep query tight
  return `${niche} ${relevanceTopics[0]}`.trim();
}

function buildGoogleNewsUrl(query: string, geo: 'NG' | 'US' = 'US'): string {
  const ceid = geo === 'NG' ? 'NG:en' : 'US:en';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=${geo}&ceid=${ceid}`;
}

// ─── Google News URL decoder (post-2024 base64 format) ───────────────────────
function decodeGoogleNewsBase64Url(encodedUrl: string): string | null {
  try {
    const match = encodedUrl.match(/\/articles\/(CBMi[A-Za-z0-9+/=_-]+)/);
    if (!match) return null;
    const base64Part = match[1].replace('CBMi', '');
    const decoded = Buffer.from(
      base64Part.replace(/-/g, '+').replace(/_/g, '/'),
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
    const canonicalMatch =
      html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    if (canonicalMatch && !canonicalMatch[1].includes('news.google.com')) return canonicalMatch[1];
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

  // ── Step 1: Registry feeds in parallel ───────────────────────────────────────
  // Topic-specific feeds (BBC Education, Guardian Law, etc.) — all pre-filtered
  // by topic so no keyword matching needed here.
  private async _fetchRegistry(
    topic: string,
    windowHours: number,
    limit: number
  ): Promise<RSSItem[]> {
    const feeds = TOPIC_REGISTRY[topic] || GENERAL_FEEDS;
    logger.info(`RSS: step 1 — ${feeds.length} registry feeds for topic "${topic}"`);

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

    logger.info(`RSS: step 1 registry → ${pool.length} items`);
    return pool;
  }

  // ── Step 2: Google News supplement ───────────────────────────────────────────
  //
  // 2a. Google News topic section feed (EDUCATION, HEALTH, SPORTS etc.)
  //     Covers all generic niche words at once — pre-categorised by Google.
  //     "Books" on an education site → EDUCATION topic feed, not a keyword search.
  //
  // 2b. Non-Nigerian niches → combined query "niche + relevanceTopic"
  //     "Books" + "Education" → search "Books Education" on Google News.
  //     This contextualises the query so Google returns educational book news,
  //     not beach reads. Works for any niche without hardcoding.
  //
  // 2c. Nigerian niches → keyword search with gl=NG
  //     Jamb, Waec, Neco etc. never appear in generic topic feeds.
  private async _fetchSupplement(
    topic: string,
    niches: string[],
    relevanceTopics: string[],
    windowHours: number,
    limit: number,
    existingKeys: Set<string>
  ): Promise<RSSItem[]> {
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

    // 2a. Google News topic section feed
    const topicFeedUrl = GOOGLE_TOPIC_FEEDS[topic];
    if (topicFeedUrl) {
      logger.info(`RSS: step 2a — Google News topic feed "${topic}"`);
      const items = await this._fetchRaw(topicFeedUrl);
      for (const raw of items) {
        await addItem(raw, 'Google News');
        if (pool.length >= limit) return pool;
      }
    }

    // 2b. Non-Nigerian niches → combined query "niche + relevanceTopic" on Google News US
    const genericNiches = niches.filter(n => !isNigerianKeyword(n));
    if (genericNiches.length > 0 && pool.length < limit) {
      logger.info(`RSS: step 2b — combined queries for generic niches: [${genericNiches.join(', ')}]`);
      const queries = genericNiches.map(niche => ({
        niche,
        query: buildCombinedQuery(niche, relevanceTopics),
      }));

      const results = await Promise.allSettled(
        queries.map(({ query }) =>
          this._fetchRaw(buildGoogleNewsUrl(query, 'US')).then(items => ({ query, items }))
        )
      );

      for (const result of results) {
        if (result.status === 'rejected') continue;
        const { query, items } = result.value;
        logger.info(`RSS: step 2b query "${query}" → ${items.length} raw items`);
        for (const raw of items) {
          await addItem(raw, 'Google News');
          if (pool.length >= limit) return pool;
        }
      }
    }

    // 2c. Nigerian niches → keyword search gl=NG
    const nigerianNiches = niches.filter(n => isNigerianKeyword(n));
    if (nigerianNiches.length > 0 && pool.length < limit) {
      logger.info(`RSS: step 2c — Nigerian niches gl=NG: [${nigerianNiches.join(', ')}]`);
      const results = await Promise.allSettled(
        nigerianNiches.map(niche =>
          this._fetchRaw(buildGoogleNewsUrl(niche, 'NG')).then(items => ({ niche, items }))
        )
      );
      for (const result of results) {
        if (result.status === 'rejected') continue;
        for (const raw of result.value.items) {
          await addItem(raw, 'Google News Nigeria');
          if (pool.length >= limit) return pool;
        }
      }
    }

    return pool;
  }

  // ── Main public method ────────────────────────────────────────────────────────
  async fetchItemsForNiches(
    niches: string[],
    totalLimit = 10,
    windowHours = 24,
    relevanceTopics: string[] = [],
  ): Promise<RSSItem[]> {
    if (!niches || niches.length === 0) return [];

    const topic = detectTopic(relevanceTopics, niches);

    // Step 1: registry feeds
    const registry = await this._fetchRegistry(topic, windowHours, totalLimit);
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
      topic, niches, relevanceTopics, windowHours, remaining, existingKeys
    );

    const combined = [...registry, ...supplement];

    // Step 3: widen to 72h if still empty
    if (combined.length === 0 && windowHours <= 24) {
      logger.warn(`RSS: nothing in ${windowHours}h window — retrying with 72h`);
      return this.fetchItemsForNiches(niches, totalLimit, 72, relevanceTopics);
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