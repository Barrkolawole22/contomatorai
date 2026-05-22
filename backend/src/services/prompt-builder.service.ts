// backend/src/services/prompt-builder.service.ts - IMPROVED RAG + GROUNDING VERSION
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

    /**
     * ============================================================
     * OPENING + SOURCE GROUNDING (MOST IMPORTANT SECTION)
     * ============================================================
     */

    prompt += `Write a comprehensive, engaging, high-quality article about "${keyword}" for ${audience}.\n\n`;

    // STRONG RAG GROUNDING — placed EARLY for token priority
    if (options.additionalContext) {

      prompt += `CRITICAL SOURCE MATERIAL — YOU MUST USE THIS:

The following content comes from the user's knowledgebase and is your PRIMARY source of truth for this article.

YOU MUST:
- Base the article primarily on this material
- Incorporate relevant facts, examples, explanations, terminology, and insights from this source throughout the article
- Expand and explain the ideas naturally and clearly
- Maintain factual consistency with the provided material

YOU MUST NOT:
- Ignore this material
- Invent statistics, studies, cases, quotes, citations, or factual claims not supported by the source
- Contradict the source material
- Fabricate examples pretending they came from the source

If information is missing or uncertain, explain conservatively instead of inventing details.

---
${options.additionalContext}
---

`;
    }

    /**
     * ============================================================
     * TARGET LENGTH
     * ============================================================
     */

    prompt += `TARGET LENGTH: Approximately ${targetWordCount} words

Aim close to the target naturally. A strong, complete article is more important than exact word count.

`;

    /**
     * ============================================================
     * RETRY ATTEMPT HANDLING
     * ============================================================
     */

    if (attempt > 1) {
      prompt += `IMPORTANT RETRY INSTRUCTIONS:

The previous generation attempt had quality issues.

You MUST:
- Write complete, fully developed sections
- Avoid abrupt endings
- Avoid placeholders
- Ensure logical flow between sections
- Finish with a satisfying conclusion
- Maintain depth and specificity throughout

`;
    }

    /**
     * ============================================================
     * WRITING STYLE
     * ============================================================
     */

    prompt += `WRITING STYLE:

Think like an expert writer for ${this.getStyleReference(style)}.

Your goal is to:
- Inform clearly
- Engage naturally
- Provide practical value
- Sound human and thoughtful
- Avoid robotic phrasing

Tone: ${tone}

Audience level:
${this.getAudienceDescription(audience)}

`;

    /**
     * ============================================================
     * CONTENT STRUCTURE
     * ============================================================
     */

    prompt += `CONTENT STRUCTURE:

1. COMPELLING HEADLINE

Write a specific, benefit-focused headline.

Good headlines:
- "How AI Writing Tools Cut Content Creation Time by 60%"
- "Why Traditional Marketing Funnels Are Failing in 2026"
- "12 Remote Work Productivity Strategies That Actually Work"

Avoid generic headlines unless the article is truly comprehensive.

---

2. STRONG OPENING (150-250 words)

Hook readers immediately using:
- A surprising insight
- A relatable challenge
- A bold statement
- A compelling scenario
- A meaningful observation

Then establish:
- Why the topic matters
- Why readers should care now
- What readers will gain

---

3. MAIN BODY

Organize the article around 4-6 meaningful sections.

Each section should:
- Start with a clear core idea
- Explain why it matters
- Include concrete details
- Use examples where relevant
- Deliver practical insight
- Connect naturally to the next idea

SECTION GUIDELINES:

- Use descriptive H2 headings
- Develop sections thoroughly (250-400 words)
- Keep paragraphs readable
- Vary sentence structure naturally
- Use transitions between ideas
- Include specifics instead of vague statements

`;

    /**
     * ============================================================
     * INTERNAL LINKS
     * ============================================================
     */

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
- Use descriptive anchor text
- Avoid "click here"
- Spread links across multiple sections
- Integrate links conversationally

