// backend/src/services/ai.service.ts - Updated Multi-Model Service
import logger from '../config/logger';
import groqService from './groq.service';
import geminiService from './gemini.service';
import claudeService from './claude.service';

export type AIModel = 'groq' | 'gemini' | 'claude';

// Model configuration with credit multipliers
export const MODEL_CONFIG = {
  groq: {
    name: 'Fast Generation',
    description: 'Quick and efficient content generation with Llama 3.3 70B',
    creditMultiplier: 1,
    service: groqService,
    icon: '⚡',
    speed: 'fastest',
    quality: 'good'
  },
  gemini: {
    name: 'Balanced',
    description: 'Good quality with moderate speed using Google Gemini Pro',
    creditMultiplier: 2,
    service: geminiService,
    icon: '⭐',
    speed: 'fast',
    quality: 'better'
  },
  claude: {
    name: 'Premium Quality',
    description: 'Highest quality and most detailed content with Claude Sonnet 4.5',
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
}

export class AIService {
  constructor() {
    logger.info('AI Service initialized with multi-model support: Groq, Gemini, Claude');
  }

  /**
   * Generate blog post content using selected AI model
   * @param keyword - Main keyword for the content
   * @param model - AI model to use (groq, gemini, or claude)
   * @param options - Content generation options
   * @returns Generated content with title, body, and word count
   */
  async generateBlogPost(
    keyword: string, 
    model: AIModel = 'groq',
    options: GenerationOptions = {}
  ): Promise<any> {
    // Validate model
    if (!MODEL_CONFIG[model]) {
      throw new Error(`Invalid model: ${model}. Available models: groq, gemini, claude`);
    }

    const modelConfig = MODEL_CONFIG[model];
    const targetWordCount = options.wordCount || 1500;
    const estimatedCredits = Math.ceil(targetWordCount * modelConfig.creditMultiplier);

    logger.info(
      `Generating content with ${modelConfig.name} (${model}): ` +
      `${targetWordCount} words, ~${estimatedCredits} credits (${modelConfig.creditMultiplier}x multiplier)`
    );

    try {
      const startTime = Date.now();
      
      // Generate content using selected model
      const content = await modelConfig.service.generateBlogPost(keyword, options);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const actualCredits = Math.ceil(content.wordCount * modelConfig.creditMultiplier);

      logger.info(
        `✅ SUCCESS: ${modelConfig.name} generated ${content.wordCount} words in ${duration}s ` +
        `(${actualCredits} credits used)`
      );

      return {
        ...content,
        model,
        modelName: modelConfig.name,
        creditsUsed: actualCredits,
        generationTime: parseFloat(duration)
      };
    } catch (error: any) {
      logger.error(`❌ ${modelConfig.name} failed: ${error.message}`);
      throw new Error(
        `Content generation failed with ${modelConfig.name}: ${error.message}`
      );
    }
  }

  /**
   * Get available models with their configurations
   * @returns List of available models with details
   */
  getAvailableModels() {
    return Object.entries(MODEL_CONFIG).map(([key, config]) => ({
      id: key as AIModel,
      name: config.name,
      description: config.description,
      creditMultiplier: config.creditMultiplier,
      icon: config.icon,
      speed: config.speed,
      quality: config.quality,
      costPerWord: `${config.creditMultiplier}x`,
      recommended: key === 'groq' // Default recommendation
    }));
  }

  /**
   * Calculate credits needed for a generation
   * @param wordCount - Target word count
   * @param model - AI model to use
   * @returns Estimated credits needed
   */
  calculateCreditsNeeded(wordCount: number, model: AIModel = 'groq'): number {
    const multiplier = MODEL_CONFIG[model]?.creditMultiplier || 1;
    return Math.ceil(wordCount * multiplier);
  }

  /**
   * Get model recommendation based on user needs
   * @param priority - User priority: 'speed', 'quality', or 'cost'
   * @returns Recommended model
   */
  getRecommendedModel(priority: 'speed' | 'quality' | 'cost'): AIModel {
    switch (priority) {
      case 'speed':
      case 'cost':
        return 'groq';
      case 'quality':
        return 'claude';
      default:
        return 'gemini';
    }
  }

  /**
   * Check health status of all AI services
   * @returns Status object for each service
   */
  async checkService(): Promise<any> {
    const results = await Promise.allSettled([
      groqService.checkService(),
      geminiService.checkService(),
      claudeService.checkService()
    ]);

    return {
      groq: results[0].status === 'fulfilled' 
        ? { ...results[0].value, model: 'groq' }
        : { status: 'error', error: results[0].reason?.message, model: 'groq' },
      gemini: results[1].status === 'fulfilled' 
        ? { ...results[1].value, model: 'gemini' }
        : { status: 'error', error: results[1].reason?.message, model: 'gemini' },
      claude: results[2].status === 'fulfilled' 
        ? { ...results[2].value, model: 'claude' }
        : { status: 'error', error: results[2].reason?.message, model: 'claude' }
    };
  }

  /**
   * Validate if user has sufficient credits for generation
   * @param userCredits - Available user credits
   * @param wordCount - Target word count
   * @param model - Selected model
   * @returns Validation result
   */
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
        : `Insufficient credits. Need ${required.toLocaleString()} credits but only have ${userCredits.toLocaleString()}`
    };
  }
}

export default new AIService();