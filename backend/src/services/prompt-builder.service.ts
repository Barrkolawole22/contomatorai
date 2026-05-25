// backend/src/services/prompt-builder.service.ts
import logger from '../config/logger';

export type ContentMode =
  | 'seo_blog'
  | 'news'
  | 'academic'
  | 'technical'
  | 'commercial'
  | 'opinion'
  | 'listicle';

interface InternalLink {
  url: string;
  title: string;
  description?: string;
  relevanceScore?: number;
}

interface PromptOptions {
  // Primary mode — drives structure, voice, and defaults
  contentMode?: ContentMode;

  // Legacy fields — used as fallback when contentMode is not set
  tone?: string;
  writingStyle?: string;

  wordCount?: number;
  targetAudience?: string;
  includeIntroduction?: boolean;
  includeConclusion?: boolean;
  includeFAQ?: boolean;
  contentIntent?: 'informational' | 'navigational' | 'commercial' | 'transactional';
  customPrompt?: string;
  additionalContext?: string;
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
  sourceUrl?: string;
  sourceName?: string;
  articleImages?: Array<{ url: string; alt: string }>;
}

export class PromptBuilderService {

  /** Resolve a ContentMode from the options, with legacy writingStyle fallback. */
  private resolveMode(options: PromptOptions): ContentMode {
    if (options.contentMode) return options.contentMode;
    switch (options.writingStyle) {
      case 'journalistic': return 'news';
      case 'academic':     return 'academic';
      case 'technical':    return 'technical';
      case 'creative':     return 'opinion';
      default:             return 'seo_blog';
    }
  }

