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
import User from '../models/user.model';
import wordpressService from './wordpress.service';
import sitemapCrawlerService from './sitemap-crawler.service';
import { IMPACT_FORMAT_MODE } from './prompt-builder.service';
import type { ImpactFormat } from './prompt-builder.service';
import { env } from '../config/env';
import logger from '../config/logger';

const MIN_CONTEXT_WORDS = 100;
const PUBLISH_STAGGER_MINUTES = 120;
const MAX_INTERNAL_LINK_SUGGESTIONS = 3;
const RSS_FETCH_MULTIPLIER = 10;

// Full list of valid impact format IDs for response parsing
const VALID_IMPACT_FORMATS = new Set<string>([
  'rate_change_alert', 'policy_shift', 'price_hike_survival', 'feature_removal_warning',
  'new_law_breakdown', 'scam_fraud_alert', 'product_recall_guide', 'market_crash_explainer',
  'subscription_trap', 'comparison_flip', 'deadline_reminder', 'hidden_cost_revealer',
  'upgrade_decision', 'data_breach_response', 'trend_reality_check', 'beginner_entry_point',
  'contract_renewal_audit', 'seasonal_timing_guide', 'myth_buster', 'risk_explainer',
  // Scholarship formats
  'scholarship_new_opening', 'scholarship_deadline_alert',
  'scholarship_how_to_apply', 'scholarship_results',
]);

// Niche → WordPress category name mapping.
// The pipeline passes these to wordpressService.publishContent so posts land in
// the right category automatically. Add more mappings here as new niches are added.
const NICHE_CATEGORY_MAP: Record<string, string> = {
  scholarship:   'Scholarship',
  scholarships:  'Scholarship',
  fellowship:    'Scholarship',
  education:     'Education',
  law:           'Law',
  legal:         'Law',
  finance:       'Finance',
  technology:    'Technology',
  tech:          'Technology',
  health:        'Health',
  politics:      'Politics',
  business:      'Business',
  sports:        'Sports',
  entertainment: 'Entertainment',
};

/**
 * Derive WordPress category names from a pipeline's niches array.
 * Returns deduplicated category names ready to pass to publishContent.
 */
function deriveCategories(niches: string[]): string[] {
  const cats = new Set<string>();
  for (const niche of niches) {
    const key = niche.toLowerCase().trim();
    if (NICHE_CATEGORY_MAP[key]) cats.add(NICHE_CATEGORY_MAP[key]);
  }
  return Array.from(cats);
}

/**
 * Ask Gemini Flash: is this article relevant to the configured topics?
 * When classifyFormat=true, also identifies the best impact format in the same call.
 * Returns relevant (bool), reason (string), and optionally suggestedFormat.
 */
