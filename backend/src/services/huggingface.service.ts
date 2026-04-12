// backend/src/services/huggingface.service.ts - FIXED VERSION
import { HfInference } from '@huggingface/inference';
import { env } from '../config/env';
import logger from '../config/logger';
import { PromptBuilder } from '../utils/prompt-builder';

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

export class HuggingFaceService {
  private hf: HfInference | null = null;
  private apiKey: string | undefined;
  
  private readonly MODELS = [
    'meta-llama/Meta-Llama-3.1-8B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.3',
    'google/flan-t5-xxl',
    'meta-llama/Meta-Llama-3.1-70B-Instruct'
  ];

  constructor() {
    this.apiKey = env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('HUGGINGFACE_API_KEY is required');
    }
    
    this.hf = new HfInference(this.apiKey);
    logger.info('HuggingFace service initialized with fallback model strategy');
  }

  async generateBlogPost(
    keyword: string, 
    options: ContentGenerationOptions = {}
  ): Promise<GeneratedContent> {
    if (!this.hf) {
      throw new Error('HuggingFace service not initialized');
    }

    logger.info(`Generating enhanced content with HuggingFace for: ${keyword}`);

    // BUILD COMPREHENSIVE PROMPT WITH ALL OPTIONS
    const prompt = PromptBuilder.buildComprehensivePrompt({
      keyword,
      tone: options.tone,
      wordCount: options.wordCount,
      targetAudience: options.targetAudience,
      contentIntent: options.contentIntent,
      writingStyle: options.writingStyle,
      includeIntroduction: options.includeIntroduction,
      includeConclusion: options.includeConclusion,
      includeFAQ: options.includeFAQ,
      includeStatistics: options.includeStatistics,
      includeExamples: options.includeExamples,
      includeComparisons: options.includeComparisons,
      callToAction: options.callToAction,
      customPrompt: options.customPrompt,
      additionalContext: options.additionalContext,
      extraInstructions: options.extraInstructions,
      seoFocus: options.seoFocus,
      targetKeywordDensity: options.targetKeywordDensity
    });

    const errors: string[] = [];

    for (const model of this.MODELS) {
      try {
        logger.info(`Trying HuggingFace model: ${model}`);

        const generatedText = await this.generateWithModel(model, prompt, options.wordCount || 1500);
        
        if (!generatedText || generatedText.length < 200) {
          throw new Error('Generated content too short - minimum 200 characters required');
        }

        const parsedContent = this.parseContent(
          generatedText, 
          keyword, 
          options.contentIntent || 'informational'
        );
        
        logger.info(`HuggingFace (${model}) generated ${parsedContent.wordCount} words with custom settings`);
        
        return parsedContent;
      } catch (error: any) {
        const errorMsg = `${model}: ${error.message}`;
        errors.push(errorMsg);
        logger.error(`HuggingFace model ${model} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error(`HuggingFace failed: All models unavailable. ${errors.join('; ')}`);
  }

  private async generateWithModel(
    model: string, 
    prompt: string, 
    targetWordCount: number
  ): Promise<string> {
    if (!this.hf) throw new Error('HF not initialized');

    let formattedPrompt = prompt;
    
    if (model.includes('llama')) {
      formattedPrompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are a world-class content strategist and expert writer with 10+ years of experience. Follow the detailed instructions provided exactly. Create exceptional, in-depth content that demonstrates genuine expertise. Write specific, actionable content with concrete examples. Avoid generic advice, template-based writing, and repetitive phrases. Every sentence must provide unique value.<|eot_id|><|start_header_id|>user<|end_header_id|>

${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;
    } else if (model.includes('mistral')) {
      formattedPrompt = `<s>[INST] You are a world-class content strategist and expert writer. ${prompt} [/INST]`;
    }

    const response = await this.hf.textGeneration({
      model: model,
      inputs: formattedPrompt,
      parameters: {
        max_new_tokens: Math.min(Math.max(targetWordCount * 2, 1000), 4000),
        temperature: 0.8,
        top_p: 0.95,
        top_k: 50,
        repetition_penalty: 1.15,
        return_full_text: false,
        do_sample: true,
        stop_sequences: ['<|eot_id|>', '</s>']
      }
    });

    return response.generated_text;
  }

  private parseContent(
    generatedText: string, 
    keyword: string, 
    intent: string
  ): GeneratedContent {
    const h1Match = generatedText.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = h1Match 
      ? h1Match[1].replace(/<[^>]*>/g, '').trim()
      : this.generateFallbackTitle(keyword, intent);

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
      
      if (trimmed.length < 80 && !trimmed.endsWith('.') && !trimmed.endsWith('?') && !trimmed.endsWith('!') && index > 0) {
        if (index < 3 || trimmed.includes(':') || trimmed.toUpperCase() === trimmed) {
          formatted += `<h2>${trimmed}</h2>\n\n`;
        } else {
          formatted += `<h3>${trimmed}</h3>\n\n`;
        }
      } 
      else if (trimmed.match(/^\d+\.\s/)) {
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
      else if (trimmed.match(/^[-•*]\s/)) {
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
      .replace(/<\|[^|]*\|>/g, '')
      .replace(/<s>|<\/s>/g, '')
      .replace(/\[INST\]|\[\/INST\]/g, '')
      .replace(/>\s+</g, '>\n<')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private generateFallbackTitle(keyword: string, intent: string): string {
    const capitalized = keyword.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    const titles: Record<string, string> = {
      informational: `${capitalized}: The Complete Expert Guide`,
      navigational: `Finding the Best ${capitalized}: Your Complete Resource`,
      commercial: `${capitalized} Comparison: Making the Right Choice`,
      transactional: `Get Started with ${capitalized}: Your Action Plan`
    };
    
    return titles[intent] || `${capitalized}: Everything You Need to Know`;
  }

  async checkService(): Promise<{ status: string; models: string[] }> {
    if (!this.hf) {
      throw new Error('HuggingFace service not initialized');
    }

    try {
      await this.hf.textGeneration({
        model: this.MODELS[0],
        inputs: 'Test',
        parameters: { max_new_tokens: 10 }
      });

      return {
        status: 'operational',
        models: this.MODELS
      };
    } catch (error: any) {
      logger.error('HuggingFace service check failed:', error);
      throw new Error(`HuggingFace check failed: ${error.message}`);
    }
  }
}

export default new HuggingFaceService();