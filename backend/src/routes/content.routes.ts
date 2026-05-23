// backend/src/routes/content.routes.ts
import express, { Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import Content from '../models/content.model';
import Site from '../models/site.model';
import User from '../models/user.model';
import logger from '../config/logger';
import aiService, { AIModel } from '../services/ai.service';

const router = express.Router();
router.use(authMiddleware);

const PRO_ONLY_MODELS: AIModel[] = ['claude'];
const PRO_PLANS = ['pro', 'agency', 'enterprise'];

const extractKeywords = (mainKeyword: string): string[] => {
  try {
    return [
      `${mainKeyword} guide`,
      `${mainKeyword} tips`,
      `how to ${mainKeyword}`,
    ];
  } catch {
    return [];
  }
};

const generateTags = (keyword: string): string[] => {
  try {
    const words = keyword.split(' ').filter(w => w.length > 0);
    return [...words, 'guide', 'tips', 'strategy']
      .slice(0, 5)
      .map(t => t.toLowerCase().trim())
      .filter((t, i, arr) => t.length > 0 && arr.indexOf(t) === i);
  } catch {
    return ['article', 'content'];
  }
};

const calculateSEOScore = (content: string, keyword: string): number => {
  if (!content || !keyword) return 0;
  const contentLower = content.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  let score = 0;
  if (contentLower.includes(keywordLower)) score += 25;
  const wordCount = content.replace(/<[^>]*>/g, ' ').split(/\s+/).length;
  if (wordCount >= 300) score += 25;
  if (/<h[1-6][^>]*>/i.test(content)) score += 25;
  const occurrences = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
  const density = (occurrences / wordCount) * 100;
  if (density >= 0.5 && density <= 3) score += 25;
  return Math.min(score, 100);
};

// GET /api/content
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const { status, siteId, page = '1', limit = '20', search } = req.query;
    const query: any = { userId };
    if (status) query.status = status;
    if (siteId) query.siteId = siteId;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { keyword: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const [contents, total] = await Promise.all([
      Content.find(query).populate('siteId', 'name url').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Content.countDocuments(query)
    ]);

    const transformedContents = contents.map(content => ({
      id: content._id.toString(),
      title: content.title,
      body: content.content,
      content: content.content,
      summary: content.content ? content.content.substring(0, 200) + '...' : '',
      type: content.type || 'article',
      status: content.status,
      keywords: content.keywords || [content.keyword],
      seoScore: content.seoScore || 75,
      wordpressPostId: content.publishedPostId?.toString(),
      publishedUrl: content.publishedUrl,
      publishedAt: content.publishedAt?.toISOString(),
      wordpressSite: content.wordpressSite,
      createdAt: content.createdAt.toISOString(),
      updatedAt: content.updatedAt.toISOString(),
      userId: content.userId,
      wordCount: content.wordCount,
      readingTime: content.readingTime,
      aiGenerated: content.aiGenerated || true,
      metadata: {
        metaTitle: content.title,
        metaDescription: content.content ? content.content.substring(0, 160) : '',
        focusKeyword: content.keyword
      },
      tags: content.tags || [],
      internalLinks: content.internalLinks || [],
      site: content.siteId ? {
        id: (content.siteId as any)._id,
        name: (content.siteId as any).name,
        url: (content.siteId as any).url
      } : null
    }));

    res.json({
      success: true,
      data: transformedContents,
      pagination: { current: pageNum, pages: Math.ceil(total / limitNum), total }
    });
  } catch (error: any) {
    logger.error('Error listing content:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contents' });
  }
});

