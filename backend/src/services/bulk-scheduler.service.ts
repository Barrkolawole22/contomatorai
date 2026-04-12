// backend/src/services/bulk-scheduler.service.ts
import Content from '../models/content.model';
import User from '../models/user.model';
import Site from '../models/site.model';
import aiService, { AIModel } from './ai.service';
import schedulerService from './scheduler.service';
import sitemapCrawlerService from './sitemap-crawler.service';
import promptBuilder from './prompt-builder.service';
import logger from '../config/logger';

interface BulkGenerationEntry {
  keyword: string;
  scheduledDate?: Date;
  customPrompt?: string;
  additionalContext?: string;
}

interface BulkGenerationOptions {
  siteId: string;
  model?: AIModel;
  tone?: string;
  wordCount?: number;
  targetAudience?: string;
  includeIntroduction?: boolean;
  includeConclusion?: boolean;
  includeFAQ?: boolean;
  contentIntent?: 'informational' | 'navigational' | 'commercial' | 'transactional';
  writingStyle?: 'conversational' | 'academic' | 'journalistic' | 'technical' | 'creative';
  seoFocus?: 'primary_keyword' | 'semantic_keywords' | 'long_tail' | 'balanced';
  callToAction?: string;
  includeStatistics?: boolean;
  includeExamples?: boolean;
  includeComparisons?: boolean;
  targetKeywordDensity?: number;
  includeInternalLinks?: boolean;
  internalLinkDensity?: number;
  maxInternalLinks?: number;
  timezone?: string;
}

interface BulkGenerationResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    keyword: string;
    status: 'success' | 'failed';
    contentId?: string;
    scheduledDate?: Date;
    error?: string;
    creditsUsed?: number;
  }>;
  totalCreditsUsed: number;
  remainingCredits: number;
}

interface BulkProgress {
  currentIndex: number;
  total: number;
  currentKeyword: string;
  status: 'in_progress' | 'completed' | 'failed';
  results: Array<any>;
}

export class BulkSchedulerService {
  private progressMap: Map<string, BulkProgress> = new Map();

