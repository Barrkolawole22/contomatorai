import Content from '../models/content.model';
import User from '../models/user.model';
import aiService, { AIModel, MODEL_CONFIG } from './ai.service';
import { ContentGenerationParams, GeneratedContent, ContentData } from '../types/content.types';
import { PaginationParams, PaginationResult } from '../types/api.types';
import logger from '../config/logger';

export class ContentService {
  async generateContent(userId: string, params: ContentGenerationParams): Promise<any> {
    try {
      const p: any = params; // cast once, use everywhere

      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const selectedModel: AIModel = (p.model as AIModel) || 'groq';
      if (!MODEL_CONFIG[selectedModel]) {
        throw new Error(`Invalid model: ${selectedModel}. Available: groq, gemini, claude`);
      }

      const modelConfig = MODEL_CONFIG[selectedModel];
      const targetWordCount = p.wordCount || 1500;
      const estimatedCredits = aiService.calculateCreditsNeeded(targetWordCount, selectedModel);

      const creditValidation = aiService.validateCredits(
        (user as any).wordCredits || (user as any).credits || 0,
        targetWordCount,
        selectedModel
      );

      if (!creditValidation.valid) {
        throw new Error(
          `Insufficient credits. You need ${estimatedCredits.toLocaleString()} credits ` +
          `for ${targetWordCount.toLocaleString()} words with ${modelConfig.name} ` +
          `(${modelConfig.creditMultiplier}x multiplier) but only have ` +
          `${((user as any).wordCredits || (user as any).credits || 0).toLocaleString()} credits available.`
        );
      }

      const generationOptions = {
        tone: p.tone,
        wordCount: p.wordCount,
        targetAudience: p.targetAudience,
        includeIntroduction: p.includeIntroduction,
        includeConclusion: p.includeConclusion,
        includeFAQ: p.includeFAQ,
        contentIntent: p.contentIntent,
        customPrompt: p.customPrompt,
        additionalContext: p.additionalContext,
        writingStyle: p.writingStyle,
        seoFocus: p.seoFocus,
        callToAction: p.callToAction,
        includeStatistics: p.includeStatistics,
        includeExamples: p.includeExamples,
        includeComparisons: p.includeComparisons,
        targetKeywordDensity: p.targetKeywordDensity,
        extraInstructions: [p.extraInstructions, p.customPrompt, p.additionalContext].filter(Boolean).join('\n\n')
      };

      const topic = p.keywords?.[0] || p.keyword || 'blog post';
      const generatedContent: any = await aiService.generateBlogPost(topic, selectedModel, generationOptions);
      const readingTime = Math.ceil(generatedContent.wordCount / 200);
      const metaTitle = generatedContent.title || `${topic} - Complete Guide`;
      const metaDescription = generatedContent.summary || generatedContent.content.substring(0, 160).replace(/<[^>]*>/g, '');
      const slug = this.generateSlug(generatedContent.title || topic);

      const content = new Content({
        userId,
        title: generatedContent.title,
        content: generatedContent.content,
        excerpt: generatedContent.summary || generatedContent.content.substring(0, 200).replace(/<[^>]*>/g, ''),
        keywords: p.keywords || [topic],
        metaTitle,
        metaDescription,
        slug,
        type: p.type || 'blog',
        tone: p.tone || 'professional',
        readingTime,
        wordCount: generatedContent.wordCount,
        status: 'draft',
        model: selectedModel,
        siteId: p.siteId || null,
      });

      await content.save();

      const actualCreditsUsed = generatedContent.creditsUsed ||
        aiService.calculateCreditsNeeded(generatedContent.wordCount, selectedModel);

      const userCredits = (user as any).wordCredits || (user as any).credits || 0;
      if (userCredits < actualCreditsUsed) {
        await Content.findByIdAndDelete(content._id);
        throw new Error(`Insufficient credits for generated content.`);
      }

      const deducted = await (user as any).deductWordCredits(actualCreditsUsed, content._id.toString(), 'generation');
      if (!deducted) {
        await Content.findByIdAndDelete(content._id);
        throw new Error('Failed to deduct credits. Please try again.');
      }

      return {
        title: generatedContent.title,
        content: generatedContent.content,
        wordCount: generatedContent.wordCount,
        summary: generatedContent.summary,
        readingTime,
        metaTitle,
        metaDescription,
        slug,
        contentId: content._id.toString(),
        creditsUsed: actualCreditsUsed,
        model: selectedModel,
        modelName: modelConfig.name,
        generationTime: generatedContent.generationTime
      };
    } catch (error: any) {
      logger.error('Error generating content:', error);
      throw error;
    }
  }

