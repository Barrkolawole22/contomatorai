// backend/src/services/prompt-builder.service.ts
import logger from '../config/logger';

interface InternalLink {
  url: string;
  title: string;
  description?: string;
  relevanceScore?: number;
}

interface PromptOptions {
  tone?: string;
  wordCount?: number;
  targetAudience?: string;
  includeIntroduction?: boolean;
  includeConclusion?: boolean;
  includeFAQ?: boolean;
  contentIntent?: 'informational' | 'navigational' | 'commercial' | 'transactional';
  customPrompt?: string;
  additionalContext?: string;
  writingStyle?: 'conversational' | 'academic' | 'journalistic' | 'technical' | 'creative';
  seoFocus?: 'primary_keyword' | 'semantic_keywords' | 'long_tail' | 'balanced';
  callToAction?: string;
  includeStatistics?: boolean;
  includeExamples?: boolean;
  includeComparisons?: boolean;
  targetKeywordDensity?: number;
  includeInternalLinks?: boolean;
  internalLinkSuggestions?: InternalLink[];
  maxInternalLinks?: number;
  internalLinkDensity?: number;
  includeExternalLinks?: boolean;
  extraInstructions?: string;

  // News-specific fields
  sourceUrl?: string;
  sourceName?: string;
  articleImages?: Array<{ url: string; alt: string }>;
}

export class PromptBuilderService {

