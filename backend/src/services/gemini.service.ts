// backend/src/services/gemini.service.ts
// UPDATED VERSION — proper retry-after handling + meta description support

import { GoogleGenerativeAI, Tool } from '@google/generative-ai';
import { env } from '../config/env';
import logger from '../config/logger';
import promptBuilder from './prompt-builder.service';

interface GeneratedContent {
  title: string;
  content: string;
  wordCount: number;
  summary?: string;
}

interface ContentGenerationOptions {
  tone?: string;
  wordCount?: number;
  targetAudience?: string;
  includeHeadings?: boolean;
  includeIntroduction?: boolean;
  includeConclusion?: boolean;
  includeFAQ?: boolean;
  extraInstructions?: string;
  contentIntent?: 'informational' | 'navigational' | 'commercial' | 'transactional';
  customPrompt?: string;
  additionalContext?: string;
  writingStyle?: 'conversational' | 'academic' | 'journalistic' | 'technical' | 'creative';
  seoFocus?: 'primary_keyword' | 'semantic_keywords' | 'long_tail' | 'balanced';
  callToAction?: string;
  includeStatistics?: boolean;
  includeExamples?: boolean;
  includeComparisons?: boolean;
  targetKeywordDensity?: number;
  includeInternalLinks?: boolean;
  internalLinkSuggestions?: Array<{
    url: string;
    title: string;
    description?: string;
    relevanceScore?: number;
  }>;
  maxInternalLinks?: number;
  internalLinkDensity?: number;

  // Grounding + model routing
  modelVariant?: 'flash' | 'pro';
  enableGrounding?: boolean;

  // External links
  includeExternalLinks?: boolean;
  sourceUrl?: string;
  sourceName?: string;
  articleImages?: Array<{ url: string; alt: string }>;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private apiKey: string | undefined;

  private readonly MODELS = {
    flash: 'gemini-2.5-flash',
    pro: 'gemini-2.5-pro',
  };

  constructor() {
    this.apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    logger.info('Gemini service initialized (Flash & Pro)');
  }

  async generateBlogPost(
    keyword: string,
    options: ContentGenerationOptions = {}
  ): Promise<GeneratedContent> {
    if (!this.genAI) {
      throw new Error('Gemini service not initialized');
    }

    const modelVariant = options.modelVariant || 'flash';
    const modelString = this.MODELS[modelVariant];

    // Only Pro supports grounding
    const enableGrounding = options.enableGrounding && modelVariant === 'pro';

    logger.info(`Using Gemini model: ${modelString}, grounding: ${enableGrounding ? 'on' : 'off'}`);

    const targetWordCount = options.wordCount || 1500;
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          logger.info(`Gemini retry attempt ${attempt}/${maxRetries}`);
        }

        const content = await this.generateContent(
          keyword,
          options,
          targetWordCount,
          attempt,
          modelString,
          enableGrounding ?? false
        );

        // Internal link validation
        if (options.includeInternalLinks && options.internalLinkSuggestions?.length) {
          const validation = promptBuilder.validateInternalLinks(
            content.content,
            options.internalLinkSuggestions
          );

          if (!validation.valid && attempt < maxRetries) {
            logger.warn(`Internal link validation failed: ${validation.issues.join(', ')}`);
            throw new Error('Internal links not properly included');
          }

          logger.info(
            `Internal links validated: ${validation.foundLinks}/${options.internalLinkSuggestions.length} links found`
          );
        }

