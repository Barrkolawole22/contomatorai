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
}

export class PromptBuilderService {

  buildMasterPrompt(
    keyword: string,
    options: PromptOptions,
    attempt: number = 1
  ): string {

    const tone = options.tone || 'professional';
    const audience = options.targetAudience || 'general audience';
    const style = options.writingStyle || 'conversational';
    const targetWordCount = options.wordCount || 1500;

    let prompt = '';

    // ============================================================
    // OPENING + SOURCE GROUNDING
    // ============================================================

    prompt += `Write an article about "${keyword}" for ${audience}.\n\n`;

    if (options.additionalContext) {
      prompt += `SOURCE MATERIAL:

Use this as your primary reference. Stick to what it says -- do not invent facts, quotes, or statistics.

---
${options.additionalContext}
---

`;
    }

    // ============================================================
    // TARGET LENGTH + PADDING RULES
    // ============================================================

    prompt += `TARGET LENGTH: Approximately ${targetWordCount} words.

WORD COUNT RULES -- VERY IMPORTANT:
- Every sentence must earn its place. If it does not add new information, cut it.
- Do NOT repeat the same idea in different words just to reach the word count.
- Do NOT add filler sentences like "This is an important topic" or "As we can see..."
- Do NOT restate what you just said at the end of each section.
- If you run out of genuinely useful things to say before hitting the word count, end the article. A shorter, tighter article is always better than a padded one.

`;

    // ============================================================
    // RETRY ATTEMPT HANDLING
    // ============================================================

    if (attempt > 1) {
      prompt += `RETRY NOTE: Previous attempt had quality issues. Write complete sections, avoid placeholders, finish with a proper conclusion.

`;
    }

    // ============================================================
    // WRITING STYLE -- PLAIN EVERYDAY LANGUAGE
    // ============================================================

    prompt += `WRITING STYLE:

Write the way a smart person explains something to a friend -- clear, direct, no jargon unless necessary.

Rules:
- Use short sentences. Break up long ones.
- Use everyday words. Say "use" not "utilize". Say "help" not "facilitate".
- If you need to explain a technical term, do it in one plain sentence immediately after.
- No corporate speak. No academic padding. No motivational filler.
- Vary your sentence length -- mix short punchy sentences with longer explanatory ones.

Tone: ${tone}
Audience: ${this.getAudienceDescription(audience)}

`;

    // ============================================================
    // HEADLINE RULES
    // ============================================================

    prompt += `HEADLINE (H1 TITLE) RULES:

- Use the source headline as your starting point
- Keep it under 12 words
- No colons, no semicolons, no em-dashes splitting two clauses
- No buzzwords: avoid "navigating", "comprehensive", "ultimate", "exploring", "delving", "transformative", "landscape", "realm", "journey", "unveiling"
- Write it like a newspaper headline, not a blog post title

GOOD: "Tinubu Does Not Plan to Rename Nigeria or Abolish Sharia Law"
GOOD: "Court Rules Against Meta in User Data Privacy Case"
BAD: "Navigating the Misinformation Maze: The Truth About Tinubu's Plans" (colon + buzzword)
BAD: "Understanding the Complex Landscape of Nigerian Legal Recognition" (vague + buzzwords)

`;

    // ============================================================
    // CONTENT STRUCTURE
    // ============================================================

    prompt += `CONTENT STRUCTURE:

Start with <h1> (the headline). Then go straight into the article -- no repeated title, no subtitle.

OPENING (first 2-3 paragraphs):
- Start with the most important or interesting fact from the source
- Tell readers what happened and why it matters
- Do NOT start with "In today's world", "It is important to note", or any similar filler

MAIN BODY:
- 4-6 sections with H2 headings
- Each section covers ONE idea -- do not mix topics
- H2 headings should be plain and descriptive, same rules as H1
- Each paragraph makes exactly one point, then moves on
- No summary sentences at the end of each section (that's padding)

`;

    // ============================================================
    // INTERNAL LINKS
    // ============================================================

    if (
      options.includeInternalLinks &&
      options.internalLinkSuggestions &&
      options.internalLinkSuggestions.length > 0
    ) {
      const maxLinks = options.maxInternalLinks || 3;

      prompt += `INTERNAL LINKS:

Add up to ${maxLinks} internal links where they genuinely help the reader learn more.

AVAILABLE LINKS:
${options.internalLinkSuggestions.map((link, i) =>
  `${i + 1}. "${link.title}" -- ${link.url}`
).join('\n')}

Format: <a href="URL">descriptive anchor text</a>
Do not force links in -- only add them where they fit naturally.

`;
    }

    // ============================================================
    // EXTERNAL LINKS -- ALWAYS ON FOR PIPELINE ARTICLES
    // ============================================================

    prompt += `EXTERNAL LINKS:

Add 2-3 external links to authoritative sources where relevant.

Good sources: Wikipedia, government sites (.gov), official organization websites, major news publications.

Format: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>

Rules:
- Only link to URLs you are highly confident actually exist
- Do NOT invent URLs or guess at web addresses
- If unsure, skip the link rather than fabricating one
- Use the link naturally in a sentence -- do not add a "References" section at the end

`;

    // ============================================================
    // OPTIONAL FEATURES
    // ============================================================

    if (options.includeStatistics) {
      prompt += `STATISTICS: Include relevant statistics only if the source material supports them. Never invent numbers.

`;
    }

    if (options.includeExamples) {
      prompt += `EXAMPLES: Include real examples grounded in the source material where they help explain a point.

`;
    }

    if (options.includeFAQ) {
      prompt += `FAQ SECTION: After the main body, add 4-5 questions real readers would ask, with direct plain-language answers.

`;
    }

    // ============================================================
    // CONCLUSION
    // ============================================================

    prompt += `CONCLUSION:
- 2-3 paragraphs maximum
- Summarize only what has not already been said
- End with a clear takeaway or implication -- not a motivational statement
- Do NOT say "In conclusion" or "To summarize"

`;

    if (options.callToAction) {
      prompt += `Include this call-to-action naturally: ${options.callToAction}\n\n`;
    }

    // ============================================================
    // HTML FORMATTING
    // ============================================================

    prompt += `HTML FORMATTING:

- <h1> for the main title (ONE only -- do not repeat the title anywhere else in the article)
- <h2> for sections
- <h3> for subsections if needed
- <p> for paragraphs
- <ul>/<ol>/<li> for lists
- <a href="URL">text</a> for links
- No markdown

`;

    // ============================================================
    // AVOID LIST
    // ============================================================

    prompt += `NEVER DO THESE:
- Repeat the title as the first line after the H1
- Start the article body with the headline again in any form
- Use "In today's fast-paced world" or any similar opener
- Write "It is worth noting that..." or "It is important to understand..."
- End sections with a sentence that just restates what the section said
- Invent quotes, statistics, studies, or URLs
- Use the word "delve", "realm", "landscape", "crucial", "vital", "game-changing"
- Pad sentences to reach word count

`;

    // ============================================================
    // SEO
    // ============================================================

    prompt += `SEO: ${this.buildSEOGuidance(keyword, options.seoFocus, options.targetKeywordDensity)}

`;

    // ============================================================
    // CUSTOM
    // ============================================================

    if (options.customPrompt) {
      prompt += `ADDITIONAL REQUIREMENTS:\n${options.customPrompt}\n\n`;
    }

    if (options.extraInstructions) {
      prompt += `EXTRA GUIDELINES:\n${options.extraInstructions}\n\n`;
    }

    // ============================================================
    // FINAL
    // ============================================================

    prompt += `Now write the article. Start with <h1>. Go straight into the content after the title -- no repeated headline, no subtitle.
`;

    return prompt;
  }

