// backend/src/services/sitemap-crawler.service.ts - FIXED VERSION WITH IMPROVED LINK MATCHING
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import Site from '../models/site.model';
import SitemapUrl from '../models/sitemap-url.model';
import logger from '../config/logger';

interface SitemapEntry {
  loc: string[];
  lastmod?: string[];
  changefreq?: string[];
  priority?: string[];
}

interface ParsedSitemap {
  urlset?: {
    url: SitemapEntry[];
  };
  sitemapindex?: {
    sitemap: { loc: string[] }[];
  };
}

interface AddUrlParams {
  siteId: string;
  url: string;
  title?: string;
  description?: string;
  keywords?: string[];
  priority?: number;
}

export class SitemapCrawlerService {
  
  // ✅ URL patterns to exclude
  private readonly EXCLUDED_PATTERNS = [
    // WordPress taxonomy pages
    /\/tag\//i,
    /\/tags\//i,
    /\/category\//i,
    /\/categories\//i,
    /\/author\//i,
    /\/authors\//i,
    
    // WordPress feeds
    /\/feed\//i,
    /\/rss\//i,
    /\/atom\//i,
    
    // WordPress system pages
    /\/wp-admin\//i,
    /\/wp-content\//i,
    /\/wp-includes\//i,
    /\/wp-json\//i,
    
    // Search and filter pages
    /\/\?s=/i,
    /\/search\//i,
    
    // Attachment pages
    /\/attachment\//i,
    
    // Comments and trackbacks
    /\/comment-page/i,
    /\/trackback\//i,
    
    // Login/register pages
    /\/login\//i,
    /\/register\//i,
    /\/wp-login/i,
  ];

