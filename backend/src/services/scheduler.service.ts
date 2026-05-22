// backend/src/services/scheduler.service.ts - FIXED VERSION
import Content from '../models/content.model';
import Site from '../models/site.model';
import User from '../models/user.model';
import logger from '../config/logger';
import wordpressService from './wordpress.service';
import aiService from './ai.service'; // ✅ Added import
import emailService from './email.service'; // ✅ Added import

interface SchedulePostParams {
  contentId: string;
  siteId: string; 
  scheduledFor: Date;  
  timezone?: string;
}

interface UpdateScheduleParams {
  scheduleId: string;
  scheduledFor?: Date;
  siteId?: string;
  timezone?: string;
}

interface ScheduledPost {
  id: string;
  contentId: string;
  siteId: string;
  scheduledFor: Date;
  timezone: string;
  status: 'pending' | 'published' | 'failed' | 'cancelled';
  content: {
    title: string;
    excerpt?: string;
    wordCount?: number;
  };
  site: {
    id: string;
    name: string;
    url: string;
  };
  createdAt: Date;
  publishedAt?: Date;
  error?: string;
}

export class SchedulerService {
  
  async schedulePost(userId: string, params: SchedulePostParams): Promise<any> {
    try {
      const { contentId, siteId, scheduledFor, timezone = 'UTC' } = params;

      const content = await Content.findOne({ _id: contentId, userId });
      if (!content) {
        throw new Error('Content not found or unauthorized');
      }

      const site = await Site.findOne({ _id: siteId, owner: userId });
      if (!site) {
        throw new Error('WordPress site not found or unauthorized');
      }

      if (!content.siteId || content.siteId.toString() !== siteId) {
        content.siteId = site._id as any;
      }

      const scheduledDate = new Date(scheduledFor);
      if (scheduledDate <= new Date()) {
        throw new Error('Scheduled date must be in the future');
      }

      content.status = 'scheduled';
      content.scheduledPublishDate = scheduledDate;
      content.timezone = timezone;
      await content.save();

      logger.info(`✅ Post ${contentId} scheduled for ${scheduledDate} on site ${site.name}`);

      return {
        success: true,
        message: 'Post scheduled successfully',
        data: {
          id: content._id.toString(),
          contentId: content._id.toString(),
          siteId: site._id.toString(),
          scheduledFor: content.scheduledPublishDate,
          timezone: content.timezone,
          status: 'pending',
          site: {
            id: site._id.toString(),
            name: site.name,
            url: site.url
          }
        }
      };
    } catch (error: any) {
      logger.error('Error scheduling post:', error);
      throw error;
    }
  }