  buildSystemMessage(): string {
    return `You are a journalist and editor who writes clear, direct articles for general readers.

YOUR RULES:

1. PLAIN LANGUAGE
Write the way a smart person explains something to a friend.
Short sentences. Everyday words. No jargon without explanation.
Say "use" not "utilize". Say "help" not "facilitate". Say "now" not "at this juncture".

2. NO PADDING
Every sentence must add new information.
Do not restate what you just said. Do not summarize at the end of each section.
If you have nothing new to say, stop writing.

3. PLAIN HEADLINES
One H1. Short. No colon splitting it into two parts. No buzzwords.
Same rules for H2 headings inside the article.
Never repeat the H1 title anywhere in the article body.

4. SOURCE FIRST
When source material is provided, use it as the primary reference.
Do not invent facts, quotes, statistics, or citations.
If something is uncertain, say so simply rather than fabricating details.

5. EXTERNAL LINKS
Always include 2-3 links to real, authoritative external sources.
Only use URLs you are confident actually exist. Never invent a URL.

FORMATTING:
- Semantic HTML only: h1, h2, h3, p, ul, ol, li, a
- One h1 only
- No markdown
- No repeated title after the h1

NEVER USE THESE WORDS OR PHRASES:
delve, realm, landscape, crucial, vital, game-changing, transformative, unveiling,
navigating, empowering, comprehensive guide, in-depth look, it is worth noting,
in today's fast-paced world, in an era of, as we can see, to summarize,
in conclusion, this is important because`;
  }

