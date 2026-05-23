// backend/src/services/autonomous-pipeline.service.ts
import PipelineConfig from '../models/pipelineConfig.model';
import PipelineRun from '../models/pipelineRun.model';
import rssService from './rss.service';
import scraperService from './scraper.service';
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
      // 1. Fetch RSS items for the configured niche
      const rssItems = await rssService.fetchItems(config.niche, config.maxArticlesPerRun);

      if (rssItems.length === 0) {
        logger.warn(`No RSS items found for niche "${config.niche}" — run aborted`);
        pipelineRun.status = 'completed';
        pipelineRun.completedAt = new Date();
        await pipelineRun.save();
        config.lastRunAt = new Date();
        await config.save();
        return;
      }

      logger.info(`Pipeline ${configId}: processing ${rssItems.length} RSS item(s) for niche "${config.niche}"`);

      for (const item of rssItems) {
        try {
          // 2. Scrape full article content from the RSS item URL
          let scrapedText = item.description;
          try {
            const scraped = await scraperService.extract(item.link);
            scrapedText = scraped.text || item.description;
            logger.info(`Scraped ${scraped.wordCount} words from ${item.link}`);
          } catch (scrapeErr: any) {
            logger.warn(`Scraper failed for ${item.link}: ${scrapeErr.message} — using RSS description`);
          }

          // 3. Build context from scraped content
          const additionalContext = `Source: ${item.title}\nPublished: ${item.pubDate}\nFrom: ${item.source}\n\n${scrapedText}`;
          logger.info(`Generating article for "${item.title}" (context: ${additionalContext.length} chars)`);

          // 4. Generate article with configured model
          const articleResult = await aiService.generateBlogPost(
            item.title,
            config.aiModel as any,
            {
              wordCount: config.targetWordCount,
              additionalContext,
              tone: 'journalistic',
            }
          );

          // 5. Save to Content model
          const content = new Content({
            userId: config.userId,
            siteId: config.siteId,
            title: articleResult.title,
            content: articleResult.content,
            keyword: item.title,
            status: 'draft',
            wordCount: articleResult.wordCount,
            readingTime: Math.ceil(articleResult.wordCount / 200),
            aiGenerated: true,
          });
          await content.save();

          pipelineRun.results.push({ topic: item.title, contentId: content._id as any, status: 'generated' });
          pipelineRun.articlesGenerated += 1;

          // 6. Publish immediately or schedule based on previewWindowMinutes
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
                logger.info(`Published "${item.title}" to WordPress`);
              } else {
                throw new Error(publishResult.error);
              }
            }
          } else {
            content.status = 'scheduled';
            await content.save();
            logger.info(`Content ${content._id} queued — publishes after ${config.previewWindowMinutes} min`);
          }
        } catch (err: any) {
          logger.error(`Pipeline article failed for "${item.title}": ${err.message}`);
          pipelineRun.results.push({ topic: item.title, status: 'failed', error: err.message });
        }
      }

      pipelineRun.status = 'completed';
      pipelineRun.completedAt = new Date();
    } catch (err: any) {
      logger.error(`Pipeline run ${pipelineRun._id} failed: ${err.message}`);
      pipelineRun.status = 'failed';
      pipelineRun.runErrors.push(err.message);
    }

    await pipelineRun.save();
    config.lastRunAt = new Date();
    await config.save();
    logger.info(`Pipeline ${configId} run complete — generated: ${pipelineRun.articlesGenerated}, published: ${pipelineRun.articlesPublished}`);
  }
}

export default new AutonomousPipelineService();