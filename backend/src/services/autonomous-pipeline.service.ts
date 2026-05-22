import PipelineConfig from '../models/pipelineConfig.model';
import PipelineRun from '../models/pipelineRun.model';
import trendsService from './trends.service';
import aiService from './ai.service';
import Site from '../models/site.model';
import Content from '../models/content.model';
import wordpressService from './wordpress.service';
import logger from '../config/logger';

export class AutonomousPipelineService {
  async runPipeline(configId: string): Promise<void> {
    const config = await PipelineConfig.findById(configId).populate('siteId');
    if (!config || !config.isActive) {
      logger.warn(`Pipeline config ${configId} inactive or missing`);
      return;
    }

    const pipelineRun = new PipelineRun({
      userId: config.userId,
      pipelineConfigId: config._id,
      status: 'running',
      runAt: new Date(),
      results: [],
      runErrors: [],
      articlesGenerated: 0,
      articlesPublished: 0,
    });
    await pipelineRun.save();

    try {
      const topics = await trendsService.fetchTrendingTopics(config.niche, config.maxArticlesPerRun);

      for (const topic of topics) {
        try {
          const researchOptions = {
            wordCount: 500,
            tone: 'professional',
            writingStyle: 'conversational' as const,
            enableGrounding: true,
            modelVariant: 'pro',
          };
          const researchResult = await aiService.generateBlogPost(topic.title, 'gemini-pro', researchOptions);
          const researchContext = researchResult.content;

          const articleResult = await aiService.generateBlogPost(
            topic.title,
            config.aiModel as any,
            {
              wordCount: config.targetWordCount,
              additionalContext: researchContext,
              includeInternalLinks: false,
            }
          );

          const content = new Content({
            userId: config.userId,
            siteId: config.siteId,
            title: articleResult.title,
            content: articleResult.content,
            keyword: topic.title,
            status: 'draft',
            wordCount: articleResult.wordCount,
            readingTime: Math.ceil(articleResult.wordCount / 200),
            aiGenerated: true,
          });
          await content.save();

          pipelineRun.results.push({ topic: topic.title, contentId: content._id as any, status: 'generated' });
          pipelineRun.articlesGenerated += 1;

          if (config.previewWindowMinutes === 0) {
            const site = config.siteId as any;
            const fullSite = await Site.findById(site._id || site).select('+applicationPassword');
            if (fullSite) {
              const publishResult = await wordpressService.publishContent(fullSite, content, { status: 'publish' });
              if (publishResult.success) {
                content.status = 'published';
                content.publishedPostId = publishResult.postId;
                content.publishedUrl = publishResult.postUrl;
                content.publishedAt = new Date();
                await content.save();
                pipelineRun.articlesPublished += 1;
              } else {
                throw new Error(publishResult.error);
              }
            }
          } else {
            content.status = 'scheduled';
            await content.save();
            logger.info(`Content ${content._id} set to publish after ${config.previewWindowMinutes} min`);
          }
        } catch (err: any) {
          logger.error(`Pipeline article failed for "${topic.title}": ${err.message}`);
          pipelineRun.results.push({ topic: topic.title, status: 'failed', error: err.message });
        }
      }

      pipelineRun.status = 'completed';
      pipelineRun.completedAt = new Date();
    } catch (err: any) {
      pipelineRun.status = 'failed';
      pipelineRun.runErrors.push(err.message);
    }

    await pipelineRun.save();
    config.lastRunAt = new Date();
    await config.save();
  }
}

export default new AutonomousPipelineService();