HTML FORMAT:
<a href="URL">descriptive anchor text</a>

`;
    }

    /**
     * ============================================================
     * OPTIONAL CONTENT FEATURES
     * ============================================================
     */

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

    /**
     * ============================================================
     * FAQ SECTION
     * ============================================================
     */

    if (options.includeFAQ) {

      prompt += `4. FREQUENTLY ASKED QUESTIONS

Include 5-7 practical questions readers commonly ask about "${keyword}".

FAQ ANSWERS SHOULD:
- Be direct and useful
- Stay concise
- Remain grounded in the provided source material
- Avoid generic filler responses

`;
    }

    /**
     * ============================================================
     * CONCLUSION
     * ============================================================
     */

    prompt += `${options.includeFAQ ? '5' : '4'}. STRONG CONCLUSION (150-200 words)

The conclusion should:
- Summarize the key takeaways
- Reinforce the article's core message
- Leave readers with clarity or direction
- End naturally and confidently

`;

    if (options.callToAction) {
      prompt += `Include this call-to-action naturally:
${options.callToAction}

`;
    }

    /**
     * ============================================================
     * QUALITY STANDARDS
     * ============================================================
     */

    prompt += `QUALITY STANDARDS:

Write like a knowledgeable human expert speaking clearly to an intelligent reader.

PRIORITIZE:
- Specificity
- Clarity
- Natural flow
- Useful insights
- Real explanations
- Concrete examples

AVOID:
- Generic filler
- Repetitive phrasing
- Buzzword-heavy writing
- Obvious statements without depth
- Keyword stuffing
- Fabricated claims
- Fake studies or citations
- AI-sounding introductions
- Empty motivational language

`;

    /**
     * ============================================================
     * SEO GUIDANCE
     * ============================================================
     */

    prompt += `SEO INTEGRATION:

${this.buildSEOGuidance(keyword, options.seoFocus, options.targetKeywordDensity)}

`;

    /**
     * ============================================================
     * HTML FORMATTING
     * ============================================================
     */

    prompt += `HTML FORMATTING:

Use clean semantic HTML:

- <h1> for the main title
- <h2> for major sections
- <h3> for subsections
- <p> for paragraphs
- <ul>/<ol>/<li> for lists
- <a href="URL">text</a> for links

Do NOT include markdown.

`;

    /**
     * ============================================================
     * EXTERNAL LINKS
     * ============================================================
     */

    if (options.includeExternalLinks) {

      prompt += `EXTERNAL LINKING:

Where genuinely relevant, include 2-3 authoritative external references.

PREFER:
- Wikipedia
- Government websites (.gov)
- Academic institutions (.edu)
- Major trusted publications

FORMAT:
<a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>

IMPORTANT:
- Only include URLs you are highly confident are real and valid
- Do NOT invent URLs
- Do NOT fabricate research sources
- If uncertain, omit the link instead of hallucinating

`;
    }

    /**
     * ============================================================
     * CUSTOM REQUIREMENTS
     * ============================================================
     */

    if (options.customPrompt) {

      prompt += `ADDITIONAL REQUIREMENTS:

${options.customPrompt}

`;
    }

    if (options.extraInstructions) {

      prompt += `EXTRA GUIDELINES:

${options.extraInstructions}

`;
    }

    /**
     * ============================================================
     * FINAL GROUNDING REMINDER (VERY IMPORTANT)
     * ============================================================
     */

    prompt += `IMPORTANT FINAL REMINDER:

You MUST:
- Use the provided source material throughout the article
- Ground factual claims in the supplied context
- Maintain consistency with the knowledgebase
- Prioritize factual accuracy over creativity

You MUST NOT:
- Invent unsupported claims
- Fabricate statistics or citations
- Add fake case studies or research
- Contradict the provided material

Now write the complete article.

