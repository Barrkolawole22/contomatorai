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

// ─── Types ────────────────────────────────────────────────────────────────────
type Topic =
  | 'education'
  | 'law'
  | 'politics'
  | 'finance'
  | 'technology'
  | 'health'
  | 'business'
  | 'sports'
  | 'entertainment'
  | 'general';

// ─── In-memory feed cache (30 min TTL) ────────────────────────────────────────
// Prevents the same feed being fetched twice when two pipelines run close together.
interface CacheEntry {
  items: any[];
  fetchedAt: number;
}
const FEED_CACHE = new Map<string, CacheEntry>();
const FEED_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachedFeed(url: string): any[] | null {
  const entry = FEED_CACHE.get(url);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > FEED_CACHE_TTL_MS) {
    FEED_CACHE.delete(url);
    return null;
  }
  return entry.items;
}

function setCachedFeed(url: string, items: any[]): void {
  FEED_CACHE.set(url, { items, fetchedAt: Date.now() });
}

// ─── Nigerian-specific signal words ──────────────────────────────────────────
// If any niche or relevanceTopic contains one of these, use Google News gl=NG
// as the primary source for those keywords.
const NIGERIAN_SIGNALS = new Set([
  'nigeria', 'nigerian', 'lagos', 'abuja', 'kano', 'ibadan', 'portharcourt',
  'naira', 'ngn', 'cbn', 'efcc', 'icpc', 'inec', 'nnpc', 'nbc', 'ncc',
  'jamb', 'waec', 'neco', 'utme', 'ssce', 'wassce', 'noun', 'asuu',
  'unilag', 'unn', 'oau', 'abu', 'uniben', 'futa', 'futo', 'lasu', 'lautech',
  'tinubu', 'buhari', 'nollywood', 'afrobeats', 'super eagles', 'super falcons', 'npfl',
  'bvn', 'nin', 'pvc',
]);

function isNigerianKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase().replace(/\s+/g, '');
  return [...NIGERIAN_SIGNALS].some(sig => kw.includes(sig.replace(/\s+/g, '')));
}

// ─── Topic signal words ───────────────────────────────────────────────────────
const TOPIC_SIGNALS: Record<Topic, string[]> = {
  education: [
    'education', 'school', 'university', 'polytechnic', 'college', 'student',
    'exam', 'examination', 'admission', 'scholarship', 'jamb', 'waec', 'neco',
    'utme', 'ssce', 'textbook', 'syllabus', 'curriculum', 'academic', 'degree',
    'faculty', 'lecture', 'learning', 'teaching', 'graduate', 'classroom',
  ],
  law: [
    'law', 'legal', 'court', 'judge', 'lawyer', 'attorney', 'tribunal', 'justice',
    'verdict', 'ruling', 'lawsuit', 'prosecution', 'defendant', 'plaintiff',
    'legislation', 'constitution', 'rights', 'efcc', 'icpc', 'bail', 'sentence',
    'supreme court', 'appeals court', 'magistrate', 'solicitor', 'barrister',
  ],
  politics: [
    'politics', 'political', 'election', 'president', 'governor', 'minister',
    'senate', 'parliament', 'house of reps', 'party', 'policy', 'democracy',
    'vote', 'campaign', 'government', 'inec', 'federal', 'state', 'assembly',
    'lawmaker', 'legislator', 'diplomat', 'foreign policy',
  ],
  finance: [
    'finance', 'financial', 'economy', 'economic', 'stock', 'forex', 'crypto',
    'bitcoin', 'inflation', 'budget', 'tax', 'investment', 'market', 'revenue',
    'gdp', 'interest rate', 'monetary', 'fiscal', 'naira', 'dollar', 'exchange',
    'banking', 'loan', 'debt', 'bond', 'equity', 'trading', 'cbn', 'imf',
  ],
  technology: [
    'technology', 'tech', 'software', 'startup', 'digital', 'ai',
    'artificial intelligence', 'cybersecurity', 'internet', 'mobile', 'app',
    'innovation', 'data', 'cloud', 'blockchain', 'fintech', 'programming',
    'developer', 'gadget', 'device', 'robot', 'automation', 'machine learning',
  ],
  health: [
    'health', 'medical', 'hospital', 'disease', 'doctor', 'medicine', 'vaccine',
    'patient', 'drug', 'pharmacy', 'malaria', 'hiv', 'covid', 'cancer', 'diabetes',
    'surgery', 'treatment', 'diagnosis', 'epidemic', 'pandemic', 'mental health',
    'nutrition', 'fitness', 'wellness', 'ncdc', 'who',
  ],
  business: [
    'business', 'company', 'trade', 'commerce', 'entrepreneur', 'sme',
    'manufacturing', 'oil', 'gas', 'export', 'import', 'supply chain',
    'logistics', 'retail', 'ecommerce', 'brand', 'marketing', 'sales',
    'revenue', 'profit', 'merger', 'acquisition', 'ipo', 'corporate',
  ],
  sports: [
    'sports', 'sport', 'football', 'soccer', 'basketball', 'athletics', 'match',
    'league', 'player', 'team', 'coach', 'championship', 'tournament', 'transfer',
    'goal', 'premier league', 'champions league', 'world cup', 'afcon', 'olympics',
    'nba', 'nfl', 'cricket', 'tennis',
  ],
  entertainment: [
    'entertainment', 'music', 'movie', 'film', 'celebrity', 'concert', 'award',
    'streaming', 'album', 'actor', 'actress', 'singer', 'producer', 'director',
    'nollywood', 'hollywood', 'afrobeats', 'grammy', 'oscars', 'netflix',
    'showbiz', 'fashion', 'lifestyle',
  ],
  general: [],
};