  buildMasterPrompt(keyword: string, options: PromptOptions, attempt: number = 1): string {
    const mode = this.resolveMode(options);
    const targetWordCount = options.wordCount || this.modeDefaults(mode).wordCount;
    let prompt = '';

    // ── ROLE + TASK ────────────────────────────────────────────────────────
    prompt += this.buildRoleBlock(mode, keyword);

    // ── SOURCE MATERIAL ───────────────────────────────────────────────────
    if (options.additionalContext) {
      prompt += `SOURCE MATERIAL (use as your primary reference):

---
${options.additionalContext}
---

Extract specific details: names, dates, figures, locations, events, quotes.
Do NOT invent facts. If the source is thin, keep claims conservative.

`;
    }

    // ── WORD COUNT ────────────────────────────────────────────────────────
    prompt += `TARGET LENGTH: ${targetWordCount} words.

Every sentence must add new information. Do not restate what you just said. Tight writing beats padding.

`;

    if (attempt > 1) {
      prompt += `RETRY NOTE: Previous attempt had quality issues. Write complete sections, no placeholders, proper ending.\n\n`;
    }

    // ── MODE-SPECIFIC WRITING RULES ───────────────────────────────────────
    prompt += this.buildWritingRulesBlock(mode, options);

    // ── HEADLINE ──────────────────────────────────────────────────────────
    prompt += this.buildHeadlineBlock(mode);

    // ── STRUCTURE ─────────────────────────────────────────────────────────
    prompt += this.buildStructureBlock(mode, options);

    // ── IMAGES ────────────────────────────────────────────────────────────
    if (options.articleImages?.length) {
      prompt += `IMAGES — YOU MUST INCLUDE THESE:

Place the following image(s) inside the article body:

<figure>
  <img src="IMAGE_URL" alt="ALT_TEXT" style="max-width:100%;height:auto;" />
  <figcaption>BRIEF_CAPTION</figcaption>
</figure>

First image: after the opening section. Additional images: mid-article near relevant content.

Available images:
${options.articleImages.map((img, i) => `Image ${i + 1}: src="${img.url}" alt="${img.alt || keyword}"`).join('\n')}

Do NOT skip the images.

`;
    }

    // ── LINKS ─────────────────────────────────────────────────────────────
    prompt += this.buildLinksBlock(mode, options);

    // ── OPTIONAL FEATURES ─────────────────────────────────────────────────
    if (options.includeStatistics) {
      prompt += `STATISTICS: Use relevant statistics from the source or well-known data. Never fabricate numbers.\n\n`;
    }
    if (options.includeExamples) {
      prompt += `EXAMPLES: Include real, concrete examples. Generic illustrations are not enough.\n\n`;
    }
    if (options.includeComparisons) {
      prompt += `COMPARISONS: Include a direct comparison (table or prose) where it adds genuine value.\n\n`;
    }
    if (options.includeFAQ) {
      prompt += `FAQ SECTION: After the main body, add 4-5 questions real readers would ask, with direct plain-language answers.\n\n`;
    }

    // ── CONCLUSION ────────────────────────────────────────────────────────
    prompt += this.buildConclusionBlock(mode, options);

    // ── HTML FORMATTING ───────────────────────────────────────────────────
    prompt += `HTML FORMATTING:
- <h1> for the headline (ONE only — never repeat it in the article body)
- <h2> for major sections
- <h3> for subsections
- <p> for paragraphs
- <figure><img .../><figcaption>...</figcaption></figure> for images
- <a href="...">text</a> for links
- <ul>/<ol>/<li> for genuine lists
- No markdown

`;

    // ── SEO ───────────────────────────────────────────────────────────────
    prompt += `SEO: ${this.buildSEOGuidance(keyword, options.seoFocus, options.targetKeywordDensity)}\n\n`;

    // ── CUSTOM ────────────────────────────────────────────────────────────
    if (options.customPrompt)     prompt += `ADDITIONAL REQUIREMENTS:\n${options.customPrompt}\n\n`;
    if (options.extraInstructions) prompt += `EXTRA GUIDELINES:\n${options.extraInstructions}\n\n`;

    // ── NEVER DO ──────────────────────────────────────────────────────────
    prompt += `NEVER DO THESE:
- Repeat the H1 anywhere in the article body after its opening tag
- Use: delve, realm, landscape, crucial, vital, game-changing, transformative, comprehensive
- Invent quotes, statistics, names, or URLs
- Pad sentences to reach word count
- Skip images if they were provided above
- Include fewer than 5 links

`;

    prompt += `Now write the complete article. Start with <h1>. Include all provided images and all 5+ links.\n`;
    return prompt;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ROLE BLOCKS
  // ═══════════════════════════════════════════════════════════════════════

  private buildRoleBlock(mode: ContentMode, keyword: string): string {
    switch (mode) {
      case 'news':
        return `You are a professional news reporter writing an original news article about: "${keyword}"\n\nWrite this the way a journalist would for a reputable outlet — factual, specific, and engaging.\n\n`;

      case 'academic':
        return `You are a subject matter expert writing an academic-style research article about: "${keyword}"\n\nWrite with scholarly rigor: precise language, evidence-based claims, formal register, and clear argumentation. Your audience is educated readers who expect depth and intellectual honesty.\n\n`;

      case 'technical':
        return `You are a technical writer creating a practical, step-by-step guide about: "${keyword}"\n\nWrite for someone who needs to get this done — precise, actionable, nothing wasted. Assume they are competent but unfamiliar with this specific task.\n\n`;

      case 'commercial':
        return `You are an experienced product reviewer writing an honest, thorough review about: "${keyword}"\n\nWrite to help readers make a real decision — balance positives and negatives, be specific about features, and give a clear verdict.\n\n`;

      case 'opinion':
        return `You are a columnist writing a persuasive, well-argued opinion piece about: "${keyword}"\n\nTake a clear, confident position and defend it with evidence, logic, and acknowledgment of counterarguments. Do not hedge or sit on the fence.\n\n`;

      case 'listicle':
        return `You are a content writer creating a well-structured listicle about: "${keyword}"\n\nWrite to be scanned, saved, and shared — clear items, useful concrete details, consistent structure throughout.\n\n`;

      default: // seo_blog
        return `You are an SEO content writer creating a helpful, authoritative article about: "${keyword}"\n\nWrite the way a knowledgeable person would explain this to a curious friend — clear, direct, and genuinely useful. Answer what people actually want to know.\n\n`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WRITING RULES BLOCKS
  // ═══════════════════════════════════════════════════════════════════════

  private buildWritingRulesBlock(mode: ContentMode, options: PromptOptions): string {
    switch (mode) {
      case 'news':
        return `NEWS WRITING RULES:

1. LEAD PARAGRAPH (first 2-3 sentences):
   - Answer: Who, What, When, Where, Why
   - Use specific details: real names, actual dates, specific locations
   - Most important fact goes first

2. INVERTED PYRAMID:
   - Most important facts first
   - Supporting details next
   - Background and context last

3. SPECIFICS:
   - Full names on first mention, last name only after
   - Include titles, organisation names, locations
   - Reference specific dates, amounts, statistics from the source

4. ATTRIBUTION:
   - Direct quotes with attribution: John Smith said, "..."
   - Paraphrase with attribution: According to the report, ...
   - Do not fabricate quotes

5. TONE: Neutral and factual. Short sentences. Active voice preferred.

`;

      case 'academic':
        return `ACADEMIC WRITING RULES:

1. REGISTER: Formal throughout — no contractions, no colloquialisms, no casual phrases.

2. THIRD PERSON: Preferred for objectivity. First person acceptable only for stated positions: "This article argues..."

3. HEDGING: Use appropriate epistemic language where certainty is not established:
   - "The evidence suggests...", "This may indicate...", "One interpretation holds that..."
   - Reserve strong claims ("proves", "demonstrates conclusively") for well-established facts.

4. PARAGRAPH STRUCTURE (every paragraph must follow this):
   - Topic sentence: state the claim
   - Evidence: cite or reference the supporting data/authority
   - Analysis: explain what the evidence means and why it matters
   - Link: connect to the broader argument or thesis

5. ATTRIBUTION: Every major factual claim or interpretive position needs a source.
   - "According to [source/author], ...", "As [authority] notes, ...", "Research on X indicates..."

6. COUNTERARGUMENTS: Include at least one section that addresses the strongest opposing view and refutes it with evidence.

7. NO BULLET LISTS in the main body — use prose paragraphs. Lists only in appendix-style sections.

8. SENTENCE VARIETY: Mix complex, compound, and simple sentences. Avoid short staccato sentences in sequence.

`;

      case 'technical':
        return `TECHNICAL WRITING RULES:

1. VOICE: Direct imperative throughout — "Click", "Run", "Open", "Navigate to".
   Second person ("you") exclusively. Never passive voice.

2. PRECISION: Use exact terminology. Never approximate.
   - "Click the blue 'Save Settings' button in the top-right corner" not "click save somewhere"
   - Include version numbers, file paths, exact command syntax where relevant

3. STEPS: One action per step. State the expected outcome after each step:
   - "Click Install. You should see a green confirmation banner appear."

4. WARNINGS AND NOTES: Call out important context explicitly:
   - NOTE: for important information the reader must know
   - WARNING: for actions that could cause problems or data loss
   - TIP: for shortcuts or best practices

5. PREREQUISITES: Always list what is needed before the guide begins.

6. CODE/COMMANDS: Wrap all code, commands, and file paths in <code> tags.

7. SENTENCE LENGTH: Short. One idea per sentence. No nested clauses.

`;

      case 'commercial':
        return `COMMERCIAL/REVIEW WRITING RULES:

1. UPFRONT VERDICT: Start with a clear position — do not make the reader wait for your opinion.

2. SPECIFICITY: Avoid vague praise or criticism. Always say WHY.
   - BAD: "The interface is confusing."
   - GOOD: "The settings panel buries the export option three levels deep, making it hard to find."

3. BALANCED ASSESSMENT: Positive reviewers are not trusted. Include genuine negatives even for products you recommend.

4. WHO IT'S FOR / WHO IT'S NOT: Be explicit about the target user. This is more useful than generic praise.

5. COMPARISONS: Name the most relevant alternative and compare directly on key dimensions.

6. FEATURES: Discuss features in terms of real-world impact, not spec-sheet listing.

7. EVIDENCE: Support claims with specific observations. "In testing, the battery lasted X hours" beats "battery life is good."

8. CTA: End with a clear recommendation and a reason to act now or wait.

`;

      case 'opinion':
        return `OPINION/EDITORIAL WRITING RULES:

1. THESIS FIRST: State your position clearly in the first two paragraphs. Do not bury it.

2. CONFIDENT VOICE: Write with conviction. Hedge only when genuinely uncertain — hedging your main argument is a weakness.

3. ARGUMENT STRUCTURE: Each body section makes one argument, supports it with evidence, and connects it back to your thesis.

4. COUNTERARGUMENT SECTION (required): Directly address the strongest opposing view.
   - Name it honestly — do not strawman
   - Refute it with evidence or logic
   - This is what separates opinion writing from opinion opinion

5. EVIDENCE TYPES: Use a mix — statistics, expert quotes, specific examples, historical precedent, analogies.

6. FIRST PERSON: Acceptable and often preferred for editorials. "I argue...", "In my view..." are fine.

7. TONE: Authoritative but not preachy. Make your case — don't lecture.

8. ACTIVE VOICE: Strong verbs. Cut passive constructions ruthlessly.

9. PROVOCATIVE OPENER: Start with something that creates tension or surprise — a statistic, a contradiction, a sharp observation. Not a question.

`;

      case 'listicle':
        return `LISTICLE WRITING RULES:

1. ITEM STRUCTURE: Every item must follow the same structure:
   - H3 with number and title: "1. Item Name" or "Item Name" depending on headline style
   - Opening sentence: what it is or why it matters
   - 2-3 sentences of detail: specific, concrete, actionable
   - One practical tip, example, or insight per item

2. PARALLELISM: Items must be consistent in length, format, and depth. No item should be twice as long as another.

3. SCANABILITY: The reader should be able to read the H3s and understand the list without reading the body.

4. SPECIFICITY: Each item must have something concrete — a name, a number, a technique, an example. Vague items are useless.

5. ORDER: Arrange items logically — by importance (most important first), by difficulty (easiest first), by sequence, or by theme. State the ordering principle in the intro.

6. NUMBERING IN H3: Include the number in the heading: <h3>1. Item Title</h3>

7. NO NESTED LISTS: One level of structure per item. No bullet lists inside list items.

`;

      default: // seo_blog
        return `SEO BLOG WRITING RULES:

1. DIRECT ANSWER FIRST: Answer the main question in the first 2-3 sentences. Readers and search engines both reward this.

2. FEATURED SNIPPET PARAGRAPH: In the second or third paragraph, include a 40-60 word direct, self-contained answer to the main keyword question. Format it as a single <p> tag. This is your snippet bait.

3. QUESTION-BASED H2s: Write section headings as questions people actually search.
   - "How does X work?", "What are the benefits of Y?", "When should you use Z?"
   - Check: could this H2 be a Google search query? If yes, good.

4. SHORT PARAGRAPHS: 2-4 sentences maximum. One idea per paragraph.

5. CONVERSATIONAL TONE: Write like a smart person explaining something. No academic stiffness. Use "you" throughout.

6. LISTS AND TABLES: Use them when genuinely listing items or comparing options. Not just to break up text.

7. READABILITY: Eighth-grade reading level. Short sentences preferred. Long words only when no shorter alternative exists.

8. AUDIENCE: ${this.getAudienceDescription(options.targetAudience || 'general audience')}

`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HEADLINE BLOCKS
  // ═══════════════════════════════════════════════════════════════════════

  private buildHeadlineBlock(mode: ContentMode): string {
    switch (mode) {
      case 'news':
        return `HEADLINE:
Specific, factual, under 12 words. No colon splits. No buzzwords.
Use real names, numbers, or locations from the story.
Examples:
- "EFCC Arrests 47 in Lagos as Online Fraud Sweep Expands"
- "Court Orders Meta to Delete Millions of User Records"

`;

      case 'academic':
        return `HEADLINE:
Descriptive noun phrase that states the topic and scope. Colons acceptable for academic titles.
Do not use a question as the headline. Be specific about what the article covers.
Examples:
- "The Economic Consequences of Digital Currency Adoption in Sub-Saharan Africa"
- "Misinformation Spread on Social Media: Mechanisms, Effects, and Policy Responses"

`;

      case 'technical':
        return `HEADLINE:
"How to" or task-completion framing. State exactly what the reader will achieve.
Include the technology/tool/context in the title.
Examples:
- "How to Set Up a WordPress Site from Scratch in Under an Hour"
- "Deploying a Node.js App to AWS EC2: A Step-by-Step Guide"

`;

      case 'commercial':
        return `HEADLINE:
Review or comparison framing. Include product name, year if relevant, honest framing.
Avoid superlatives without evidence. Specific beats vague.
Examples:
- "Notion vs Obsidian: Which Note-Taking App Is Right for You in 2025?"
- "Dyson V15 Review: Impressive Suction, But Is It Worth the Price?"

`;

      case 'opinion':
        return `HEADLINE:
Sharp, provocative, takes a position. Under 12 words. Readers should feel mild tension or surprise.
Do not use a question as the headline — state the argument.
Examples:
- "Nigeria's Startup Scene Is Overrated — and the Numbers Prove It"
- "The Four-Day Work Week Is Not a Perk. It's a Business Strategy."

`;

      case 'listicle':
        return `HEADLINE:
Number + topic + reader benefit. Classic listicle format. Be specific about the count.
Examples:
- "12 Free Tools That Will Double Your Writing Productivity"
- "7 Nigerian Contract Law Principles Every Business Owner Must Know"

`;

      default: // seo_blog
        return `HEADLINE:
Clear, curiosity-driven, under 12 words. What does the reader get from reading this?
Include the primary keyword naturally. Avoid clickbait — be specific.
Examples:
- "What Is SEO? A Beginner's Guide That Actually Makes Sense"
- "How to Write a Cover Letter That Gets Responses (With Examples)"

`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STRUCTURE BLOCKS
  // ═══════════════════════════════════════════════════════════════════════

  private buildStructureBlock(mode: ContentMode, options: PromptOptions): string {
    switch (mode) {
      case 'news':
        return `ARTICLE STRUCTURE:
Start with <h1>. Go straight into the article — no subtitle, no repeated title.

SECTIONS:
- Lead paragraph (Who/What/When/Where/Why, most important fact first)
- 4-6 sections with short, plain H2 headings
- Each section covers ONE idea
- Background/context section (near the end)
- Authority/expert commentary: What the relevant regulator, official body, or expert says

`;

      case 'academic':
        return `ARTICLE STRUCTURE:
Start with <h1>. Follow academic article structure precisely.

SECTIONS (required, in this order):
1. ABSTRACT (H2): 150-200 word summary — problem, approach, key findings, significance
2. INTRODUCTION (H2): Background, why this matters, problem statement, thesis (your central argument stated clearly)
3. BODY SECTIONS (3-5 H2 sections): Each develops one component of the argument
   - Use descriptive noun-phrase headings, not questions
   - Each section: topic sentence → evidence → analysis → link to thesis
4. DISCUSSION (H2): Interpret the evidence, acknowledge limitations, address counterarguments
5. CONCLUSION (H2): Restate thesis, summarise key evidence, broader implications, areas for further research

HEADING STYLE: "The Role of X in Y" not "What Is the Role of X?"

`;

      case 'technical':
        return `ARTICLE STRUCTURE:
Start with <h1>. Structure this as a complete, usable guide.

SECTIONS (required):
1. OVERVIEW (no heading needed): 2-3 sentences — what this guide covers, who it's for, what you'll achieve
2. PREREQUISITES (H2): Bullet list of everything needed before starting (tools, accounts, prior knowledge)
3. STEP-BY-STEP INSTRUCTIONS (H2 per major phase, numbered steps within each):
   - Each step: action (imperative) + expected outcome
   - Group related steps under H2 phases, use H3 for sub-steps if needed
4. TROUBLESHOOTING (H2): 3-5 common errors with specific solutions
5. SUMMARY (H2): What was accomplished, what to do next

NOTES/WARNINGS: Use NOTE:, WARNING:, TIP: in bold before the relevant paragraph.

`;

      case 'commercial':
        return `ARTICLE STRUCTURE:
Start with <h1>. Follow a reviewer structure that helps readers decide.

SECTIONS (required):
1. QUICK VERDICT (H2): 2-3 sentences — your overall verdict and who should buy/use this
2. OVERVIEW (H2): What it is, what problem it solves, key specs
3. KEY FEATURES (H2): Discuss 3-5 features in terms of real-world impact (not spec-sheet)
4. PROS (H2): Specific positives with evidence
5. CONS (H2): Genuine negatives — no product is perfect
6. WHO IT'S FOR / WHO SHOULD AVOID IT (H2): Be explicit about the ideal and non-ideal user
7. HOW IT COMPARES (H2): Direct comparison with 1-2 main alternatives
8. FINAL VERDICT (H2): Definitive recommendation with a reason. Include CTA if applicable.

`;

      case 'opinion':
        return `ARTICLE STRUCTURE:
Start with <h1>. Follow an essay/editorial structure.

SECTIONS:
1. HOOK + THESIS (opening, no H2 needed): Provocative statement or sharp observation → your clear position in 1-2 sentences
2. ARGUMENT SECTIONS (H2 per argument, 3-4 sections):
   - Each section makes one supporting argument
   - Lead with the claim, support with evidence (data, quotes, examples, precedent), connect to thesis
3. COUNTERARGUMENT (H2): The strongest opposing view, stated honestly, refuted with evidence
4. BROADER IMPLICATION (H2, optional): Why this matters beyond the immediate topic
5. CONCLUSION: Restate your position, call to reflection or action — do NOT soften your stance at the end

`;

      case 'listicle':
        return `ARTICLE STRUCTURE:
Start with <h1>. Follow a tight listicle structure.

SECTIONS:
1. INTRO (no H2): 3-4 sentences — why this list matters, who it's for, what ordering principle is used (importance/difficulty/sequence)
2. LIST ITEMS: H3 with number and title for each item
   - Structure per item: what it is → why it matters → one concrete example or tip
   - 2-4 sentences per item, no more
   - Items must be parallel in length and depth
3. CONCLUSION: 2-3 sentences — key takeaway, how to use the list, or what to do next

NUMBER H3s: <h3>1. Item Title</h3>

`;

      default: // seo_blog
        return `ARTICLE STRUCTURE:
Start with <h1>. Go straight into useful content — no fluff opener.

SECTIONS:
1. INTRO (no H2): Direct answer to the main question in 2-3 sentences, then context
2. FEATURED SNIPPET PARAGRAPH: 40-60 word self-contained answer to the primary keyword question
3. BODY SECTIONS (H2 per section, 4-6 sections):
   - Use question-based H2s that match real search queries
   - Short paragraphs (2-4 sentences)
   - Use lists and tables where genuinely useful
4. FAQ (H2, optional): 4-5 questions with direct answers
5. CONCLUSION (H2): Summary of key points, clear takeaway

`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONCLUSION BLOCKS
  // ═══════════════════════════════════════════════════════════════════════

  private buildConclusionBlock(mode: ContentMode, options: PromptOptions): string {
    const cta = options.callToAction
      ? `\nInclude this call-to-action naturally: ${options.callToAction}\n`
      : '';

    switch (mode) {
      case 'news':
        return `CONCLUSION:
2-3 paragraphs. Summarise only what has not already been said.
End with what happens next — what is pending, what readers should watch for, what the broader implication is.
Do NOT say "In conclusion".
${cta}\n`;

      case 'academic':
        return `CONCLUSION:
3-4 paragraphs following this structure:
1. Restate the thesis (different phrasing from the introduction)
2. Summarise the key evidence and what it shows
3. Broader implications — what does this mean for the field/practice/policy?
4. Limitations and areas for further research
Do NOT say "In conclusion" or "To summarise".
${cta}\n`;

      case 'technical':
        return `CONCLUSION:
1-2 paragraphs:
1. Confirm what was accomplished: "You have now successfully..."
2. What to do next: where to go, what to explore, how to extend this
Do NOT summarise the steps — the reader just did them.
${cta}\n`;

      case 'commercial':
        return `CONCLUSION (FINAL VERDICT):
2-3 paragraphs:
1. Restate your recommendation clearly — buy/use it or not, and why in one sentence
2. Who the ideal buyer/user is
3. One final note — best deal, best time to buy, best alternative if the reader decides against it
${cta}\n`;

      case 'opinion':
        return `CONCLUSION:
2-3 paragraphs:
1. Restate your position — stronger than the introduction, now that you've made the case
2. The broader implication — what needs to change, what readers should do, what this means
3. Final line: sharp, memorable, resonant. Not soft. Not a question.
Do NOT soften your argument in the conclusion.
${cta}\n`;

      case 'listicle':
        return `CONCLUSION:
2-3 sentences only:
- Most important takeaway from the list
- How to use or apply what was covered
- Optional: one sentence pointing to the next step or related topic
Do NOT summarise the list.
${cta}\n`;

      default: // seo_blog
        return `CONCLUSION:
2-3 paragraphs. Do not summarise what was just said.
End with a clear takeaway and next step for the reader.
Do NOT say "In conclusion".
${cta}\n`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LINKS BLOCK
  // ═══════════════════════════════════════════════════════════════════════

  private buildLinksBlock(mode: ContentMode, options: PromptOptions): string {
    let prompt = `LINKS — INCLUDE AT LEAST 5:\n\n`;

    // Link 1: Primary source
    if (options.sourceUrl) {
      const sourceName = options.sourceName || 'the original source';
      prompt += `LINK 1 — PRIMARY SOURCE (required):
Attribute naturally in a sentence.
URL: ${options.sourceUrl}
Format: <a href="${options.sourceUrl}" target="_blank" rel="noopener noreferrer">${sourceName}</a>

`;
    } else {
      prompt += `LINK 1 — PRIMARY SOURCE (required):
Attribute the original source or most relevant reference for this topic naturally.
Format: <a href="SOURCE_URL" target="_blank" rel="noopener noreferrer">source name</a>

`;
    }

    // Link 2: Authority — mode-appropriate
    const authorityGuide = this.getModeAuthorityGuidance(mode);
    prompt += `LINK 2 — AUTHORITATIVE REFERENCE (required):
${authorityGuide}
Format: <a href="OFFICIAL_URL" target="_blank" rel="noopener noreferrer">Body/Source Name</a>

`;

    // Links 3+: Internal
    if (options.internalLinkSuggestions?.length) {
      const maxInternal = Math.min(options.internalLinkSuggestions.length, options.maxInternalLinks || 3);
      prompt += `LINKS 3-${2 + maxInternal} — INTERNAL LINKS (required):
Link to these previously published articles where they connect naturally:

${options.internalLinkSuggestions.slice(0, maxInternal).map((link, i) =>
  `${i + 3}. "${link.title}" — ${link.url}${link.description ? `\n   Context: ${link.description}` : ''}`
).join('\n\n')}

Use mid-sentence naturally. Format: <a href="URL">descriptive anchor text</a>

`;
    } else {
      prompt += `LINKS 3-4 — RELATED ARTICLES (required):
Link to 2 relevant previously published articles. Use natural descriptive anchor text.
Format: <a href="/relevant-url">descriptive anchor text</a>

`;
    }

    // Link 5: Additional external
    prompt += `LINK 5 — ADDITIONAL EXTERNAL REFERENCE (required):
One more credible external source relevant to the topic.
Good options: Wikipedia for definitions, Reuters/AP/BBC for context, academic institution, official body.
Only use URLs you are confident exist. Do NOT invent URLs.
Format: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>

`;

    return prompt;
  }

  private getModeAuthorityGuidance(mode: ContentMode): string {
    switch (mode) {
      case 'news':
        return 'The relevant official body, regulator, or authority for this story\'s topic (law enforcement, financial regulator, health authority, governing body, etc.)';
      case 'academic':
        return 'A peer-reviewed journal, academic institution, or authoritative research body relevant to the topic.';
      case 'technical':
        return 'The official documentation site for the tool/technology being discussed (e.g., official docs, RFC, specification).';
      case 'commercial':
        return 'The official product website, or a major independent review platform (e.g., Consumer Reports, Wirecutter, G2).';
      case 'opinion':
        return 'A credible source that provides data, research, or authoritative perspective on the topic of this editorial.';
      case 'listicle':
        return 'An authoritative source that validates or contextualises the list topic.';
      default:
        return 'The most relevant official, government, or authoritative organisation for this topic.';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SYSTEM MESSAGE
  // ═══════════════════════════════════════════════════════════════════════

  buildSystemMessage(): string {
    return `You are a professional writer who produces clear, factual, well-structured articles across all content types: news, academic, technical, commercial reviews, opinion/editorial, listicles, and SEO blogs.

YOUR RULES:

1. FOLLOW THE MODE
   The user prompt specifies a content mode. Each mode has specific structure and voice rules. Follow them exactly.

2. SPECIFICS OVER GENERICS
   Use real names, dates, figures, organisations where available. Vague writing is bad writing.

3. NO PADDING
   Every sentence adds new information. Do not restate. Do not pad to hit word count.

4. IMAGES IN THE ARTICLE
   When images are provided, place them in the article body:
   <figure><img src="..." alt="..." style="max-width:100%;height:auto;"/><figcaption>caption</figcaption></figure>
   First image after the opening section. Never skip provided images.

5. ALL 5 LINKS ARE MANDATORY
   Primary source, authority reference, 2 internal articles, 1 additional external.
   All 5 must appear. No exceptions.

6. ONE H1 ONLY
   Never repeat the title in the article body. Go straight from <h1> into the first paragraph.

7. FORMATTING
   - Semantic HTML only: h1, h2, h3, p, figure, img, figcaption, a, ul, ol, li
   - No markdown. No repeated title after h1.

NEVER USE THESE WORDS OR PHRASES:
delve, realm, landscape, crucial, vital, game-changing, transformative, unveiling,
navigating, empowering, it is worth noting, in today's world, in an era of,
as we can see, to summarise, in conclusion, this is important because,
comprehensive guide, in-depth look, exploring the`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODE DEFAULTS (for frontend and validation use)
  // ═══════════════════════════════════════════════════════════════════════

  modeDefaults(mode: ContentMode): {
    wordCount: number;
    includeFAQ: boolean;
    includeStatistics: boolean;
    includeExamples: boolean;
    includeComparisons: boolean;
    includeConclusion: boolean;
  } {
    switch (mode) {
      case 'news':
        return { wordCount: 800,  includeFAQ: false, includeStatistics: false, includeExamples: false, includeComparisons: false, includeConclusion: true };
      case 'academic':
        return { wordCount: 2500, includeFAQ: false, includeStatistics: true,  includeExamples: true,  includeComparisons: false, includeConclusion: true };
      case 'technical':
        return { wordCount: 2000, includeFAQ: true,  includeStatistics: false, includeExamples: true,  includeComparisons: false, includeConclusion: true };
      case 'commercial':
        return { wordCount: 1500, includeFAQ: false, includeStatistics: true,  includeExamples: true,  includeComparisons: true,  includeConclusion: true };
      case 'opinion':
        return { wordCount: 1200, includeFAQ: false, includeStatistics: true,  includeExamples: true,  includeComparisons: false, includeConclusion: true };
      case 'listicle':
        return { wordCount: 1500, includeFAQ: false, includeStatistics: false, includeExamples: true,  includeComparisons: false, includeConclusion: false };
      default: // seo_blog
        return { wordCount: 1500, includeFAQ: true,  includeStatistics: true,  includeExamples: true,  includeComparisons: false, includeConclusion: true };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private buildSEOGuidance(keyword: string, focus?: string, density?: number): string {
    let guidance = `Mention "${keyword}" naturally in the headline, opening paragraph, and 2-3 times in the body. `;
    switch (focus) {
      case 'primary_keyword':    guidance += `Use the exact phrase naturally throughout.`; break;
      case 'semantic_keywords':  guidance += `Focus on related concepts and semantic variations.`; break;
      case 'long_tail':          guidance += `Include natural long-tail variations in headings and body.`; break;
      default:                   guidance += `Balance the keyword with natural language.`;
    }
    if (density && density > 0) guidance += ` Target ~${density}% density but prioritise readability.`;
    return guidance;
  }

  private getAudienceDescription(audience: string): string {
    if (audience.toLowerCase().includes('beginner')) return 'Explain everything clearly — assume no prior knowledge.';
    if (audience.toLowerCase().includes('expert') || audience.toLowerCase().includes('advanced')) return 'Skip basics — focus on depth and nuance.';
    return 'Assume intelligence but not expertise — explain ideas without being condescending.';
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