// POST /api/content/generate
router.post('/generate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const { keyword, siteId, model = 'gemini', options = {} } = req.body;

    if (!keyword) { res.status(400).json({ success: false, message: 'Keyword is required' }); return; }

    const validModels: AIModel[] = ['gemini', 'gemini-pro', 'gpt4o', 'claude'];
    const selectedModel: AIModel = validModels.includes(model as AIModel) ? (model as AIModel) : 'gemini';

    const targetWordCount = options.wordCount || 1500;

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }

    // Plan-based model restriction
    if (PRO_ONLY_MODELS.includes(selectedModel)) {
      const userPlan = user.subscriptionPlan || user.subscription?.plan || 'free';
      if (!PRO_PLANS.includes(userPlan)) {
        res.status(403).json({
          success: false,
          message: `Claude Sonnet is available on Pro and Agency plans only. Your current plan is ${userPlan}.`
        });
        return;
      }
    }

    const creditsNeeded = aiService.calculateCreditsNeeded(targetWordCount, selectedModel);
    if (!user.hasWordCredits(creditsNeeded)) {
      res.status(403).json({
        success: false,
        message: `Insufficient word credits. You need ${creditsNeeded} credits but only have ${user.wordCredits} available.`,
        data: { required: creditsNeeded, available: user.wordCredits, shortfall: creditsNeeded - user.wordCredits }
      });
      return;
    }

    let resolvedSiteId = null;
    let siteInfo = null;
    if (siteId && siteId !== 'null' && siteId !== 'undefined' && siteId.toString().trim() !== '') {
      try {
        const site = await Site.findOne({ _id: siteId, owner: userId });
        if (site) {
          resolvedSiteId = site._id;
          siteInfo = { name: site.name, url: site.url };
        } else {
          res.status(400).json({ success: false, message: 'Invalid site ID provided or site not found' });
          return;
        }
      } catch {
        res.status(400).json({ success: false, message: 'Invalid site ID format' });
        return;
      }
    }

    // RAG context
    let knowledgeContext = '';
    const docIds: string[] = options.selectedDocIds || [];
    if (docIds.length > 0) {
      try {
        const knowledgebaseService = require('../services/knowledgebase.service').default;
        logger.info(`Retrieving RAG context for "${keyword}" from ${docIds.length} doc(s)`);
        knowledgeContext = await knowledgebaseService.retrieveContext(userId, docIds, keyword);
        if (knowledgeContext) logger.info(`RAG context retrieved: ${knowledgeContext.length} chars`);
      } catch (err: any) {
        logger.warn(`RAG retrieval failed (continuing without): ${err.message}`);
      }
    }

    const mergedContext = [knowledgeContext, options.additionalContext].filter(Boolean).join('\n\n---\n\n');

    logger.info(`Generating content with model: ${selectedModel}`);

    const generatedContent = await aiService.generateBlogPost(keyword, selectedModel, {
      tone: options.tone || 'professional',
      wordCount: targetWordCount,
      targetAudience: options.targetAudience || 'general audience',
      includeIntroduction: options.includeIntroduction !== false,
      includeConclusion: options.includeConclusion !== false,
      includeFAQ: options.includeFAQ || false,
      extraInstructions: options.extraInstructions,
      contentIntent: options.contentIntent || 'informational',
      customPrompt: options.customPrompt,
      additionalContext: mergedContext || undefined,
      writingStyle: options.writingStyle || 'conversational',
      seoFocus: options.seoFocus || 'balanced',
      callToAction: options.callToAction,
      includeStatistics: options.includeStatistics !== false,
      includeExamples: options.includeExamples !== false,
      includeComparisons: options.includeComparisons || false,
      targetKeywordDensity: options.targetKeywordDensity || 1.5,
      includeInternalLinks: options.includeInternalLinks,
      internalLinkSuggestions: options.internalLinkSuggestions,
      maxInternalLinks: options.maxInternalLinks,
      internalLinkDensity: options.internalLinkDensity,
      includeExternalLinks: options.includeExternalLinks || false,
    });

    const plainText = generatedContent.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const words = plainText.trim().split(/\s+/).filter(w => w.length > 0);
    const actualWordCount = words.length;

    const content = new Content({
      userId,
      siteId: resolvedSiteId,
      title: generatedContent.title,
      content: generatedContent.content,
      keyword,
      keywords: extractKeywords(keyword),
      type: 'article',
      status: 'ready',
      wordCount: actualWordCount,
      readingTime: Math.ceil(actualWordCount / 200),
      aiGenerated: true,
      seoScore: calculateSEOScore(generatedContent.content, keyword),
      tags: generateTags(keyword)
    });

    await content.save();
    await user.deductWordCredits(actualWordCount);

    res.json({
      success: true,
      data: {
        id: content._id.toString(),
        title: content.title,
        content: content.content,
        body: content.content,
        summary: plainText.substring(0, 200) + '...',
        type: content.type,
        status: content.status,
        keywords: content.keywords,
        seoScore: content.seoScore,
        createdAt: content.createdAt.toISOString(),
        updatedAt: content.updatedAt.toISOString(),
        userId: content.userId,
        wordCount: content.wordCount,
        readingTime: content.readingTime,
        aiGenerated: content.aiGenerated,
        metadata: {
          metaTitle: content.title,
          metaDescription: plainText.substring(0, 160),
          focusKeyword: keyword
        },
        tags: content.tags,
        site: siteInfo
      },
      message: resolvedSiteId
        ? `Content generated and associated with ${siteInfo?.name}. ${actualWordCount} word credits used.`
        : `Content generated successfully. ${actualWordCount} word credits used.`,
      needsSite: !resolvedSiteId,
      billing: {
        wordsGenerated: actualWordCount,
        wordsCharged: actualWordCount,
        remainingCredits: user.wordCredits
      }
    });
  } catch (error: any) {
    logger.error('Content generation error:', error);
    let errorMessage = 'Failed to generate content. Please try again.';
    let statusCode = 500;
    if (error.message?.includes('Insufficient word credits')) { errorMessage = error.message; statusCode = 403; }
    else if (error.message?.includes('rate limit') || error.message?.includes('quota')) { errorMessage = 'AI service rate limit reached. Please try again in a moment.'; statusCode = 429; }
    else if (error.message?.includes('timeout')) { errorMessage = 'Content generation timed out. Please try with a shorter word count.'; statusCode = 504; }
    res.status(statusCode).json({ success: false, message: errorMessage, error: error.message });
  }
});