  private buildSEOGuidance(keyword: string, focus?: string, density?: number): string {
    let guidance = `Mention "${keyword}" naturally where it fits. `;

    switch (focus) {
      case 'primary_keyword':
        guidance += `Use the exact phrase naturally throughout.`;
        break;
      case 'semantic_keywords':
        guidance += `Focus on related concepts and semantic variations.`;
        break;
      case 'long_tail':
        guidance += `Include natural long-tail variations in headings and body.`;
        break;
      default:
        guidance += `Balance the keyword with natural language.`;
    }

    if (density && density > 0) {
      guidance += ` Target ~${density}% density but prioritize readability.`;
    }

    return guidance;
  }

  private getStyleReference(style: string): string {
    const references: Record<string, string> = {
      conversational: 'a thoughtful writer for The Atlantic or Medium',
      academic: 'an accessible academic researcher',
      journalistic: 'a professional news journalist',
      technical: 'a precise technical educator',
      creative: 'a narrative feature writer',
    };
    return references[style] || references.conversational;
  }

  private getAudienceDescription(audience: string): string {
    if (audience.toLowerCase().includes('beginner')) {
      return 'Explain everything clearly -- assume no prior knowledge.';
    }
    if (audience.toLowerCase().includes('expert') || audience.toLowerCase().includes('advanced')) {
      return 'Skip the basics -- focus on depth and nuance.';
    }
    return 'Assume intelligence but not expertise -- explain ideas without being condescending.';
  }

  validateInternalLinks(
    content: string,
    requiredLinks: InternalLink[]
  ): {
    valid: boolean;
    foundLinks: number;
    missingLinks: InternalLink[];
    issues: string[];
  } {
    const issues: string[] = [];
    const missingLinks: InternalLink[] = [];
    let foundLinks = 0;

    for (const link of requiredLinks) {
      if (content.includes(link.url)) {
        foundLinks++;
      } else {
        missingLinks.push(link);
      }
    }

    const minRequired = Math.ceil(requiredLinks.length * 0.5);
    const valid = foundLinks >= minRequired;

    if (!valid) {
      issues.push(`Only ${foundLinks} of ${requiredLinks.length} internal links included (minimum: ${minRequired})`);
    }

    const anchorTags = content.match(/<a\s+href="[^"]+">.*?<\/a>/gi) || [];
    if (anchorTags.length < foundLinks) {
      issues.push('Some URLs were found but not properly formatted as anchor tags');
    }

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