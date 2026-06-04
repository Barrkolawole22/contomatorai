// backend/src/services/openai.service.ts - GPT-4o via OpenAI API
import OpenAI from 'openai';
import { env } from '../config/env';
import logger from '../config/logger';
import promptBuilder from './prompt-builder.service';
import type { ContentMode, ImpactFormat } from './prompt-builder.service';

interface GeneratedContent {
  title: string;
  content: string;
  wordCount: number;
  summary?: string;
}

interface ContentGenerationOptions {
  contentMode?: ContentMode;
  impactFormat?: ImpactFormat;
  niche?: string;

  tone?: string;
  writingStyle?: 'conversational' | 'academic' | 'journalistic' | 'technical' | 'creative';

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
  seoFocus?: 'primary_keyword' | 'semantic_keywords' | 'long_tail' | 'balanced';
  callToAction?: string;
  includeStatistics?: boolean;
  includeExamples?: boolean;
  includeComparisons?: boolean;
  targetKeywordDensity?: number;
  includeInternalLinks?: boolean;
  includeExternalLinks?: boolean;
  sourceUrl?: string;
  sourceName?: string;
  articleImages?: Array<{ url: string; alt: string }>;
  internalLinkSuggestions?: Array<{
    url: string;
    title: string;
    description?: string;
    relevanceScore?: number;
  }>;
  maxInternalLinks?: number;
  internalLinkDensity?: number;
}

export class OpenAIService {
  private client: OpenAI | null = null;

  constructor() {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn('OPENAI_API_KEY not set – GPT-4o will not be available');
      return;
    }
    this.client = new OpenAI({ apiKey });
    logger.info('OpenAI service initialized (GPT-4o)');
  }

  async generateBlogPost(
    keyword: string,
    options: ContentGenerationOptions = {}
  ): Promise<GeneratedContent> {
    if (!this.client) throw new Error('OpenAI service not available – missing API key');

    const targetWordCount = options.wordCount || 1500;
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) logger.info(`OpenAI retry attempt ${attempt}/${maxRetries}`);

        const content = await this.generateContent(keyword, options, targetWordCount, attempt);

        if (options.includeInternalLinks && options.internalLinkSuggestions?.length) {
          const validation = promptBuilder.validateInternalLinks(content.content, options.internalLinkSuggestions);
          if (!validation.valid && attempt < maxRetries) {
            logger.warn(`Internal link validation failed: ${validation.issues.join(', ')}`);
            throw new Error('Internal links not properly included');
          }
        }

        return content;
      } catch (error: any) {
        lastError = error;
        logger.warn(`OpenAI attempt ${attempt} failed: ${error.message}`);
        if (attempt === maxRetries) throw lastError;
      }
    }
    throw lastError || new Error('OpenAI content generation failed');
  }

  private async generateContent(
    keyword: string,
    options: ContentGenerationOptions,
    targetWordCount: number,
    attempt: number
  ): Promise<GeneratedContent> {
    const systemMessage = promptBuilder.buildSystemMessage();
    const userPrompt = promptBuilder.buildMasterPrompt(keyword, options, attempt);

    const response = await this.client!.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 8192,
    });

    const generatedText = response.choices[0]?.message?.content;
    if (!generatedText || generatedText.length < 200) {
      throw new Error('Generated content too short');
    }

    const cleanedText = generatedText.replace(/```html\s*/gi, '').replace(/```/g, '');
    const parsed = this.parseContent(cleanedText, keyword);
    const wordCount = this.countWords(parsed.content);
    logger.info(`OpenAI generated ${wordCount} words`);
    return { ...parsed, wordCount };
  }

  private countWords(text: string): number {
    const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    return plainText.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  private parseContent(text: string, keyword: string): GeneratedContent {
    const h1Match = text.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = h1Match ? h1Match[1].replace(/<[^>]*>/g, '').trim() : keyword;
    let content = text;
    if (h1Match) content = text.replace(h1Match[0], '').trim();
    if (!content.includes('<h1>') && !content.includes('<h2>') && !content.includes('<p>')) {
      content = `<h1>${title}</h1>\n\n` + content.split('\n').filter(p => p.trim()).map(p => `<p>${p}</p>`).join('\n');
    }
    return {
      title,
      content: content.trim(),
      wordCount: this.countWords(content),
      summary: content.substring(0, 200) + '...'
    };
  }

  async checkService(): Promise<{ status: string; model: string }> {
    if (!this.client) throw new Error('OpenAI service not initialized');
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 5,
      });
      if (response.choices[0]?.message?.content) {
        return { status: 'operational', model: 'gpt-4o' };
      }
      throw new Error('No response');
    } catch (error: any) {
      throw new Error(`OpenAI check failed: ${error.message}`);
    }
  }
}

export default new OpenAIService();