// POST /api/content/:id/associate-site
router.post('/:id/associate-site', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const { contentId, siteId } = req.body;
    if (!contentId || !siteId) { res.status(400).json({ success: false, message: 'Content ID and Site ID are required' }); return; }

    const site = await Site.findOne({ _id: siteId, owner: userId });
    if (!site) { res.status(404).json({ success: false, message: 'Site not found or unauthorized' }); return; }

    const content = await Content.findOne({ _id: contentId, userId });
    if (!content) { res.status(404).json({ success: false, message: 'Content not found or unauthorized' }); return; }

    content.siteId = siteId;
    await content.save();

    res.json({ success: true, message: 'Content associated with site successfully', data: { contentId: content._id, siteId: site._id, siteName: site.name } });
  } catch (error: any) {
    logger.error('Associate content with site error:', error);
    res.status(500).json({ success: false, message: 'Failed to associate content with site' });
  }
});

// GET /api/content/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const content = await Content.findOne({ _id: req.params.id, userId }).populate('siteId', 'name url');
    if (!content) { res.status(404).json({ success: false, message: 'Content not found' }); return; }

    const plainText = content.content ? content.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '';

    res.json({
      success: true,
      data: {
        id: content._id.toString(),
        title: content.title,
        content: content.content,
        body: content.content,
        summary: plainText.substring(0, 200) + '...',
        type: content.type || 'article',
        status: content.status,
        keywords: content.keywords || [content.keyword],
        seoScore: content.seoScore || calculateSEOScore(content.content, content.keyword),
        wordpressPostId: content.publishedPostId?.toString(),
        publishedUrl: content.publishedUrl,
        publishedAt: content.publishedAt?.toISOString(),
        wordpressSite: content.wordpressSite,
        createdAt: content.createdAt.toISOString(),
        updatedAt: content.updatedAt.toISOString(),
        userId: content.userId,
        wordCount: content.wordCount,
        readingTime: content.readingTime,
        aiGenerated: content.aiGenerated || false,
        metadata: {
          metaTitle: content.title,
          metaDescription: plainText.substring(0, 160),
          focusKeyword: content.keyword
        },
        tags: content.tags || [],
        internalLinks: content.internalLinks || [],
        site: content.siteId ? {
          id: (content.siteId as any)._id,
          name: (content.siteId as any).name,
          url: (content.siteId as any).url
        } : null
      }
    });
  } catch (error: any) {
    logger.error('Get content by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch content' });
  }
});

