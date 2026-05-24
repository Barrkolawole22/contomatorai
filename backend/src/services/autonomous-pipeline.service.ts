// backend/src/services/autonomous-pipeline.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import PipelineConfig from '../models/pipelineConfig.model';
import PipelineRun from '../models/pipelineRun.model';
import rssService from './rss.service';
import scraperService from './scraper.service';
import { ScrapedImage } from './scraper.service';
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
const MAX_TAGS = 10;

/**
 * Ask Gemini Flash: is this article relevant to the configured topics?
 * Returns true (proceed) or false (skip). Fast + cheap — ~10 tokens output.
 */
async function aiRelevanceCheck(
  title: string,
  description: string,
  relevanceTopics: string[],
  niches: string[]
): Promise<{ relevant: boolean; reason: string }> {
  try {
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { maxOutputTokens: 10, temperature: 0 },
    });

    const prompt = `You are a content relevance filter for a niche website.

Broad topics this pipeline covers: ${relevanceTopics.join(', ')}
Specific niche keywords for this site: ${niches.join(', ')}

An article is relevant if it touches on any of the broad topics, any of the specific niche
keywords, or is clearly about the same subject area as those keywords. Be inclusive rather
than strict — if there is a reasonable connection, answer YES.

Article title: ${title}
Article description: ${description || '(none)'}

Is this article relevant?
Reply with only YES or NO — nothing else.`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim().toUpperCase();
    const relevant = answer.startsWith('YES');
    return { relevant, reason: relevant ? 'AI approved' : `AI rejected: not relevant to [${relevanceTopics.join(', ')}]` };
  } catch (err: any) {
    // If AI check fails, default to allowing the article through
    logger.warn(`AI relevance check failed: ${err.message} -- defaulting to allow`);
    return { relevant: true, reason: 'AI check failed — allowed by default' };
  }
}

/**
 * Extract up to MAX_TAGS relevant tags from the article title + content.
 */