  /**
   * Check if URL should be excluded
   */
  private shouldExcludeUrl(url: string): boolean {
    for (const pattern of this.EXCLUDED_PATTERNS) {
      if (pattern.test(url)) {
        logger.debug(`Excluding URL (matched pattern): ${url}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Validate and clean URL
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      
      // Only allow http and https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      
      // Check file extensions to exclude
      const excludedExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar',
        '.mp3', '.mp4', '.avi', '.mov', '.css', '.js', '.xml'
      ];
      
      const hasExcludedExt = excludedExtensions.some(ext => 
        parsed.pathname.toLowerCase().endsWith(ext)
      );
      
      if (hasExcludedExt) {
        logger.debug(`Excluding URL (file extension): ${url}`);
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * ✅ NEW: Manually add a URL to the sitemap index
   */
  async addUrl(params: AddUrlParams): Promise<any> {
    try {
      const { siteId, url, title, description, keywords, priority } = params;

      // Validate URL format
      if (!this.isValidUrl(url)) {
        throw new Error('Invalid URL format');
      }

      // Check if URL should be excluded
      if (this.shouldExcludeUrl(url)) {
        throw new Error('This URL matches exclusion patterns (tags, categories, authors, etc.)');
      }

      // Verify site exists
      const site = await Site.findById(siteId);
      if (!site) {
        throw new Error('Site not found');
      }

      // Check if URL already exists
      const existing = await SitemapUrl.findOne({ siteId, url });
      if (existing) {
        // Update existing URL
        existing.title = title || existing.title;
        existing.description = description || existing.description;
        existing.keywords = keywords || existing.keywords;
        existing.priority = priority !== undefined ? priority : existing.priority;
        existing.status = 'active';
        existing.crawledAt = new Date();
        await existing.save();

        logger.info(`✅ Updated existing URL: ${url}`);
        return {
          success: true,
          message: 'URL updated successfully',
          data: {
            id: existing._id.toString(),
            siteId: existing.siteId.toString(),
            url: existing.url,
            title: existing.title,
            description: existing.description,
            keywords: existing.keywords,
            priority: existing.priority,
            status: existing.status
          }
        };
      }

      // Create new URL entry
      const sitemapUrl = new SitemapUrl({
        siteId,
        url,
        title: title || '',
        description: description || '',
        keywords: keywords || [],
        priority: priority !== undefined ? priority : 0.5,
        changeFreq: 'weekly',
        isIndexed: true,
        status: 'active',
        crawledAt: new Date()
      });

      await sitemapUrl.save();

      logger.info(`✅ Added new URL to sitemap: ${url}`);
      return {
        success: true,
        message: 'URL added successfully',
        data: {
          id: sitemapUrl._id.toString(),
          siteId: sitemapUrl.siteId.toString(),
          url: sitemapUrl.url,
          title: sitemapUrl.title,
          description: sitemapUrl.description,
          keywords: sitemapUrl.keywords,
          priority: sitemapUrl.priority,
          status: sitemapUrl.status
        }
      };
    } catch (error: any) {
      logger.error('Error adding URL:', error);
      throw error;
    }
  }

  /**
   * Crawl all sites for a user or all active sites
   */
  async crawlAllSites(userId?: string): Promise<void> {
    try {
      const query = userId ? { owner: userId, isActive: true } : { isActive: true };
      const sites = await Site.find(query);
      
      logger.info(`Starting sitemap crawl for ${sites.length} sites`);
      
      for (const site of sites) {
        try {
          await this.crawlSite(site._id.toString());
        } catch (error: any) {
          logger.error(`Failed to crawl site ${site.name}:`, error.message);
        }
      }
      
      logger.info(`Completed sitemap crawl for ${sites.length} sites`);
    } catch (error: any) {
      logger.error('Error in crawlAllSites:', error);
      throw error;
    }
  }

  /**
   * Crawl a specific site's sitemap
   */
  async crawlSite(siteId: string): Promise<number> {
    try {
      const site = await Site.findById(siteId);
      if (!site) {
        throw new Error('Site not found');
      }

      logger.info(`Crawling sitemap for: ${site.name}`);

      // Try common sitemap locations
      const sitemapUrls = [
        `${site.url}/sitemap.xml`,
        `${site.url}/sitemap_index.xml`,
        `${site.url}/wp-sitemap.xml`,
        `${site.url}/sitemap-index.xml`,
        `${site.url}/sitemap1.xml`
      ];

      let urls: any[] = [];
      let sitemapFound = false;

      for (const sitemapUrl of sitemapUrls) {
        try {
          urls = await this.fetchAndParseSitemap(sitemapUrl);
          if (urls.length > 0) {
            sitemapFound = true;
            logger.info(`Found sitemap at: ${sitemapUrl}`);
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!sitemapFound) {
        logger.warn(`No sitemap found for site: ${site.name}`);
        return 0;
      }

      // Filter out excluded URLs
      const filteredUrls = urls.filter(urlData => {
        if (!this.isValidUrl(urlData.url)) {
          return false;
        }
        
        if (this.shouldExcludeUrl(urlData.url)) {
          return false;
        }
        
        return true;
      });

      logger.info(`Filtered ${urls.length - filteredUrls.length} URLs (tags, categories, authors, etc.)`);
      logger.info(`Processing ${filteredUrls.length} valid URLs`);

      // Store URLs in database
      let savedCount = 0;
      for (const urlData of filteredUrls) {
        try {
          await SitemapUrl.findOneAndUpdate(
            { siteId, url: urlData.url },
            {
              $set: {
                lastModified: urlData.lastModified,
                changeFreq: urlData.changeFreq || 'weekly',
                priority: urlData.priority || 0.5,
                crawledAt: new Date(),
                isIndexed: true,
                status: 'active'
              }
            },
            { upsert: true, new: true }
          );
          savedCount++;
        } catch (error: any) {
          logger.error(`Error saving URL ${urlData.url}:`, error.message);
        }
      }

      // Remove URLs that are no longer in sitemap
      await this.cleanupStaleUrls(siteId, filteredUrls.map(u => u.url));

      // Fetch page metadata for better internal linking
      const enrichedCount = await this.enrichUrlMetadata(siteId);
      logger.info(`📝 Enriched ${enrichedCount} URLs with metadata`);

      logger.info(`✅ Crawled ${savedCount} URLs for site: ${site.name}`);
      return savedCount;
    } catch (error: any) {
      logger.error('Error in crawlSite:', error);
      throw error;
    }
  }

  /**
   * Remove URLs that are no longer in the sitemap
   */
  private async cleanupStaleUrls(siteId: string, currentUrls: string[]): Promise<void> {
    try {
      const result = await SitemapUrl.deleteMany({
        siteId,
        url: { $nin: currentUrls }
      });
      
      if (result.deletedCount && result.deletedCount > 0) {
        logger.info(`🗑️ Removed ${result.deletedCount} stale URLs from database`);
      }
    } catch (error: any) {
      logger.error('Error cleaning up stale URLs:', error);
    }
  }

  /**
   * Fetch and parse sitemap XML
   */
  private async fetchAndParseSitemap(sitemapUrl: string): Promise<any[]> {
    try {
      const response = await axios.get(sitemapUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'ContentAI-Bot/1.0'
        }
      });

      const parsed: ParsedSitemap = await parseStringPromise(response.data);
      
      // Check if it's a sitemap index
      if (parsed.sitemapindex?.sitemap) {
        return await this.processSitemapIndex(parsed.sitemapindex.sitemap);
      }

      // Regular sitemap
      if (parsed.urlset?.url) {
        return this.processSitemapUrls(parsed.urlset.url);
      }

      return [];
    } catch (error: any) {
      logger.error(`Error fetching sitemap ${sitemapUrl}:`, error.message);
      throw error;
    }
  }

  /**
   * Process sitemap index (contains multiple sitemaps)
   */
  private async processSitemapIndex(sitemaps: { loc: string[] }[]): Promise<any[]> {
    let allUrls: any[] = [];

    for (const sitemap of sitemaps) {
      const sitemapUrl = sitemap.loc[0];
      
      // Skip taxonomy sitemaps
      if (this.shouldExcludeSitemap(sitemapUrl)) {
        logger.debug(`Skipping sitemap: ${sitemapUrl}`);
        continue;
      }
      
      try {
        const urls = await this.fetchAndParseSitemap(sitemapUrl);
        allUrls = [...allUrls, ...urls];
      } catch (error: any) {
        logger.error(`Error processing child sitemap ${sitemapUrl}:`, error.message);
      }
    }

    return allUrls;
  }

  /**
   * Check if entire sitemap should be skipped
   */
  private shouldExcludeSitemap(sitemapUrl: string): boolean {
    const excludedSitemapPatterns = [
      /category-sitemap/i,
      /post_tag-sitemap/i,
      /author-sitemap/i,
      /tag-sitemap/i,
    ];

    return excludedSitemapPatterns.some(pattern => pattern.test(sitemapUrl));
  }

  /**
   * Process URL entries from sitemap
   */
  private processSitemapUrls(urls: SitemapEntry[]): any[] {
    return urls.map(entry => ({
      url: entry.loc[0],
      lastModified: entry.lastmod?.[0] ? new Date(entry.lastmod[0]) : undefined,
      changeFreq: entry.changefreq?.[0],
      priority: entry.priority?.[0] ? parseFloat(entry.priority[0]) : undefined
    }));
  }

  /**
   * ✅ PUBLIC: Enrich URL metadata by fetching page titles and descriptions
   */
  async enrichUrlMetadata(siteId: string, force: boolean = false): Promise<number> {
    try {
      // Build query - if force, enrich all URLs, otherwise only empty ones
      const query: any = { siteId, status: 'active' };
      
      if (!force) {
        query.title = { $in: ['', null] };
      }
      
      const urls = await SitemapUrl.find(query).limit(50);

      logger.info(`🔍 Enriching metadata for ${urls.length} URLs (force: ${force})`);

      let enrichedCount = 0;

      for (const urlDoc of urls) {
        try {
          const startTime = Date.now();
          const response = await axios.get(urlDoc.url, {
            timeout: 10000,
            headers: {
              'User-Agent': 'ContentAI-Bot/1.0'
            }
          });
          const responseTime = Date.now() - startTime;

          // Extract title
          const titleMatch = response.data.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : '';

          // Extract meta description
          const descMatch = response.data.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
          const description = descMatch ? descMatch[1].trim() : '';

          // Extract keywords from content
          const keywords = this.extractKeywords(response.data);

          await SitemapUrl.findByIdAndUpdate(urlDoc._id, {
            title,
            description,
            keywords: keywords.slice(0, 10),
            responseTime,
            statusCode: response.status
          });

          enrichedCount++;
          logger.info(`✅ Enriched: ${title || urlDoc.url}`);

          await this.delay(500); // Rate limiting
        } catch (error: any) {
          logger.error(`Error enriching URL ${urlDoc.url}:`, error.message);
          
          await SitemapUrl.findByIdAndUpdate(urlDoc._id, {
            status: 'broken',
            statusCode: error.response?.status || 0
          });
        }
      }

      logger.info(`✅ Successfully enriched ${enrichedCount}/${urls.length} URLs`);
      return enrichedCount;
    } catch (error: any) {
      logger.error('Error in enrichUrlMetadata:', error);
      throw error;
    }
  }

  /**
   * Extract keywords from HTML content
   */
  private extractKeywords(html: string): string[] {
    const text = html.replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const words = text.split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));

    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 
      'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 
      'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 
      'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 
      'use', 'will', 'about', 'than', 'into', 'time', 'year', 'your',
      'from', 'have', 'this', 'that', 'with', 'they', 'there', 'been'
    ];
    return stopWords.includes(word);
  }

  /**
   * ✅ IMPROVED: Find relevant internal links for content (FLEXIBLE SEARCH)
   */
  async findRelevantLinks(siteId: string, keywords: string[], limit: number = 5): Promise<any[]> {
    try {
      // ✅ STEP 1: Process keywords - split phrases into individual words
      const processedKeywords: string[] = [];
      
      keywords.forEach(keyword => {
        // Split phrase into individual words
        const words = keyword
          .toLowerCase()
          .split(/\s+/)
          .filter(word => {
            // Remove short words and common stop words
            if (word.length <= 2) return false;
            
            const stopWords = [
              'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
              'how', 'what', 'when', 'where', 'why', 'who', 'which',
              'this', 'that', 'with', 'from', 'have', 'has', 'had',
              'will', 'would', 'should', 'could', 'may', 'might'
            ];
            
            return !stopWords.includes(word);
          });
        
        processedKeywords.push(...words);
      });
      
      // Remove duplicates
      const uniqueKeywords = [...new Set(processedKeywords)];
      
      logger.info(`🔍 Finding relevant links for keywords: ${keywords.join(', ')}`);
      logger.info(`📝 Processed to individual words: ${uniqueKeywords.join(', ')}`);

      if (uniqueKeywords.length === 0) {
        logger.warn('⚠️ No valid keywords after processing');
        return [];
      }

      // ✅ STEP 2: Build flexible search query (OR conditions for each word)
      const searchConditions = uniqueKeywords.map(word => ({
        $or: [
          { title: { $regex: word, $options: 'i' } },
          { description: { $regex: word, $options: 'i' } },
          { keywords: { $regex: word, $options: 'i' } },
          { url: { $regex: word, $options: 'i' } }
        ]
      }));

      // ✅ STEP 3: Fetch URLs that match ANY of the words
      const urls = await SitemapUrl.find({
        siteId,
        status: { $ne: 'broken' }, // Only exclude broken URLs
        $or: searchConditions
      })
      .limit(limit * 5) // Get extra results for better scoring
      .select('url title description keywords priority')
      .lean();

      logger.info(`📊 Found ${urls.length} potential matching URLs`);

      if (urls.length === 0) {
        const totalUrls = await SitemapUrl.countDocuments({ siteId });
        logger.warn(`⚠️ No matching URLs found. Site has ${totalUrls} total URLs.`);
        return [];
      }

      // ✅ STEP 4: Score each URL based on matches
      const scoredUrls = urls.map(url => {
        let score = 0;
        const urlLower = (url.url || '').toLowerCase();
        const titleLower = (url.title || '').toLowerCase();
        const descLower = (url.description || '').toLowerCase();
        const urlKeywords = (url.keywords || []).map(k => k.toLowerCase());
        
        uniqueKeywords.forEach(word => {
          const wordLower = word.toLowerCase();
          
          // Title matches = highest score (10 points per word)
          if (titleLower.includes(wordLower)) {
            score += 10;
            logger.debug(`  ✓ Title match for "${word}" in ${url.title}`);
          }
          
          // Keyword array matches = high score (8 points per word)
          const keywordMatch = urlKeywords.some(k => k.includes(wordLower));
          if (keywordMatch) {
            score += 8;
            logger.debug(`  ✓ Keyword match for "${word}"`);
          }
          
          // Description matches = medium score (5 points per word)
          if (descLower.includes(wordLower)) {
            score += 5;
            logger.debug(`  ✓ Description match for "${word}"`);
          }
          
          // URL path matches = lower score (3 points per word)
          if (urlLower.includes(wordLower)) {
            score += 3;
            logger.debug(`  ✓ URL match for "${word}"`);
          }
        });
        
        // Bonus points for multiple word matches
        const matchCount = uniqueKeywords.filter(word => {
          const wordLower = word.toLowerCase();
          return titleLower.includes(wordLower) || 
                 descLower.includes(wordLower) ||
                 urlKeywords.some(k => k.includes(wordLower));
        }).length;
        
        if (matchCount > 1) {
          score += matchCount * 2; // Bonus for matching multiple words
        }
        
        return {
          url: url.url,
          title: url.title || url.url,
          description: url.description || '',
          keywords: url.keywords || [],
          excerpt: url.description ? url.description.substring(0, 150) + '...' : '',
          relevanceScore: Math.min(score / (uniqueKeywords.length * 10), 1) // Normalize to 0-1
        };
      });

      // ✅ STEP 5: Sort by score and return top results
      const results = scoredUrls
        .filter(u => u.relevanceScore > 0) // Only return if ANY relevance
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

      logger.info(`✅ Returning ${results.length} relevant links with scores`);
      results.forEach(r => {
        logger.debug(`  - ${r.title} (${Math.round(r.relevanceScore * 100)}%)`);
      });

      return results;

    } catch (error: any) {
      logger.error('Error finding relevant links:', error);
      return [];
    }
  }

  /**
   * Get crawl statistics for a site
   */
  async getCrawlStats(siteId: string): Promise<any> {
    try {
      const total = await SitemapUrl.countDocuments({ siteId });
      const active = await SitemapUrl.countDocuments({ siteId, status: 'active' });
      const broken = await SitemapUrl.countDocuments({ siteId, status: 'broken' });
      const lastCrawl = await SitemapUrl.findOne({ siteId }).sort({ crawledAt: -1 }).select('crawledAt');

      return {
        totalUrls: total,
        activeUrls: active,
        brokenUrls: broken,
        lastCrawledAt: lastCrawl?.crawledAt || null
      };
    } catch (error: any) {
      logger.error('Error getting crawl stats:', error);
      throw error;
    }
  }

  /**
   * Delete all URLs for a site
   */
  async clearSiteUrls(siteId: string): Promise<number> {
    try {
      const result = await SitemapUrl.deleteMany({ siteId });
      return result.deletedCount || 0;
    } catch (error: any) {
      logger.error('Error clearing site URLs:', error);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new SitemapCrawlerService();