  buildMasterPrompt(
    keyword: string,
    options: PromptOptions,
    attempt: number = 1
  ): string {

    const tone = options.tone || 'journalistic';
    const audience = options.targetAudience || 'general readers';
    const targetWordCount = options.wordCount || 1200;

    let prompt = '';

    // ============================================================
    // ROLE + TASK
    // ============================================================

    prompt += `You are a news reporter writing an original news article about: "${keyword}"

This is a news article, not a blog post. Write it the way a professional journalist would for a reputable outlet.

`;

    // ============================================================
    // SOURCE MATERIAL
    // ============================================================

    if (options.additionalContext) {
      prompt += `SOURCE MATERIAL (primary reference -- base all facts on this):

---
${options.additionalContext}
---

Extract and use: specific names, dates, times, locations, figures, quotes, and events from this material.
Do NOT invent facts. If the source is thin, rely on grounding to fill in verified details.

`;
    }

    // ============================================================
    // WORD COUNT + NO PADDING
    // ============================================================

    prompt += `TARGET LENGTH: ${targetWordCount} words.

Every sentence must add new information. Do not restate what you just said. Do not pad to reach word count. A tight 800-word article beats a bloated 1200-word one.

`;

    // ============================================================
    // RETRY
    // ============================================================

    if (attempt > 1) {
      prompt += `RETRY: Previous attempt had quality issues. Write complete sections, no placeholders, proper ending.\n\n`;
    }

    // ============================================================
    // NEWS WRITING STYLE
    // ============================================================

    prompt += `NEWS WRITING RULES:

1. LEAD PARAGRAPH (first paragraph, 2-3 sentences):
   - Answer: Who, What, When, Where, Why
   - Use specific details: real names, actual dates or timeframes ("on Tuesday", "last week", "as of May 2025"), specific locations
   - This is the most important paragraph -- make it count

2. INVERTED PYRAMID structure:
   - Most important facts first
   - Supporting details next
   - Background and context last

3. NAMES AND SPECIFICS:
   - Always use full names on first mention, then last name only
   - Include job titles, organisation names, locations
   - Reference specific dates, amounts, statistics from the source
   - If the source mentions "the agency", name the agency

4. QUOTES AND ATTRIBUTION:
   - If the source contains quotes, use them with proper attribution: John Smith said, "..."
   - If no direct quotes, paraphrase with attribution: According to the report, ...
   - Do not fabricate quotes

5. TIME REFERENCES:
   - Use specific time references from the source: "on Friday", "during a press briefing on Wednesday", "as announced in March 2025"
   - If date is not in the source, use relative terms: "recently", "this week"

6. TONE:
   - Neutral, factual, no opinion in the main body
   - Short sentences. Active voice preferred.
   - No filler words. No fluff.

`;

    // ============================================================
    // HEADLINE
    // ============================================================

    prompt += `HEADLINE (H1):

Write a headline that makes someone want to click and read. It should be:
- Specific -- use real names, numbers, or locations from the story
- Curious or slightly surprising -- hint at something unexpected
- Under 12 words
- No colons splitting it into two clauses
- No buzzwords (no "navigating", "comprehensive", "exploring", "transformative")
- Written like a newspaper front page, not a blog post

GOOD examples:
- "Sex Offender Charged Again for Hiding Where He Works"
- "Tinubu Did Not Plan to Rename Nigeria. Here Is What Actually Happened."
- "EFCC Arrests 47 in Lagos as Online Fraud Sweep Expands Nationwide"
- "Court Orders Meta to Delete Millions of User Records Collected Without Consent"

BAD examples:
- "Offender Fails To Update Job Status" (too flat, zero curiosity)
- "Understanding the Legal Landscape of Sex Offender Registration" (buzzword, boring)
- "Important Update: What You Need to Know About..." (vague clickbait)

`;

    // ============================================================
    // ARTICLE STRUCTURE
    // ============================================================

    prompt += `ARTICLE STRUCTURE:

Start with <h1> (the headline). Then go straight into the lead paragraph -- no subtitle, no repeated title.

SECTIONS:
- 4-6 sections with plain H2 headings
- Each section covers ONE idea
- H2 headings: short, plain, descriptive (same rules as H1 but can be slightly shorter)
- No summary sentence at the end of each section (that is padding)

LEGAL COMMENTARY (subtle, one section):
Include one section that briefly addresses the legal dimension -- not a lecture, more like a comment. Example:
- What law applies here
- What the penalties or precedents are
- What legal experts or the law generally says about this type of situation
- Keep it factual and brief -- 1-2 paragraphs only

`;

    // ============================================================
    // IMAGES -- inject into article body
    // ============================================================

    if (options.articleImages && options.articleImages.length > 0) {
      prompt += `IMAGES:

You have ${options.articleImages.length} image(s) from the source article. Place them naturally inside the article body using this exact HTML format:

<figure>
  <img src="IMAGE_URL" alt="ALT_TEXT" style="max-width:100%;height:auto;" />
  <figcaption>BRIEF_CAPTION</figcaption>
</figure>

Place the first image after the lead paragraph. Place additional images (if any) in the middle of the article where they are relevant to the section being discussed.

Available images:
${options.articleImages.map((img, i) => `Image ${i + 1}: src="${img.url}" alt="${img.alt || keyword}"`).join('\n')}

Do NOT skip the images. They must appear in the article HTML.

`;
    }

    // ============================================================
    // MANDATORY LINK STRUCTURE
    // ============================================================

    prompt += `MANDATORY LINKS -- YOU MUST INCLUDE ALL OF THESE:

The article must contain at least 5 links total. Here is how to include each:

`;

    // Link 1: Primary source
    if (options.sourceUrl) {
      const sourceName = options.sourceName || 'the original report';
      prompt += `LINK 1 -- PRIMARY SOURCE (required):
Link to the original article where this news was reported.
URL: ${options.sourceUrl}
How to use it: Attribute the source naturally in a sentence, for example:
  "According to ${sourceName}, the incident occurred..."
  "${sourceName} first reported that..."
  "As ${sourceName} reported, ..."
Format: <a href="${options.sourceUrl}" target="_blank" rel="noopener noreferrer">anchor text</a>

`;
    } else {
      prompt += `LINK 1 -- PRIMARY SOURCE (required):
Attribute the original source in a sentence. Link to the original news outlet that reported this story.
Use natural phrasing like "According to [outlet name]..." or "[outlet] reported that..."
Format: <a href="SOURCE_URL" target="_blank" rel="noopener noreferrer">outlet name</a>

`;
    }

    // Link 2: Authority website
    prompt += `LINK 2 -- AUTHORITY AGENCY WEBSITE (required):
Link to a relevant official government or law enforcement agency website.
Examples depending on topic:
- Nigeria: EFCC (efcc.gov.ng), NDLEA (ndlea.gov.ng), Nigerian Judiciary (judiciary.gov.ng), CBN (cbn.gov.ng)
- USA: FBI (fbi.gov), DOJ (justice.gov), FTC (ftc.gov), SEC (sec.gov), relevant .gov agency
- UK: Crown Prosecution Service (cps.gov.uk), National Crime Agency (nationalcrimeagency.gov.uk)
Choose the agency most relevant to the story topic.
Use it naturally: "The [Agency Name] defines this as..." or "Under [Agency] guidelines..."
Format: <a href="AGENCY_URL" target="_blank" rel="noopener noreferrer">Agency Name</a>

`;

    // Links 3-4: Internal links from sitemap
    if (options.internalLinkSuggestions && options.internalLinkSuggestions.length > 0) {
      const maxInternal = Math.min(options.internalLinkSuggestions.length, options.maxInternalLinks || 3);
      prompt += `LINKS 3-${3 + maxInternal - 1} -- INTERNAL LINKS TO OUR PREVIOUS ARTICLES (required):
Link to these previously published articles on our site where they are relevant to what you are writing:

${options.internalLinkSuggestions.slice(0, maxInternal).map((link, i) =>
  `${i + 3}. "${link.title}"
   URL: ${link.url}
   ${link.description ? `Context: ${link.description}` : ''}`
).join('\n\n')}

Use them naturally mid-sentence where the topic connects. Example:
"This follows a pattern seen in earlier cases, as we reported in our coverage of [anchor text linking to previous article]."
Format: <a href="URL">descriptive anchor text</a>

`;
    } else {
      prompt += `LINKS 3-4 -- INTERNAL LINKS (required):
Link to 2 relevant previously published articles. Use natural anchor text and place links where the topic connects.
Format: <a href="/relevant-article-url">descriptive anchor text</a>

`;
    }

    // Link 5: Additional external authority
    prompt += `LINK 5 -- ADDITIONAL EXTERNAL REFERENCE (required):
Include one more external link to a highly authoritative source relevant to the topic.
Good choices: Wikipedia for background definitions, academic institutions, major news organisations (Reuters, BBC, AP), WHO, UN, relevant international bodies.
Only link to URLs you are confident actually exist. Do NOT invent URLs.
Format: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>

`;

    // ============================================================
    // CONCLUSION
    // ============================================================

    prompt += `CONCLUSION:
2-3 paragraphs. Summarise only what has not already been said. End with what happens next -- what readers should watch for, what is pending, or what the broader implication is.
Do NOT say "In conclusion" or "To summarise".

`;

    // ============================================================
    // HTML FORMATTING
    // ============================================================

    prompt += `HTML FORMATTING:
- <h1> for the headline (ONE only -- never repeat the title in the article body)
- <h2> for section headings
- <p> for paragraphs
- <figure><img .../><figcaption>...</figcaption></figure> for images
- <a href="...">text</a> for links
- No markdown. No bullet lists unless genuinely listing items.

`;

    // ============================================================
    // SEO
    // ============================================================

    prompt += `SEO: Mention "${keyword}" naturally in the headline, first paragraph, and 2-3 times in the body. Do not stuff it.\n\n`;

    // ============================================================
    // NEVER DO LIST
    // ============================================================

    prompt += `NEVER DO THESE:
- Repeat the H1 title anywhere in the article body
- Start with "In today's world" or any filler opener
- Use: delve, realm, landscape, crucial, vital, game-changing, transformative, unveiling, empowering, comprehensive
- Invent quotes, statistics, names, or URLs
- Pad sentences to reach word count
- Skip the images if they were provided
- Skip any of the 5 mandatory links

`;

    // ============================================================
    // CUSTOM
    // ============================================================

    if (options.customPrompt) prompt += `ADDITIONAL REQUIREMENTS:\n${options.customPrompt}\n\n`;
    if (options.extraInstructions) prompt += `EXTRA GUIDELINES:\n${options.extraInstructions}\n\n`;

    // ============================================================
    // FINAL
    // ============================================================

    prompt += `Now write the complete news article. Start with <h1>. Include all 5+ links and all provided images.\n`;

    return prompt;
  }

