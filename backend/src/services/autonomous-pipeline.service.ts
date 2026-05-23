// backend/src/services/autonomous-pipeline.service.ts
import PipelineConfig from '../models/pipelineConfig.model';
import PipelineRun from '../models/pipelineRun.model';
import rssService from './rss.service';
import scraperService from './scraper.service';
import aiService from './ai.service';
import Site from '../models/site.model';
import Content from '../models/content.model';
import wordpressService from './wordpress.service';
import sitemapCrawlerService from './sitemap-crawler.service';
import logger from '../config/logger';

// Minimum scraped word count to proceed with generation.
// Below this threshold the context is too poor to produce quality content.
const MIN_CONTEXT_WORDS = 100;

// How many minutes apart to stagger article publishing within a single run.
const PUBLISH_STAGGER_MINUTES = 120; // 2 hours between each article

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

    // Track whether gemini-pro quota is exhausted for this run.
    // ai.service handles its own fallback (gemini-pro -> gemini) on first failure,
    // but once we know Pro is exhausted we skip straight to Flash for all remaining
    // articles to avoid wasting 4-6s on a doomed attempt each time.
    let proQuotaExhausted = false;

    try {
      // 1. Fetch RSS items for the configured niche
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

      // 2. Fetch internal link suggestions once for the whole run (shared across articles)
      const siteId = (config.siteId as any)?._id?.toString() || config.siteId?.toString();
      const internalLinks = await this.fetchInternalLinks(siteId, config.niche);

      // Track article index for staggered scheduling
      let articleIndex = 0;

      for (const item of rssItems) {
        try {
          // 3. Scrape full article content
          let scrapedText = item.description || '';
          let scrapedWordCount = scrapedText.split(/\s+/).filter(Boolean).length;

          try {
            const scraped = await scraperService.extract(item.link);
            scrapedText = scraped.text || item.description;
            scrapedWordCount = scraped.wordCount;
            logger.info(`Scraped ${scraped.wordCount} words from ${item.link}`);
          } catch (scrapeErr: any) {
            logger.warn(`Scraper failed for ${item.link}: ${scrapeErr.message} -- using RSS description`);
          }

          // 4. If scraping failed, log it but continue -- gemini-pro with grounding
          //    will search the web itself during generation, so scraped context
          //    is enrichment only, not a hard requirement.
          if (scrapedWordCount < MIN_CONTEXT_WORDS) {
            logger.warn(
              `Low scraped context for "${item.title}" (${scrapedWordCount} words) -- proceeding with grounding`
            );
            // Use just the RSS title + description as context seed
            scrapedText = item.description || '';
          }

          // 5. Deduplication check -- skip if a similar topic was published in the last 30 days
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

          // 6. Build generation context
          const additionalContext = [
            `Source: ${item.title}`,
            `Published: ${item.pubDate}`,
            `From: ${item.source}`,
            '',
            scrapedText,
          ].join('\n');

          logger.info(`Generating article for "${item.title}" (context: ${additionalContext.length} chars)`);

          // 7. Determine model -- skip Pro immediately if quota was already exhausted this run.
          //    ai.service has its own fallback but we skip the wasted first attempt entirely.
          const modelToUse: any = proQuotaExhausted ? 'gemini' : config.aiModel;

          // 8. Generate article
          let articleResult: any;
          try {
            articleResult = await aiService.generateBlogPost(item.title, modelToUse, {
              wordCount: config.targetWordCount,
              additionalContext,
              tone: 'journalistic',
              internalLinkSuggestions: internalLinks,
              includeInternalLinks: internalLinks.length > 0,
              maxInternalLinks: 3,
            });
          } catch (genErr: any) {
            // If this is the first quota failure this run, mark Pro as exhausted
            // and retry immediately with Flash for this article.
            if (this.isQuotaError(genErr) && !proQuotaExhausted) {
              proQuotaExhausted = true;
              logger.warn('Pro quota exhausted -- remaining articles this run will use Flash');
              articleResult = await aiService.generateBlogPost(item.title, 'gemini', {
                wordCount: config.targetWordCount,
                additionalContext,
                tone: 'journalistic',
                internalLinkSuggestions: internalLinks,
                includeInternalLinks: internalLinks.length > 0,
                maxInternalLinks: 3,
              });
            } else {
              throw genErr;
            }
          }

          // 9. Generate meta description (cheap secondary Flash prompt)
          const metaDescription = await this.generateMetaDescription(
            articleResult.title,
            articleResult.content
          );

          // 10. Save to Content model
          const content = new Content({
            userId: config.userId,
            siteId: config.siteId,
            title: articleResult.title,
            content: articleResult.content,
            excerpt: metaDescription,
            keyword: item.title,
            status: 'draft',
            wordCount: articleResult.wordCount,
            readingTime: Math.ceil(articleResult.wordCount / 200),
            aiGenerated: true,
          });
          await content.save();

          pipelineRun.results.push({ topic: item.title, contentId: content._id as any, status: 'generated' });
          pipelineRun.articlesGenerated += 1;

          // 11. Publish immediately or stagger-schedule
          if (config.previewWindowMinutes === 0) {
            const site = config.siteId as any;
            const fullSite = await Site.findById(site._id || site).select('+applicationPassword');
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
          } else {
            // Stagger publish times: first article after previewWindow, then +2h each
            const staggeredMinutes =
              config.previewWindowMinutes + articleIndex * PUBLISH_STAGGER_MINUTES;
            const scheduledDate = new Date(Date.now() + staggeredMinutes * 60 * 1000);

            content.status = 'scheduled';
            content.scheduledPublishDate = scheduledDate;
            await content.save();
            logger.info(
              `Content ${content._id} scheduled -- publishes at ${scheduledDate.toISOString()} (+${staggeredMinutes} min)`
            );
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

  /**
   * Check if a very similar topic/keyword was published in the last 30 days
   * to avoid near-duplicate content on the site.
   */
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

  /**
   * Fetch internal link suggestions from the sitemap for a given site + niche.
   * Returns empty array gracefully if sitemap has no data yet.
   */
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
   * Generate a concise 155-character meta description using the Flash model.
   * Always uses Flash -- fast, cheap, no need for Pro here.
   */
  private async generateMetaDescription(title: string, content: string): Promise<string> {
    try {
      const plainText = content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 500);

      const prompt = `Write a compelling SEO meta description for this article in exactly 1 sentence, maximum 155 characters. Do not use quotes. Output only the description, nothing else.\n\nTitle: ${title}\nContent excerpt: ${plainText}`;

      const result = await aiService.generateBlogPost(prompt, 'gemini', {
        wordCount: 50,
        additionalContext: '',
      });

      const meta = result.content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 155);

      logger.info(`Generated meta description: ${meta.substring(0, 60)}...`);
      return meta;
    } catch (err: any) {
      logger.warn(`Meta description generation failed: ${err.message} -- using empty string`);
      return '';
    }
  }

  /**
   * Detect whether an error is a Gemini quota/rate-limit error.
   */
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