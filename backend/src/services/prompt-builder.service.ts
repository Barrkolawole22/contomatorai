// backend/src/services/prompt-builder.service.ts - IMPROVED VERSION
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

    // RAG context comes FIRST — grounding before instructions
    if (options.additionalContext) {
      prompt += `AUTHORITATIVE SOURCE MATERIAL:
The following is your primary knowledge source. You MUST base the article on this content. Do not fabricate statistics, cases, or facts not found here. Expand and explain what is here — do not invent new information outside of this source.

---
${options.additionalContext}
---

Now using the above as your primary source, write a comprehensive article about "${keyword}" for ${audience}.

`;
    } else {
      prompt += `Write a comprehensive, engaging article about "${keyword}" for ${audience}.\n\n`;
    }

    prompt += `TARGET LENGTH: Approximately ${targetWordCount} words (aim close to target, natural ending is more important than exact count)

${attempt > 1 ? 'IMPORTANT: Previous attempt had issues. Focus on complete, well-developed content with proper conclusion. No placeholders or incomplete thoughts.\n\n' : ''}
WRITING STYLE:
Think like an expert writer for ${this.getStyleReference(style)}. Your goal is to inform and engage, not to sell or impress with jargon.

Tone: ${tone}
Audience level: ${this.getAudienceDescription(audience)}

CONTENT STRUCTURE:

1. COMPELLING HEADLINE
Write a specific, benefit-focused headline. Good headlines promise value and intrigue readers.

Examples of strong headlines:
- "How AI Writing Tools Cut Content Creation Time by 60% (Without Sacrificing Quality)"
- "The Complete Guide to Remote Work Productivity: 12 Strategies That Actually Work"
- "Why Traditional Marketing Funnels Are Broken (And What Works Instead)"

Avoid generic patterns like "Everything You Need to Know About X" or "The Ultimate Guide to X" unless you're genuinely comprehensive.

2. STRONG OPENING (150-250 words)
Hook readers immediately. Start with:
- A surprising statistic or fact
- A relatable problem or question
- A bold statement that challenges conventional wisdom
- A brief story or scenario

Then quickly establish:
- Why this topic matters now
- What readers will gain from this article
- Your credibility or perspective

3. MAIN BODY (Core content)
Organize naturally around 4-6 major ideas, each explored in depth:

- Use descriptive H2 headings that tell readers what they'll learn
  Good: "Why Keyword Research Still Matters in 2026"
  Bad: "Keyword Research"

- Develop each section thoroughly (250-400 words)
  * Start with the core concept
  * Explain why it matters
  * Provide specific examples or data
  * Address common misconceptions
  * Give actionable takeaways

- Vary your sentence structure and paragraph length
  * Mix short, punchy sentences with longer explanatory ones
  * Keep paragraphs to 3-5 sentences max
  * Use occasional one-sentence paragraphs for emphasis

- Use concrete numbers and specifics wherever available from the source material`;

    if (options.includeInternalLinks && options.internalLinkSuggestions && options.internalLinkSuggestions.length > 0) {
      const maxLinks = options.maxInternalLinks || 5;
      prompt += `\n\nINTERNAL LINKING (Natural Integration):

Include ${maxLinks} internal links throughout the article where they naturally support the content.

Available links:
${options.internalLinkSuggestions.map((link, index) =>
  `${index + 1}. "${link.title}" (${link.url})${link.description ? `\n   When to use: ${link.description}` : ''}`
).join('\n')}

Linking best practices:
- Link when you're discussing a related topic that needs more depth
- Use descriptive anchor text that indicates what readers will find (not "click here" or "this article")
- Distribute links across different sections naturally
- Format: <a href="URL">descriptive anchor text</a>

Example of natural linking:
"Before diving into advanced strategies, make sure you understand <a href="${options.internalLinkSuggestions[0]?.url}">${options.internalLinkSuggestions[0]?.title?.toLowerCase()}</a>, which forms the foundation of this approach."`;
    }

    if (options.includeStatistics) {
      prompt += '\n\n- Support claims with relevant data and statistics where applicable — only use figures present in the source material';
    }

    if (options.includeExamples) {
      prompt += '\n\n- Include 2-3 detailed real-world examples or case studies that illustrate key points, drawn from the source material where possible';
    }

    if (options.includeComparisons) {
      prompt += '\n\n- Compare different approaches or solutions with specific pros/cons for each';
    }

    if (options.includeFAQ) {
      prompt += `\n\n4. FREQUENTLY ASKED QUESTIONS
Address 5-7 common questions about "${keyword}". Keep answers focused and practical. Each answer should be 2-4 sentences that directly address the question. Base answers on the source material provided.`;
    }

    prompt += `\n\n${options.includeFAQ ? '5' : '4'}. STRONG CONCLUSION (150-200 words)
Wrap up by:
- Summarizing the 3-4 most important takeaways
- Reinforcing the main benefit or transformation
- ${options.callToAction ? `Include this call-to-action naturally: ${options.callToAction}` : 'Giving readers a clear next step'}

QUALITY STANDARDS:

Write like a human expert having a conversation with an intelligent reader:
- Be specific and concrete rather than vague and abstract
- Use "you" to speak directly to readers
- Vary your vocabulary naturally
- Include transitions between ideas
- Write complete, well-developed paragraphs
- Every sentence should add value
- Do NOT invent statistics, studies, or facts not present in the source material

Avoid these AI writing patterns:
- Starting with "In today's digital landscape..." or similar filler
- Using buzzwords without explanation
- Lists of obvious points without depth
- Generic advice without specific examples
- Fabricated data or citations

SEO INTEGRATION:
${this.buildSEOGuidance(keyword, options.seoFocus, options.targetKeywordDensity)}

HTML FORMATTING:
Use clean, semantic HTML:
- <h1> for the main title
- <h2> for major sections
- <h3> for subsections within major sections
- <p> tags for all paragraphs
- <ul>/<ol> and <li> for lists
- <a href="URL">text</a> for links`;

    if (options.customPrompt) {
      prompt += `\n\nADDITIONAL REQUIREMENTS:\n${options.customPrompt}`;
    }

    if (options.extraInstructions) {
      prompt += `\n\nEXTRA GUIDELINES:\n${options.extraInstructions}`;
    }

    prompt += `\n\nNow write the complete article. Ground every claim in the source material provided. Start with <h1> and write through to a satisfying conclusion.`;

    return prompt;
  }

  buildSystemMessage(): string {
    return `You are an expert content writer known for creating engaging, valuable articles that read naturally.

YOUR WRITING PRINCIPLES:

1. GROUND EVERYTHING IN PROVIDED SOURCE MATERIAL
When source material is provided, treat it as the authoritative reference. Do not fabricate facts, statistics, or citations not present in the source. Expand and explain what is there — do not invent beyond it.

2. CLARITY OVER CLEVERNESS
Write clearly and directly. Avoid jargon unless necessary. Explain complex topics simply without being condescending.

3. SPECIFICITY OVER GENERALITY
Use concrete examples, specific numbers, and real scenarios from the source. Remove fluff and filler.

4. VALUE OVER WORD COUNT
Every paragraph should teach something new or provide actionable insight.

5. NATURAL FLOW OVER RIGID STRUCTURE
Let ideas connect naturally. Use transitions. Vary sentence length and structure.

6. READER-FOCUSED OVER KEYWORD-FOCUSED
Write for humans first. Include keywords naturally where they fit, not forced.

FORMATTING:
- Use semantic HTML: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <a>
- Start with <h1> for the title
- Structure sections with <h2>, subsections with <h3>
- Keep all formatting clean and valid

Avoid these common AI writing tells:
- Generic openings ("In today's fast-paced world...")
- Fabricated statistics or studies not in source material
- Buzzword-heavy language without substance
- Repetitive phrasing or sentence structure
- Keyword stuffing
- Placeholder text or incomplete thoughts

Write the article you would want to read, grounded in the facts provided.`;
  }

  private buildSEOGuidance(keyword: string, focus?: string, density?: number): string {
    let guidance = `Mention "${keyword}" naturally throughout the article where it fits. `;

    switch (focus) {
      case 'primary_keyword':
        guidance += `Include the exact phrase "${keyword}" 8-12 times in natural contexts. Vary with related terms.`;
        break;
      case 'semantic_keywords':
        guidance += `Focus on semantic variations and related terms. Use "${keyword}" occasionally but emphasize related concepts.`;
        break;
      case 'long_tail':
        guidance += `Target long-tail variations like "how to [keyword]", "best [keyword] for", "[keyword] tips". Be specific.`;
        break;
      default:
        guidance += `Balance the main keyword with natural variations and related terms. Quality over keyword density.`;
    }

    if (density && density > 0) {
      guidance += `\n\nTarget keyword density: approximately ${density}% (but prioritize natural flow over hitting exact percentages)`;
    }

    return guidance;
  }

  private getStyleReference(style: string): string {
    const references = {
      conversational: 'Medium, The Atlantic, or a knowledgeable friend explaining something they care about',
      academic: 'a journal article or research paper - authoritative but accessible',
      journalistic: 'The New York Times or Wall Street Journal - objective, well-researched, balanced',
      technical: 'a technical blog or documentation - precise, detailed, assumes some expertise',
      creative: 'a feature story or narrative journalism - engaging, story-driven, vivid'
    };

    return references[style as keyof typeof references] || references.conversational;
  }

  private getAudienceDescription(audience: string): string {
    if (audience.toLowerCase().includes('beginner')) {
      return 'Explain concepts clearly without assuming prior knowledge. Define technical terms.';
    }
    if (audience.toLowerCase().includes('expert') || audience.toLowerCase().includes('advanced')) {
      return 'Assume familiarity with basics. Focus on advanced insights and nuanced details.';
    }
    return "Explain key concepts but don't over-explain obvious points. Strike a balance.";
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
      issues.push('Some URLs found but not properly formatted as anchor tags');
    }

    logger.info(`Internal link validation: ${foundLinks}/${requiredLinks.length} links found, valid: ${valid}`);

    return {
      valid,
      foundLinks,
      missingLinks,
      issues
    };
  }

  extractInternalLinks(content: string): Array<{ url: string; anchorText: string }> {
    const linkRegex = /<a\s+href="([^"]+)">([^<]+)<\/a>/gi;
    const links: Array<{ url: string; anchorText: string }> = [];
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