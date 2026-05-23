// backend/src/services/autonomous-pipeline.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import PipelineConfig from '../models/pipelineConfig.model';
import PipelineRun from '../models/pipelineRun.model';
import rssService from './rss.service';
import scraperService from './scraper.service';
import aiService from './ai.service';
import Site from '../models/site.model';
import Content from '../models/content.model';
import wordpressService from './wordpress.service';
import sitemapCrawlerService from './sitemap-crawler.service';
import { env } from '../config/env';
import logger from '../config/logger';

const MIN_CONTEXT_WORDS = 100;
const PUBLISH_STAGGER_MINUTES = 120;
const MAX_INTERNAL_LINK_SUGGESTIONS = 3;

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

    // Extract the plain ObjectId from the populated siteId — critical for
    // correct query matching on the schedule page
    const siteObjectId = (config.siteId as any)?._id ?? config.siteId;
    const siteIdString = siteObjectId?.toString();

    let proQuotaExhausted = false;

    try {
      const rssItems = await rssService.fetchItems(config.niche, config.maxArticlesPerRun);

      if (rssItems.length === 0) {
        logger.warn(`No RSS items found for niche "${config.niche}" -- run aborted`);
        pipelineRun.status = 'completed';
        pipelineRun.completedAt = new Date();
        await pipelineRun.save();
        config.lastRunAt = new Date();
        await config.save();
        return;
      }

      logger.info(`Pipeline ${configId}: processing ${rssItems.length} RSS item(s) for niche "${config.niche}"`);

      const internalLinks = await this.fetchInternalLinks(siteIdString, config.niche);

      let articleIndex = 0;

      for (const item of rssItems) {
        try {
          // Build context seed — always include title so Gemini has something
          // meaningful even when scraping fails entirely
          let contextSeed = [item.title, item.description].filter(Boolean).join('\n\n');

          try {
            const scraped = await scraperService.extract(item.link);
            if (scraped.wordCount >= MIN_CONTEXT_WORDS) {
              contextSeed = scraped.text;
              logger.info(`Scraped ${scraped.wordCount} words from ${item.link}`);
            } else {
              contextSeed = [item.title, item.description, scraped.text].filter(Boolean).join('\n\n');
              logger.warn(
                `Low scraped context for "${item.title}" (${scraped.wordCount} words) -- proceeding with grounding`
              );
            }
          } catch (scrapeErr: any) {
            logger.warn(`Scraper failed for ${item.link}: ${scrapeErr.message} -- using RSS seed`);
          }

          const isDuplicate = await this.isDuplicateTopic(config.userId.toString(), item.title);
          if (isDuplicate) {
            logger.warn(`Skipping "${item.title}" -- duplicate topic published within last 30 days`);
            pipelineRun.results.push({
              topic: item.title,
              status: 'skipped',
              error: 'Duplicate topic -- already published recently',
            });
            continue;
          }

          const additionalContext = [
            `Source: ${item.title}`,
            `Published: ${item.pubDate}`,
            `From: ${item.source}`,
            '',
            contextSeed,
          ].join('\n');

          logger.info(`Generating article for "${item.title}" (context: ${additionalContext.length} chars)`);

          const modelToUse: any = proQuotaExhausted ? 'gemini' : config.aiModel;
          const trimmedLinks = internalLinks.slice(0, MAX_INTERNAL_LINK_SUGGESTIONS);

          let articleResult: any;
          try {
            articleResult = await aiService.generateBlogPost(item.title, modelToUse, {
              wordCount: config.targetWordCount,
              additionalContext,
              tone: 'journalistic',
              internalLinkSuggestions: trimmedLinks,
              includeInternalLinks: trimmedLinks.length > 0,
              maxInternalLinks: trimmedLinks.length,
            });
          } catch (genErr: any) {
            if (this.isQuotaError(genErr) && !proQuotaExhausted) {
              proQuotaExhausted = true;
              logger.warn('Pro quota exhausted -- remaining articles this run will use Flash');
              articleResult = await aiService.generateBlogPost(item.title, 'gemini', {
                wordCount: config.targetWordCount,
                additionalContext,
                tone: 'journalistic',
                internalLinkSuggestions: trimmedLinks,
                includeInternalLinks: trimmedLinks.length > 0,
                maxInternalLinks: trimmedLinks.length,
              });
            } else {
              throw genErr;
            }
          }

          const metaDescription = await this.generateMetaDescription(
            articleResult.title,
            articleResult.content
          );

          // Determine schedule date BEFORE the save so status + scheduledPublishDate
          // are written in a single atomic operation — same pattern as bulkScheduler.
          // previewWindowMinutes === 0 means publish immediately; anything else = schedule.
          const staggeredMinutes = config.previewWindowMinutes + articleIndex * PUBLISH_STAGGER_MINUTES;
          const scheduledDate =
            config.previewWindowMinutes > 0
              ? new Date(Date.now() + staggeredMinutes * 60 * 1000)
              : undefined;

          const content = new Content({
            userId: config.userId,
            siteId: siteObjectId,                             // plain ObjectId, not populated doc
            title: articleResult.title,
            content: articleResult.content,
            excerpt: metaDescription,
            keyword: item.title,
            status: scheduledDate ? 'scheduled' : 'draft',   // single authoritative write
            scheduledPublishDate: scheduledDate,
            timezone: 'UTC',
            wordCount: articleResult.wordCount,
            readingTime: Math.ceil(articleResult.wordCount / 200),
            aiGenerated: true,
          });
          await content.save();

          pipelineRun.results.push({ topic: item.title, contentId: content._id as any, status: 'generated' });
          pipelineRun.articlesGenerated += 1;

          if (scheduledDate) {
            logger.info(
              `Content ${content._id} scheduled -- publishes at ${scheduledDate.toISOString()} (+${staggeredMinutes} min)`
            );
          } else {
            // previewWindowMinutes === 0: publish immediately to WordPress
            const fullSite = await Site.findById(siteObjectId).select('+applicationPassword');
            if (fullSite) {
              const publishResult = await wordpressService.publishContent(fullSite, content, {
                status: 'publish',
              });
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
          }

          articleIndex++;
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
    logger.info(
      `Pipeline ${configId} run complete -- generated: ${pipelineRun.articlesGenerated}, published: ${pipelineRun.articlesPublished}`
    );
  }

  private async isDuplicateTopic(userId: string, topic: string): Promise<boolean> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const keywords = topic
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 4)
        .slice(0, 4);

      if (keywords.length === 0) return false;

      const recentContent = await Content.find({
        userId,
        status: { $in: ['published', 'scheduled', 'draft'] },
        createdAt: { $gte: thirtyDaysAgo },
      })
        .select('keyword title')
        .lean();

      for (const existing of recentContent) {
        const existingText = `${existing.keyword || ''} ${existing.title || ''}`.toLowerCase();
        const matchCount = keywords.filter(kw => existingText.includes(kw)).length;
        if (matchCount >= 2) {
          logger.info(
            `Duplicate detected: "${topic}" matches existing content "${existing.title}" (${matchCount} keyword overlaps)`
          );
          return true;
        }
      }

      return false;
    } catch (err: any) {
      logger.warn(`Duplicate check failed: ${err.message} -- proceeding anyway`);
      return false;
    }
  }

  private async fetchInternalLinks(siteId: string, niche: string): Promise<any[]> {
    try {
      if (!siteId) return [];
      const keywords = niche.split(/[\s,]+/).filter(Boolean);
      const links = await sitemapCrawlerService.findRelevantLinks(siteId, keywords, 10);
      logger.info(`Found ${links.length} internal link candidates for niche "${niche}"`);
      return links;
    } catch (err: any) {
      logger.warn(`Internal link fetch failed: ${err.message} -- skipping`);
      return [];
    }
  }

  /**
   * Direct Flash call — no full article pipeline.
   * maxOutputTokens: 80 caps the response to ~1 sentence.
   */
  private async generateMetaDescription(title: string, content: string): Promise<string> {
    try {
      const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { maxOutputTokens: 80, temperature: 0.3 },
      });

      const plainText = content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 500);

      const prompt = `Write a compelling SEO meta description in exactly 1 sentence, maximum 155 characters. Output only the description, nothing else.\n\nTitle: ${title}\nContent: ${plainText}`;

      const result = await model.generateContent(prompt);
      const meta = result.response.text().trim().substring(0, 155);
      logger.info(`Generated meta description: ${meta.substring(0, 60)}...`);
      return meta;
    } catch (err: any) {
      logger.warn(`Meta description generation failed: ${err.message}`);
      return '';
    }
  }

  private isQuotaError(err: any): boolean {
    const msg = err?.message || '';
    return (
      msg.includes('429') ||
      msg.includes('quota') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('rate limit')
    );
  }
}

export default new AutonomousPipelineService();