// backend/src/services/scraper.service.ts
import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../config/logger';

export interface ScrapedContent {
  text: string;
  title: string;
  wordCount: number;
  images: ScrapedImage[];
}

export interface ScrapedImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

export class ScraperService {
  async extract(url: string): Promise<ScrapedContent> {
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }

    logger.info(`Scraping URL: ${url}`);

    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    const $ = cheerio.load(response.data);

    // Handle meta-refresh redirects (used by Google News)
    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh) {
      const match = metaRefresh.match(/url=(.+)/i);
      if (match) {
        logger.info(`Following meta-refresh to: ${match[1]}`);
        return this.extract(match[1]);
      }
    }

    // Extract images BEFORE removing elements
    const images = this.extractImages($, url);

    // Remove unwanted elements
    $('script, style, nav, footer, header, aside, .sidebar, .menu, .ad, .social, .comments').remove();

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';

    // Try to get main content area
    let mainContent = '';
    const articleSelectors = [
      'article',
      '[role="main"]',
      'main',
      '.post-content',
      '.article-body',
      '#content',
      '.entry-content',
      '.story-body',
    ];
    for (const sel of articleSelectors) {
      const el = $(sel);
      if (el.length) {
        mainContent = el.text();
        break;
      }
    }
    if (!mainContent) {
      mainContent = $('body').text();
    }

    let text = mainContent.replace(/\s+/g, ' ').trim();

    const words = text.split(/\s+/);
    const MAX_WORDS = 3000;
    if (words.length > MAX_WORDS) {
      text = words.slice(0, MAX_WORDS).join(' ');
    }

    const wordCount = words.length;
    logger.info(`Scraped ${wordCount} words and ${images.length} images from ${url}`);

    return { text, title, wordCount, images };
  }

  private extractImages($: cheerio.CheerioAPI, baseUrl: string): ScrapedImage[] {
    const images: ScrapedImage[] = [];
    const seen = new Set<string>();

    // Priority 1: Open Graph image (best quality, editorial choice)
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      const resolved = this.resolveUrl(ogImage, baseUrl);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        images.push({
          url: resolved,
          alt: $('meta[property="og:image:alt"]').attr('content') || '',
        });
      }
    }

    // Priority 2: Twitter card image
    const twitterImage = $('meta[name="twitter:image"]').attr('content');
    if (twitterImage) {
      const resolved = this.resolveUrl(twitterImage, baseUrl);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        images.push({
          url: resolved,
          alt: $('meta[name="twitter:image:alt"]').attr('content') || '',
        });
      }
    }

    // Priority 3: Article/main content images
    const contentSelectors = ['article img', '[role="main"] img', 'main img', '.post-content img', '.entry-content img', '.article-body img'];
    for (const sel of contentSelectors) {
      $(sel).each((_, el) => {
        if (images.length >= 5) return false; // max 5 images

        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (!src) return;

        const resolved = this.resolveUrl(src, baseUrl);
        if (!resolved || seen.has(resolved)) return;

        // Skip tiny images (icons, avatars, tracking pixels)
        const width = parseInt($(el).attr('width') || '0');
        const height = parseInt($(el).attr('height') || '0');
        if ((width > 0 && width < 200) || (height > 0 && height < 150)) return;

        // Skip obvious non-editorial images
        if (this.isJunkImage(resolved)) return;

        seen.add(resolved);
        images.push({
          url: resolved,
          alt: $(el).attr('alt') || '',
          width: width || undefined,
          height: height || undefined,
        });
      });
      if (images.length >= 3) break; // stop after first selector that yields images
    }

    return images.slice(0, 3); // cap at 3
  }

  private resolveUrl(src: string, baseUrl: string): string | null {
    try {
      if (src.startsWith('//')) return `https:${src}`;
      if (src.startsWith('http')) return src;
      const base = new URL(baseUrl);
      return new URL(src, base).href;
    } catch {
      return null;
    }
  }

  private isJunkImage(url: string): boolean {
    const lower = url.toLowerCase();
    const junkPatterns = [
      'avatar', 'logo', 'icon', 'spinner', 'loading', 'pixel',
      'tracking', 'beacon', 'ads', 'banner', 'badge', 'button',
      '.gif', 'gravatar', '1x1', '2x2',
    ];
    return junkPatterns.some(p => lower.includes(p));
  }
}

export default new ScraperService();