// backend/src/controllers/content.controller.ts - Complete Fixed Version Using Service Layer
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import Content from '../models/content.model';
import Site from '../models/site.model';
import User from '../models/user.model';
import logger from '../config/logger';
import contentService from '../services/content.service';
import wordpressService from '../services/wordpress.service';

class ContentController {
  // List all content for user
  async listContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
        return;
      }

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

      const contents = await Content.find(query)
        .populate('siteId', 'name url')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      const total = await Content.countDocuments(query);

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
        publishedAt: content.publishedAt?.toISOString(), // ✅ Add publishing info
        publishedUrl: content.publishedUrl, // ✅ Add publishing info
        wordpressSite: content.wordpressSite, // ✅ Add publishing info
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
        site: content.siteId ? {
          id: (content.siteId as any)._id,
          name: (content.siteId as any).name,
          url: (content.siteId as any).url
        } : null
      }));

      res.json({
        success: true,
        data: transformedContents,
        pagination: {
          current: pageNum,
          pages: Math.ceil(total / limitNum),
          total
        }
      });
      return;
    } catch (error: any) {
      logger.error('Error listing content:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to fetch contents' 
      });
      return;
    }
  }

  // Generate content using ContentService
  async generateContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          message: 'Unauthorized' 
        });
        return;
      }

      const { keyword, siteId, model, options = {} } = req.body;

      if (!keyword) {
        res.status(400).json({ 
          success: false,
          message: 'Keyword is required' 
        });
        return;
      }

      // Validate site if provided
      let resolvedSiteId = null;
      let siteInfo = null;
      
      if (siteId && siteId !== 'null' && siteId !== 'undefined' && siteId.toString().trim() !== '') {
        try {
          const site = await Site.findOne({ _id: siteId, owner: userId });
          if (site) {
            resolvedSiteId = site._id;
            siteInfo = { name: site.name, url: site.url };
          } else {
            res.status(400).json({
              success: false,
              message: 'Invalid site ID provided or site not found'
            });
            return;
          }
        } catch (error) {
          res.status(400).json({
            success: false,
            message: 'Invalid site ID format'
          });
          return;
        }
      }

      // Use ContentService to generate content (handles credits automatically)
      const generatedContent = await contentService.generateContent(userId, {
        keywords: [keyword],
        type: 'blog',
        tone: options.tone || 'professional',
        wordCount: options.wordCount || 1500,
        model: model, // âœ… Pass model to service
        targetAudience: options.targetAudience,
        includeHeadings: true,
        includeIntroduction: options.includeIntroduction !== false,
        includeConclusion: options.includeConclusion !== false,
        includeFAQ: options.includeFAQ || false,
        extraInstructions: options.extraInstructions,
        contentIntent: options.contentIntent || 'informational',
        customPrompt: options.customPrompt,
        additionalContext: options.additionalContext,
        writingStyle: options.writingStyle || 'conversational',
        seoFocus: options.seoFocus || 'balanced',
        callToAction: options.callToAction,
        includeStatistics: options.includeStatistics !== false,
        includeExamples: options.includeExamples !== false,
        includeComparisons: options.includeComparisons || false,
        targetKeywordDensity: options.targetKeywordDensity || 1.5
      });

      // Get the saved content from database
      const content = await Content.findById(generatedContent.contentId);
      if (!content) {
        throw new Error('Content was generated but not saved properly');
      }

      // Update with siteId if provided
      if (resolvedSiteId) {
        content.siteId = resolvedSiteId;
        await content.save();
      }

      // Generate and add tags
      const generatedTags = this.generateTags(keyword);
      content.tags = generatedTags;
      
      // Calculate SEO score
      content.seoScore = this.calculateSEOScore(content.content, keyword);
      await content.save();

      // Get updated user for remaining credits
      const user = await User.findById(userId);

      const plainText = content.content ? content.content.replace(/<[^>]*>/g, ' ') : '';
      
      const responseData = {
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
      };

      const message = resolvedSiteId 
        ? `Content generated and associated with ${siteInfo?.name}. ${content.wordCount} word credits used.`
        : `Content generated successfully. ${content.wordCount} word credits used.`;

      res.json({
        success: true,
        data: responseData,
        message,
        needsSite: !resolvedSiteId,
        creditsUsed: generatedContent.creditsUsed, // âœ… Return credits used
        billing: {
          wordsGenerated: content.wordCount,
          wordsCharged: content.wordCount,
          remainingCredits: user?.wordCredits || 0
        }
      });
      return;

    } catch (error: any) {
      logger.error('Content generation error:', error);
      
      let errorMessage = 'Failed to generate content. Please try again.';
      let statusCode = 500;
      
      if (error.message?.includes('Insufficient')) {
        errorMessage = error.message;
        statusCode = 403;
      } else if (error.message?.includes('API key')) {
        errorMessage = 'AI API configuration error. Please contact support.';
      } else if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        errorMessage = 'AI service temporarily unavailable. Please try again in a few minutes.';
      } else if (error.message?.includes('All AI services')) {
        errorMessage = 'All AI services are currently unavailable. Please try again later.';
      }

      res.status(statusCode).json({ 
        success: false,
        message: errorMessage
      });
      return;
    }
  }

  // Get user's sites
  async getUserSites(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
        return;
      }

      const sites = await Site.find({ owner: userId })
        .select('name url isActive createdAt')
        .sort({ createdAt: -1 });

      const transformedSites = sites.map(site => ({
        id: site._id.toString(),
        name: site.name,
        url: site.url,
        isActive: site.isActive,
        createdAt: site.createdAt.toISOString()
      }));

      res.json({
        success: true,
        data: transformedSites
      });
      return;
    } catch (error: any) {
      logger.error('Error fetching user sites:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to fetch sites' 
      });
      return;
    }
  }

  // Associate content with a site
  async associateContentWithSite(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
        return;
      }

      const { contentId, siteId } = req.body;

      if (!contentId || !siteId) {
        res.status(400).json({
          success: false,
          message: 'Content ID and Site ID are required'
        });
        return;
      }

      // Validate site ownership
      const site = await Site.findOne({ _id: siteId, owner: userId });
      if (!site) {
        res.status(400).json({
          success: false,
          message: 'Site not found or not owned by user'
        });
        return;
      }

      // Update content with siteId
      const content = await Content.findOneAndUpdate(
        { _id: contentId, userId },
        { siteId: siteId },
        { new: true }
      ).populate('siteId', 'name url');

      if (!content) {
        res.status(404).json({
          success: false,
          message: 'Content not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          contentId: content._id.toString(),
          site: {
            id: (content.siteId as any)._id,
            name: (content.siteId as any).name,
            url: (content.siteId as any).url
          }
        },
        message: `Content associated with ${(content.siteId as any).name} successfully`
      });
      return;

    } catch (error: any) {
      logger.error('Error associating content with site:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to associate content with site'
      });
      return;
    }
  }

  // Get content by ID
  async getContentById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          message: 'Unauthorized' 
        });
        return;
      }

      const content = await Content.findOne({
        _id: req.params.id,
        userId
      }).populate('siteId', 'name url');

      if (!content) {
        res.status(404).json({ 
          success: false,
          message: 'Content not found' 
        });
        return;
      }

      const plainText = content.content ? content.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '';

      const transformedContent = {
        id: content._id.toString(),
        title: content.title,
        content: content.content,
        body: content.content,
        summary: plainText.substring(0, 200) + '...',
        type: content.type || 'article',
        status: content.status,
        keywords: content.keywords || [content.keyword],
        seoScore: content.seoScore || this.calculateSEOScore(content.content, content.keyword),
        wordpressPostId: content.publishedPostId?.toString(),
        publishedAt: content.publishedAt?.toISOString(), // ✅ Add publishing info
        publishedUrl: content.publishedUrl, // ✅ Add publishing info
        wordpressSite: content.wordpressSite, // ✅ Add publishing info
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
        site: content.siteId ? {
          id: (content.siteId as any)._id,
          name: (content.siteId as any).name,
          url: (content.siteId as any).url
        } : null
      };

      res.json({ 
        success: true,
        data: transformedContent 
      });
      return;
    } catch (error: any) {
      logger.error('Get content by ID error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to fetch content' 
      });
      return;
    }
  }

  // Update content
  async updateContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          message: 'Unauthorized' 
        });
        return;
      }

      const { title, content: contentText, categories, tags, siteId } = req.body;

      const content = await Content.findOne({ _id: req.params.id, userId });
      if (!content) {
        res.status(404).json({ 
          success: false,
          message: 'Content not found or unauthorized' 
        });
        return;
      }

      // Update fields
      if (title) content.title = title;
      if (contentText) {
        content.content = contentText;
        const plainText = contentText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        const words = plainText.trim().split(/\s+/).filter(word => word.length > 0);
        content.wordCount = words.length;
        content.readingTime = Math.ceil(words.length / 200);
        content.seoScore = this.calculateSEOScore(contentText, content.keyword);
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
          tags: content.tags || []
        },
        message: 'Content updated successfully'
      });
      return;
    } catch (error: any) {
      logger.error('Update content error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to update content' 
      });
      return;
    }
  }

  // Delete content
  async deleteContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          message: 'Unauthorized' 
        });
        return;
      }

      const content = await Content.findOne({ _id: req.params.id, userId });
      if (!content) {
        res.status(404).json({ 
          success: false,
          message: 'Content not found or unauthorized' 
        });
        return;
      }

      await Content.findByIdAndDelete(req.params.id);
      
      res.json({ 
        success: true,
        message: 'Content deleted successfully' 
      });
      return;
    } catch (error: any) {
      logger.error('Delete content error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to delete content' 
      });
      return;
    }
  }

  // Associate content with a site
  async associateWithSite(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          message: 'Unauthorized' 
        });
        return;
      }

      const { contentId, siteId } = req.body;

      if (!contentId || !siteId) {
        res.status(400).json({
          success: false,
          message: 'Content ID and Site ID are required'
        });
        return;
      }

      // Verify site belongs to user
      const site = await Site.findOne({ _id: siteId, owner: userId });
      if (!site) {
        res.status(404).json({
          success: false,
          message: 'Site not found or unauthorized'
        });
        return;
      }

      // Update content
      const content = await Content.findOne({ _id: contentId, userId });
      if (!content) {
        res.status(404).json({
          success: false,
          message: 'Content not found or unauthorized'
        });
        return;
      }

      content.siteId = siteId;
      await content.save();

      res.json({
        success: true,
        message: 'Content associated with site successfully',
        data: {
          contentId: content._id,
          siteId: site._id,
          siteName: site.name
        }
      });
      return;
    } catch (error: any) {
      logger.error('Associate content with site error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to associate content with site' 
      });
      return;
    }
  }

  // Publish content to WordPress
  async publishContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          message: 'Unauthorized' 
        });
        return;
      }

      const content = await Content.findOne({
        _id: req.params.id,
        userId
      }).populate('siteId');

      if (!content) {
        res.status(404).json({ 
          success: false,
          message: 'Content not found' 
        });
        return;
      }


      // Check for siteId in request body first, then fall back to content.siteId
      const { siteId } = req.body;
      let targetSiteId = content.siteId;

      if (siteId) {
        // Validate and use the siteId from request body
        const requestedSite = await Site.findOne({ _id: siteId, owner: userId });
        if (!requestedSite) {
          res.status(400).json({
            success: false,
            message: 'Invalid site ID or site not found'
          });
          return;
        }
        targetSiteId = requestedSite._id as any;
        // Update content with the new siteId
        content.siteId = targetSiteId;
        await content.save();
      }

      if (!targetSiteId) {
        res.status(400).json({
          success: false,
          message: 'Content must be associated with a WordPress site before publishing',
          needsSite: true
        });
        return;
      }

      const site = await Site.findById(targetSiteId).select('+applicationPassword');
      
      if (!site) {
        res.status(400).json({
          success: false,
          message: 'WordPress site not found'
        });
        return;
      }

      const wordpressTags = content.tags && content.tags.length > 0 
        ? content.tags.map(tag => String(tag).trim()).filter(tag => tag)
        : [];

      const publishResult = await wordpressService.publishContent(
        site,
        content,
        {
          status: 'publish',
          tags: wordpressTags,
          categories: (content.categories || []).map(String)
        }
      );

      if (!publishResult.success) {
        const errorMessage = typeof publishResult.error === 'object'
          ? JSON.stringify(publishResult.error)
          : String(publishResult.error || 'Unknown error');

        res.status(500).json({
          success: false,
          message: errorMessage
        });
        return;
      }

      content.status = 'published';
      content.publishedPostId = publishResult.postId;
      content.publishedUrl = publishResult.postUrl;
      content.publishDate = new Date();
      content.publishedAt = new Date(); // Add publishedAt field for frontend
      content.wordpressSite = site.name; // Add site name for frontend display
      
      console.log("🔍 Before save:", {
        id: content._id,
        publishedAt: content.publishedAt,
        wordpressSite: content.wordpressSite,
        publishedUrl: content.publishedUrl,
        publishedPostId: content.publishedPostId
      });

      await content.save();
      
      console.log("✅ After save - values should be persisted to database");

      res.json({
        success: true,
        data: {
          contentId: content._id.toString(),
          wordpressPostId: publishResult.postId,
          wordpressUrl: publishResult.postUrl,
          editUrl: publishResult.editUrl,
          status: content.status,
          publishedAt: content.publishedAt?.toISOString(), // For URL params
          siteName: site.name, // For URL params
          site: {
            name: (content.siteId as any).name,
            url: (content.siteId as any).url
          }
        },
        message: `Content published successfully to ${(content.siteId as any).name}`
      });
      return;

    } catch (error: any) {
      logger.error('Publish content error:', error);
      res.status(500).json({ 
        success: false,
        message: error.message || 'Failed to publish content' 
      });
      return;
    }
  }

  // Helper methods
  private generateTags(keyword: string): string[] {
    try {
      const words = keyword.split(' ').filter(word => word.length > 0);
      const baseTags = [...words];
      baseTags.push('guide', 'tips', 'strategy');
      
      const cleanTags = baseTags
        .slice(0, 5)
        .map(tag => tag.toLowerCase().trim())
        .filter(tag => tag.length > 0)
        .filter((tag, index, arr) => arr.indexOf(tag) === index);
      
      return cleanTags;
    } catch (error) {
      logger.error('Error generating tags:', error);
      return ['article', 'content'];
    }
  }

  private calculateSEOScore(content: string, keyword: string): number {
    if (!content || !keyword) return 0;
    
    const contentLower = content.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    
    let score = 0;
    
    // Check keyword presence
    if (contentLower.includes(keywordLower)) score += 25;
    
    // Check word count
    const wordCount = content.replace(/<[^>]*>/g, ' ').split(/\s+/).length;
    if (wordCount >= 300) score += 25;
    
    // Check headings
    const hasHeadings = /<h[1-6][^>]*>/i.test(content);
    if (hasHeadings) score += 25;
    
    // Check keyword density
    const keywordOccurrences = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
    const keywordDensity = (keywordOccurrences / wordCount) * 100;
    if (keywordDensity >= 0.5 && keywordDensity <= 3) score += 25;
    
    return Math.min(score, 100);
  }
}

const contentController = new ContentController();
export default contentController;