  private generateSlug(title: string): string {
    return title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  }

  async getContent(userId: string, params: PaginationParams & { status?: string; type?: string; search?: string; model?: string }): Promise<PaginationResult<any>> {
    try {
      const { page = 1, limit = 10, sort = 'createdAt', order = 'desc', status, type, search, model } = params as any;
      const query: any = { userId };
      if (status) query.status = status;
      if (type) query.type = type;
      if (model) query.model = model;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { keywords: { $in: [new RegExp(search, 'i')] } },
        ];
      }

      const skip = (page - 1) * limit;
      const total = await Content.countDocuments(query);
      const content = await Content.find(query).sort({ [sort]: order === 'desc' ? -1 : 1 }).skip(skip).limit(limit).lean();
      const pages = Math.ceil(total / limit);

      return {
        data: content,
        pagination: { page, limit, total, pages, hasNext: page < pages, hasPrev: page > 1 },
      };
    } catch (error) {
      logger.error('Error fetching content:', error);
      throw error;
    }
  }

  async getContentById(userId: string, contentId: string): Promise<any> {
    const content = await Content.findOne({ _id: contentId, userId });
    if (!content) throw new Error('Content not found');
    return content;
  }

  async updateContent(userId: string, contentId: string, updates: Partial<ContentData>): Promise<any> {
    const content = await Content.findOneAndUpdate(
      { _id: contentId, userId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!content) throw new Error('Content not found');
    return content;
  }

  async deleteContent(userId: string, contentId: string): Promise<void> {
    const content = await Content.findOneAndDelete({ _id: contentId, userId });
    if (!content) throw new Error('Content not found');
  }

  async duplicateContent(userId: string, contentId: string): Promise<any> {
    const originalContent = await this.getContentById(userId, contentId);
    const duplicatedContent = new Content({
      ...originalContent.toObject(),
      _id: undefined,
      title: `${originalContent.title} (Copy)`,
      slug: `${originalContent.slug}-copy-${Date.now()}`,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await duplicatedContent.save();
    return duplicatedContent;
  }

  async getContentStats(userId: string): Promise<any> {
    const [total, published, draft, scheduled, wordStats, modelStats] = await Promise.all([
      Content.countDocuments({ userId }),
      Content.countDocuments({ userId, status: 'published' }),
      Content.countDocuments({ userId, status: 'draft' }),
      Content.countDocuments({ userId, status: 'scheduled' }),
      Content.aggregate([{ $match: { userId } }, { $group: { _id: null, totalWords: { $sum: '$wordCount' }, averageReadingTime: { $avg: '$readingTime' } } }]),
      Content.aggregate([{ $match: { userId } }, { $group: { _id: '$model', count: { $sum: 1 }, totalWords: { $sum: '$wordCount' } } }])
    ]);

    const modelUsage: any = { groq: 0, gemini: 0, claude: 0 };
    const creditsUsedByModel: any = { groq: 0, gemini: 0, claude: 0 };

    modelStats.forEach((stat: any) => {
      if (stat._id && modelUsage.hasOwnProperty(stat._id)) {
        modelUsage[stat._id] = stat.count;
        creditsUsedByModel[stat._id] = Math.ceil(stat.totalWords * MODEL_CONFIG[stat._id as AIModel].creditMultiplier);
      }
    });

    return {
      total, published, draft, scheduled,
      totalWords: wordStats[0]?.totalWords || 0,
      averageReadingTime: Math.round(wordStats[0]?.averageReadingTime || 0),
      modelUsage,
      creditsUsed: { total: Object.values(creditsUsedByModel).reduce((a: any, b: any) => a + b, 0), byModel: creditsUsedByModel }
    };
  }

  getAvailableModels() { return aiService.getAvailableModels(); }
  calculateCreditsNeeded(wordCount: number, model: AIModel = 'groq') { return aiService.calculateCreditsNeeded(wordCount, model); }
  getRecommendedModel(priority: 'speed' | 'quality' | 'cost') { return aiService.getRecommendedModel(priority); }
}

export default new ContentService();