// PUT /api/content/:id
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const { title, content: contentText, categories, tags, siteId } = req.body;
    const content = await Content.findOne({ _id: req.params.id, userId });
    if (!content) { res.status(404).json({ success: false, message: 'Content not found or unauthorized' }); return; }

    if (title) content.title = title;
    if (contentText) {
      content.content = contentText;
      const plainText = contentText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const words = plainText.trim().split(/\s+/).filter((w: string) => w.length > 0);
      content.wordCount = words.length;
      content.readingTime = Math.ceil(words.length / 200);
      content.seoScore = calculateSEOScore(contentText, content.keyword);
    }
    if (categories) content.categories = Array.isArray(categories) ? categories : [categories];
    if (tags) content.tags = Array.isArray(tags) ? tags : [tags];
    if (siteId !== undefined) content.siteId = siteId || null;

    await content.save();

    const plainText = content.content ? content.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '';

    res.json({
      success: true,
      data: {
        id: content._id.toString(),
        title: content.title,
        content: content.content,
        body: content.content,
        summary: plainText.substring(0, 200) + '...',
        type: content.type,
        status: content.status,
        keywords: content.keywords || [content.keyword],
        seoScore: content.seoScore,
        updatedAt: content.updatedAt.toISOString(),
        wordCount: content.wordCount,
        readingTime: content.readingTime,
        metadata: {
          metaTitle: content.title,
          metaDescription: plainText.substring(0, 160),
          focusKeyword: content.keyword
        },
        tags: content.tags || [],
        internalLinks: content.internalLinks || []
      },
      message: 'Content updated successfully'
    });
  } catch (error: any) {
    logger.error('Update content error:', error);
    res.status(500).json({ success: false, message: 'Failed to update content' });
  }
});

// DELETE /api/content/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const content = await Content.findOne({ _id: req.params.id, userId });
    if (!content) { res.status(404).json({ success: false, message: 'Content not found or unauthorized' }); return; }

    await Content.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Content deleted successfully' });
  } catch (error: any) {
    logger.error('Delete content error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete content' });
  }
});

// POST /api/content/:id/publish
router.post('/:id/publish', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const content = await Content.findOne({ _id: req.params.id, userId }).populate('siteId');
    if (!content) { res.status(404).json({ success: false, message: 'Content not found' }); return; }

    const { siteId } = req.body;
    let targetSiteId = content.siteId;

    if (siteId) {
      const requestedSite = await Site.findOne({ _id: siteId, owner: userId });
      if (!requestedSite) { res.status(400).json({ success: false, message: 'Invalid site ID or site not found' }); return; }
      targetSiteId = requestedSite._id as any;
      content.siteId = targetSiteId;
      await content.save();
    }

    if (!targetSiteId) {
      res.status(400).json({ success: false, message: 'Content must be associated with a WordPress site before publishing', needsSite: true });
      return;
    }

    const site = await Site.findById(targetSiteId).select('+applicationPassword');
    if (!site) { res.status(400).json({ success: false, message: 'WordPress site not found' }); return; }

    const wordpressService = require('../services/wordpress.service').default;
    const wordpressTags = content.tags?.length ? content.tags.map((t: string) => String(t).trim()).filter(Boolean) : [];

    const publishResult = await wordpressService.publishContent(site, content, {
      status: 'publish',
      tags: wordpressTags,
      categories: content.categories || []
    });

    if (!publishResult.success) {
      const errorMessage = typeof publishResult.error === 'object'
        ? JSON.stringify(publishResult.error)
        : String(publishResult.error || 'Unknown error');
      res.status(500).json({ success: false, message: errorMessage });
      return;
    }

    content.status = 'published';
    content.publishedPostId = publishResult.postId;
    content.publishedUrl = publishResult.postUrl;
    content.publishDate = new Date();
    content.publishedAt = new Date();
    content.wordpressSite = site.name;
    await content.save();

    res.json({
      success: true,
      data: {
        contentId: content._id.toString(),
        wordpressPostId: publishResult.postId,
        wordpressUrl: publishResult.postUrl,
        editUrl: publishResult.editUrl,
        status: content.status,
        publishedAt: content.publishedAt?.toISOString(),
        siteName: site.name,
        site: { name: (content.siteId as any).name, url: (content.siteId as any).url }
      },
      message: `Content published successfully to ${(content.siteId as any).name}`
    });
  } catch (error: any) {
    logger.error('Publish content error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to publish content' });
  }
});

export default router;