async function aiRelevanceCheck(
  title: string,
  description: string,
  relevanceTopics: string[],
  niches: string[],
  country: string = 'Global',
  classifyFormat: boolean = false
): Promise<{ relevant: boolean; reason: string; suggestedFormat?: ImpactFormat }> {
  try {
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });

    const countryLabel =
      country === 'Global' ? 'worldwide sources'
      : country === 'NG' ? 'Nigeria'
      : country === 'US' ? 'the United States'
      : country === 'GB' ? 'the United Kingdom'
      : country;

    const relevanceSection = `You are a content quality gate for a website.

This website covers: ${relevanceTopics.join(', ')}
The site's specific content areas include: ${niches.join(', ')}
This site focuses on content from: ${countryLabel}

Your job is NOT to check if an article mentions topics related to these areas in passing.
Your job is to check if the article's SUBSTANCE — what it is actually about — directly deals with the core of these topics.

ANSWER YES only if the article's primary subject matter is substantively about one of the configured topics. Ask yourself: would someone who comes to this site specifically for "${relevanceTopics.join(' or ')}" content find this article directly useful and on-topic — not merely tangentially related?

ANSWER NO if:
- The article only mentions the topic in passing while being primarily about something else
- A relevant institution or person is mentioned but the substance is off-topic (e.g. an electoral official giving a speech about integrity is not a law article)
- The connection to the topic requires a stretch of reasoning
- The article is general news that happens to involve a sector covered by this site
- The article is clearly about a different country than ${countryLabel}, unless the news is global or international in nature and directly relevant to the topic

The test: if a regular reader would scroll past it as "not what I came here for", answer NO.

Article title: "${title}"
Article description: "${description || '(none)'}"`

    const formatSection = classifyFormat ? `

Additionally, identify the single best content format for this article from the list below.
Choose the one that most precisely matches what the article is about:

rate_change_alert — a rate, fee, or yield has changed
policy_shift — a new rule, regulation, or official policy was announced
price_hike_survival — a price increase was announced
feature_removal_warning — a feature is being removed or locked behind a paywall
new_law_breakdown — a new law was passed or a ruling was issued
scam_fraud_alert — a new scam, fraud, or security threat was identified
product_recall_guide — a product recall or safety warning was issued
market_crash_explainer — a market drop or significant financial movement occurred
subscription_trap — hidden fees or subscription terms were revealed
comparison_flip — context has changed which of two options is now better
deadline_reminder — a time-sensitive action has a specific upcoming deadline
hidden_cost_revealer — a full cost breakdown reveals more than was advertised
upgrade_decision — a new version or product was released, triggering an upgrade decision
data_breach_response — a data breach or security incident was announced
trend_reality_check — a viral claim or trend needs fact-checking against data
beginner_entry_point — newcomers need a clear starting point into a topic
contract_renewal_audit — a contract or subscription renewal decision is triggered
seasonal_timing_guide — timing-based advice for an action or purchase
myth_buster — a common misconception needs correcting with evidence
risk_explainer — risks of a decision or action should be explained before committing
scholarship_new_opening — a scholarship or fellowship program has opened for applications
scholarship_deadline_alert — a scholarship application deadline is approaching or has been announced
scholarship_how_to_apply — guidance on how to apply for a specific scholarship or program
scholarship_results — scholarship winners, awardees, or selection results have been announced

Reply format (choose one):
- YES:[format_id]   (relevant, with best format — e.g. YES:scholarship_new_opening)
- YES:none          (relevant, but no format fits)
- NO                (not relevant)

Reply with nothing else.` : `

Reply with only YES or NO.`;

    const result = await model.generateContent(relevanceSection + formatSection);
    const answer = result.response.text().trim().toUpperCase();
    const relevant = answer.startsWith('YES');

    let suggestedFormat: ImpactFormat | undefined;
    if (relevant && classifyFormat) {
      const match = answer.match(/^YES:([A-Z_]+)/i);
      const formatId = match?.[1]?.toLowerCase();
      if (formatId && formatId !== 'none' && VALID_IMPACT_FORMATS.has(formatId)) {
        suggestedFormat = formatId as ImpactFormat;
      }
    }

    return {
      relevant,
      reason: relevant ? 'AI approved' : `AI rejected: not relevant to [${relevanceTopics.join(', ')}]`,
      suggestedFormat,
    };
  } catch (err: any) {
    logger.warn(`AI relevance check failed: ${err.message} -- defaulting to allow`);
    return { relevant: true, reason: 'AI check failed — allowed by default' };
  }
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
    const country: string = (config as any).country || 'Global';
    const enableImpactFormats: boolean = (config as any).enableImpactFormats || false;
    const allowedImpactFormats: string[] = (config as any).allowedImpactFormats || [];
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

      // Derive WordPress categories once from the pipeline's niche list.
      // These are passed to every publish/schedule call so posts land in
      // the correct category automatically (e.g. "Scholarship" for scholarship niches).
      const wpCategories = deriveCategories(niches);
      if (wpCategories.length > 0) {
        logger.info(`Pipeline ${configId}: WordPress categories derived from niches: [${wpCategories.join(', ')}]`);
      }

      const fetchLimit = config.maxArticlesPerRun * RSS_FETCH_MULTIPLIER;
      const rssItems = await rssService.fetchItemsForNiches(niches, fetchLimit, 24, relevanceTopics, country as any);

      if (rssItems.length === 0) {
        logger.warn(`No RSS items found for niches [${niches.join(', ')}] -- run aborted`);
        pipelineRun.status = 'completed';
        pipelineRun.completedAt = new Date();
        await pipelineRun.save();
        config.lastRunAt = new Date();
        await config.save();
        return;
      }

      logger.info(`Pipeline ${configId}: fetched ${rssItems.length} RSS candidates for niches [${niches.join(', ')}] (target: ${config.maxArticlesPerRun})`);

      const internalLinks = await this.fetchInternalLinks(siteIdString, niches[0]);
      let articleIndex = 0;

      for (const item of rssItems) {
        if (pipelineRun.articlesGenerated >= config.maxArticlesPerRun) {
          logger.info(`Pipeline ${configId}: reached target of ${config.maxArticlesPerRun} article(s) -- stopping early`);
          break;
        }

        try {
          // ── AI RELEVANCE GATE ─────────────────────────────────────────────
          const meaningfulNiches = niches.filter(n => n.length >= 4);
          const gateTopics = relevanceTopics.length > 0 ? relevanceTopics : meaningfulNiches;

          let suggestedFormat: ImpactFormat | undefined;

          if (gateTopics.length > 0) {
            const check = await aiRelevanceCheck(
              item.title,
              item.description,
              gateTopics,
              meaningfulNiches,
              country,
              enableImpactFormats
            );

            if (!check.relevant) {
              logger.warn(`AI gate rejected "${item.title}": ${check.reason}`);
              pipelineRun.results.push({ topic: item.title, status: 'skipped', error: check.reason });
              continue;
            }

            logger.info(`AI gate approved "${item.title}"${check.suggestedFormat ? ` [format: ${check.suggestedFormat}]` : ''}`);
            suggestedFormat = check.suggestedFormat;
          }
          // ─────────────────────────────────────────────────────────────────

          // Filter by allowedImpactFormats if the user restricted which formats to use
          let impactFormat: ImpactFormat | undefined;
          if (enableImpactFormats && suggestedFormat) {
            const isAllowed = allowedImpactFormats.length === 0 || allowedImpactFormats.includes(suggestedFormat);
            if (isAllowed) {
              impactFormat = suggestedFormat;
            } else {
              logger.info(`Format "${suggestedFormat}" not in allowedImpactFormats — using standard generation`);
            }
          }

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

          logger.info(`Generating article for "${item.title}" (context: ${additionalContext.length} chars, images: ${scrapedImages.length}, format: ${impactFormat || 'standard'})`);

          const modelToUse: any = proQuotaExhausted ? 'gemini' : config.aiModel;
          const trimmedLinks = internalLinks.slice(0, MAX_INTERNAL_LINK_SUGGESTIONS);
          const contentMode = impactFormat ? IMPACT_FORMAT_MODE[impactFormat] : undefined;

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
            ...(impactFormat && { impactFormat, contentMode, niche: niches[0] }),
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

          const cleanedContent = articleResult.content
            .replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '')
            .trim();

          const metaDescription = await this.generateMetaDescription(articleResult.title, cleanedContent);

          const staggeredMinutes = config.previewWindowMinutes + articleIndex * PUBLISH_STAGGER_MINUTES;
          const scheduledDate =
            config.previewWindowMinutes > 0
              ? new Date(Date.now() + staggeredMinutes * 60 * 1000)
              : undefined;

          const content = new Content({
            userId: config.userId,
            siteId: siteObjectId,
            title: articleResult.title,
            content: cleanedContent,
            excerpt: metaDescription,
            keyword: item.title,
            status: scheduledDate ? 'scheduled' : 'draft',
            scheduledPublishDate: scheduledDate,
            timezone: 'UTC',
            wordCount: articleResult.wordCount,
            readingTime: Math.ceil(articleResult.wordCount / 200),
            aiGenerated: true,
          });
          await content.save();

          const user = await User.findById(config.userId);
          if (user) {
            await user.deductWordCredits(
              articleResult.creditsUsed,
              content._id?.toString(),
              'generation'
            );
            logger.info(`Credits deducted: ${articleResult.creditsUsed} for user ${config.userId.toString()} (remaining: ${user.wordCredits})`);
          } else {
            logger.warn(`Could not find user ${config.userId.toString()} to deduct credits`);
          }

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
                // Pass derived categories so every post lands in the right WP category.
                // getCategoryIds inside publishContent does a case-insensitive name match,
                // so the category must already exist in WordPress or the post publishes
                // without a category (it won't throw).
                ...(wpCategories.length > 0 && { categories: wpCategories }),
              });

              if (publishResult.success) {
                content.status = 'published';
                content.publishedPostId = publishResult.postId;
                content.publishedUrl = publishResult.postUrl;
                content.publishedAt = new Date();
                await content.save();
                pipelineRun.articlesPublished += 1;
                logger.info(`Published "${item.title}" to WordPress${wpCategories.length ? ` [categories: ${wpCategories.join(', ')}]` : ''}`);
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