  buildSystemMessage(): string {
    return `You are a professional news journalist writing factual, clear, engaging articles for a general readership.

YOUR RULES:

1. NEWS FIRST
Lead with the most important fact. Use real names, dates, amounts, and locations.
Attribute everything. Quote sources properly.

2. PLAIN LANGUAGE
Short sentences. Everyday words. Active voice.
Say "arrested" not "taken into custody". Say "said" not "stated".

3. NO PADDING
Every sentence adds new information. No restating. No summaries at section ends.

4. IMAGES GO IN THE ARTICLE
When images are provided, place them inside the article body using <figure><img/><figcaption></figcaption></figure>.
First image goes after the lead paragraph. Never skip provided images.

5. ALL 5 LINKS ARE MANDATORY
Primary source attribution, authority agency, 2 internal previous articles, 1 additional external reference.
All 5 must appear. No exceptions.

6. SUBTLE LEGAL ANGLE
Include one section addressing the legal dimension briefly -- what law applies, what the penalties are, what precedent exists. Keep it factual, not preachy.

7. ONE H1 ONLY
Never repeat the title in the article body. Go straight from <h1> into the lead paragraph.

FORMATTING:
- Semantic HTML only: h1, h2, p, figure, img, figcaption, a, ul, ol, li
- No markdown
- No repeated title after h1

NEVER USE:
delve, realm, landscape, crucial, vital, game-changing, transformative, unveiling,
navigating, empowering, it is worth noting, in today's world, in an era of,
as we can see, to summarise, in conclusion, this is important because`;
  }

