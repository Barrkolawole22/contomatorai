import Content from '../models/content.model';
import User from '../models/user.model';
import Site from '../models/site.model';
import aiService, { AIModel } from './ai.service';
import schedulerService from './scheduler.service';
import sitemapCrawlerService from './sitemap-crawler.service';
import promptBuilder from './prompt-builder.service';
import knowledgebaseService from './knowledgebase.service';
import logger from '../config/logger';

interface BulkGenerationEntry {
  keyword: string;
  topic?: string;
  scheduledDate?: Date;
  customPrompt?: string;
  additionalContext?: string;
  docIds?: string[];
  dos?: string;
  donts?: string;
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

  async bulkGenerateAndSchedule(
    userId: string,
    entries: BulkGenerationEntry[],
    options: BulkGenerationOptions
  ): Promise<BulkGenerationResult> {
    const operationId = `bulk_${userId}_${Date.now()}`;

    this.progressMap.set(operationId, {
      currentIndex: 0,
      total: entries.length,
      currentKeyword: '',
      status: 'in_progress',
      results: [],
    });

    try {
      logger.info(`🚀 Starting bulk generation for user ${userId}: ${entries.length} articles`);

      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const site = await Site.findOne({ _id: options.siteId, owner: userId });
      if (!site) throw new Error('Site not found or unauthorized');

      const selectedModel = (options.model || 'gemini') as AIModel;
      const creditsPerArticle = aiService.calculateCreditsNeeded(options.wordCount || 1500, selectedModel);
      const totalCreditsNeeded = creditsPerArticle * entries.length;

      if ((user.wordCredits || 0) < totalCreditsNeeded) {
        throw new Error(
          `Insufficient credits. Need ${totalCreditsNeeded.toLocaleString()} but only have ${user.wordCredits?.toLocaleString() || 0}`
        );
      }

      logger.info(`💳 Total credits needed: ${totalCreditsNeeded} (${creditsPerArticle} per article)`);

      let internalLinkSuggestions: any[] = [];
      if (options.includeInternalLinks) {
        try {
          logger.info('🔗 Crawling sitemap for internal links...');
          await sitemapCrawlerService.crawlSite(options.siteId);
        } catch (error: any) {
          logger.warn('Sitemap crawl failed, continuing without internal links:', error.message);
        }
      }

      const results: BulkGenerationResult = {
        total: entries.length,
        successful: 0,
        failed: 0,
        results: [],
        totalCreditsUsed: 0,
        remainingCredits: user.wordCredits || 0,
      };

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        const progress = this.progressMap.get(operationId);
        if (progress) {
          progress.currentIndex = i;
          progress.currentKeyword = entry.topic || entry.keyword;
        }

        logger.info(`📝 Processing ${i + 1}/${entries.length}: "${entry.topic || entry.keyword}"`);

        try {
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

          const generationOptions: Record<string, any> = {
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
            internalLinkSuggestions,
            maxInternalLinks: options.maxInternalLinks || 5,
            internalLinkDensity: options.internalLinkDensity || 3,
          };

          if (entry.docIds && entry.docIds.length > 0) {
            try {
              logger.info(`RAG: retrieving context for "${entry.keyword}" from ${entry.docIds.length} doc(s)`);
              const knowledgeContext = await knowledgebaseService.retrieveContext(
                userId,
                entry.docIds,
                entry.topic || entry.keyword
              );
              logger.info(`RAG: ${knowledgeContext.length} chars retrieved for "${entry.keyword}"`);
              const mergedContext = [knowledgeContext, entry.additionalContext].filter(Boolean).join('\n\n---\n\n');
              generationOptions.additionalContext = mergedContext;
            } catch (ragError: any) {
              logger.warn(`RAG retrieval failed for "${entry.keyword}": ${ragError.message}. Continuing without knowledgebase context.`);
            }
          }

          if (entry.dos || entry.donts) {
            const instructionParts: string[] = [];
            if (entry.dos) instructionParts.push(`MUST DO: ${entry.dos}`);
            if (entry.donts) instructionParts.push(`MUST NOT: ${entry.donts}`);
            const instructions = instructionParts.join('\n');
            generationOptions.extraInstructions = instructions + '\n\n' + (generationOptions.extraInstructions || '');
          }

          // ========================================================
          // ✅ FIX: Check if we need to schedule AI generation
          // ========================================================
          const now = new Date();
          let isFutureScheduled = false;
          let generateAt: Date | undefined = undefined;

          if (entry.scheduledDate) {
            const scheduledDate = new Date(entry.scheduledDate);
            generateAt = new Date(scheduledDate.getTime() - 15 * 60000); // 15 mins before
            
            // If 15 mins before is already in the past, just generate it now
            if (generateAt > now) {
              isFutureScheduled = true;
            }
          }

          if (isFutureScheduled) {
            // Save Shell Article to DB instantly
            const content = new Content({
              userId,
              siteId: options.siteId,
              title: `[Pending AI Generation] ${entry.topic || entry.keyword}`,
              content: '',
              keyword: entry.keyword,
              keywords: [entry.keyword],
              status: 'pending_generation', // Triggers Phase 1 of cron
              type: 'article',
              tone: options.tone || 'professional',
              wordCount: options.wordCount || 1500,
              aiGenerated: true,
              aiModel: selectedModel,
              scheduledPublishDate: entry.scheduledDate,
              generateAt: generateAt,
              timezone: options.timezone || 'UTC',
              tags: this.generateTags(entry.keyword),
              categories: [],
              generationOptions: {
                tone: options.tone || 'professional',
                wordCount: options.wordCount || 1500,
                includeHeadings: true,
                includeIntroduction: options.includeIntroduction !== false,
                includeConclusion: options.includeConclusion !== false,
                // Serialize options for the cron job to read later
                extraInstructions: JSON.stringify({ model: selectedModel, ...generationOptions })
              }
            });

            await content.save();
            await user.deductWordCredits(creditsPerArticle, content._id.toString(), 'bulk_schedule_reservation');

            results.successful++;
            results.totalCreditsUsed += creditsPerArticle;
            results.results.push({
              keyword: entry.keyword,
              status: 'success',
              contentId: content._id.toString(),
              scheduledDate: entry.scheduledDate,
              creditsUsed: creditsPerArticle,
            });

            logger.info(`⏳ Reserved Shell: "${entry.keyword}" scheduled to generate at ${generateAt}`);
            continue; // Skip immediate AI generation and move to next article!
          }

          // ========================================================
          // IMMEDIATE GENERATION (If no schedule or schedule is past)
          // ========================================================

          const generationKeyword = entry.topic || entry.keyword;
          const generatedContent = await aiService.generateBlogPost(generationKeyword, selectedModel, generationOptions);

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
            seoScore: this.calculateSEOScore(generatedContent.content, entry.keyword),
          });

          await content.save();

          const actualCreditsUsed = generatedContent.creditsUsed || creditsPerArticle;
          await user.deductWordCredits(actualCreditsUsed, content._id.toString(), 'bulk_generation');

          results.successful++;
          results.totalCreditsUsed += actualCreditsUsed;
          results.results.push({
            keyword: entry.keyword,
            status: 'success',
            contentId: content._id.toString(),
            scheduledDate: entry.scheduledDate,
            creditsUsed: actualCreditsUsed,
          });

          logger.info(`✅ Success: "${entry.keyword}" (${actualCreditsUsed} credits)`);

          if (i < entries.length - 1) await this.delay(500);
        } catch (error: any) {
          logger.error(`❌ Failed: "${entry.keyword}" - ${error.message}`);
          results.failed++;
          results.results.push({ keyword: entry.keyword, status: 'failed', error: error.message });
        }
      }

      const progress = this.progressMap.get(operationId);
      if (progress) {
        progress.status = 'completed';
        progress.results = results.results;
      }

      const updatedUser = await User.findById(userId);
      results.remainingCredits = updatedUser?.wordCredits || 0;

      logger.info(`🏁 Bulk generation complete: ${results.successful}/${results.total} successful`);
      return results;
    } catch (error: any) {
      logger.error('Bulk generation failed:', error);
      const progress = this.progressMap.get(operationId);
      if (progress) progress.status = 'failed';
      throw error;
    }
  }

  getProgress(operationId: string): BulkProgress | null {
    return this.progressMap.get(operationId) || null;
  }

  clearProgress(operationId: string): void {
    this.progressMap.delete(operationId);
  }

  private generateTags(keyword: string): string[] {
    const words = keyword.split(' ').filter(w => w.length > 0);
    const baseTags = [...words.slice(0, 3), 'guide', 'tips'];
    return baseTags
      .slice(0, 5)
      .map(tag => tag.toLowerCase().trim())
      .filter((tag, index, arr) => arr.indexOf(tag) === index);
  }

  private calculateSEOScore(content: string, keyword: string): number {
    if (!content || !keyword) return 0;
    const contentLower = content.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    let score = 0;
    if (contentLower.includes(keywordLower)) score += 25;
    const wordCount = content.replace(/<[^>]*>/g, ' ').split(/\s+/).length;
    if (wordCount >= 300) score += 25;
    if (/<h[1-6][^>]*>/i.test(content)) score += 25;
    const occurrences = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
    const density = (occurrences / wordCount) * 100;
    if (density >= 0.5 && density <= 3) score += 25;
    return Math.min(score, 100);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async bulkGenerate(
    userId: string,
    keywords: string[],
    options: Omit<BulkGenerationOptions, 'scheduledDate'>
  ): Promise<BulkGenerationResult> {
    return this.bulkGenerateAndSchedule(userId, keywords.map(k => ({ keyword: k })), options);
  }

  estimateBulkCredits(entries: number, wordCount: number = 1500, model: AIModel = 'gemini'): number {
    return aiService.calculateCreditsNeeded(wordCount, model) * entries;
  }
}

export default new BulkSchedulerService();