Start with <h1> and continue through a complete, satisfying conclusion.
`;

    return prompt;
  }

  buildSystemMessage(): string {

    return `You are an expert content writer known for producing thoughtful, engaging, natural-sounding articles.

YOUR CORE PRINCIPLES:

1. SOURCE MATERIAL IS AUTHORITATIVE
When source material is provided, treat it as the primary factual reference.

You MUST:
- Base the article on the provided material
- Expand and explain naturally
- Preserve factual consistency

You MUST NOT:
- Fabricate claims
- Invent statistics
- Create fake citations
- Add unsupported facts

2. CLARITY OVER COMPLEXITY
Write clearly and directly.
Avoid unnecessary jargon.
Explain ideas naturally.

3. SPECIFICITY OVER VAGUENESS
Use concrete details and meaningful examples.

4. VALUE OVER FLUFF
Every paragraph should contribute useful information.

5. NATURAL HUMAN FLOW
Vary sentence structure.
Use smooth transitions.
Avoid robotic repetition.

6. WRITE FOR PEOPLE FIRST
Prioritize readability and usefulness over SEO manipulation.

FORMATTING RULES:
- Use semantic HTML
- Use <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <a>
- Keep formatting clean and valid

AVOID COMMON AI WRITING PATTERNS:
- "In today's fast-paced world..."
- Generic filler openings
- Buzzword-heavy paragraphs
- Repetitive sentence structures
- Fabricated statistics
- Empty conclusions
- Keyword stuffing

Write like a credible human expert who genuinely understands the topic.`;
  }

  private buildSEOGuidance(
    keyword: string,
    focus?: string,
    density?: number
  ): string {

    let guidance = `Mention "${keyword}" naturally where relevant. `;

    switch (focus) {

      case 'primary_keyword':
        guidance += `Use the exact phrase naturally throughout the article while maintaining readability.`;
        break;

      case 'semantic_keywords':
        guidance += `Focus heavily on semantic relevance and related concepts.`;
        break;

      case 'long_tail':
        guidance += `Target long-tail keyword variations naturally within headings and content.`;
        break;

      default:
        guidance += `Balance the primary keyword with natural language and semantic variations.`;
    }

    if (density && density > 0) {
      guidance += `

Target keyword density:
Approximately ${density}% — but natural writing quality takes priority over exact density.
`;
    }

    return guidance;
  }

  private getStyleReference(style: string): string {

    const references = {
      conversational: 'a thoughtful Medium or Atlantic writer',
      academic: 'an accessible but authoritative academic researcher',
      journalistic: 'a professional investigative journalist',
      technical: 'a precise technical educator or engineer',
      creative: 'a narrative feature writer'
    };

    return references[style as keyof typeof references] || references.conversational;
  }

  private getAudienceDescription(audience: string): string {

    if (audience.toLowerCase().includes('beginner')) {
      return 'Explain concepts clearly without assuming prior knowledge.';
    }

    if (
      audience.toLowerCase().includes('expert') ||
      audience.toLowerCase().includes('advanced')
    ) {
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

    const anchorTags =
      content.match(/<a\s+href="[^"]+">.*?<\/a>/gi) || [];

    if (anchorTags.length < foundLinks) {
      issues.push(
        'Some URLs were found but not properly formatted as anchor tags'
      );
    }

    logger.info(
      `Internal link validation: ${foundLinks}/${requiredLinks.length} links found, valid: ${valid}`
    );

    return {
      valid,
      foundLinks,
      missingLinks,
      issues
    };
  }

  extractInternalLinks(
    content: string
  ): Array<{ url: string; anchorText: string }> {

    const linkRegex =
      /<a\s+href="([^"]+)">([^<]+)<\/a>/gi;

    const links: Array<{
      url: string;
      anchorText: string;
    }> = [];

    let match;

    while ((match = linkRegex.exec(content)) !== null) {

      links.push({
        url: match[1],
        anchorText: match[2]
      });
    }

    return links;
  }
}

export default new PromptBuilderService();