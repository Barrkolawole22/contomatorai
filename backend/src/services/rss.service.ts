// backend/src/services/rss.service.ts
import Parser from 'rss-parser';
import axios from 'axios';
import logger from '../config/logger';
import {
  COUNTRY_CONFIG,
  COUNTRY_TOPIC_REGISTRY,
  TOPIC_REGISTRY,
  GOOGLE_TOPIC_FEEDS,
  TOPIC_ALIASES,
  type PipelineCountry,
} from '../config/feed-registry';

export type { PipelineCountry } from '../config/feed-registry';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectTopic(relevanceTopics: string[], niches: string[]): string {
  const combined = [...relevanceTopics, ...niches].join(' ').toLowerCase();
  for (const [alias, topic] of Object.entries(TOPIC_ALIASES)) {
    if (combined.includes(alias)) return topic;
  }
  return 'general';
}

function buildGoogleNewsUrl(query: string, gl: string, ceid: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=${gl}&ceid=${ceid}`;
}

function buildCombinedQuery(niche: string, relevanceTopics: string[]): string {
  if (relevanceTopics.length === 0) return niche;
  return `${niche} ${relevanceTopics[0]}`.trim();
}

function isGoogleNewsUrl(url: string): boolean { return url.includes('news.google.com'); }

function isWithinWindow(pubDate: string, hours = 24): boolean {
  if (!pubDate) return true;
  return new Date(pubDate).getTime() >= Date.now() - hours * 60 * 60 * 1000;
}

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

// ─── Service ──────────────────────────────────────────────────────────────────
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

  private toKey(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
  }

  // Step 1: broad country registry — only used when no specific topic is detected
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
        const key = this.toKey(raw.title || '');
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

  // Step 2a: country-specific topic feeds only
  private async _fetchCountryTopicFeeds(
    country: PipelineCountry,
    topic: string,
    windowHours: number,
    limit: number,
    existingKeys: Set<string> = new Set()
  ): Promise<RSSItem[]> {
    const feeds = COUNTRY_TOPIC_REGISTRY[country]?.[topic] || [];
    if (!feeds.length) return [];

    logger.info(`RSS: step 2a country-topic "${country}/${topic}" — ${feeds.length} feeds (${windowHours}h window)`);

    const pool: RSSItem[] = [];
    const seen = new Set(existingKeys);

    const results = await Promise.allSettled(
      feeds.map(url => this._fetchRaw(url).then(items => ({ url, items })))
    );

    for (const result of results) {
      if (result.status === 'rejected') continue;
      const { url, items } = result.value;
      const hostname = new URL(url).hostname;
      for (const raw of items) {
        if (!isWithinWindow(raw.pubDate || '', windowHours)) continue;
        const key = this.toKey(raw.title || '');
        if (seen.has(key)) continue;
        seen.add(key);
        const shaped = await this._shape(raw, hostname);
        if (shaped) pool.push(shaped);
        if (pool.length >= limit) break;
      }
      if (pool.length >= limit) break;
    }

    logger.info(`RSS: step 2a → ${pool.length} items`);
    return pool;
  }

  // Steps 2b–2d: international topic feeds, Google News section, keyword search
  private async _fetchInternationalSupplement(
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
      const key = this.toKey(raw.title || '');
      if (seen.has(key)) return false;
      seen.add(key);
      const shaped = await this._shape(raw, source);
      if (shaped) { pool.push(shaped); return true; }
      return false;
    };

    const fetchFeeds = async (urls: string[], label: string) => {
      if (!urls.length || pool.length >= limit) return;
      logger.info(`RSS: ${label} — ${urls.length} feeds`);
      const results = await Promise.allSettled(
        urls.map(url => this._fetchRaw(url).then(items => ({ url, items })))
      );
      for (const result of results) {
        if (result.status === 'rejected') continue;
        for (const raw of result.value.items) {
          await addItem(raw, new URL(result.value.url).hostname);
          if (pool.length >= limit) return;
        }
      }
    };

    // 2b. Generic international topic feeds
    const countryTopicFeeds = COUNTRY_TOPIC_REGISTRY[country]?.[topic] || [];
    const genericFeeds = (TOPIC_REGISTRY[topic] || []).filter(u => !countryTopicFeeds.includes(u));
    await fetchFeeds(genericFeeds, `step 2b generic topic "${topic}"`);

    // 2c. Google News topic section feed
    const topicFeedUrl = GOOGLE_TOPIC_FEEDS[topic];
    if (topicFeedUrl && pool.length < limit) {
      logger.info(`RSS: step 2c — Google News section feed "${topic}"`);
      const items = await this._fetchRaw(topicFeedUrl);
      for (const raw of items) {
        await addItem(raw, 'Google News');
        if (pool.length >= limit) break;
      }
    }

    // 2d. Keyword search scoped to country geo
    if (pool.length < limit) {
      logger.info(`RSS: step 2d — keyword searches (gl=${cfg.gl})`);
      const queries = niches.map(n => buildCombinedQuery(n, relevanceTopics));
      const results = await Promise.allSettled(
        queries.map(q => this._fetchRaw(buildGoogleNewsUrl(q, cfg.gl, cfg.ceid)).then(items => ({ q, items })))
      );
      for (const result of results) {
        if (result.status === 'rejected') continue;
        logger.info(`RSS: step 2d query "${result.value.q}" → ${result.value.items.length} raw`);
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
    if (!niches?.length) return [];

    const topic = detectTopic(relevanceTopics, niches);
    logger.info(`RSS: country="${country}", topic="${topic}", niches=[${niches.join(', ')}]`);

    // ── Topic-aware path ─────────────────────────────────────────────────────
    if (topic !== 'general') {
      logger.info(`RSS: topic "${topic}" detected — skipping step 1`);

      const hasCountryFeeds = !!(COUNTRY_TOPIC_REGISTRY[country]?.[topic]?.length);

      // Step 2a: country-specific topic feeds (primary source)
      let primary = hasCountryFeeds
        ? await this._fetchCountryTopicFeeds(country, topic, windowHours, totalLimit)
        : [];

      // If country feeds exist but returned nothing in 24h, widen to 72h before
      // falling back to international sources the AI gate will likely reject anyway.
      if (hasCountryFeeds && primary.length === 0 && windowHours <= 24) {
        logger.warn(`RSS: step 2a empty within ${windowHours}h — retrying with 72h`);
        primary = await this._fetchCountryTopicFeeds(country, topic, 72, totalLimit);
      }

      if (primary.length >= totalLimit) {
        return primary
          .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
          .slice(0, totalLimit);
      }

      // Steps 2b–2d: international supplement for remaining slots
      const existingKeys = new Set(primary.map(i => this.toKey(i.title)));
      const international = await this._fetchInternationalSupplement(
        country, topic, niches, relevanceTopics,
        windowHours, totalLimit - primary.length, existingKeys
      );

      const combined = [...primary, ...international];

      if (combined.length === 0) {
        logger.warn(`RSS: nothing found across all sources — aborting`);
        return [];
      }

      return combined
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
        .slice(0, totalLimit);
    }

    // ── No topic signal: broad country registry ──────────────────────────────
    const registry = await this._fetchCountryRegistry(country, windowHours, totalLimit);
    if (registry.length >= totalLimit) {
      return registry
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
        .slice(0, totalLimit);
    }

    const existingKeys = new Set(registry.map(i => this.toKey(i.title)));
    logger.info(`RSS: step 1 gave ${registry.length}/${totalLimit} — running step 2`);

    const international = await this._fetchInternationalSupplement(
      country, topic, niches, relevanceTopics,
      windowHours, totalLimit - registry.length, existingKeys
    );

    const combined = [...registry, ...international];

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