// backend/src/services/openai.service.ts - COMPLETE FILE WITH ALL FORM SETTINGS
import OpenAI from 'openai';
import { env } from '../config/env';
import logger from '../config/logger';

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
}

export class OpenAIService {
  private openai: OpenAI | null = null;
  private apiKey: string | undefined;
  private readonly MODEL = 'gpt-4-turbo-preview';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    
    if (!this.apiKey || this.apiKey === 'your_openai_key_here' || this.apiKey.includes('sk-your-')) {
      logger.warn('OpenAI service disabled - no valid API key found');
      this.openai = null;
      return;
    }
    
    this.openai = new OpenAI({ apiKey: this.apiKey });
    logger.info(`OpenAI service initialized with ${this.MODEL}`);
  }

  async generateBlogPost(
    keyword: string, 
    options: ContentGenerationOptions = {}
  ): Promise<GeneratedContent> {
    if (!this.openai) {
      throw new Error('OpenAI service not available - API key not configured');
    }

    logger.info(`Generating content with OpenAI ${this.MODEL} for: ${keyword}`);

    const targetWordCount = options.wordCount || 1500;
    
    try {
      const content = await this.generateContent(keyword, options, targetWordCount);
      return content;
    } catch (error: any) {
      logger.error(`OpenAI generation error: ${error.message}`);
      
      if (error.code === 'insufficient_quota') {
        throw new Error('OpenAI API quota exceeded. Please check your billing.');
      } else if (error.code === 'invalid_api_key') {
        throw new Error('Invalid OpenAI API key.');
      }
      
      throw new Error(`OpenAI failed: ${error.message}`);
    }
  }

  private async generateContent(
    keyword: string,
    options: ContentGenerationOptions,
    targetWordCount: number
  ): Promise<GeneratedContent> {
    const prompt = this.buildComprehensivePrompt(keyword, options, targetWordCount);

    const maxTokens = Math.min(
      Math.ceil(targetWordCount * 3),
      8000
    );
    
    const apiParams = {
      model: this.MODEL,
      temperature: 0.7,
      max_tokens: maxTokens,
      top_p: 0.9,
      frequency_penalty: 0.3,
      presence_penalty: 0.1,
    };
    
    logger.info('🔍 DEBUG: API Parameters:', apiParams);
    console.log('🔍 DEBUG - Full Parameters:', JSON.stringify(apiParams, null, 2));
    
    const completion = await this.openai!.chat.completions.create({
      model: this.MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert content writer who creates engaging, well-structured, high-quality articles. Follow all user instructions precisely. Write naturally with proper flow and readability.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
      top_p: 0.9,
      frequency_penalty: 0.3,
      presence_penalty: 0.1,
    });

    let generatedText = completion.choices[0]?.message?.content || '';
    
    logger.info(`🔍 DEBUG: Received ${generatedText.length} characters`);
    console.log('🔍 DEBUG - Finish reason:', completion.choices[0]?.finish_reason);

    if (!generatedText || generatedText.length < 200) {
      throw new Error('Generated content too short');
    }

    if (this.hasQualityIssues(generatedText)) {
      logger.warn('Minor quality issues detected - applying light cleanup');
      generatedText = this.lightCleanup(generatedText);
    }

    const parsedContent = this.parseContent(generatedText, keyword);

    const actualWords = this.countWords(parsedContent.content);
    if (actualWords > targetWordCount * 2.5) {
      logger.warn(`Content ${actualWords} words (target: ${targetWordCount}). Truncating.`);
      parsedContent.content = this.smartTruncate(parsedContent.content, targetWordCount * 2);
      parsedContent.wordCount = this.countWords(parsedContent.content);
    }

    logger.info(`✅ Generated ${parsedContent.wordCount} words (target: ${targetWordCount})`);
    
    return parsedContent;
  }

  private buildComprehensivePrompt(
    keyword: string, 
    options: ContentGenerationOptions,
    targetWordCount: number
  ): string {
    const tone = options.tone || 'professional';
    const audience = options.targetAudience || 'general readers';
    const style = options.writingStyle || 'conversational';
    const intent = options.contentIntent || 'informational';
    const seoFocus = options.seoFocus || 'balanced';
    const keywordDensity = options.targetKeywordDensity || 1.5;

    let prompt = `Write a detailed, comprehensive article about "${keyword}" (aim for around ${targetWordCount} words).

**ARTICLE SPECIFICATIONS:**
Tone: ${tone}
Audience: ${audience}
Writing Style: ${style}
Content Purpose: ${this.getIntentDescription(intent)}
SEO Focus: ${seoFocus}
Target Keyword: "${keyword}"
Keyword Density: ${keywordDensity}%

**STRUCTURE:**
- Compelling H1 title
- Engaging introduction (hook + overview + what readers will learn)
- 5-7 substantial sections with descriptive H2 headings
- Each section should have 2-3 subsections with H3 headings`;

    if (options.includeStatistics !== false) {
      prompt += '\n- Include relevant statistics, data points, and research findings';
    }

    if (options.includeExamples !== false) {
      prompt += '\n- Provide 3-5 detailed real-world examples with specific scenarios';
    }

    if (options.includeComparisons) {
      prompt += '\n- Add comparison sections (pros/cons, before/after, alternatives)';
    }

    if (options.includeFAQ) {
      prompt += '\n- FAQ section with 5-7 common questions and detailed answers';
    }

    if (options.includeConclusion !== false) {
      prompt += '\n- Comprehensive conclusion summarizing 3-5 key takeaways';
    }

    if (options.callToAction) {
      prompt += `\n- End with this call-to-action: "${options.callToAction}"`;
    }

    prompt += `\n\n**SEO OPTIMIZATION:**`;
    if (seoFocus === 'primary_keyword') {
      prompt += `\n- Focus heavily on "${keyword}" throughout the article`;
      prompt += `\n- Use the keyword in title, introduction, headings, and conclusion`;
    } else if (seoFocus === 'semantic_keywords') {
      prompt += `\n- Use semantic variations and related terms naturally`;
      prompt += `\n- Include synonyms and contextually related phrases`;
    } else if (seoFocus === 'long_tail') {
      prompt += `\n- Target long-tail variations of "${keyword}"`;
      prompt += `\n- Address specific questions and detailed queries`;
    } else {
      prompt += `\n- Balance primary keyword "${keyword}" with natural variations`;
      prompt += `\n- Maintain ${keywordDensity}% keyword density naturally`;
    }

    if (options.customPrompt && options.customPrompt.trim()) {
      prompt += `\n\n**CUSTOM REQUIREMENTS:**\n${options.customPrompt.trim()}`;
    }

    if (options.additionalContext && options.additionalContext.trim()) {
      prompt += `\n\n**ADDITIONAL CONTEXT:**\n${options.additionalContext.trim()}`;
    }

    if (options.extraInstructions && options.extraInstructions.trim()) {
      prompt += `\n\n**EXTRA INSTRUCTIONS:**\n${options.extraInstructions.trim()}`;
    }

    prompt += `\n\n**FORMATTING & QUALITY:**
- Use HTML tags: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <ol>, <strong>
- Write with depth and detail - cover the topic thoroughly
- Use proper grammar and complete sentences throughout
- Maintain consistent quality from start to finish
- Write a complete, well-crafted conclusion (not rushed)
- NO placeholder text or incomplete sentences

Begin writing the comprehensive article now:`;

    return prompt;
  }

  private getIntentDescription(intent: string): string {
    const descriptions = {
      informational: 'Educational content that provides knowledge and answers questions',
      navigational: 'Content that helps users find specific information or resources',
      commercial: 'Content comparing products/services to influence purchasing decisions',
      transactional: 'Content designed to drive immediate action (purchases, sign-ups, conversions)'
    };
    return descriptions[intent as keyof typeof descriptions] || 'General informative content';
  }

  private hasQualityIssues(text: string): boolean {
    if (text.includes('[continue]') || text.includes('[insert')) return true;
    if (text.includes('&lt;') || text.includes('&gt;') || text.includes('&amp;')) return true;

    const words = text.toLowerCase().split(/\s+/);
    const wordFrequency = new Map<string, number>();
    
    for (const word of words) {
      if (word.length > 4) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }
    }

    const maxFrequency = Math.max(...Array.from(wordFrequency.values()));
    if (maxFrequency > 50) {
      logger.warn(`Extreme repetition: word appears ${maxFrequency} times`);
      return true;
    }

    return false;
  }

  private lightCleanup(text: string): string {
    text = text.replace(/\[continue.*?\]/gi, '');
    text = text.replace(/\[insert.*?\]/gi, '');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/\.{4,}/g, '...');
    return text.trim();
  }

  private smartTruncate(content: string, maxWords: number): string {
    const paragraphs = content.split(/<\/p>/i);
    let truncated = '';
    let currentWords = 0;
    
    for (const para of paragraphs) {
      const paraWords = this.countWords(para);
      if (currentWords + paraWords <= maxWords) {
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
    let cleanText = generatedText
      .replace(/^```html\s*/i, '')
      .replace(/\s*```$/g, '')
      .trim();

    const h1Match = cleanText.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = h1Match 
      ? h1Match[1].replace(/<[^>]*>/g, '').trim()
      : `${keyword.charAt(0).toUpperCase() + keyword.slice(1)}: Complete Guide`;

    let content = cleanText;
    if (h1Match) {
      content = cleanText.replace(h1Match[0], '').trim();
    }

    if (!content.includes('<h') && !content.includes('<p>')) {
      content = this.addBasicFormatting(content);
    }

    content = this.cleanHTML(content);

    if (!content.startsWith('<h1>')) {
      content = `<h1>${title}</h1>\n\n${content}`;
    }

    const wordCount = this.countWords(content);
    const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      title,
      content: content.trim(),
      wordCount,
      summary: plainText.substring(0, 200).trim() + '...'
    };
  }

  private addBasicFormatting(text: string): string {
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    let formatted = '';
    
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      
      if (trimmed.length < 100 && !trimmed.match(/[.!?]$/)) {
        formatted += `<h2>${trimmed}</h2>\n\n`;
      } 
      else if (trimmed.match(/^[-•*]\s/) || trimmed.includes('\n-')) {
        const items = trimmed.split(/\n[-•*]\s/).filter(Boolean);
        formatted += '<ul>\n';
        items.forEach(item => {
          const cleanItem = item.replace(/^[-•*]\s/, '').trim();
          if (cleanItem) {
            formatted += `  <li>${cleanItem}</li>\n`;
          }
        });
        formatted += '</ul>\n\n';
      }
      else if (trimmed.match(/^\d+\.\s/) || trimmed.includes('\n1.')) {
        const items = trimmed.split(/\n\d+\.\s/).filter(Boolean);
        formatted += '<ol>\n';
        items.forEach(item => {
          const cleanItem = item.replace(/^\d+\.\s/, '').trim();
          if (cleanItem) {
            formatted += `  <li>${cleanItem}</li>\n`;
          }
        });
        formatted += '</ol>\n\n';
      }
      else {
        formatted += `<p>${trimmed}</p>\n\n`;
      }
    }

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

  async checkService(): Promise<{ status: string; model: string }> {
    if (!this.openai) {
      throw new Error('OpenAI service not initialized');
    }

    try {
      await this.openai.chat.completions.create({
        model: this.MODEL,
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 10
      });
      
      return { status: 'operational', model: this.MODEL };
    } catch (error: any) {
      throw new Error(`OpenAI check failed: ${error.message}`);
    }
  }
}

export default new OpenAIService();