// ─── International feed registry ─────────────────────────────────────────────
// All feeds confirmed active in 2026 from production logs and research.
// Reuters direct feeds are DEAD since 2020 — replaced with Google News source filter.
// [QA] = open feeds but not server-confirmed; validate in production.
const FEED_REGISTRY: Record<Topic, string[]> = {
  education: [
    'https://feeds.bbci.co.uk/news/education/rss.xml',
    'https://www.theguardian.com/education/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.insidehighered.com/rss.xml',             // [QA]
    'https://www.timeshighereducation.com/rss.xml',        // [QA]
    'https://www.educationweek.org/rss/rss.xml',           // [QA]
  ],
  law: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.theguardian.com/law/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://www.lawfaremedia.org/rss.xml',                // [QA]
    'https://abovethelaw.com/feed/',                       // [QA]
    'https://feeds.bbci.co.uk/news/uk/rss.xml',
  ],
  politics: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://www.theguardian.com/politics/rss',
    'https://www.france24.com/en/rss',                     // [QA]
    'https://feeds.bbci.co.uk/news/uk/rss.xml',
    'https://foreignpolicy.com/feed/',                     // [QA]
  ],
  finance: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://feeds.npr.org/1001/rss.xml',
    'https://www.theguardian.com/business/rss',
    'https://www.marketwatch.com/rss/topstories',          // [QA]
    'https://feeds.cnbc.com/rss/cnbc/top-news-feed',       // [QA]
    'https://www.ft.com/?format=rss',                      // [QA]
  ],
  technology: [
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://www.theguardian.com/technology/rss',
    'https://techcrunch.com/feed/',                        // [QA]
    'https://www.theverge.com/rss/index.xml',              // [QA]
    'https://feeds.arstechnica.com/arstechnica/index',     // [QA]
    'https://www.wired.com/feed/rss',                      // [QA]
    'https://www.technologyreview.com/feed/',              // [QA]
  ],
  health: [
    'https://feeds.bbci.co.uk/news/health/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://www.theguardian.com/society/rss',
    'https://www.statnews.com/feed/',                      // [QA]
    'https://www.medicalnewstoday.com/rss',                // [QA]
    'https://www.sciencedaily.com/rss/health_medicine.xml',// [QA]
  ],
  business: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://feeds.npr.org/1001/rss.xml',
    'https://www.theguardian.com/business/rss',
    'https://www.ft.com/?format=rss',                      // [QA]
    'https://feeds.cnbc.com/rss/cnbc/top-news-feed',       // [QA]
  ],
  sports: [
    'https://feeds.bbci.co.uk/sport/rss.xml',
    'https://www.theguardian.com/sport/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://www.espn.com/espn/rss/news',                  // [QA]
    'https://www.goal.com/feeds/en/news',                  // [QA]
    'https://feeds.skynews.com/feeds/rss/sports.xml',      // [QA]
  ],
  entertainment: [
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    'https://www.theguardian.com/culture/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://variety.com/feed/',                           // [QA]
    'https://deadline.com/feed/',                          // [QA]
    'https://www.hollywoodreporter.com/feed/',             // [QA]
    'https://pitchfork.com/rss/news/feed/r.jf',           // [QA]
  ],
  general: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://www.theguardian.com/world/rss',
  ],
};