  async getScheduledPosts(
    userId: string,
    filters?: {
      siteId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ): Promise<{ success: boolean; data: ScheduledPost[] }> {
    try {
      const query: any = { userId };

      if (filters?.status && filters.status !== 'all') {
        query.status = filters.status;
      } else {
        query.status = { $in: ['scheduled', 'pending_generation'] }; // Support both
      }

      if (filters?.siteId) {
        query.siteId = filters.siteId;
      }

      if (filters?.startDate || filters?.endDate) {
        query.scheduledPublishDate = {};
        if (filters.startDate) {
          query.scheduledPublishDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.scheduledPublishDate.$lte = new Date(filters.endDate);
        }
      }

      const limit = filters?.limit || 100;

      const posts = await Content.find(query)
        .populate('siteId', 'name url')
        .sort({ scheduledPublishDate: 1 })
        .limit(limit)
        .lean();

      const transformedPosts: ScheduledPost[] = posts.map(post => ({
        id: post._id.toString(),
        contentId: post._id.toString(),
        siteId: post.siteId ? (post.siteId as any)._id.toString() : '',
        scheduledFor: post.scheduledPublishDate!,
        timezone: post.timezone || 'UTC',
        status: this.mapStatus(post.status),
        content: {
          title: post.title,
          excerpt: post.excerpt,
          wordCount: post.wordCount
        },
        site: post.siteId ? {
          id: (post.siteId as any)._id.toString(),
          name: (post.siteId as any).name,
          url: (post.siteId as any).url
        } : { id: '', name: 'Unknown', url: '' },
        createdAt: post.createdAt,
        publishedAt: post.publishDate,
        error: post.publishError
      }));

      return {
        success: true,
        data: transformedPosts
      };
    } catch (error: any) {
      logger.error('Error getting scheduled posts:', error);
      throw error;
    }
  }

  async getScheduledPostById(userId: string, scheduleId: string): Promise<any> {
    try {
      const content = await Content.findOne({
        _id: scheduleId,
        userId,
        status: { $in: ['scheduled', 'published', 'failed', 'pending_generation'] }
      }).populate('siteId', 'name url');

      if (!content) {
        throw new Error('Scheduled post not found');
      }

      return {
        success: true,
        data: {
          id: content._id.toString(),
          contentId: content._id.toString(),
          siteId: content.siteId ? (content.siteId as any)._id.toString() : '',
          scheduledFor: content.scheduledPublishDate,
          timezone: content.timezone || 'UTC',
          status: this.mapStatus(content.status),
          content: {
            title: content.title,
            excerpt: content.excerpt,
            wordCount: content.wordCount
          },
          site: content.siteId ? {
            id: (content.siteId as any)._id.toString(),
            name: (content.siteId as any).name,
            url: (content.siteId as any).url
          } : null,
          createdAt: content.createdAt,
          publishedAt: content.publishDate,
          error: content.publishError
        }
      };
    } catch (error: any) {
      logger.error('Error getting scheduled post:', error);
      throw error;
    }
  }

  async updateSchedule(userId: string, scheduleId: string, params: UpdateScheduleParams): Promise<any> {
    try {
      const content = await Content.findOne({ 
        _id: scheduleId, 
        userId, 
        status: { $in: ['scheduled', 'pending_generation'] }
      });

      if (!content) {
        throw new Error('Scheduled post not found');
      }

      if (params.scheduledFor) {
        const newDate = new Date(params.scheduledFor);
        if (newDate <= new Date()) {
          throw new Error('New scheduled date must be in the future');
        }
        content.scheduledPublishDate = newDate;
        
        // Also adjust the generateAt offset if it's pending generation
        if (content.status === 'pending_generation') {
          content.generateAt = new Date(newDate.getTime() - 15 * 60000);
        }
      }

      if (params.siteId) {
        const site = await Site.findOne({ _id: params.siteId, owner: userId });
        if (!site) {
          throw new Error('WordPress site not found or unauthorized');
        }
        content.siteId = site._id as any;
      }

      if (params.timezone) {
        content.timezone = params.timezone;
      }

      await content.save();

      logger.info(`✅ Updated schedule for post ${scheduleId}`);

      return {
        success: true,
        message: 'Schedule updated successfully',
        data: {
          id: content._id.toString(),
          scheduledFor: content.scheduledPublishDate,
          siteId: content.siteId?.toString(),
          timezone: content.timezone
        }
      };
    } catch (error: any) {
      logger.error('Error updating schedule:', error);
      throw error;
    }
  }

  async cancelSchedule(userId: string, scheduleId: string): Promise<any> {
    try {
      const content = await Content.findOne({ 
        _id: scheduleId, 
        userId, 
        status: { $in: ['scheduled', 'pending_generation'] } 
      });

      if (!content) {
        throw new Error('Scheduled post not found');
      }

      content.status = 'draft';
      content.scheduledPublishDate = undefined;
      content.generateAt = undefined;
      await content.save();

      logger.info(`✅ Cancelled schedule for post ${scheduleId}`);

      return {
        success: true,
        message: 'Schedule cancelled successfully'
      };
    } catch (error: any) {
      logger.error('Error cancelling schedule:', error);
      throw error;
    }
  }

  async publishNow(userId: string, scheduleId: string): Promise<any> {
    try {
      const content = await Content.findOne({
        _id: scheduleId,
        userId,
        status: { $in: ['scheduled', 'pending_generation'] }
      }).populate('siteId');

      if (!content) {
        throw new Error('Scheduled post not found');
      }

      if (!content.siteId) {
        throw new Error('Content has no associated WordPress site');
      }
      
      // If the user hits Publish Now while it's pending generation, generate it immediately first
      if (content.status === 'pending_generation') {
         let genOptions: any = {};
         if (content.generationOptions?.extraInstructions) {
            try { genOptions = JSON.parse(content.generationOptions.extraInstructions); } catch(e) {}
         }
         const generatedContent = await aiService.generateBlogPost(
           content.keyword,
           (genOptions.model || content.aiModel || 'gemini') as any,
           genOptions
         );
         content.title = generatedContent.title;
         content.content = generatedContent.content;
         content.status = 'scheduled'; 
         await content.save();
      }

      // Publish immediately
      await this.publishScheduledPost(content);

      logger.info(`✅ Published post ${scheduleId} immediately`);

      return {
        success: true,
        message: 'Post published successfully',
        data: {
          postId: content.publishedPostId,
          postUrl: content.publishedUrl
        }
      };
    } catch (error: any) {
      logger.error('Error publishing now:', error);
      throw error;
    }
  }

  /**
   * ✅ FIXED: Handles 15-min generation offset AND publishing
   */
  async processScheduledPosts(): Promise<void> {
    try {
      const now = new Date();
      
      // ==========================================
      // PHASE 1: Generate Content (15 mins prior)
      // ==========================================
      const postsToGenerate = await Content.find({
        status: 'pending_generation',
        generateAt: { $lte: now }
      });

      if (postsToGenerate.length > 0) {
        logger.info(`🔍 Found ${postsToGenerate.length} posts ready for AI generation`);
      }

      for (const content of postsToGenerate) {
        try {
          logger.info(`🤖 Auto-generating scheduled content for: ${content.keyword}`);
          
          let genOptions: any = {};
          if (content.generationOptions?.extraInstructions) {
            try {
               genOptions = JSON.parse(content.generationOptions.extraInstructions);
            } catch(e) {}
          }

          const selectedModel = genOptions.model || content.aiModel || 'gemini';

          const generatedContent = await aiService.generateBlogPost(
            content.keyword,
            selectedModel as any,
            genOptions
          );

          content.title = generatedContent.title;
          content.content = generatedContent.content;
          content.wordCount = generatedContent.wordCount;
          content.readingTime = Math.ceil(generatedContent.wordCount / 200);
          content.status = 'scheduled'; // Ready for Phase 2

          await content.save();
          logger.info(`✅ Successfully generated and prepared scheduled post: ${content._id}`);
        } catch (error: any) {
          logger.error(`❌ Failed to auto-generate content for ${content._id}:`, error.message);
          content.status = 'failed';
          content.publishError = 'Generation failed: ' + error.message;
          await content.save();
        }
      }

      // ==========================================
      // PHASE 2: Publish to WordPress
      // ==========================================
      const postsToPublish = await Content.find({
        status: 'scheduled',
        scheduledPublishDate: { $lte: now }
      }).populate('siteId');

      if (postsToPublish.length > 0) {
        logger.info(`🔍 Found ${postsToPublish.length} posts ready to publish`);
      }

      for (const content of postsToPublish) {
        try {
          await this.publishScheduledPost(content);
        } catch (error: any) {
          logger.error(`❌ Failed to publish scheduled post ${content._id}:`, error.message);
          
          content.status = 'failed';
          content.publishError = error.message;
          await content.save();
        }
      }
    } catch (error: any) {
      logger.error('Error processing scheduled posts:', error);
    }
  }

  private async publishScheduledPost(content: any): Promise<void> {
    try {
      if (!content.siteId) {
        throw new Error('Content has no associated site');
      }

      const site = await Site.findById(content.siteId).select('+applicationPassword');
      if (!site) {
        throw new Error('WordPress site not found');
      }

      logger.info(`📤 Publishing scheduled post: ${content.title} to ${site.name}`);

      const wordpressTags = content.tags && content.tags.length > 0 
        ? content.tags.map((tag: string) => String(tag).trim()).filter((tag: string) => tag)
        : [];

      const publishResult = await wordpressService.publishContent(
        site,
        content,
        {
          status: 'publish',
          tags: wordpressTags,
          categories: content.categories || []
        }
      );

      if (!publishResult.success) {
        throw new Error(publishResult.error || 'Failed to publish to WordPress');
      }

      content.status = 'published';
      content.publishedPostId = publishResult.postId;
      content.publishedUrl = publishResult.postUrl;
      content.publishDate = new Date();
      await content.save();

      await this.notifyUserOfPublish(content.userId, content, site);

      logger.info(`✅ Successfully published scheduled post: ${content.title}`);
    } catch (error: any) {
      logger.error('Error publishing scheduled post:', error);
      throw error;
    }
  }

  /**
   * ✅ FIXED: Connected directly to Brevo Email API
   */
  private async notifyUserOfPublish(userId: string, content: any, site: any): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) return;

