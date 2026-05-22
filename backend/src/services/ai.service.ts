// backend/src/services/ai.service.ts - Updated Multi-Model Service
import logger from '../config/logger';
import geminiService from './gemini.service';
import openaiService from './openai.service';
import claudeService from './claude.service';

export type AIModel = 'gemini' | 'gemini-pro' | 'gpt4o' | 'claude';

// Model configuration with credit multipliers
export const MODEL_CONFIG = {
  gemini: {
    label: 'Fast',
    description: 'Gemini 2.5 Flash – quick, efficient generation',
    creditMultiplier: 1,
    service: geminiService,
    modelVariant: 'flash' as const,
    icon: '⚡',
    speed: 'fastest',
    quality: 'good'
  },
  'gemini-pro': {
    label: 'Balanced',
    description: 'Gemini 2.5 Pro + Google Search Grounding – well-researched content',
    creditMultiplier: 2,
    service: geminiService,
    modelVariant: 'pro' as const,
    enableGrounding: true,
    icon: '🌟',
    speed: 'fast',
    quality: 'better'
  },
  gpt4o: {
    label: 'Premium',
    description: 'GPT-4o – high quality, nuanced content',
    creditMultiplier: 3,
    service: openaiService,
    icon: '🧠',
    speed: 'moderate',
    quality: 'excellent'
  },
  claude: {
    label: 'Elite',
    description: 'Claude 3.5 Sonnet – deepest analysis and longest form',
    creditMultiplier: 5,
    service: claudeService,
    icon: '💎',
    speed: 'moderate',
    quality: 'best'
  }
} as const;

interface GenerationOptions {
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
  includeExternalLinks?: boolean;
  internalLinkSuggestions?: Array<{
    url: string;
    title: string;
    description?: string;
    relevanceScore?: number;
  }>;
  maxInternalLinks?: number;
  internalLinkDensity?: number;
}

export class AIService {
  constructor() {
    logger.info('AI Service initialized with multi-model support: Gemini, GPT-4o, Claude');
  }

  async generateBlogPost(
    keyword: string,
    model: AIModel = 'gemini',
    options: GenerationOptions = {}
  ): Promise<any> {
    const config = MODEL_CONFIG[model];
    if (!config) {
      throw new Error(`Invalid model: ${model}. Available models: ${Object.keys(MODEL_CONFIG).join(', ')}`);
    }

    const targetWordCount = options.wordCount || 1500;
    const estimatedCredits = Math.ceil(targetWordCount * config.creditMultiplier);

    logger.info(
      `Generating content with ${config.label} (${model}): ` +
      `${targetWordCount} words, ~${estimatedCredits} credits (${config.creditMultiplier}x multiplier)`
    );

    try {
      const startTime = Date.now();

      // Pass model-specific options
      const serviceOptions = { ...options };
     if (model === 'gemini' || model === 'gemini-pro') {
        (serviceOptions as any).modelVariant = (config as any).modelVariant;
        if (model === 'gemini-pro') {
          (serviceOptions as any).enableGrounding = true;
        }
      }

      const content = await config.service.generateBlogPost(keyword, serviceOptions);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const actualCredits = Math.ceil(content.wordCount * config.creditMultiplier);

      logger.info(
        `✅ SUCCESS: ${config.label} generated ${content.wordCount} words in ${duration}s ` +
        `(${actualCredits} credits used)`
      );

      return {
        ...content,
        model,
        modelName: config.label,
        creditsUsed: actualCredits,
        generationTime: parseFloat(duration)
      };
    } catch (error: any) {
      logger.error(`❌ ${config.label} failed: ${error.message}`);
      throw new Error(`Content generation failed with ${config.label}: ${error.message}`);
    }
  }

  getAvailableModels() {
    return Object.entries(MODEL_CONFIG).map(([key, config]) => ({
      id: key as AIModel,
      name: config.label,
      description: config.description,
      creditMultiplier: config.creditMultiplier,
      icon: config.icon,
      speed: config.speed,
      quality: config.quality,
      costPerWord: `${config.creditMultiplier}x`
    }));
  }

  calculateCreditsNeeded(wordCount: number, model: AIModel = 'gemini'): number {
    const multiplier = MODEL_CONFIG[model]?.creditMultiplier || 1;
    return Math.ceil(wordCount * multiplier);
  }

  getRecommendedModel(priority: 'speed' | 'quality' | 'cost'): AIModel {
    switch (priority) {
      case 'speed':
      case 'cost':
        return 'gemini';
      case 'quality':
        return 'claude';
      default:
        return 'gemini-pro';
    }
  }

  async checkService(): Promise<any> {
    const results = await Promise.allSettled([
      geminiService.checkService(),
      openaiService.checkService(),
      claudeService.checkService()
    ]);

    return {
      gemini: results[0].status === 'fulfilled'
        ? { ...results[0].value, model: 'gemini' }
        : { status: 'error', error: results[0].reason?.message, model: 'gemini' },
      openai: results[1].status === 'fulfilled'
        ? { ...results[1].value, model: 'gpt4o' }
        : { status: 'error', error: results[1].reason?.message, model: 'gpt4o' },
      claude: results[2].status === 'fulfilled'
        ? { ...results[2].value, model: 'claude' }
        : { status: 'error', error: results[2].reason?.message, model: 'claude' }
    };
  }

  validateCredits(userCredits: number, wordCount: number, model: AIModel): {
    valid: boolean;
    required: number;
    available: number;
    message?: string;
  } {
    const required = this.calculateCreditsNeeded(wordCount, model);
    const valid = userCredits >= required;

    return {
      valid,
      required,
      available: userCredits,
      message: valid
        ? undefined
        : `Insufficient credits. Need ${required.toLocaleString()} credits but have ${userCredits.toLocaleString()}`
    };
  }
}

export default new AIService();