// ─── Topic detection ──────────────────────────────────────────────────────────
function detectTopic(niches: string[], relevanceTopics: string[]): Topic {
  const combined = [...niches, ...relevanceTopics].join(' ').toLowerCase();
  let bestTopic: Topic = 'general';
  let bestScore = 0;

  for (const [topic, signals] of Object.entries(TOPIC_SIGNALS) as [Topic, string[]][]) {
    if (topic === 'general') continue;
    const score = signals.filter(sig => combined.includes(sig)).length;
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  logger.info(`RSS: detected topic "${bestTopic}" (score: ${bestScore}) from niches [${niches.join(', ')}]`);
  return bestTopic;
}

// ─── Google News URL builders ─────────────────────────────────────────────────
// NOTE: feeds.reuters.com is DEAD since June 2020.
// Use source-restricted Google News query instead.
function buildGoogleNewsSearchUrl(keyword: string, geo: 'NG' | 'US' = 'US'): string {
  const ceid = geo === 'NG' ? 'NG:en' : 'US:en';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=en&gl=${geo}&ceid=${ceid}`;
}

// Source-restricted Reuters replacement (confirmed working workaround)
function buildReutersGoogleNewsUrl(): string {
  return 'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en&gl=US';
}

// ─── Google News link decoder ─────────────────────────────────────────────────
// Post-2024 Google News RSS items use base64-encoded URLs in the <link> tag.
// Format: https://news.google.com/rss/articles/CBMi<base64payload>
// The payload decodes to a protobuf-like binary where the URL is embedded as a string.
// Strategy: try base64 decode first, fall back to HTTP redirect resolution.
function decodeGoogleNewsBase64Url(encodedUrl: string): string | null {
  try {
    const match = encodedUrl.match(/\/articles\/(CBMi[A-Za-z0-9+/=_-]+)/);
    if (!match) return null;

    // The base64 portion after "CBMi" decodes to a binary blob.
    // The actual URL starts after a short protobuf header (typically 4-5 bytes).
    // "CBMi" is a fixed protobuf varint prefix — skip it and decode the rest.
    const base64Part = match[1].replace('CBMi', '');
    // Normalize URL-safe base64 to standard base64
    const normalized = base64Part.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf-8');

    // Extract the first http/https URL from the decoded string
    const urlMatch = decoded.match(/https?:\/\/[^\s\x00-\x1f"<>]+/);
    if (urlMatch && !urlMatch[0].includes('news.google.com')) {
      return urlMatch[0];
    }
  } catch {
    // Fall through to HTTP resolution
  }
  return null;
}

async function resolveGoogleNewsUrl(googleUrl: string, rawItem: any): Promise<string> {
  // 1. Try base64 decode (fast, no HTTP call)
  const base64Decoded = decodeGoogleNewsBase64Url(googleUrl);
  if (base64Decoded) return base64Decoded;

  // 2. Try guid / source fields (sometimes contains the real URL)
  if (rawItem.guid?.startsWith('http') && !rawItem.guid.includes('news.google.com')) {
    return rawItem.guid;
  }
  if (rawItem.source?.url && !rawItem.source.url.includes('news.google.com')) {
    return rawItem.source.url;
  }

  // 3. HTTP redirect resolution (slower, last resort)
  try {
    const response = await axios.get(googleUrl, {
      timeout: 8000,
      maxRedirects: 5,
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

    const dataAttrMatch = html.match(/data-n-au="([^"]+)"/);
    if (dataAttrMatch) return dataAttrMatch[1];

    const finalUrl: string = response.request?.res?.responseUrl || '';
    if (finalUrl && !finalUrl.includes('news.google.com')) return finalUrl;
  } catch (err: any) {
    logger.warn(`RSS: could not resolve Google News URL: ${err.message}`);
  }

  return googleUrl;
}

function isGoogleNewsUrl(url: string): boolean {
  return url.includes('news.google.com');
}

// ─── Time filter ──────────────────────────────────────────────────────────────
function isWithinWindow(pubDate: string, hours = 24): boolean {
  if (!pubDate) return true;
  return new Date(pubDate).getTime() >= Date.now() - hours * 60 * 60 * 1000;
}

const parser = new Parser({ timeout: 10000 });

export class RSSService {

  /**
   * Core method: fetch and cache raw feed items from a single URL.
   * Returns raw rss-parser items (not yet shaped into RSSItem).
   */
  private async _fetchRawFeed(url: string): Promise<any[]> {
    const cached = getCachedFeed(url);
    if (cached) {
      logger.info(`RSS: cache hit for ${url}`);
      return cached;
    }
    try {
      const feed = await parser.parseURL(url);
      const items = feed.items || [];
      setCachedFeed(url, items);
      logger.info(`RSS: fetched ${items.length} raw item(s) from ${url}`);
      return items;
    } catch (err: any) {
      logger.warn(`RSS: feed failed (${url}): ${err.message}`);
      return [];
    }
  }

  /**
   * Shape a raw rss-parser item into an RSSItem, resolving Google News URLs.
   */
  private async _shapeItem(raw: any, feedTitle: string): Promise<RSSItem | null> {
    if (!raw.title || !raw.link) return null;
    let link = raw.link;
    if (isGoogleNewsUrl(link)) {
      link = await resolveGoogleNewsUrl(link, raw);
    }
    return {
      title: raw.title,
      link,
      description: raw.contentSnippet || raw.summary || '',
      pubDate: raw.pubDate || '',
      source: feedTitle,
    };
  }

  /**
   * Fetch ALL registry feeds for the detected topic in parallel.
   * Returns a pool of items already filtered by keyword and time window.
   * Each feed is only fetched once per 30 minutes regardless of how many
   * niches share the same registry.
   */
  private async _fetchTopicPool(
    topic: Topic,
    niches: string[],
    windowHours: number,
    limit: number,
  ): Promise<RSSItem[]> {
    const feeds = FEED_REGISTRY[topic];
    const kwWords = niches.map(n => n.toLowerCase().split(/\s+/)).flat();

    logger.info(`RSS: fetching ${feeds.length} registry feeds in parallel for topic "${topic}"`);

    // Fetch all feeds simultaneously
    const feedResults = await Promise.allSettled(
      feeds.map(url => this._fetchRawFeed(url).then(items => ({ url, items })))
    );

    const seen = new Set<string>();
    const pool: RSSItem[] = [];

    for (const result of feedResults) {
      if (result.status === 'rejected') continue;
      const { url, items } = result.value;

      // Get feed title from parser cache or derive from URL
      const feedTitle = new URL(url).hostname;

      for (const raw of items) {
        if (!raw.title || !raw.link) continue;
        if (!isWithinWindow(raw.pubDate || '', windowHours)) continue;

        // Filter by keyword relevance
        const titleLower = (raw.title || '').toLowerCase();
        const descLower = (raw.contentSnippet || raw.summary || '').toLowerCase();
        const isRelevant = kwWords.some(w => w.length >= 3 && (titleLower.includes(w) || descLower.includes(w)));
        if (!isRelevant) continue;

        // Deduplicate by title
        const key = titleLower.replace(/[^a-z0-9]/g, '').substring(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);

        const shaped = await this._shapeItem(raw, feedTitle);
        if (shaped) pool.push(shaped);

        if (pool.length >= limit) break;
      }
      if (pool.length >= limit) break;
    }

    return pool;
  }

  /**
   * Main public method.
   * Detects topic from niches + relevanceTopics, fetches registry in parallel,
   * falls back to Google News (with correct geo for Nigerian keywords).
   */
  async fetchItemsForNiches(
    niches: string[],
    totalLimit = 10,
    windowHours = 24,
    relevanceTopics: string[] = [],
  ): Promise<RSSItem[]> {
    if (!niches || niches.length === 0) return [];

    const topic = detectTopic(niches, relevanceTopics);

    // ── Step 1: parallel registry fetch ──────────────────────────────────────
    const pool = await this._fetchTopicPool(topic, niches, windowHours, totalLimit);

    if (pool.length >= totalLimit) {
      logger.info(`RSS: registry pool satisfied (${pool.length} items) for topic "${topic}"`);
      return pool
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
        .slice(0, totalLimit);
    }

    logger.info(`RSS: registry pool only ${pool.length}/${totalLimit} — supplementing with Google News`);

    // ── Step 2: Google News supplement ───────────────────────────────────────
    // Nigerian-specific niches → gl=NG. Everything else → gl=US.
    // Fetch each niche in parallel, up to remaining slots.
    const remaining = totalLimit - pool.length;
    const seen = new Set(pool.map(i => i.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60)));

    const gnResults = await Promise.allSettled(
      niches.map(async niche => {
        const geo = isNigerianKeyword(niche) ? 'NG' : 'US';
        const url = buildGoogleNewsSearchUrl(niche, geo);
        const rawItems = await this._fetchRawFeed(url);
        const items: RSSItem[] = [];

        for (const raw of rawItems) {
          if (!raw.title || !raw.link) continue;
          if (!isWithinWindow(raw.pubDate || '', windowHours)) continue;

          const key = (raw.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
          if (seen.has(key)) continue;

          const shaped = await this._shapeItem(raw, 'Google News');
          if (shaped) {
            seen.add(key);
            items.push(shaped);
          }
        }
        return items;
      })
    );

    for (const result of gnResults) {
      if (result.status === 'rejected') continue;
      pool.push(...result.value);
      if (pool.length >= totalLimit) break;
    }

    // ── Step 3: widen time window if still not enough ─────────────────────────
    if (pool.length === 0 && windowHours <= 24) {
      logger.warn(`RSS: no items found in ${windowHours}h window — widening to 72h`);
      return this.fetchItemsForNiches(niches, totalLimit, 72, relevanceTopics);
    }

    return pool
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, totalLimit);
  }

  /**
   * Expose the Reuters Google News workaround URL for any service that needs it.
   * Direct feeds.reuters.com URLs are dead since June 2020.
   */
  getReutersFeedUrl(): string {
    return buildReutersGoogleNewsUrl();
  }
}

export default new RSSService();