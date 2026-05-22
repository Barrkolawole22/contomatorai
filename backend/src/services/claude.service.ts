// backend/src/services/claude.service.ts - Claude 3.5 Sonnet via Anthropic API
import Anthropic from '@anthropic-ai/sdk';
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
  // same as in gemini.service.ts
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
}

export class ClaudeService {
  private client: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn('ANTHROPIC_API_KEY not set – Claude will not be available');
      return;
    }
    this.client = new Anthropic({ apiKey });
    logger.info('Anthropic service initialized (Claude 3.5 Sonnet)');
  }

  async generateBlogPost(
    keyword: string,
    options: ContentGenerationOptions = {}
  ): Promise<GeneratedContent> {
    if (!this.client) throw new Error('Claude service not available – missing API key');

    const targetWordCount = options.wordCount || 1500;
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) logger.info(`Claude retry attempt ${attempt}/${maxRetries}`);

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
        logger.warn(`Claude attempt ${attempt} failed: ${error.message}`);
        if (attempt === maxRetries) throw lastError;
      }
    }
    throw lastError || new Error('Claude content generation failed');
  }

  private async generateContent(
    keyword: string,
    options: ContentGenerationOptions,
    targetWordCount: number,
    attempt: number
  ): Promise<GeneratedContent> {
    const systemMessage = promptBuilder.buildSystemMessage();
    const userPrompt = promptBuilder.buildMasterPrompt(keyword, options, attempt);

    const response = await this.client!.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      system: systemMessage,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
    });

    // Claude response content block
    const contentBlock = response.content[0];
    if (!contentBlock || contentBlock.type !== 'text') {
      throw new Error('Claude did not return text');
    }
    let generatedText = contentBlock.text;

    if (generatedText.length < 200) {
      throw new Error('Generated content too short');
    }

    // Clean up any markdown wrapping
    generatedText = generatedText.replace(/```html\s*/gi, '').replace(/```/g, '');
    const parsed = this.parseContent(generatedText, keyword);
    const wordCount = this.countWords(parsed.content);
    logger.info(`Claude generated ${wordCount} words`);
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
    return { title, content: content.trim(), wordCount: this.countWords(content), summary: content.substring(0, 200) + '...' };
  }

  async checkService(): Promise<{ status: string; model: string }> {
    if (!this.client) throw new Error('Claude service not initialized');
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Test' }],
      });
      if (response.content[0]?.type === 'text') {
        return { status: 'operational', model: 'claude-3-5-sonnet-20241022' };
      }
      throw new Error('No text response');
    } catch (error: any) {
      throw new Error(`Claude check failed: ${error.message}`);
    }
  }
}

export default new ClaudeService();