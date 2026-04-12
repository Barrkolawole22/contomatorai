// backend/src/services/groq.service.ts - UPDATED WITH PROMPT BUILDER
import Groq from 'groq-sdk';
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

export class GroqService {
  private groq: Groq | null = null;
  private apiKey: string | undefined;
  
  private readonly MODELS = {
    'llama-70b': 'llama-3.3-70b-versatile',
    'llama-8b': 'llama-3.1-8b-instant'
  };

  private readonly MODEL_PRIORITY = [
    'llama-70b',
    'llama-8b'
  ];

  constructor() {
    this.apiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is required');
    }
    
    this.groq = new Groq({ apiKey: this.apiKey });
    logger.info('Groq service initialized with Llama 3.3 70B Versatile');
  }

  async generateBlogPost(
    keyword: string, 
    options: ContentGenerationOptions = {}
  ): Promise<GeneratedContent> {
    if (!this.groq) {
      throw new Error('Groq service not initialized');
    }

    logger.info(`Generating content with Groq for: ${keyword}`);

    const targetWordCount = options.wordCount || 1500;
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          logger.info(`Groq retry attempt ${attempt}/${maxRetries}`);
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
        logger.warn(`Groq attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error('Groq content generation failed after retries');
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
        logger.info(`Using Groq model: ${modelKey} (${modelId})`);

        const generatedText = await this.generateWithModel(modelId, prompt, targetWordCount);
        
        if (!generatedText || generatedText.length < 200) {
          throw new Error('Generated content too short - minimum 200 characters required');
        }

        if (this.detectWordSalad(generatedText)) {
          logger.warn('Quality issues detected - cleaning content');
          const cleaned = this.cleanWordSalad(generatedText);
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
        
        logger.info(`Groq ${modelKey} generated ${parsedContent.wordCount} words`);
        
        return parsedContent;
      } catch (error: any) {
        const errorMsg = `${modelKey}: ${error.message}`;
        errors.push(errorMsg);
        logger.error(`Groq model ${modelKey} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error(`Groq failed: All models unavailable. ${errors.join('; ')}`);
  }

  private async generateWithModel(model: string, prompt: string, targetWordCount: number): Promise<string> {
    if (!this.groq) throw new Error('Groq not initialized');

    const maxTokens = Math.min(
      Math.ceil(targetWordCount * 1.3),
      6000
    );

    const completion = await this.groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: promptBuilder.buildSystemMessage() // ✅ Use centralized system message
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: model,
      temperature: 0.6,
      max_tokens: maxTokens,
      top_p: 0.85,
      presence_penalty: 0.1,
      frequency_penalty: 0.3,
      stream: false
    });

    return completion.choices[0]?.message?.content || '';
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
    
    if (content.includes('& lt;') || content.includes('& gt;')) {
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

  private detectWordSalad(text: string): boolean {
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

    const sentences = text.split(/[.!?]+/);
    const hasLongRamble = sentences.some(s => s.split(/\s+/).length > 200);
    
    if (hasLongRamble) {
      logger.warn('Detected sentence with 200+ words - excessive rambling');
      return true;
    }

    const placeholderPatterns = [
      /\[continue.*?\]/i,
      /\[insert.*?\]/i,
      /\.\.\.\s*\.\.\.\s*\.\.\./g,
      /etcetera.*etcetera.*etcetera/gi,
    ];

    for (const pattern of placeholderPatterns) {
      if (pattern.test(text)) {
        logger.warn(`Detected placeholder pattern: ${pattern}`);
        return true;
      }
    }

    if (text.includes('& lt;') || text.includes('& gt;') || text.includes('& amp;')) {
      logger.warn('Detected broken HTML entities');
      return true;
    }

    const paragraphs = text.split(/\n+/);
    for (const para of paragraphs) {
      const noPunctuation = para.replace(/[.!?,;:]/g, '').trim();
      if (noPunctuation.split(/\s+/).length > 300) {
        logger.warn('Detected massive run-on paragraph without punctuation');
        return true;
      }
    }

    return false;
  }

  private cleanWordSalad(text: string): string {
    text = text.replace(/\[continue.*?\]/gi, '');
    text = text.replace(/\[insert.*?\]/gi, '');
    text = text.replace(/& lt;/g, '<');
    text = text.replace(/& gt;/g, '>');
    text = text.replace(/& amp;/g, '&');
    text = text.replace(/& quot;/g, '"');
    
    const paragraphs = text.split(/\n\n+/);
    const cleanParagraphs: string[] = [];
    let skippedCount = 0;
    
    for (const para of paragraphs) {
      const words = para.split(/\s+/);
      
      if (words.length > 300) {
        const hasPunctuation = /[.!?,;:]/.test(para);
        if (hasPunctuation) {
          logger.warn(`Long paragraph (${words.length} words) but has punctuation - keeping`);
          cleanParagraphs.push(para);
          continue;
        } else {
          logger.warn('Dropping paragraph with 300+ words and no punctuation');
          skippedCount++;
          if (skippedCount >= 2) break;
          continue;
        }
      }
      
      const hasPunctuation = /[.!?,;:]/.test(para);
      if (!hasPunctuation && words.length > 100) {
        logger.warn(`Dropping paragraph: ${words.length} words without punctuation`);
        skippedCount++;
        if (skippedCount >= 2) break;
        continue;
      }
      
      const uniqueWords = new Set(words.map(w => w.toLowerCase()));
      const uniqueRatio = uniqueWords.size / words.length;
      
      if (uniqueRatio < 0.25 && words.length > 50) {
        logger.warn(`Dropping paragraph with low unique word ratio: ${(uniqueRatio * 100).toFixed(1)}%`);
        skippedCount++;
        if (skippedCount >= 2) break;
        continue;
      }
      
      if (para.trim() === '...' || para.trim() === '…') {
        continue;
      }
      
      cleanParagraphs.push(para);
    }
    
    const result = cleanParagraphs.join('\n\n');
    
    const originalWords = this.countWords(text);
    const cleanedWords = this.countWords(result);
    
    if (cleanedWords < originalWords * 0.5) {
      logger.warn(`Cleaning removed ${originalWords - cleanedWords} words (${((1 - cleanedWords/originalWords) * 100).toFixed(0)}%) - too aggressive, using original`);
      return text;
    }
    
    return result;
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
    if (!this.groq) {
      throw new Error('Groq service not initialized');
    }

    try {
      await this.groq.chat.completions.create({
        messages: [{ role: 'user', content: 'Test' }],
        model: this.MODELS['llama-70b'],
        max_tokens: 10
      });

      return {
        status: 'operational',
        models: Object.keys(this.MODELS)
      };
    } catch (error: any) {
      logger.error('Groq service check failed:', error);
      throw new Error(`Groq check failed: ${error.message}`);
    }
  }
}

export default new GroqService();