      logger.info(`📧 Notification: Post "${content.title}" published to ${site.name} for user ${user.email}`);
      
      await emailService.sendPostPublishedEmail(
        user.email,
        user.name || 'User',
        content.title,
        content.publishedUrl || site.url,
        site.name
      );
    } catch (error: any) {
      logger.error('Error sending notification:', error);
    }
  }

  async getScheduledPostsCalendar(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
    try {
      const posts = await Content.find({
        userId,
        status: { $in: ['scheduled', 'published', 'pending_generation'] },
        scheduledPublishDate: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .populate('siteId', 'name url')
      .sort({ scheduledPublishDate: 1 });

      const grouped: Record<string, any[]> = {};
      
      posts.forEach(post => {
        const dateKey = post.scheduledPublishDate!.toISOString().split('T')[0];
        
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }

        grouped[dateKey].push({
          id: post._id.toString(),
          contentId: post._id.toString(),
          title: post.title,
          scheduledFor: post.scheduledPublishDate,
          status: this.mapStatus(post.status),
          site: {
            id: (post.siteId as any)?._id.toString(),
            name: (post.siteId as any)?.name || 'Unknown',
            url: (post.siteId as any)?.url || ''
          }
        });
      });

      return {
        success: true,
        data: grouped
      };
    } catch (error: any) {
      logger.error('Error getting calendar view:', error);
      throw error;
    }
  }

  async getSchedulingStats(userId: string, siteId?: string): Promise<any> {
    try {
      const baseQuery: any = { userId };
      if (siteId) {
        baseQuery.siteId = siteId;
      }

      const [
        totalScheduled,
        pendingPosts,
        publishedToday,
        upcomingThisWeek,
        failedPosts
      ] = await Promise.all([
        Content.countDocuments({ ...baseQuery, status: { $in: ['scheduled', 'pending_generation'] } }),
        Content.countDocuments({ 
          ...baseQuery, 
          status: { $in: ['scheduled', 'pending_generation'] },
          scheduledPublishDate: { $gte: new Date() }
        }),
        Content.countDocuments({
          ...baseQuery,
          status: 'published',
          publishDate: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            $lte: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }),
        Content.countDocuments({
          ...baseQuery,
          status: { $in: ['scheduled', 'pending_generation'] },
          scheduledPublishDate: {
            $gte: new Date(),
            $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        }),
        Content.countDocuments({ ...baseQuery, status: 'failed' })
      ]);

      return {
        success: true,
        data: {
          totalScheduled,
          pendingPosts,
          publishedToday,
          upcomingThisWeek,
          failedPosts
        }
      };
    } catch (error: any) {
      logger.error('Error getting scheduling stats:', error);
      throw error;
    }
  }

  async bulkSchedule(
    userId: string, 
    schedules: { contentId: string; siteId: string; scheduledFor: Date; timezone?: string }[]
  ): Promise<any> {
    try {
      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[]
      };

      for (const schedule of schedules) {
        try {
          await this.schedulePost(userId, schedule);
          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${schedule.contentId}: ${error.message}`);
        }
      }

      return {
        success: true,
        data: results,
        message: `Bulk schedule completed: ${results.success} successful, ${results.failed} failed`
      };
    } catch (error: any) {
      logger.error('Error in bulk schedule:', error);
      throw error;
    }
  }

  /**
   * ✅ FIXED: Mapped pending_generation to "pending" for the frontend UI to understand
   */
  private mapStatus(contentStatus: string): 'pending' | 'published' | 'failed' | 'cancelled' {
    switch (contentStatus) {
      case 'pending_generation':
      case 'scheduled':
        return 'pending';
      case 'published':
        return 'published';
      case 'failed':
        return 'failed';
      case 'draft':
        return 'cancelled';
      default:
        return 'pending';
    }
  }
}

export default new SchedulerService();