  /**
   * Generate and schedule multiple articles in one operation
   * This is the main method you need for bulk generation + scheduling
   */
  async bulkGenerateAndSchedule(
    userId: string,
    entries: BulkGenerationEntry[],
    options: BulkGenerationOptions
  ): Promise<BulkGenerationResult> {
    const operationId = `bulk_${userId}_${Date.now()}`;
    
    // Initialize progress tracking
    this.progressMap.set(operationId, {
      currentIndex: 0,
      total: entries.length,
      currentKeyword: '',
      status: 'in_progress',
      results: []
    });

    try {
      logger.info(`🚀 Starting bulk generation for user ${userId}: ${entries.length} articles`);

      // Validate user exists and has sufficient credits
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate site
      const site = await Site.findOne({ _id: options.siteId, owner: userId });
      if (!site) {
        throw new Error('Site not found or unauthorized');
      }

      // Calculate total credits needed
      const selectedModel = options.model || 'groq';
      const creditsPerArticle = aiService.calculateCreditsNeeded(
        options.wordCount || 1500,
        selectedModel
      );
      const totalCreditsNeeded = creditsPerArticle * entries.length;

      // Check if user has enough credits
      if ((user.wordCredits || 0) < totalCreditsNeeded) {
        throw new Error(
          `Insufficient credits. Need ${totalCreditsNeeded.toLocaleString()} but only have ${user.wordCredits?.toLocaleString() || 0}`
        );
      }

      logger.info(`💳 Total credits needed: ${totalCreditsNeeded} (${creditsPerArticle} per article)`);

      // Crawl sitemap once for internal links (if enabled)
      let internalLinkSuggestions: any[] = [];
      if (options.includeInternalLinks) {
        try {
          logger.info('📊 Crawling sitemap for internal links...');
          await sitemapCrawlerService.crawlSite(options.siteId);
        } catch (error: any) {
          logger.warn('Sitemap crawl failed, continuing without internal links:', error.message);
        }
      }

      // Process each entry
      const results: BulkGenerationResult = {
        total: entries.length,
        successful: 0,
        failed: 0,
        results: [],
        totalCreditsUsed: 0,
        remainingCredits: user.wordCredits || 0
      };

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        
        // Update progress
        const progress = this.progressMap.get(operationId);
        if (progress) {
          progress.currentIndex = i;
          progress.currentKeyword = entry.keyword;
        }

        logger.info(`📝 Processing ${i + 1}/${entries.length}: "${entry.keyword}"`);

        try {
          // Get internal link suggestions for this keyword
          if (options.includeInternalLinks) {
            try {
              const suggestions = await sitemapCrawlerService.findRelevantLinks(
                options.siteId,
                [entry.keyword],
                options.maxInternalLinks || 5
              );
              internalLinkSuggestions = suggestions;
            } catch (error: any) {
              logger.warn(`Failed to get internal links for "${entry.keyword}":`, error.message);
              internalLinkSuggestions = [];
            }
          }

          // Generate content
          const generationOptions = {
            tone: options.tone || 'professional',
            wordCount: options.wordCount || 1500,
            targetAudience: options.targetAudience || 'general audience',
            includeIntroduction: options.includeIntroduction !== false,
            includeConclusion: options.includeConclusion !== false,
            includeFAQ: options.includeFAQ || false,
            contentIntent: options.contentIntent || 'informational',
            customPrompt: entry.customPrompt || '',
            additionalContext: entry.additionalContext || '',
            writingStyle: options.writingStyle || 'conversational',
            seoFocus: options.seoFocus || 'balanced',
            callToAction: options.callToAction || '',
            includeStatistics: options.includeStatistics !== false,
            includeExamples: options.includeExamples !== false,
            includeComparisons: options.includeComparisons || false,
            targetKeywordDensity: options.targetKeywordDensity || 1.5,
            includeInternalLinks: options.includeInternalLinks || false,
            internalLinkSuggestions: internalLinkSuggestions,
            maxInternalLinks: options.maxInternalLinks || 5,
            internalLinkDensity: options.internalLinkDensity || 3
          };

          const generatedContent = await aiService.generateBlogPost(
            entry.keyword,
            selectedModel,
            generationOptions
          );

          // Create content in database
          const content = new Content({
            userId,
            siteId: options.siteId,
            title: generatedContent.title,
            content: generatedContent.content,
            keyword: entry.keyword,
            keywords: [entry.keyword],
            status: entry.scheduledDate ? 'scheduled' : 'draft',
            type: 'article',
            tone: options.tone || 'professional',
            wordCount: generatedContent.wordCount,
            readingTime: Math.ceil(generatedContent.wordCount / 200),
            aiGenerated: true,
            aiModel: selectedModel,
            scheduledPublishDate: entry.scheduledDate,
            timezone: options.timezone || 'UTC',
            tags: this.generateTags(entry.keyword),
            categories: [],
            seoScore: this.calculateSEOScore(generatedContent.content, entry.keyword)
          });

          await content.save();

          // Deduct credits
          const actualCreditsUsed = generatedContent.creditsUsed || creditsPerArticle;
          await user.deductWordCredits(actualCreditsUsed, content._id.toString(), 'bulk_generation');

          results.successful++;
          results.totalCreditsUsed += actualCreditsUsed;
          results.results.push({
            keyword: entry.keyword,
            status: 'success',
            contentId: content._id.toString(),
            scheduledDate: entry.scheduledDate,
            creditsUsed: actualCreditsUsed
          });

          logger.info(`✅ Success: "${entry.keyword}" (${actualCreditsUsed} credits)`);

          // Add delay to avoid rate limits (500ms between generations)
          if (i < entries.length - 1) {
            await this.delay(500);
          }

        } catch (error: any) {
          logger.error(`❌ Failed: "${entry.keyword}" - ${error.message}`);
          
          results.failed++;
          results.results.push({
            keyword: entry.keyword,
            status: 'failed',
            error: error.message
          });
        }
      }

      // Update final progress
      const progress = this.progressMap.get(operationId);
      if (progress) {
        progress.status = 'completed';
        progress.results = results.results;
      }

      // Get updated user credits
      const updatedUser = await User.findById(userId);
      results.remainingCredits = updatedUser?.wordCredits || 0;

      logger.info(`🎉 Bulk generation complete: ${results.successful}/${results.total} successful`);

      return results;

    } catch (error: any) {
      logger.error('Bulk generation failed:', error);
      
      const progress = this.progressMap.get(operationId);
      if (progress) {
        progress.status = 'failed';
      }

      throw error;
    }
  }

  /**
   * Get progress of bulk operation
   */
  getProgress(operationId: string): BulkProgress | null {
    return this.progressMap.get(operationId) || null;
  }

  /**
   * Clear progress after completion
   */
  clearProgress(operationId: string): void {
    this.progressMap.delete(operationId);
  }

  /**
   * Generate tags from keyword
   */
  private generateTags(keyword: string): string[] {
    const words = keyword.split(' ').filter(word => word.length > 0);
    const baseTags = [...words.slice(0, 3)];
    baseTags.push('guide', 'tips');
    
    return baseTags
      .slice(0, 5)
      .map(tag => tag.toLowerCase().trim())
      .filter((tag, index, arr) => arr.indexOf(tag) === index);
  }

  /**
   * Calculate SEO score
   */
  private calculateSEOScore(content: string, keyword: string): number {
    if (!content || !keyword) return 0;
    
    const contentLower = content.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    
    let score = 0;
    
    if (contentLower.includes(keywordLower)) score += 25;
    
    const wordCount = content.replace(/<[^>]*>/g, ' ').split(/\s+/).length;
    if (wordCount >= 300) score += 25;
    
    const hasHeadings = /<h[1-6][^>]*>/i.test(content);
    if (hasHeadings) score += 25;
    
    const keywordOccurrences = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
    const keywordDensity = (keywordOccurrences / wordCount) * 100;
    if (keywordDensity >= 0.5 && keywordDensity <= 3) score += 25;
    
    return Math.min(score, 100);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simple bulk generation without scheduling (faster)
   */
  async bulkGenerate(
    userId: string,
    keywords: string[],
    options: Omit<BulkGenerationOptions, 'scheduledDate'>
  ): Promise<BulkGenerationResult> {
    const entries = keywords.map(keyword => ({ keyword }));
    return this.bulkGenerateAndSchedule(userId, entries, options);
  }

  /**
   * Estimate total credits needed for bulk operation
   */
  estimateBulkCredits(
    entries: number,
    wordCount: number = 1500,
    model: AIModel = 'groq'
  ): number {
    return aiService.calculateCreditsNeeded(wordCount, model) * entries;
  }
}

export default new BulkSchedulerService();