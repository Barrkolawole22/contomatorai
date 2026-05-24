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

    const targetWordCount = options.wordCount || 1200;
    const style = options.writingStyle || 'journalistic';
    const isJournalistic = style === 'journalistic' || options.tone === 'journalistic';

    let prompt = '';

    // ============================================================
    // ROLE + TASK
    // ============================================================

    if (isJournalistic) {
      prompt += `You are a professional news reporter writing an original news article about: "${keyword}"\n\n`;
      prompt += `Write this the way a journalist would for a reputable outlet -- factual, specific, and engaging.\n\n`;
    } else {
      prompt += `Write a high-quality article about: "${keyword}"\n\n`;
    }

    // ============================================================
    // SOURCE MATERIAL
    // ============================================================

    if (options.additionalContext) {
      prompt += `SOURCE MATERIAL (use this as your primary reference):

---
${options.additionalContext}
---

Extract and use specific details from this: names, dates, figures, locations, events, quotes.
Do NOT invent facts. If the source is thin, use what you have and keep claims conservative.

`;
    }

    // ============================================================
    // WORD COUNT + NO PADDING
    // ============================================================

    prompt += `TARGET LENGTH: ${targetWordCount} words.

Every sentence must add new information. Do not restate what you just said. Do not pad to hit the word count. A tight article beats a bloated one.

`;

    // ============================================================
    // RETRY
    // ============================================================

    if (attempt > 1) {
      prompt += `RETRY NOTE: Previous attempt had quality issues. Write complete sections, no placeholders, proper ending.\n\n`;
    }

    // ============================================================
    // WRITING STYLE
    // ============================================================

    if (isJournalistic) {
      prompt += `NEWS WRITING RULES:

1. LEAD PARAGRAPH (first 2-3 sentences):
   - Answer: Who, What, When, Where, Why
   - Use specific details: real names, actual dates or timeframes, specific locations
   - Most important fact goes first

2. INVERTED PYRAMID:
   - Most important facts first
   - Supporting details next
   - Background and context last

3. SPECIFICS:
   - Always use full names on first mention, then last name only
   - Include job titles, organisation names, locations
   - Reference specific dates, amounts, statistics from the source
   - If the source mentions "the agency" -- name it

4. ATTRIBUTION:
   - Use direct quotes with attribution when available: John Smith said, "..."
   - Paraphrase with attribution when no quote: According to the report, ...
   - Do not fabricate quotes

5. TIME REFERENCES:
   - Use specific time references from the source: "on Friday", "during a press briefing on Wednesday"
   - If date is not in the source, use relative terms: "recently", "this week"

6. TONE:
   - Neutral, factual. No personal opinion in the main body.
   - Short sentences. Active voice preferred.

`;
    } else {
      prompt += `WRITING STYLE:

Write clearly and directly -- like a smart person explaining something to a friend.
Short sentences. Everyday words. No jargon without explanation.
Tone: ${options.tone || 'professional'}
Audience: ${this.getAudienceDescription(options.targetAudience || 'general audience')}

`;
    }

    // ============================================================
    // HEADLINE
    // ============================================================

    prompt += `HEADLINE (H1):

Write a headline that makes someone want to click and read.
- Specific: use real names, numbers, or locations from the story where available
- Curious or slightly surprising: hint at something the reader does not expect
- Under 12 words
- No colons splitting it into two clauses
- No buzzwords: avoid "navigating", "comprehensive", "exploring", "transformative", "landscape", "realm"
- Written like a newspaper front page, not a blog post title

GOOD:
- "EFCC Arrests 47 in Lagos as Online Fraud Sweep Expands"
- "Court Orders Meta to Delete Millions of User Records"
- "Sex Offender Charged Again for Hiding Where He Works"
- "Tesla Recalls 200,000 Vehicles Over Software Defect"

BAD:
- "Understanding the Complex Landscape of Digital Fraud" (vague + buzzword)
- "Important Update: What You Need to Know About Meta" (generic clickbait)
- "Offender Fails To Update Job Status" (flat, no pull)

`;

    // ============================================================
    // ARTICLE STRUCTURE
    // ============================================================

    prompt += `ARTICLE STRUCTURE:

Start with <h1> (the headline). Go straight into the article -- no subtitle, no repeated title.

`;

    if (isJournalistic) {
      prompt += `SECTIONS:
- Lead paragraph (answers who/what/when/where/why)
- 4-6 sections with short, plain H2 headings
- Each section covers ONE idea -- do not mix topics
- No summary sentence at the end of each section

EXPERT/AUTHORITY COMMENTARY (one section):
Include one section that briefly brings in an authoritative perspective on the topic.
This could be:
- What an expert in the relevant field says or has said publicly
- What the relevant authority, regulator, or governing body says about this
- What the broader industry, community, or field considers the standard here
- Any relevant regulation, policy, or precedent that applies

Keep this factual and brief -- 1-2 paragraphs. Adapt it to whatever the topic is:
- Crime/legal story: what the law says, what the penalty is, what precedent exists
- Tech story: what the regulator says, what the industry standard is
- Health story: what health authorities recommend, what the research shows
- Business story: what market analysts or regulators say
- Sports story: what the governing body rules, what the precedent is

This section should feel like informed commentary, not a lecture.

`;
    } else {
      prompt += `SECTIONS:
- 4-6 sections with plain, descriptive H2 headings
- Each section covers ONE idea
- No summary sentence at the end of each section

`;
    }

    // ============================================================
    // IMAGES
    // ============================================================

    if (options.articleImages && options.articleImages.length > 0) {
      prompt += `IMAGES -- YOU MUST INCLUDE THESE:

Place the following image(s) inside the article body. Use this exact HTML:

<figure>
  <img src="IMAGE_URL" alt="ALT_TEXT" style="max-width:100%;height:auto;" />
  <figcaption>BRIEF_CAPTION</figcaption>
</figure>

Place the first image after the lead paragraph (or after the opening section for non-news articles).
Place additional images mid-article where they relate to the section being discussed.

Available images:
${options.articleImages.map((img, i) => `Image ${i + 1}: src="${img.url}" alt="${img.alt || keyword}"`).join('\n')}

Do NOT skip the images. They must appear in the final HTML output.

`;
    }

    // ============================================================
    // MANDATORY LINKS
    // ============================================================

    prompt += `LINKS -- INCLUDE AT LEAST 5:

`;

    // Link 1: Primary source
    if (options.sourceUrl) {
      const sourceName = options.sourceName || 'the original report';
      prompt += `LINK 1 -- PRIMARY SOURCE (required):
Attribute the original source naturally in a sentence.
URL: ${options.sourceUrl}
Example phrasing:
  "According to ${sourceName}, ..."
  "${sourceName} reported that ..."
  "As ${sourceName} first reported, ..."
Format: <a href="${options.sourceUrl}" target="_blank" rel="noopener noreferrer">source name or outlet</a>

`;
    } else {
      prompt += `LINK 1 -- PRIMARY SOURCE (required):
Find where this story was first reported and attribute it naturally.
Example: "According to [outlet name], ..." linked to the original article.
Format: <a href="SOURCE_URL" target="_blank" rel="noopener noreferrer">outlet name</a>

`;
    }

    // Link 2: Authority website -- topic-agnostic
    prompt += `LINK 2 -- AUTHORITATIVE BODY (required):
Link to the most relevant official, government, or authoritative organisation for this topic.
Match the link to the subject matter:
- Crime / law enforcement: relevant police, prosecution, or justice agency (FBI, DOJ, EFCC, NCA, CPS etc.)
- Finance / fraud: financial regulator (SEC, FCA, CBN, EFCC etc.)
- Health: health authority (WHO, NHS, CDC, NAFDAC etc.)
- Technology: tech regulator or standards body (FTC, ICO, NITDA etc.)
- Environment: environmental agency (EPA, NESREA etc.)
- Sports: governing body (FIFA, CAF, NFL, Premier League etc.)
- Business / corporate: relevant regulator or exchange
Choose whichever official body is most directly relevant to the story.
Use it naturally: "The [body name] states that..." or "Under [body name] guidelines..."
Format: <a href="OFFICIAL_URL" target="_blank" rel="noopener noreferrer">Body Name</a>

`;

    // Links 3-4: Internal links
    if (options.internalLinkSuggestions && options.internalLinkSuggestions.length > 0) {
      const maxInternal = Math.min(options.internalLinkSuggestions.length, options.maxInternalLinks || 3);
      prompt += `LINKS 3-${2 + maxInternal} -- PREVIOUS ARTICLES ON OUR SITE (required):
Link to these previously published articles where they connect naturally to what you are writing:

${options.internalLinkSuggestions.slice(0, maxInternal).map((link, i) =>
  `${i + 3}. "${link.title}" -- ${link.url}${link.description ? `\n   Context: ${link.description}` : ''}`
).join('\n\n')}

Use them naturally mid-sentence. Example:
"This follows a broader pattern, as covered in our earlier report on [anchor text]."
Format: <a href="URL">descriptive anchor text</a>

`;
    } else {
      prompt += `LINKS 3-4 -- RELATED ARTICLES (required):
Link to 2 relevant previously published articles on this topic. Use natural anchor text.
Format: <a href="/relevant-url">descriptive anchor text</a>

`;
    }

    // Link 5: Additional external
    prompt += `LINK 5 -- ADDITIONAL EXTERNAL REFERENCE (required):
One more external link to a highly credible source relevant to the topic.
Good options: Wikipedia for background definitions, major news wire (Reuters, AP, BBC), academic institution, relevant international body.
Only use URLs you are confident actually exist. Do NOT invent URLs.
Format: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>

`;

    // ============================================================
    // OPTIONAL FEATURES
    // ============================================================

    if (options.includeStatistics) {
      prompt += `STATISTICS: Use relevant statistics only if supported by the source. Never fabricate numbers.\n\n`;
    }

    if (options.includeExamples) {
      prompt += `EXAMPLES: Include real examples grounded in the source material.\n\n`;
    }

    if (options.includeFAQ) {
      prompt += `FAQ SECTION: After the main body, add 4-5 questions real readers would ask, with direct plain-language answers.\n\n`;
    }

    // ============================================================
    // CONCLUSION
    // ============================================================

    prompt += `CONCLUSION:
2-3 paragraphs. Summarise only what has not already been said.
${isJournalistic ? 'End with what happens next -- what is pending, what readers should watch for, what the broader implication is.' : 'End with a clear takeaway.'}
Do NOT say "In conclusion" or "To summarise".

`;

    if (options.callToAction) {
      prompt += `Include this call-to-action naturally: ${options.callToAction}\n\n`;
    }

    // ============================================================
    // HTML FORMATTING
    // ============================================================

    prompt += `HTML FORMATTING:
- <h1> for the headline (ONE only -- never repeat it in the article body)
- <h2> for section headings
- <h3> for subsections if needed
- <p> for paragraphs
- <figure><img src="..." alt="..." style="max-width:100%;height:auto;"/><figcaption>...</figcaption></figure> for images
- <a href="...">text</a> for links
- <ul>/<ol>/<li> for lists only when genuinely listing items
- No markdown

`;

    // ============================================================
    // SEO
    // ============================================================

    prompt += `SEO: ${this.buildSEOGuidance(keyword, options.seoFocus, options.targetKeywordDensity)}\n\n`;

    // ============================================================
    // CUSTOM
    // ============================================================

    if (options.customPrompt) prompt += `ADDITIONAL REQUIREMENTS:\n${options.customPrompt}\n\n`;
    if (options.extraInstructions) prompt += `EXTRA GUIDELINES:\n${options.extraInstructions}\n\n`;

    // ============================================================
    // NEVER DO
    // ============================================================

    prompt += `NEVER DO THESE:
- Repeat the H1 title anywhere in the article body after the opening tag
- Start with "In today's world", "In an era of", or any filler opener
- Use: delve, realm, landscape, crucial, vital, game-changing, transformative, unveiling, empowering, comprehensive
- Invent quotes, statistics, names, or URLs
- Pad sentences to reach word count
- Skip images if they were provided above
- Include fewer than 5 links

`;

    // ============================================================
    // FINAL
    // ============================================================

    prompt += `Now write the complete article. Start with <h1>. Include all provided images and all 5+ links.\n`;

    return prompt;
  }

  buildSystemMessage(): string {
    return `You are a professional writer who produces clear, factual, well-sourced articles on any topic.

YOUR RULES:

1. SPECIFICS OVER GENERICS
Use real names, dates, figures, organisations. Vague writing is bad writing.

2. NO PADDING
Every sentence adds new information. No restating. No section summaries.

3. IMAGES IN THE ARTICLE
When images are provided, place them in the article body using:
<figure><img src="..." alt="..." style="max-width:100%;height:auto;"/><figcaption>caption</figcaption></figure>
First image goes after the opening paragraph. Never skip provided images.

4. ALL 5 LINKS ARE MANDATORY
Primary source attribution, relevant authority body, 2 internal previous articles, 1 additional external.
All 5 must appear. No exceptions.

5. AUTHORITY COMMENTARY
Include one section with an informed perspective from a relevant expert, regulator, or authority body.
Adapt this to the topic -- legal, tech, health, finance, sports, whatever applies.

6. ONE H1 ONLY
Never repeat the title in the article body. Go straight from <h1> into the first paragraph.

7. HEADLINE QUALITY
Specific. Curious. Under 12 words. No colons. No buzzwords.
Make readers want to click.

FORMATTING:
- Semantic HTML only: h1, h2, h3, p, figure, img, figcaption, a, ul, ol, li
- No markdown. No repeated title after h1.

NEVER USE THESE WORDS OR PHRASES:
delve, realm, landscape, crucial, vital, game-changing, transformative, unveiling,
navigating, empowering, it is worth noting, in today's world, in an era of,
as we can see, to summarise, in conclusion, this is important because,
comprehensive guide, in-depth look, exploring the`;
  }

  private buildSEOGuidance(keyword: string, focus?: string, density?: number): string {
    let guidance = `Mention "${keyword}" naturally in the headline, opening paragraph, and 2-3 times in the body. `;
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
    if (audience.toLowerCase().includes('expert') || audience.toLowerCase().includes('advanced')) return 'Skip basics -- focus on depth and nuance.';
    return 'Assume intelligence but not expertise -- explain ideas without being condescending.';
  }

  validateInternalLinks(
    content: string,
    requiredLinks: InternalLink[]
  ): { valid: boolean; foundLinks: number; missingLinks: InternalLink[]; issues: string[] } {
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