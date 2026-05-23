// backend/src/services/scraper.service.ts
import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../config/logger';

export class ScraperService {
  async extract(url: string): Promise<{ text: string; title: string; wordCount: number }> {
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

    // Clean text: collapse whitespace, remove extra spaces
    let text = mainContent.replace(/\s+/g, ' ').trim();

    // Limit to ~3000 words
    const words = text.split(/\s+/);
    const MAX_WORDS = 3000;
    if (words.length > MAX_WORDS) {
      text = words.slice(0, MAX_WORDS).join(' ');
    }

    const wordCount = words.length;
    logger.info(`Scraped ${wordCount} words from ${url}`);

    return { text, title, wordCount };
  }
}

export default new ScraperService();