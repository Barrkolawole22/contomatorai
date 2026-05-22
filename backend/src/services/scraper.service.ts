// backend/src/services/scraper.service.ts
import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../config/logger';

export class ScraperService {
  async extract(url: string): Promise<{ text: string; title: string; wordCount: number }> {
    try {
      // Validate URL
      new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }

    logger.info(`Scraping URL: ${url}`);

    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContomatorAI/1.0)' }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, footer, header, aside, .sidebar, .menu, .ad, .social, .comments').remove();

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';

    // Try to get main content area
    let mainContent = '';
    const articleSelectors = ['article', '[role="main"]', 'main', '.post-content', '.article-body', '#content'];
    for (const sel of articleSelectors) {
      const el = $(sel);
      if (el.length) {
        mainContent = el.text();
        break;
      }
    }
    if (!mainContent) {
      // Fallback to body text with some filtering
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