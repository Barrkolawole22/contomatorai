// backend/src/services/claude.service.ts - UPDATED WITH PROMPT BUILDER
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import logger from '../config/logger';
import promptBuilder from './prompt-builder.service'; // ✅ NEW: Centralized prompts

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
}

export class ClaudeService {
  private client: Anthropic | null = null;
  private apiKey: string | undefined;
  
  private readonly MODELS = {
    'sonnet-4.5': 'claude-sonnet-4-5-20250929',
    'opus-4.1': 'claude-opus-4-20250514',
    'haiku-3.5': 'claude-3-5-haiku-20241022'
  };

  private readonly MODEL_PRIORITY = [
    'sonnet-4.5',
    'opus-4.1',
    'haiku-3.5'
  ];

  constructor() {
    this.apiKey = (env as any).CLAUDE_API_KEY || (process.env as any).CLAUDE_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('CLAUDE_API_KEY is required');
    }
    
    this.client = new Anthropic({ apiKey: this.apiKey });
    logger.info('Claude service initialized with Claude Sonnet 4.5 (latest)');
  }

  async generateBlogPost(
    keyword: string, 
    options: ContentGenerationOptions = {}
  ): Promise<GeneratedContent> {
    if (!this.client) {
      throw new Error('Claude service not initialized');
    }

    logger.info(`Generating content with Claude Sonnet 4.5 for: ${keyword}`);

    const targetWordCount = options.wordCount || 1500;
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          logger.info(`Claude retry attempt ${attempt}/${maxRetries}`);
        }
        
        const content = await this.generateContent(keyword, options, targetWordCount, attempt);
        
        // ✅ Validate internal links if required
        if (options.includeInternalLinks && options.internalLinkSuggestions && options.internalLinkSuggestions.length > 0) {
          const validation = promptBuilder.validateInternalLinks(
            content.content,
            options.internalLinkSuggestions
          );
          
          if (!validation.valid && attempt < maxRetries) {
            logger.warn(`Internal link validation failed: ${validation.issues.join(', ')}`);
            throw new Error('Internal links not properly included');
          }
          
          logger.info(`Internal links validated: ${validation.foundLinks}/${options.internalLinkSuggestions.length} links found`);
        }
        
        return content;
      } catch (error: any) {
        lastError = error;
        logger.warn(`Claude attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error('Claude content generation failed after retries');
  }

  private async generateContent(
    keyword: string,
    options: ContentGenerationOptions,
    targetWordCount: number,
    attempt: number = 1
  ): Promise<GeneratedContent> {
    // ✅ USE CENTRALIZED PROMPT BUILDER
    const prompt = promptBuilder.buildMasterPrompt(keyword, options, attempt);

    const errors: string[] = [];
    
    for (const modelKey of this.MODEL_PRIORITY) {
      const modelId = this.MODELS[modelKey as keyof typeof this.MODELS];
      
      try {
        logger.info(`Using Claude model: ${modelKey} (${modelId})`);

        const generatedText = await this.generateWithModel(modelId, prompt, targetWordCount);
        
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
          
          const criticalIssues = validationIssues.filter(i => 
            i.includes('too short') || i.includes('placeholder') || i.includes('incomplete')
          );
          
          if (criticalIssues.length > 0) {
            throw new Error(`Content quality failed: ${criticalIssues.join(', ')}`);
          }
        }

        const actualWords = this.countWords(parsedContent.content);
        
        if (actualWords > targetWordCount * 1.5) {
          logger.warn(`Content ${actualWords} words (target: ${targetWordCount}). Truncating.`);
          parsedContent.content = this.smartTruncate(parsedContent.content, targetWordCount);
          parsedContent.wordCount = this.countWords(parsedContent.content);
        }
        
        logger.info(`Claude ${modelKey} generated ${parsedContent.wordCount} words`);
        
        return parsedContent;
      } catch (error: any) {
        const errorMsg = `${modelKey}: ${error.message}`;
        errors.push(errorMsg);
        logger.error(`Claude model ${modelKey} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error(`Claude failed: All models unavailable. ${errors.join('; ')}`);
  }

  private async generateWithModel(model: string, prompt: string, targetWordCount: number): Promise<string> {
    if (!this.client) throw new Error('Claude not initialized');

    const maxTokens = Math.min(
      Math.ceil(targetWordCount * 1.7),
      8000
    );

    const message = await this.client.messages.create({
      model: model,
      max_tokens: maxTokens,
      temperature: 0.7,
      system: promptBuilder.buildSystemMessage(), // ✅ Use centralized system message
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const textContent = message.content.find(block => block.type === 'text');
    return textContent && 'text' in textContent ? textContent.text : '';
  }

  // Keep all helper methods unchanged
  private validateContentQuality(content: string, targetWordCount: number): string[] {
    const issues: string[] = [];
    const wordCount = this.countWords(content);
    
    if (wordCount < targetWordCount * 0.4) {
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
    
    const h2Count = (content.match(/<h2/gi) || []).length;
    if (h2Count < 2) {
      issues.push(`Insufficient structure: only ${h2Count} H2 headings (need at least 2)`);
    }
    
    const pCount = (content.match(/<p>/gi) || []).length;
    if (pCount < 3) {
      issues.push(`Insufficient content: only ${pCount} paragraphs (need at least 3)`);
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
    if (maxFrequency > 25) {
      logger.warn(`Word appears ${maxFrequency} times - excessive repetition`);
      return true;
    }

    const placeholderPatterns = [
      /\[continue.*?\]/i,
      /\[insert.*?\]/i,
      /\.\.\.\s*\.\.\.\s*\.\.\./g,
    ];

    for (const pattern of placeholderPatterns) {
      if (pattern.test(text)) {
        logger.warn(`Detected placeholder pattern: ${pattern}`);
        return true;
      }
    }

    if (text.includes('&lt;') || text.includes('&gt;') || text.includes('&amp;')) {
      logger.warn('Detected broken HTML entities');
      return true;
    }

    return false;
  }

  private cleanContent(text: string): string {
    text = text.replace(/\[continue.*?\]/gi, '');
    text = text.replace(/\[insert.*?\]/gi, '');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/\.{4,}/g, '...');
    
    return text.trim();
  }

  private smartTruncate(content: string, targetWordCount: number): string {
    const paragraphs = content.split(/<\/p>/i);
    let truncated = '';
    let currentWords = 0;
    
    for (const para of paragraphs) {
      const paraWords = this.countWords(para);
      
      if (currentWords + paraWords <= targetWordCount * 1.2) {
        truncated += para + '</p>';
        currentWords += paraWords;
      } else {
        break;
      }
    }
    
    if (!truncated.includes('</h1>')) {
      const h1Match = content.match(/<h1[^>]*>.*?<\/h1>/i);
      if (h1Match) {
        truncated = h1Match[0] + '\n\n' + truncated;
      }
    }
    
    return truncated;
  }

  private countWords(text: string): number {
    const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const words = plainText.trim().split(/\s+/).filter(w => w.length > 0);
    return words.length;
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
    const words = plainText.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    return {
      title,
      content: content.trim(),
      wordCount,
      summary: plainText.substring(0, 200).trim() + '...'
    };
  }

  private addBasicFormatting(text: string, title: string): string {
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    let formatted = `<h1>${title}</h1>\n\n`;
    
    paragraphs.forEach((para, index) => {
      const trimmed = para.trim();
      if (!trimmed) return;
      
      if (trimmed.length < 80 && !trimmed.endsWith('.') && !trimmed.endsWith('?') && index > 0) {
        if (index < 3 || trimmed.includes(':')) {
          formatted += `<h2>${trimmed}</h2>\n\n`;
        } else {
          formatted += `<h3>${trimmed}</h3>\n\n`;
        }
      } 
      else if (trimmed.match(/^[-•*]\s/) || trimmed.match(/^\d+\.\s/)) {
        const isNumbered = trimmed.match(/^\d+\.\s/);
        const items = trimmed.split(/\n(?:[-•*]|\d+\.)\s/).filter(Boolean);
        
        formatted += isNumbered ? '<ol>\n' : '<ul>\n';
        items.forEach(item => {
          const cleanItem = item.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '').trim();
          if (cleanItem) {
            formatted += `  <li>${cleanItem}</li>\n`;
          }
        });
        formatted += isNumbered ? '</ol>\n\n' : '</ul>\n\n';
      } 
      else {
        formatted += `<p>${trimmed}</p>\n\n`;
      }
    });

    return formatted.trim();
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
    const capitalized = keyword.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return `${capitalized}: Complete Guide`;
  }

  async checkService(): Promise<{ status: string; models: string[] }> {
    if (!this.client) {
      throw new Error('Claude service not initialized');
    }

    try {
      const message = await this.client.messages.create({
        model: this.MODELS['sonnet-4.5'],
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Test' }]
      });

      if (message.content.length > 0) {
        return {
          status: 'operational',
          models: Object.keys(this.MODELS)
        };
      }
      
      throw new Error('No response from Claude');
    } catch (error: any) {
      logger.error('Claude service check failed:', error);
      throw new Error(`Claude check failed: ${error.message}`);
    }
  }
}

export default new ClaudeService();