  private buildSEOGuidance(keyword: string, focus?: string, density?: number): string {
    let guidance = `Mention "${keyword}" naturally where it fits. `;
    switch (focus) {
      case 'primary_keyword': guidance += `Use the exact phrase naturally throughout.`; break;
      case 'semantic_keywords': guidance += `Focus on related concepts and semantic variations.`; break;
      case 'long_tail': guidance += `Include natural long-tail variations in headings and body.`; break;
      default: guidance += `Balance the keyword with natural language.`;
    }
    if (density && density > 0) guidance += ` Target ~${density}% density but prioritise readability.`;
    return guidance;
  }

  private getAudienceDescription(audience: string): string {
    if (audience.toLowerCase().includes('beginner')) return 'Explain everything clearly -- assume no prior knowledge.';
    if (audience.toLowerCase().includes('expert') || audience.toLowerCase().includes('advanced')) return 'Skip basics -- focus on depth.';
    return 'Assume intelligence but not expertise.';
  }

  validateInternalLinks(content: string, requiredLinks: InternalLink[]): {
    valid: boolean; foundLinks: number; missingLinks: InternalLink[]; issues: string[];
  } {
    const issues: string[] = [];
    const missingLinks: InternalLink[] = [];
    let foundLinks = 0;

    for (const link of requiredLinks) {
      if (content.includes(link.url)) foundLinks++;
      else missingLinks.push(link);
    }

    const minRequired = Math.ceil(requiredLinks.length * 0.5);
    const valid = foundLinks >= minRequired;
    if (!valid) issues.push(`Only ${foundLinks} of ${requiredLinks.length} internal links included (minimum: ${minRequired})`);

    logger.info(`Internal link validation: ${foundLinks}/${requiredLinks.length} links found, valid: ${valid}`);
    return { valid, foundLinks, missingLinks, issues };
  }

  extractInternalLinks(content: string): Array<{ url: string; anchorText: string }> {
    const linkRegex = /<a\s+href="([^"]+)">([^<]+)<\/a>/gi;
    const links: Array<{ url: string; anchorText: string }> = [];
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      links.push({ url: match[1], anchorText: match[2] });
    }
    return links;
  }
}

export default new PromptBuilderService();