        return content;
      } catch (error: any) {
        lastError = error;

        const retryDelayMs = this.extractRetryDelayMs(error);

        if (retryDelayMs > 0 && attempt < maxRetries) {
          logger.warn(
            `Gemini attempt ${attempt} failed (quota). Honouring retry-after: ${retryDelayMs}ms`
          );
          await this.delay(retryDelayMs);
        } else {
          logger.warn(`Gemini attempt ${attempt} failed: ${error.message}`);
        }

        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Gemini content generation failed after retries');
  }

  private extractRetryDelayMs(error: any): number {
    try {
      const msg: string = error?.message || '';

      const retryDelayMatch = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
      if (retryDelayMatch) {
        const seconds = parseFloat(retryDelayMatch[1]);
        return Math.ceil(seconds * 1000);
      }

      const retryAfter = error?.response?.headers?.['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000;
      }
    } catch {
      // swallow — not critical
    }
    return 0;
  }

  private async generateContent(
    keyword: string,
    options: ContentGenerationOptions,
    targetWordCount: number,
    attempt: number,
    modelString: string,
    enableGrounding: boolean
  ): Promise<GeneratedContent> {
    const generationConfig = {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    // Cast to Tool[] to satisfy SDK's strict union type while preserving runtime shape
    const tools: Tool[] | undefined = enableGrounding
      ? ([{ googleSearch: {} }] as unknown as Tool[])
      : undefined;

    const model = this.genAI!.getGenerativeModel({
      model: modelString,
      generationConfig,
      systemInstruction: promptBuilder.buildSystemMessage(),
      ...(tools ? { tools } : {}),
    });

    const prompt = promptBuilder.buildMasterPrompt(keyword, options, attempt);

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const generatedText = response.text();

      if (!generatedText || generatedText.length < 200) {
        throw new Error('Generated content too short - minimum 200 characters required');
      }

      if (this.detectQualityIssues(generatedText)) {
        logger.warn('Quality issues detected - cleaning content');
        const cleaned = this.cleanContent(generatedText);
        if (cleaned.length < 200) {
          throw new Error('Content quality too low after cleaning');
        }
      }

      const parsedContent = this.parseContent(generatedText, keyword);

      const validationIssues = this.validateContentQuality(parsedContent.content, targetWordCount);

      if (validationIssues.length > 0) {
        logger.warn('Content quality issues:', validationIssues);

        const criticalIssues = validationIssues.filter(
          issue =>
            issue.includes('too short') ||
            issue.includes('placeholder') ||
            issue.includes('incomplete')
        );

        if (criticalIssues.length > 0) {
          throw new Error(`Content quality failed: ${criticalIssues.join(', ')}`);
        }
      }

      const actualWords = this.countWords(parsedContent.content);
      if (actualWords > targetWordCount * 2) {
        logger.warn(`Content ${actualWords} words (target: ${targetWordCount}). Overlength but keeping.`);
      }

      logger.info(`Gemini generated ${parsedContent.wordCount} words`);
      return parsedContent;
    } catch (error: any) {
      logger.error(`Gemini generation error: ${error.message}`);
      throw new Error(`Gemini failed: ${error.message}`);
    }
  }

  private validateContentQuality(content: string, targetWordCount: number): string[] {
    const issues: string[] = [];
    const wordCount = this.countWords(content);

    if (wordCount < targetWordCount * 0.3) {
      issues.push(`Content too short: ${wordCount} words (target: ${targetWordCount})`);
    }

    if (content.includes('[continue') || content.includes('[insert')) {
      issues.push('Contains placeholder text');
    }

    if (content.includes('&lt;') || content.includes('&gt;') || content.includes('&amp;')) {
      issues.push('Contains broken HTML entities');
    }

    if (wordCount < targetWordCount * 0.5) {
      const lastPara = content.trim().split(/\n/).pop() || '';
      const lastText = lastPara.replace(/<[^>]*>/g, '').trim();
      if (lastText && !lastText.match(/[.!?]$/)) {
        issues.push('Content appears incomplete (no ending punctuation)');
      }
    }

    return issues;
  }

  private detectQualityIssues(text: string): boolean {
    const words = text.toLowerCase().split(/\s+/);
    const wordFrequency = new Map<string, number>();

    for (const word of words) {
      if (word.length > 4) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }
    }

    const maxFrequency = Math.max(...Array.from(wordFrequency.values()));
    if (maxFrequency > 25) return true;

    const placeholderPatterns = [/\[continue.*?\]/i, /\[insert.*?\]/i, /\.{3,}/g];
    for (const pattern of placeholderPatterns) {
      if (pattern.test(text)) return true;
    }

    if (text.includes('&lt;') || text.includes('&gt;') || text.includes('&amp;')) {
      return true;
    }

    return false;
  }

  private cleanContent(text: string): string {
    text = text.replace(/\[continue.*?\]/gi, '');
    text = text.replace(/\[insert.*?\]/gi, '');
    text = text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    text = text.replace(/\.{4,}/g, '...');
    return text.trim();
  }

  private countWords(text: string): number {
    const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    return plainText
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0).length;
  }

  private parseContent(generatedText: string, keyword: string): GeneratedContent {
    const h1Match = generatedText.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = h1Match
      ? h1Match[1].replace(/<[^>]*>/g, '').trim()
      : this.generateFallbackTitle(keyword);

    let content = generatedText;
    if (h1Match) {
      content = generatedText.replace(h1Match[0], '').trim();
    }

    if (!content.includes('<h') && !content.includes('<p>')) {
      content = this.addBasicFormatting(content, title);
    }

    content = this.cleanHTML(content);

    if (!content.startsWith('<h1>')) {
      content = `<h1>${title}</h1>\n\n${content}`;
    }

    const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const words = plainText
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0);

    return {
      title,
      content: content.trim(),
      wordCount: words.length,
      summary: plainText.substring(0, 200).trim() + '...',
    };
  }

  private addBasicFormatting(text: string, title: string): string {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    const formatted = paragraphs.map(p => `<p>${p.trim()}</p>`).join('\n\n');
    return `<h1>${title}</h1>\n\n${formatted}`;
  }

  private cleanHTML(content: string): string {
    return content
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/>\s+</g, '>\n<')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private generateFallbackTitle(keyword: string): string {
    return (
      keyword
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') + ': Complete Guide'
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkService(): Promise<{ status: string; model: string }> {
    if (!this.genAI) {
      throw new Error('Gemini service not initialized');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: this.MODELS.flash });
      const result = await model.generateContent('Test');
      if ((await result.response).text()) {
        return { status: 'operational', model: this.MODELS.flash };
      }
      throw new Error('No response');
    } catch (error: any) {
      throw new Error(`Gemini check failed: ${error.message}`);
    }
  }
}

export default new GeminiService();