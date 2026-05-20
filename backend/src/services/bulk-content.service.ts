import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import Content from '../models/content.model';
import User from '../models/user.model';
import aiService, { AIModel, MODEL_CONFIG } from './ai.service';
import logger from '../config/logger';

interface BulkEntry {
  keyword: string;
  topic?: string;
  scheduledDate?: string;
  customPrompt?: string;
  additionalContext?: string;
  docIds?: string[];
  dos?: string;
  donts?: string;
}

interface BulkOptions {
  siteId: string;
  model?: 'groq' | 'gemini' | 'claude';
  wordCount?: number;
  tone?: string;
  targetAudience?: string;
  includeIntroduction?: boolean;
  includeConclusion?: boolean;
  includeFAQ?: boolean;
  includeExamples?: boolean;
  includeStatistics?: boolean;
  includeComparisons?: boolean;
  contentIntent?: string;
  writingStyle?: string;
  seoFocus?: string;
  callToAction?: string;
  includeInternalLinks?: boolean;
  maxInternalLinks?: number;
  internalLinkDensity?: number;
  timezone?: string;
}

export class BulkContentService {

  /**
   * Generate and schedule multiple articles (manual entry mode).
   */
  async generateAndSchedule(userId: string, entries: BulkEntry[], options: BulkOptions) {
    const results: any[] = [];
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const model: AIModel = options.model || 'groq';
    const wordCount = options.wordCount || 1500;
    const userCredits = (user as any).wordCredits || (user as any).credits || 0;

    for (const entry of entries) {
      try {
        const topic = entry.keyword || entry.topic || 'blog post';

        // Build generation params matching ContentService.generateContent
        const generationParams: any = {
          keyword: topic,
          siteId: options.siteId,
          model,
          wordCount,
          tone: options.tone || 'professional',
          targetAudience: options.targetAudience || 'general audience',
          includeIntroduction: options.includeIntroduction,
          includeConclusion: options.includeConclusion,
          includeFAQ: options.includeFAQ,
          includeExamples: options.includeExamples,
          includeStatistics: options.includeStatistics,
          includeComparisons: options.includeComparisons,
          contentIntent: options.contentIntent,
          writingStyle: options.writingStyle,
          seoFocus: options.seoFocus,
          callToAction: options.callToAction,
          includeInternalLinks: options.includeInternalLinks,
          maxInternalLinks: options.maxInternalLinks,
          internalLinkDensity: options.internalLinkDensity,
          extraInstructions: [
            options.callToAction,
            entry.customPrompt,
            entry.additionalContext,
            entry.dos ? `Do: ${entry.dos}` : '',
            entry.donts ? `Don't: ${entry.donts}` : ''
          ].filter(Boolean).join('\n\n')
        };

        const contentService = (await import('./content.service')).default;
        const generated = await contentService.generateContent(userId, generationParams);

        results.push({
          keyword: topic,
          status: 'success',
          contentId: generated.contentId,
          title: generated.title,
          wordCount: generated.wordCount,
          creditsUsed: generated.creditsUsed
        });
      } catch (error: any) {
        logger.error(`Bulk generation failed for "${entry.keyword || entry.topic}":`, error.message);
        results.push({
          keyword: entry.keyword || entry.topic,
          status: 'error',
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;

    return {
      successful,
      failed,
      total: entries.length,
      totalCreditsUsed: results
        .filter(r => r.status === 'success')
        .reduce((sum, r) => sum + (r.creditsUsed || 0), 0),
      results
    };
  }

  /**
   * Simple bulk generation (all as drafts, no scheduling).
   */
  async generate(userId: string, keywords: string[], options: BulkOptions) {
    // Reuse generateAndSchedule with empty extra fields
    return this.generateAndSchedule(
      userId,
      keywords.map(k => ({ keyword: k })),
      options
    );
  }

  /**
   * ✅ Parse a CSV file and return a preview of rows.
   * Expected CSV columns: topic, keyword, tags, publish_date, doc_ids, dos, donts
   */
  async parseCSV(filePath: string): Promise<{
    rows: any[];
    totalRows: number;
    estimatedCredits: number;
    errors: string[];
  }> {
    return new Promise((resolve, reject) => {
      const rows: any[] = [];
      const errors: string[] = [];
      let rowCount = 0;

      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data: any) => {
          rowCount++;
          const topic = data.topic?.trim();
          const keyword = data.keyword?.trim() || topic;

          if (!topic && !keyword) {
            errors.push(`Row ${rowCount}: Missing both topic and keyword`);
            return; // skip this row
          }

          rows.push({
            topic: topic || keyword,
            keyword: keyword || topic,
            tags: data.tags?.trim() || '',
            publish_date: data.publish_date?.trim() || '',
            doc_ids: data.doc_ids?.trim() || '',
            dos: data.dos?.trim() || '',
            donts: data.donts?.trim() || ''
          });
        })
        .on('end', () => {
          // Clean up uploaded file
          fs.unlink(filePath, () => {});

          // Simple credit estimate (assume 1500 words, default model)
          const estimatedCredits = rows.length * aiService.calculateCreditsNeeded(1500, 'groq');

          resolve({
            rows,
            totalRows: rows.length,
            estimatedCredits,
            errors
          });
        })
        .on('error', (error: any) => {
          // Clean up file on error too
          fs.unlink(filePath, () => {});
          reject(error);
        });
    });
  }

  /**
   * ✅ Execute bulk generation from parsed CSV rows.
   * This is called after the user has previewed the CSV and confirmed.
   */
  async executeCSV(userId: string, rows: any[], options: BulkOptions) {
    const entries: BulkEntry[] = rows.map(row => ({
      keyword: row.keyword || row.topic,
      topic: row.topic,
      scheduledDate: row.publish_date || row.scheduledDate || undefined,
      docIds: row.doc_ids
        ? row.doc_ids.split('|').map((id: string) => id.trim()).filter(Boolean)
        : undefined,
      dos: row.dos || undefined,
      donts: row.donts || undefined,
      customPrompt: undefined,
      additionalContext: undefined
    }));

    return this.generateAndSchedule(userId, entries, options);
  }
}

export default new BulkContentService();