function extractArticleTags(title: string, content: string, niches: string[]): string[] {
  const tags = new Set<string>();

  // 1. Capitalised title words → named entities
  title
    .replace(/<[^>]*>/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && /^[A-Z]/.test(w))
    .map(w => w.replace(/[^a-zA-Z]/g, '').trim())
    .filter(Boolean)
    .slice(0, 5)
    .forEach(w => tags.add(w));

  // 2. Best-matching niche labels scored against content
  const plainContent = `${title} ${content}`.toLowerCase().replace(/<[^>]*>/g, '');
  const stopwords = new Set(['the','and','for','are','but','not','you','all','can','was','one','our','had','how','its','who','did','get','has','may','now','say','she','too','use','way','new','over','such','than','then','them','they','this','that','with','will','from','have','been','were']);

  niches
    .map(niche => {
      const words = niche.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w));
      const score = words.filter(w => plainContent.includes(w)).length;
      return { niche: niche.trim(), score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .forEach(({ niche }) => {
      if (tags.size < MAX_TAGS) tags.add(niche);
    });

  return Array.from(tags).slice(0, MAX_TAGS);
}

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

    const siteObjectId = (config.siteId as any)?._id ?? config.siteId;
    const siteIdString = siteObjectId?.toString();
    const relevanceTopics: string[] = (config as any).relevanceTopics || [];
    let proQuotaExhausted = false;

    try {
      const niches: string[] = (config as any).niches?.length
        ? (config as any).niches
        : [(config as any).niche].filter(Boolean);

      if (niches.length === 0) {
        logger.warn(`Pipeline ${configId} has no niches configured -- run aborted`);
        pipelineRun.status = 'completed';
        pipelineRun.completedAt = new Date();
        await pipelineRun.save();
        config.lastRunAt = new Date();
        await config.save();
        return;
      }

      const rssItems = await rssService.fetchItemsForNiches(niches, config.maxArticlesPerRun);

      if (rssItems.length === 0) {
        logger.warn(`No RSS items found for niches [${niches.join(', ')}] -- run aborted`);
        pipelineRun.status = 'completed';
        pipelineRun.completedAt = new Date();
        await pipelineRun.save();
        config.lastRunAt = new Date();
        await config.save();
        return;
      }

      logger.info(`Pipeline ${configId}: processing ${rssItems.length} RSS item(s) for niches [${niches.join(', ')}]`);

      const internalLinks = await this.fetchInternalLinks(siteIdString, niches[0]);
      let articleIndex = 0;

      for (const item of rssItems) {
        try {
          // ── AI RELEVANCE GATE ─────────────────────────────────────────────
          const meaningfulNiches = niches.filter(n => n.length >= 4);

          if (relevanceTopics.length > 0 && meaningfulNiches.length > 0) {
            const check = await aiRelevanceCheck(item.title, item.description, relevanceTopics, meaningfulNiches);
            if (!check.relevant) {
              logger.warn(`AI gate rejected "${item.title}": ${check.reason}`);
              pipelineRun.results.push({ topic: item.title, status: 'skipped', error: check.reason });
              continue;
            }
            logger.info(`AI gate approved "${item.title}"`);
          } else if (relevanceTopics.length > 0 && meaningfulNiches.length === 0) {
            logger.warn(`AI gate skipped for "${item.title}" -- no meaningful niche keywords to evaluate against`);
          }
          // ─────────────────────────────────────────────────────────────────

          let contextSeed = [item.title, item.description].filter(Boolean).join('\n\n');
          let scrapedImages: ScrapedImage[] = [];
          let sourceUrl = item.link;
          let sourceName = item.source || '';

          const isGoogleNewsUrl = item.link.includes('news.google.com');

          if (!isGoogleNewsUrl) {
            try {
              const scraped = await scraperService.extract(item.link);
              scrapedImages = scraped.images || [];
              sourceUrl = scraped.sourceUrl || item.link;
              if (scraped.wordCount >= MIN_CONTEXT_WORDS) {
                contextSeed = scraped.text;
                logger.info(`Scraped ${scraped.wordCount} words and ${scrapedImages.length} images from ${item.link}`);
              } else {
                contextSeed = [item.title, item.description, scraped.text].filter(Boolean).join('\n\n');
                logger.warn(`Low scraped context for "${item.title}" (${scraped.wordCount} words) -- proceeding with grounding`);
              }
            } catch (scrapeErr: any) {
              logger.warn(`Scraper failed for ${item.link}: ${scrapeErr.message} -- using RSS seed`);
            }
          } else {
            logger.info(`Google News URL for "${item.title}" -- skipping scrape, relying on grounding`);
          }

          const isDuplicate = await this.isDuplicateTopic(config.userId.toString(), item.title);
          if (isDuplicate) {
            logger.warn(`Skipping "${item.title}" -- duplicate topic published within last 30 days`);
            pipelineRun.results.push({ topic: item.title, status: 'skipped', error: 'Duplicate topic' });
            continue;
          }

          const additionalContext = [
            `Source article title: ${item.title}`,
            `Published: ${item.pubDate}`,
            `Source outlet: ${item.source}`,
            `Source URL: ${sourceUrl}`,
            '',
            contextSeed,
          ].join('\n');

          logger.info(`Generating article for "${item.title}" (context: ${additionalContext.length} chars, images: ${scrapedImages.length})`);

          const modelToUse: any = proQuotaExhausted ? 'gemini' : config.aiModel;
          const trimmedLinks = internalLinks.slice(0, MAX_INTERNAL_LINK_SUGGESTIONS);

          let articleResult: any;
          const generationOptions = {
            wordCount: config.targetWordCount,
            additionalContext,
            tone: 'journalistic',
            writingStyle: 'journalistic' as const,
            internalLinkSuggestions: trimmedLinks,
            includeInternalLinks: trimmedLinks.length > 0,
            maxInternalLinks: trimmedLinks.length,
            includeExternalLinks: true,
            sourceUrl,
            sourceName,
            articleImages: scrapedImages.map(img => ({ url: img.url, alt: img.alt })),
          };

          try {
            articleResult = await aiService.generateBlogPost(item.title, modelToUse, generationOptions);
          } catch (genErr: any) {
            if (this.isQuotaError(genErr) && !proQuotaExhausted) {
              proQuotaExhausted = true;
              logger.warn('Pro quota exhausted -- remaining articles this run will use Flash');
              articleResult = await aiService.generateBlogPost(item.title, 'gemini', generationOptions);
            } else {
              throw genErr;
            }
          }

          const metaDescription = await this.generateMetaDescription(articleResult.title, articleResult.content);

          const staggeredMinutes = config.previewWindowMinutes + articleIndex * PUBLISH_STAGGER_MINUTES;
          const scheduledDate =
            config.previewWindowMinutes > 0
              ? new Date(Date.now() + staggeredMinutes * 60 * 1000)
              : undefined;

          const wordpressTags = extractArticleTags(articleResult.title, articleResult.content, niches);
          logger.info(`Tags for "${articleResult.title}": [${wordpressTags.join(', ')}]`);

          const content = new Content({
            userId: config.userId,
            siteId: siteObjectId,
            title: articleResult.title,
            content: articleResult.content,
            excerpt: metaDescription,
            keyword: item.title,
            status: scheduledDate ? 'scheduled' : 'draft',
            scheduledPublishDate: scheduledDate,
            timezone: 'UTC',
            wordCount: articleResult.wordCount,
            readingTime: Math.ceil(articleResult.wordCount / 200),
            aiGenerated: true,
            tags: wordpressTags,
          });
          await content.save();

          pipelineRun.results.push({ topic: item.title, contentId: content._id as any, status: 'generated' });
          pipelineRun.articlesGenerated += 1;

          if (scheduledDate) {
            logger.info(`Content ${content._id} scheduled at ${scheduledDate.toISOString()} (+${staggeredMinutes} min)`);
          } else {
            const fullSite = await Site.findById(siteObjectId).select('+applicationPassword');
            if (fullSite) {
              let featuredImageId: number | undefined;
              if (scrapedImages.length > 0) {
                featuredImageId = await wordpressService.uploadImageFromUrl(
                  fullSite,
                  scrapedImages[0].url,
                  scrapedImages[0].alt || articleResult.title
                );
                if (featuredImageId) logger.info(`Uploaded featured image (ID: ${featuredImageId})`);
              }

              const publishResult = await wordpressService.publishContent(fullSite, content, {
                status: 'publish',
                featuredImageId,
                tags: wordpressTags,
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
    logger.info(`Pipeline ${configId} run complete -- generated: ${pipelineRun.articlesGenerated}, published: ${pipelineRun.articlesPublished}`);
  }

  private async isDuplicateTopic(userId: string, topic: string): Promise<boolean> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const keywords = topic.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 4).slice(0, 4);
      if (keywords.length === 0) return false;

      const recentContent = await Content.find({
        userId,
        status: { $in: ['published', 'scheduled', 'draft'] },
        createdAt: { $gte: thirtyDaysAgo },
      }).select('keyword title').lean();

      for (const existing of recentContent) {
        const existingText = `${existing.keyword || ''} ${existing.title || ''}`.toLowerCase();
        const matchCount = keywords.filter(kw => existingText.includes(kw)).length;
        if (matchCount >= 2) {
          logger.info(`Duplicate detected: "${topic}" matches "${existing.title}" (${matchCount} overlaps)`);
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

  private async generateMetaDescription(title: string, content: string): Promise<string> {
    try {
      const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { maxOutputTokens: 80, temperature: 0.3 } });
      const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
      const result = await model.generateContent(
        `Write a compelling SEO meta description in exactly 1 sentence, maximum 155 characters. Output only the description, nothing else.\n\nTitle: ${title}\nContent: ${plainText}`
      );
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
    return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit');
  }
}

export default new AutonomousPipelineService();