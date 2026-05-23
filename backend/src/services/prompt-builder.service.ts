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

    prompt += `Write a comprehensive, engaging, high-quality article about "${keyword}" for ${audience}.\n\n`;

    if (options.additionalContext) {
      prompt += `CRITICAL SOURCE MATERIAL -- YOU MUST USE THIS:

The following content comes from the source article and is your PRIMARY reference.

YOU MUST:
- Base the article primarily on this material
- Incorporate relevant facts, examples, explanations, and insights from this source
- Expand and explain the ideas naturally and clearly
- Maintain factual consistency with the provided material

YOU MUST NOT:
- Ignore this material
- Invent statistics, studies, cases, quotes, or factual claims not supported by the source
- Contradict the source material
- Fabricate examples pretending they came from the source

If information is missing or uncertain, explain conservatively instead of inventing details.

---
${options.additionalContext}
---

`;
    }

    // ============================================================
    // TARGET LENGTH
    // ============================================================

    prompt += `TARGET LENGTH: Approximately ${targetWordCount} words

Aim close to the target naturally. A strong, complete article is more important than exact word count.

`;

    // ============================================================
    // RETRY ATTEMPT HANDLING
    // ============================================================

    if (attempt > 1) {
      prompt += `IMPORTANT RETRY INSTRUCTIONS:

The previous generation attempt had quality issues. You MUST:
- Write complete, fully developed sections
- Avoid abrupt endings and placeholders
- Ensure logical flow between sections
- Finish with a satisfying conclusion

`;
    }

    // ============================================================
    // WRITING STYLE
    // ============================================================

    prompt += `WRITING STYLE:

Think like an expert writer for ${this.getStyleReference(style)}.

Your goal is to inform clearly, engage naturally, provide practical value, and sound human and thoughtful.

Tone: ${tone}

Audience level: ${this.getAudienceDescription(audience)}

`;

    // ============================================================
    // HEADLINE RULES -- THE MOST IMPORTANT SECTION FOR TITLE QUALITY
    // ============================================================

    prompt += `HEADLINE (H1 TITLE) RULES -- READ CAREFULLY:

The title must be plain, direct, and journalistic. Think newspaper headline, not blog post SEO title.

RULES:
- Use the source headline as your starting point
- Keep it short -- ideally under 10 words, maximum 12
- NO colons, NO semicolons, NO em-dashes splitting two clauses
- NO subtitle after the main title
- NO buzzwords: avoid "navigating", "unyielding", "comprehensive", "ultimate", "in-depth", "exploring", "delving", "crucial", "vital", "game-changing", "transformative", "landscape", "realm", "journey", "unveiling", "empowering"
- NO AI-sounding phrases: avoid "In today's world", "In an era of", "It is worth noting"
- Write it like a journalist, not a content marketer

GOOD examples (plain, direct, under 12 words):
- "BOSCON and Nigerian Law Society Award Blue Silk Despite Legal Dispute"
- "Tinubu Does Not Plan to Rename Nigeria or Abolish Sharia Law"
- "Nigeria Faces Mounting Pressure Over New Electoral Guidelines"
- "Court Rules Against Meta in User Data Privacy Case"

BAD examples (do NOT write titles like these):
- "Navigating the Misinformation Maze: The Truth About Tinubu's Alleged Plans" (colon + too long + buzzword)
- "The Unyielding Path of Professional Recognition: BOSCON's Blue Silk Amidst Legal Turmoil" (colon + flowery + vague)
- "Understanding the Complex Landscape of Nigerian Legal Recognition in 2026" (vague + buzzwords)
- "Exploring How Nigeria's Legal System Handles Professional Disputes" (starts with "Exploring")

If the source has a clear, plain headline already -- use it directly or simplify it slightly.

`;

    // ============================================================
    // CONTENT STRUCTURE
    // ============================================================

    prompt += `CONTENT STRUCTURE:

1. HEADLINE
Follow the headline rules above strictly.

---

2. STRONG OPENING (150-250 words)

Hook readers immediately using one of:
- A surprising insight
- A relatable challenge
- A bold statement
- A compelling scenario

Then establish why the topic matters and what readers will gain.

---

3. MAIN BODY

Organize around 4-6 meaningful sections. Each section should:
- Start with a clear core idea
- Explain why it matters
- Include concrete details and examples
- Connect naturally to the next section

Section guidelines:
- Use descriptive H2 headings (apply the same plain-language rules as the H1)
- Develop sections thoroughly (250-400 words each)
- Keep paragraphs readable
- Vary sentence structure naturally

`;

    // ============================================================
    // INTERNAL LINKS
    // ============================================================

    if (
      options.includeInternalLinks &&
      options.internalLinkSuggestions &&
      options.internalLinkSuggestions.length > 0
    ) {
      const maxLinks = options.maxInternalLinks || 5;

      prompt += `INTERNAL LINKING REQUIREMENTS:

Include up to ${maxLinks} internal links naturally throughout the article.

AVAILABLE INTERNAL LINKS:

${options.internalLinkSuggestions.map((link, index) =>
  `${index + 1}. "${link.title}" (${link.url})${link.description ? `\n   Context: ${link.description}` : ''}`
).join('\n')}

BEST PRACTICES:
- Link naturally where readers would genuinely benefit
- Use descriptive anchor text, not "click here"
- Spread links across multiple sections

HTML FORMAT: <a href="URL">descriptive anchor text</a>

`;
    }

    // ============================================================
    // OPTIONAL CONTENT FEATURES
    // ============================================================

    if (options.includeStatistics) {
      prompt += `STATISTICS:
- Include relevant statistics ONLY if supported by the source material
- Never fabricate numbers or studies

`;
    }

    if (options.includeExamples) {
      prompt += `EXAMPLES:
- Include detailed examples or case studies where appropriate
- Prefer examples grounded in the source material

`;
    }

    if (options.includeComparisons) {
      prompt += `COMPARISONS:
- Compare approaches, tools, methods, or ideas where relevant
- Explain practical pros and cons

`;
    }

    // ============================================================
    // FAQ SECTION
    // ============================================================

    if (options.includeFAQ) {
      prompt += `4. FREQUENTLY ASKED QUESTIONS

Include 5-7 practical questions readers commonly ask about "${keyword}".

FAQ answers should be direct, concise, and grounded in the source material.

`;
    }

    // ============================================================
    // CONCLUSION
    // ============================================================

    prompt += `${options.includeFAQ ? '5' : '4'}. STRONG CONCLUSION (150-200 words)

The conclusion should:
- Summarize the key takeaways
- Reinforce the article's core message
- End naturally and confidently

`;

    if (options.callToAction) {
      prompt += `Include this call-to-action naturally: ${options.callToAction}

`;
    }

    // ============================================================
    // QUALITY STANDARDS
    // ============================================================

    prompt += `QUALITY STANDARDS:

Write like a knowledgeable human expert speaking clearly to an intelligent reader.

PRIORITIZE: Specificity, clarity, natural flow, useful insights, concrete examples.

AVOID:
- Generic filler and repetitive phrasing
- Buzzword-heavy writing
- AI-sounding introductions ("In today's fast-paced world...")
- Keyword stuffing
- Fabricated claims, fake studies, or invented citations
- Empty motivational language

`;

    // ============================================================
    // SEO GUIDANCE
    // ============================================================

    prompt += `SEO INTEGRATION:

${this.buildSEOGuidance(keyword, options.seoFocus, options.targetKeywordDensity)}

`;

    // ============================================================
    // HTML FORMATTING
    // ============================================================

    prompt += `HTML FORMATTING:

Use clean semantic HTML:
- <h1> for the main title (one only)
- <h2> for major sections
- <h3> for subsections
- <p> for paragraphs
- <ul>/<ol>/<li> for lists
- <a href="URL">text</a> for links

Do NOT include markdown.

`;

    // ============================================================
    // EXTERNAL LINKS
    // ============================================================

    if (options.includeExternalLinks) {
      prompt += `EXTERNAL LINKING:

Where genuinely relevant, include 2-3 authoritative external references (Wikipedia, .gov, .edu, major publications).

FORMAT: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>

IMPORTANT: Only include URLs you are highly confident are real. Do NOT invent URLs.

`;
    }

    // ============================================================
    // CUSTOM REQUIREMENTS
    // ============================================================

    if (options.customPrompt) {
      prompt += `ADDITIONAL REQUIREMENTS:\n\n${options.customPrompt}\n\n`;
    }

    if (options.extraInstructions) {
      prompt += `EXTRA GUIDELINES:\n\n${options.extraInstructions}\n\n`;
    }

    // ============================================================
    // FINAL REMINDER
    // ============================================================

    prompt += `FINAL REMINDER:

- Follow the headline rules strictly -- short, plain, no colons, no buzzwords
- Use the provided source material throughout
- Ground factual claims in the supplied context
- Do not invent unsupported claims, statistics, or citations

Now write the complete article. Start with <h1> and finish with a complete conclusion.
`;

    return prompt;
  }

  buildSystemMessage(): string {
    return `You are an expert content writer known for producing clear, direct, human-sounding articles.

YOUR CORE PRINCIPLES:

1. PLAIN HEADLINES
Write titles like a newspaper editor, not a content marketer.
Short. Direct. No colons splitting two clauses. No buzzwords.
If the source has a usable headline, adapt it directly.

2. SOURCE MATERIAL IS AUTHORITATIVE
When source material is provided, treat it as the primary factual reference.
Base the article on it. Do not fabricate claims, statistics, or citations.

3. CLARITY OVER COMPLEXITY
Write clearly and directly. Avoid unnecessary jargon.

4. SPECIFICITY OVER VAGUENESS
Use concrete details and meaningful examples.

5. VALUE OVER FLUFF
Every paragraph should contribute useful information.

6. NATURAL HUMAN FLOW
Vary sentence structure. Use smooth transitions. Avoid robotic repetition.

FORMATTING RULES:
- Use semantic HTML: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <a>
- One <h1> only -- the main title
- Keep formatting clean and valid
- No markdown

AVOID THESE AI WRITING PATTERNS AT ALL TIMES:
- "In today's fast-paced world..."
- "It is worth noting that..."
- "In an era of..."
- "Navigating the [noun] landscape"
- "Exploring the [adjective] realm of"
- "The unyielding/transformative/comprehensive journey"
- Colons splitting headline into title + subtitle
- Generic filler openings
- Fabricated statistics or studies
- Keyword stuffing
- Empty conclusions

Write like a credible human journalist or subject-matter expert.`;
  }

  private buildSEOGuidance(
    keyword: string,
    focus?: string,
    density?: number
  ): string {
    let guidance = `Mention "${keyword}" naturally where relevant. `;

    switch (focus) {
      case 'primary_keyword':
        guidance += `Use the exact phrase naturally throughout while maintaining readability.`;
        break;
      case 'semantic_keywords':
        guidance += `Focus on semantic relevance and related concepts.`;
        break;
      case 'long_tail':
        guidance += `Target long-tail keyword variations naturally within headings and content.`;
        break;
      default:
        guidance += `Balance the primary keyword with natural language and semantic variations.`;
    }

    if (density && density > 0) {
      guidance += `\n\nTarget keyword density: approximately ${density}% -- but natural writing quality takes priority.`;
    }

    return guidance;
  }

  private getStyleReference(style: string): string {
    const references: Record<string, string> = {
      conversational: 'a thoughtful Medium or Atlantic writer',
      academic: 'an accessible but authoritative academic researcher',
      journalistic: 'a professional investigative journalist',
      technical: 'a precise technical educator or engineer',
      creative: 'a narrative feature writer',
    };
    return references[style] || references.conversational;
  }

  private getAudienceDescription(audience: string): string {
    if (audience.toLowerCase().includes('beginner')) {
      return 'Explain concepts clearly without assuming prior knowledge.';
    }
    if (audience.toLowerCase().includes('expert') || audience.toLowerCase().includes('advanced')) {
      return 'Assume familiarity with fundamentals and focus on deeper insights.';
    }
    return 'Balance accessibility with meaningful depth.';
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
      issues.push(
        `Only ${foundLinks} of ${requiredLinks.length} internal links included (minimum: ${minRequired})`
      );
    }

    const anchorTags = content.match(/<a\s+href="[^"]+">.*?<\/a>/gi) || [];
    if (anchorTags.length < foundLinks) {
      issues.push('Some URLs were found but not properly formatted as anchor tags');
    }

    logger.info(
      `Internal link validation: ${foundLinks}/${requiredLinks.length} links found, valid: ${valid}`
    );

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