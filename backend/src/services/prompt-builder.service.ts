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

export type ImpactFormat =
  | 'rate_change_alert'
  | 'policy_shift'
  | 'price_hike_survival'
  | 'feature_removal_warning'
  | 'new_law_breakdown'
  | 'scam_fraud_alert'
  | 'product_recall_guide'
  | 'market_crash_explainer'
  | 'subscription_trap'
  | 'comparison_flip'
  | 'deadline_reminder'
  | 'hidden_cost_revealer'
  | 'upgrade_decision'
  | 'data_breach_response'
  | 'trend_reality_check'
  | 'beginner_entry_point'
  | 'contract_renewal_audit'
  | 'seasonal_timing_guide'
  | 'myth_buster'
  | 'risk_explainer'
  | 'scholarship_new_opening'
  | 'scholarship_deadline_alert'
  | 'scholarship_how_to_apply'
  | 'scholarship_results';

// Maps each impact format to its appropriate base content mode.
export const IMPACT_FORMAT_MODE: Record<ImpactFormat, ContentMode> = {
  rate_change_alert:         'seo_blog',
  policy_shift:              'news',
  price_hike_survival:       'seo_blog',
  feature_removal_warning:   'seo_blog',
  new_law_breakdown:         'news',
  scam_fraud_alert:          'news',
  product_recall_guide:      'seo_blog',
  market_crash_explainer:    'news',
  subscription_trap:         'seo_blog',
  comparison_flip:           'commercial',
  deadline_reminder:         'seo_blog',
  hidden_cost_revealer:      'seo_blog',
  upgrade_decision:          'commercial',
  data_breach_response:      'news',
  trend_reality_check:       'opinion',
  beginner_entry_point:      'seo_blog',
  contract_renewal_audit:    'seo_blog',
  seasonal_timing_guide:     'seo_blog',
  myth_buster:               'opinion',
  risk_explainer:            'seo_blog',
  // Scholarship formats
  scholarship_new_opening:   'seo_blog',
  scholarship_deadline_alert:'seo_blog',
  scholarship_how_to_apply:  'seo_blog',
  scholarship_results:       'news',
};

type OpeningStyle =
  | 'anecdote'
  | 'stat'
  | 'scene'
  | 'provocative'
  | 'direct_answer'
  | 'contradiction'
  | 'question_in_body';

type WriterPersona =
  | 'seasoned_journalist'
  | 'practitioner_expert'
  | 'curious_analyst'
  | 'direct_explainer'
  | 'critical_thinker'
  | 'industry_insider';

interface InternalLink {
  url: string;
  title: string;
  description?: string;
  relevanceScore?: number;
}

interface PromptOptions {
  contentMode?: ContentMode;
  impactFormat?: ImpactFormat;
  niche?: string;
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

// Deterministic pseudo-random pick from seed string
function seededPick<T>(arr: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return arr[hash % arr.length];
}

export class PromptBuilderService {

  private resolveMode(options: PromptOptions): ContentMode {
    if (options.contentMode) return options.contentMode;
    if (options.impactFormat) return IMPACT_FORMAT_MODE[options.impactFormat];
    switch (options.writingStyle) {
      case 'journalistic': return 'news';
      case 'academic':     return 'academic';
      case 'technical':    return 'technical';
      case 'creative':     return 'opinion';
      default:             return 'seo_blog';
    }
  }

  private resolveOpeningStyle(keyword: string, mode: ContentMode): OpeningStyle {
    const byMode: Record<ContentMode, OpeningStyle[]> = {
      news:      ['stat', 'scene', 'direct_answer', 'provocative'],
      academic:  ['stat', 'contradiction', 'direct_answer', 'provocative'],
      technical: ['direct_answer', 'scene', 'stat', 'anecdote'],
      commercial:['provocative', 'stat', 'direct_answer', 'contradiction'],
      opinion:   ['provocative', 'contradiction', 'anecdote', 'stat'],
      listicle:  ['stat', 'direct_answer', 'provocative', 'anecdote'],
      seo_blog:  ['direct_answer', 'stat', 'anecdote', 'scene', 'contradiction'],
    };
    return seededPick(byMode[mode], keyword);
  }

  private resolvePersona(keyword: string, mode: ContentMode): WriterPersona {
    const byMode: Record<ContentMode, WriterPersona[]> = {
      news:      ['seasoned_journalist', 'curious_analyst', 'industry_insider'],
      academic:  ['critical_thinker', 'curious_analyst', 'practitioner_expert'],
      technical: ['practitioner_expert', 'direct_explainer', 'industry_insider'],
      commercial:['critical_thinker', 'industry_insider', 'practitioner_expert'],
      opinion:   ['critical_thinker', 'seasoned_journalist', 'curious_analyst'],
      listicle:  ['direct_explainer', 'practitioner_expert', 'curious_analyst'],
      seo_blog:  ['direct_explainer', 'curious_analyst', 'practitioner_expert', 'industry_insider'],
    };
    return seededPick(byMode[mode], keyword + mode);
  }

  buildMasterPrompt(keyword: string, options: PromptOptions, attempt: number = 1): string {
    const mode = this.resolveMode(options);
    const openingStyle = this.resolveOpeningStyle(keyword, mode);
    const persona = this.resolvePersona(keyword, mode);
    const targetWordCount = options.wordCount || this.modeDefaults(mode).wordCount;
    const useImpactFormat = !!options.impactFormat;
    let prompt = '';

    prompt += this.buildPersonaBlock(persona, mode, keyword);

    if (options.additionalContext) {
      prompt += `SOURCE MATERIAL (use as your primary reference):

---
${options.additionalContext}
---

Extract specific details: names, dates, figures, locations, events, quotes.
Do NOT invent facts. If the source is thin, keep claims conservative.

`;
    }

    prompt += `TARGET LENGTH: approximately ${targetWordCount} words. Aim within 10% of this. Do not pad to hit it exactly — end when the content is complete.\n\n`;

    if (attempt > 1) {
      prompt += `RETRY NOTE: Previous attempt had quality issues. Write complete sections, no placeholders, proper ending.\n\n`;
    }

    prompt += this.buildHumanSignalsBlock(mode, options);
    prompt += this.buildOpeningStyleBlock(openingStyle, mode, keyword);
    prompt += this.buildWritingRulesBlock(mode, options);

    if (useImpactFormat) {
      prompt += this.buildImpactFormatBlock(options.impactFormat!, keyword, options.niche);
    } else {
      prompt += this.buildHeadlineBlock(mode);
      prompt += this.buildStructureBlock(mode, options);
    }

    if (options.articleImages?.length) {
      prompt += `IMAGES — YOU MUST INCLUDE THESE:

Place image(s) inside the article body using:
<figure>
  <img src="IMAGE_URL" alt="ALT_TEXT" style="max-width:100%;height:auto;" />
  <figcaption>BRIEF_CAPTION</figcaption>
</figure>

First image: after the opening paragraph or first section. Others: mid-article near relevant content.

Available images:
${options.articleImages.map((img, i) => `Image ${i + 1}: src="${img.url}" alt="${img.alt || keyword}"`).join('\n')}

`;
    }

    prompt += this.buildLinksBlock(mode, options);

    if (options.includeStatistics) {
      prompt += `STATISTICS: Use real figures when they genuinely strengthen a point. A well-placed stat beats three weak ones. Never fabricate numbers.\n\n`;
    }
    if (options.includeExamples) {
      prompt += `EXAMPLES: Ground abstract points in concrete reality. Real beats hypothetical. Specific beats generic.\n\n`;
    }
    if (options.includeComparisons) {
      prompt += `COMPARISONS: Compare directly where it adds real value. Name the alternatives. Don't hedge.\n\n`;
    }
    if (!useImpactFormat && options.includeFAQ) {
      prompt += `FAQ SECTION: After the main body, add 4-5 questions real readers would type into Google. Answer each directly in plain language. No padding.\n\n`;
    }

    if (!useImpactFormat) {
      prompt += this.buildConclusionBlock(mode, options);
    }

    prompt += `HTML FORMATTING:
- <h1> headline (ONE only — never repeat in the body)
- <h2> for major sections
- <h3> for subsections
- <p> for paragraphs — including single-sentence paragraphs used for emphasis
- <figure><img .../><figcaption>...</figcaption></figure> for images
- <a href="...">text</a> for links
- <ul>/<ol>/<li> for genuine lists only
- No markdown

`;

    prompt += `SEO: ${this.buildSEOGuidance(keyword, options.seoFocus, options.targetKeywordDensity)}\n\n`;

    if (options.customPrompt)      prompt += `ADDITIONAL REQUIREMENTS:\n${options.customPrompt}\n\n`;
    if (options.extraInstructions) prompt += `EXTRA GUIDELINES:\n${options.extraInstructions}\n\n`;

    prompt += `HARD LIMITS — NEVER DO THESE:
- Repeat the H1 anywhere in the body after its opening tag
- Use: delve, realm, landscape, crucial, vital, game-changing, transformative, comprehensive, navigate, empower, it is worth noting, in today's world, in an era of, as we can see, tapestry, multifaceted, synergy, paradigm, cutting-edge
- Invent quotes, statistics, names, or URLs
- Pad sentences to reach word count
- Skip images if provided
- Include fewer than 5 links
- Sound like every other AI article on this topic

`;

    prompt += `Now write the complete article. Start with <h1>.\n`;
    return prompt;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NICHE CONTEXT RESOLVER
  // ═══════════════════════════════════════════════════════════════════════

  private getNicheContext(niche?: string): { actor: string; consumer: string; unit: string } {
    const n = (niche || '').toLowerCase();
    if (/scholarship|fellowship|bursary|grant|studentship|study.abroad/.test(n))
      return { actor: 'university, foundation, or government body', consumer: 'student or prospective applicant', unit: 'scholarship award, eligibility criteria, or application deadline' };
    if (/financ|bank|invest|loan|credit|insur|mortgage/.test(n))
      return { actor: 'bank, lender, or financial institution', consumer: 'account holder, borrower, or investor', unit: 'interest rate, fee, or yield' };
    if (/tech|saas|software|app|platform|startup/.test(n))
      return { actor: 'software company or platform', consumer: 'user or subscriber', unit: 'subscription price or feature' };
    if (/health|medical|fitness|wellness|pharma/.test(n))
      return { actor: 'provider, insurer, or manufacturer', consumer: 'patient, member, or user', unit: 'cost, coverage, or tracked metric' };
    if (/travel|airline|hotel|hospitality|tourism/.test(n))
      return { actor: 'airline, hotel chain, or booking platform', consumer: 'traveler or loyalty member', unit: 'fee, points value, or booking policy' };
    if (/legal|law|regulat|compliance|court/.test(n))
      return { actor: 'regulator, court, or legislature', consumer: 'individual, business owner, or professional', unit: 'compliance requirement or legal right' };
    if (/gaming|game|hardware|console/.test(n))
      return { actor: 'developer or hardware manufacturer', consumer: 'player or buyer', unit: 'in-game mechanic, price, or hardware spec' };
    if (/real estate|property|housing/.test(n))
      return { actor: 'lender, developer, or regulator', consumer: 'buyer, renter, or homeowner', unit: 'mortgage rate, price, or policy' };
    if (/education|exam|school|university|jamb|waec/.test(n))
      return { actor: 'institution, board, or platform', consumer: 'student or parent', unit: 'fee, policy, or exam requirement' };
    return { actor: 'company or provider', consumer: 'customer or user', unit: 'price, feature, or policy' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMPACT FORMAT BLOCK
  // ═══════════════════════════════════════════════════════════════════════

  private buildImpactFormatBlock(format: ImpactFormat, keyword: string, niche?: string): string {
    const ctx = this.getNicheContext(niche);
    const nicheHint = `NICHE CONTEXT: The entity in this story is a ${ctx.actor}. The reader is a ${ctx.consumer}. The key variable is the ${ctx.unit}.\n\n`;

    const blocks: Record<ImpactFormat, string> = {

      rate_change_alert: `IMPACT FORMAT — RATE CHANGE ALERT
Headline: "[Entity] Just [Raised/Cut] Its [Rate/Fee]: What It Means for Your [Wallet/Account]" — under 12 words, lead with the change not the entity.

H2: What Just Changed
  Bullet list: old rate → new rate, exact effective date, who's affected and who isn't.
H2: Does This Help or Hurt You?
  Direct verdict. No hedging. Quantify the impact in real terms (e.g., "₦12,000 more per year on a ₦500,000 balance").
H2: What to Do Before [Deadline]
  3–4 numbered actions, most urgent first. Be specific — name products, steps, deadlines.
H2: Better Options Right Now
  3 named alternatives with one sentence each on why they're worth switching to now.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags. Real panic questions. 2–3 sentences per answer. Plain English.

Tone: Urgent but grounded. Lead with numbers. Every claim traces to the source material.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      policy_shift: `IMPACT FORMAT — POLICY SHIFT EXPLAINER
Headline: "[Body/Company] Just Changed the Rules on [Topic]: Here's What Actually Changes for You" — under 12 words.

H2: The New Rule in Plain English
  No jargon. One clear paragraph explaining what it does, not what it's called.
H2: What Changes for You (and When)
  Specific date, specific impact. Distinguish: affected now vs. later vs. not at all.
H2: What to Do Before It Takes Effect
  Step-by-step, ordered by urgency. Only include "do nothing" if that's genuinely safe.
H2: What Happens If You Don't Act
  Plain consequences. Not dramatic — just accurate.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags. Questions a confused consumer would actually type into Google.

Tone: Clear and authoritative. Report the impact. Do not editorialize about whether the policy is good or bad.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      price_hike_survival: `IMPACT FORMAT — PRICE HIKE SURVIVAL GUIDE
Headline: "[Company] Is Raising [Price] by [Amount]: How to Lock In the Old Rate or Find Something Better"

H2: How Much More You'll Pay
  Monthly and annual cost increase calculated. Who gets hit immediately vs. at renewal.
H2: How to Lock In the Current Price
  Specific steps: prepay, lock plan, use grandfathered option — whatever applies. Include the deadline if there is one.
H2: Is It Still Worth Paying More?
  Honest verdict. What you're getting vs. what it now costs. Pick a side.
H2: 3 Alternatives That Cost Less Right Now
  Named products or strategies. One sentence on why each is worth switching to.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags. 2–3 sentences per answer.

Tone: Practical. Help the reader keep money in their pocket.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      feature_removal_warning: `IMPACT FORMAT — FEATURE REMOVAL WARNING
Headline: "[Platform] Is Removing [Feature]: What to Do Before [Date]" — specific, no vagueness about timing.

H2: What Exactly Is Being Removed (and When)
  The feature explained simply. Exact date. Exact scope of what disappears.
H2: Who This Affects
  Free vs. paid users, which plan tiers, which regions. Be specific.
H2: How to Replace It
  Workarounds within the platform first, then external tools that do the same job. Name them.
H2: Should You Stay or Switch?
  Honest verdict based on what the removed feature was actually worth.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Problem-solving, not complaining. You're here to help the reader adapt.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      new_law_breakdown: `IMPACT FORMAT — NEW LAW BREAKDOWN
Headline: "[New Law] Just Passed: What It Means for [Everyday People / Businesses / Consumers]"

H2: What the Law Actually Says (In Plain English)
  No legal jargon. One paragraph. What it does, not what it's called or who sponsored it.
H2: Who It Affects (and Who It Doesn't)
  Specific: individuals vs. businesses, income thresholds, industry scope, which regions.
H2: The Practical Changes You'll Notice
  Day-to-day impact. What looks different starting [date]?
H2: What You Need to Do Now
  Concrete steps. If no action is needed, say so clearly — don't pad.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags. Genuine confusion questions from the people this affects.

Tone: Informative, not partisan. Report the impact. Do not editorialize about whether the law is good or bad.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      scam_fraud_alert: `IMPACT FORMAT — SCAM / FRAUD ALERT
Headline: "The [Scam Type] Scam Targeting [Audience]: How to Spot It and Protect Yourself"

H2: How This Scam Works (Step by Step)
  The sequence. Be specific — abstract descriptions don't protect anyone.
H2: The Red Flags to Watch For
  Bullet list of specific warning signs. Real signals, not generic "be careful" advice.
H2: What to Do If You've Already Been Targeted
  Immediate steps in order. Specific contacts, actions, and timelines.
H2: How to Protect Yourself Going Forward
  Preventative measures: specific tools, settings, or habits to adopt now.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags. Questions a panicked reader would actually type.

Tone: Calm and practical. You're a knowledgeable friend helping someone not get ripped off. Never sensationalize.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      product_recall_guide: `IMPACT FORMAT — PRODUCT RECALL GUIDE
Headline: "[Product] Has Been Recalled: Here's Whether You're Affected and What to Do"

H2: Which Products Are Affected
  Model numbers, serial ranges, batch codes, purchase date range. Where it was sold.
H2: What the Risk Is
  Plain description of the hazard. No minimization. No panic. Just the confirmed facts.
H2: How to Check If You Own One
  Step-by-step instructions to identify an affected unit.
H2: What to Do Now
  Return process, replacement process, or stop-use instructions. Who to contact and how.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Precise and calm. This is safety information. No padding, no filler.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      market_crash_explainer: `IMPACT FORMAT — MARKET CRASH EXPLAINER
Headline: "What Just Happened in [Market]: What It Actually Means for Your [Savings/Investments/Prices]"

H2: What Happened (The Short Version)
  Cause, sequence, and scale. Plain English. Specific numbers where available.
H2: What This Means for You Specifically
  Savings, pensions, mortgages, consumer prices — whichever apply. Short-term noise vs. long-term signal.
H2: What to Do (and What Not to Do)
  Practical guidance. Earn the "don't panic" advice with evidence — don't just assert it.
H2: What to Watch in the Coming Days
  The specific indicators, dates, or decisions that will determine what happens next.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Steady and fact-based. The reader is anxious — acknowledge that without amplifying it.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      subscription_trap: `IMPACT FORMAT — SUBSCRIPTION TRAP DETECTOR
Headline: "The Real Cost of [Service]: Hidden Fees Most [Company] Subscribers Don't Know About"

H2: The Advertised Price vs. What You Actually Pay
  Base price, add-ons, taxes, mandatory extras. Annual total clearly stated.
H2: The Fees Most People Don't Notice Until It's Too Late
  Specific line items. Named. Explained. Where to find them in the terms.
H2: How to Reduce What You Pay
  Specific tactics: downgrade, negotiate, cancel-and-rejoin, annual vs. monthly billing.
H2: Alternatives With Transparent Pricing
  3 alternatives with their actual all-in costs stated plainly.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Investigative consumer advocacy. Not hostile — just honest about the math.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      comparison_flip: `IMPACT FORMAT — COMPARISON FLIP
Headline: "Everyone Picks [Option A]. Here's Why [Option B] Is the Smarter Choice Right Now"

H2: Why People Default to [Option A]
  A fair, honest account of how Option A earned its reputation. Don't strawman it.
H2: What's Changed (Why This Matters Now)
  The specific recent development that shifts the calculation in Option B's favour.
H2: How [Option B] Wins Today
  Head-to-head on the dimensions that matter most. Specific numbers or features, not vague claims.
H2: When [Option A] Still Wins
  Intellectual honesty: the specific scenarios where the conventional choice remains right.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Confident but fair. Making a case for Option B, not attacking Option A.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      deadline_reminder: `IMPACT FORMAT — DEADLINE REMINDER
Headline: "You Have Until [Date] to [Action]: Here's Exactly What to Do" — specific date, specific action.

H2: What the Deadline Is (and What Happens If You Miss It)
  Exact date. Exact consequences. No vagueness.
H2: Who This Applies To
  Eligibility, scope, exclusions. Specific.
H2: Step-by-Step: How to Complete This Before the Deadline
  Numbered steps. Include estimated time per step where relevant.
H2: What If You've Already Missed It?
  Late options, appeals, penalties, or grace periods — whatever applies from the source material.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Urgent and actionable. This article's job is to get the reader to do something specific.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      hidden_cost_revealer: `IMPACT FORMAT — HIDDEN COST REVEALER
Headline: "The True Cost of [Product/Service]: What You'll Actually Pay Over [Time Period]"

H2: The Advertised Price vs. The Real Price
  What the company says it costs vs. what you actually pay.
H2: All the Costs They Don't Lead With
  Setup, maintenance, consumables, mandatory accessories, renewal rates. Named and explained.
H2: The Full Cost Breakdown
  A calculated total: monthly × 12, or a multi-year projection. Plain numbers, not percentages.
H2: Is It Worth the Real Price?
  Honest assessment. What you get for that total. Direct verdict.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Transparent and methodical. Do the math the company hopes the reader won't do.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      upgrade_decision: `IMPACT FORMAT — UPGRADE DECISION GUIDE
Headline: "Should You Upgrade to [New Version/Product] Right Now? The Honest Answer"

H2: What's Actually New
  Changes that matter in real-world use. Skip the spec sheet. Focus on practical impact.
H2: Who Should Upgrade Now
  Specific user profiles: current version, primary use case, budget. Be direct.
H2: Who Should Wait
  Specific reasons to hold off: upcoming release, current version still capable, price drop likely.
H2: The Cost of Upgrading vs. The Cost of Waiting
  Real numbers where available. Framed around value, not just price.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Honest and direct. Help the reader make a good decision — not push them toward an upgrade.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      data_breach_response: `IMPACT FORMAT — DATA BREACH RESPONSE
Headline: "[Company] Data Breach: If Your Data Was Exposed, Do These [N] Things Now"

H2: What Was Exposed (and What Wasn't)
  Confirmed data types only: email, passwords, payment info, etc. Do not speculate beyond confirmed reports.
H2: How to Find Out If You're Affected
  Specific steps: official breach checker, notification email, account review instructions.
H2: What to Do Right Now (In This Order)
  Numbered, prioritized steps. Password change, credit freeze, 2FA setup — most urgent first.
H2: What to Watch for Over the Next 90 Days
  Phishing patterns, fraudulent account openings, suspicious activity signs to monitor.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Calm and practical. The reader may be panicking — give them a clear list and let that do the reassuring.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      trend_reality_check: `IMPACT FORMAT — TREND REALITY CHECK
Headline: "Is [Trending Claim] Actually True? Here's What the Evidence Shows"

H2: The Claim (What People Are Saying)
  Represent the viral version fairly. Do not strawman it.
H2: What the Evidence Actually Shows
  Data, studies, track records. Specific sources. Distinguish confirmed, mixed, and unsupported elements.
H2: Why This Claim Spread
  The grain of truth. Why it resonated. What people got partially right.
H2: What This Means for Your Decisions
  Practical implication: how should this change — or not change — what the reader does?
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Analytically honest. Not debunking for sport — genuinely trying to leave the reader better informed.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      beginner_entry_point: `IMPACT FORMAT — BEGINNER ENTRY POINT
Headline: "New to [Topic]? Here's Exactly Where to Start (And What to Ignore at First)"

H2: What [Topic] Actually Is
  No jargon, no history. One clear paragraph: what it is and why it exists.
H2: What Beginners Usually Get Wrong First
  Name the most common first mistake or misconception directly. Don't soften it.
H2: The Three Things to Understand Before Anything Else
  Three numbered <h3> subsections. One foundational concept each. Maximum 4 sentences per subsection.
H2: Your First Practical Step
  The one thing to do today. Specific. Achievable. Not a reading list.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags. Questions that reflect genuine beginner confusion.

Tone: Patient, direct, non-condescending. Explain clearly without making the reader feel foolish for not knowing.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      contract_renewal_audit: `IMPACT FORMAT — CONTRACT RENEWAL AUDIT
Headline: "Is Your [Contract/Plan/Subscription] Still Worth It? A Renewal Audit"

H2: What You're Paying Now vs. What You Were Promised
  The original deal vs. current reality. Any price creep, feature changes, or service degradation.
H2: What You'd Get If You Switched Today
  Best current alternatives, specific and directly comparable to the current plan.
H2: The Real Cost of Switching
  Honest calculation: cancellation fees, data migration time, re-learning curve.
H2: The Verdict: Renew, Renegotiate, or Switch
  Three options laid out clearly. A direct recommendation with the reasoning.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Methodical and honest. Help the reader think clearly — not push them toward a switch.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      seasonal_timing_guide: `IMPACT FORMAT — SEASONAL TIMING GUIDE
Headline: "The Best (and Worst) Time to [Buy/Apply for/Act on] [Topic]: A Timing Guide"

H2: Why Timing Matters for [Topic]
  The specific reason timing affects price, quality, or outcome. Data-backed where available.
H2: The Best Window to Act
  Specific months, conditions, or triggers. Not vague "when it's on sale" — name the pattern.
H2: When to Avoid It
  The periods where you're most likely to overpay, underperform, or face obstacles.
H2: How to Prepare If the Right Window Isn't Open Yet
  What to do now so you're positioned when the right time comes.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Practical and specific. Generalizations are worthless here — the reader wants a date, range, or clear signal.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      myth_buster: `IMPACT FORMAT — MYTH BUSTER
Headline: "The [Topic] Myth That's Costing People [Money/Time/Opportunities]: What's Actually True"

H2: The Myth (What Most People Believe)
  State it charitably. This was a belief that made sense at some point or in some context.
H2: Where the Myth Came From
  The origin: outdated data, misunderstood study, marketing, media shorthand.
H2: What the Evidence Actually Shows
  Specific data, studies, track records. Named sources.
H2: The Better Mental Model
  A replacement framework — not just "you were wrong," but something more accurate to use going forward.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Respectful. Offering something better, not mocking anyone for a reasonable mistake.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      risk_explainer: `IMPACT FORMAT — RISK EXPLAINER
Headline: "Before You [Do/Buy/Sign Up for] [Topic]: The Risks Most People Discover Too Late"

H2: What Most People Assume When They [Action]
  The default mental model and why it's incomplete or misleading.
H2: The Real Risks
  3–5 specific, evidenced risks. For each: what it is, how likely, how bad if it happens.
  Use a numbered <h3> per risk if there are more than 3.
H2: Who Is Most at Risk (and Who Is Probably Fine)
  Honest segmentation. Do not universalize the risk. Do not minimize it either.
H2: How to Reduce the Risk Without Abandoning the Idea
  Mitigation strategies. Specific. Actionable.
H2: Frequently Asked Questions
  3 Q&As as <h3> tags.

Tone: Balanced and honest. Help the reader go in with open eyes — not scared off, just informed.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      // ═══════════════════════════════════════════════════════════════════
      // SCHOLARSHIP FORMATS
      // ═══════════════════════════════════════════════════════════════════

      scholarship_new_opening: `IMPACT FORMAT — SCHOLARSHIP: NEW OPENING
This is a scholarship opportunity article. The reader is a prospective applicant. The most important thing you can do for them is be specific, accurate, and complete. Every vague sentence costs them something real.

Headline: "[Scholarship Name] [Year] Applications Are Now Open: Full Details, Eligibility, and Deadlines"
Keep it under 14 words. Include the scholarship name and year. Never use "comprehensive" or "everything you need to know."

H2: What This Scholarship Offers
  Award value in concrete terms: is it full tuition only, or does it include a living stipend, flights, health insurance, and books?
  State the host country, host institution(s) if fixed, duration (e.g. 1 year MSc, 2-year PhD), and number of places available if known.
  Do NOT round figures or omit currency. "Up to $50,000" and "$50,000" are different claims.

H2: Who Can Apply
  Eligibility is the most-searched information. Be precise:
  - Nationality/citizenship (which passport holders are eligible — named)
  - Degree level (undergraduate, postgraduate taught, postgraduate research, PhD)
  - Field of study (named disciplines, not vague clusters)
  - Academic requirement (minimum GPA, degree classification, or equivalent — name the scale)
  - Age limit if any
  - Language requirement: IELTS/TOEFL minimum scores if stated
  - Residency restriction if any (e.g. "must be resident in Nigeria at time of application")
  If you don't know a criterion, say "not specified" — do not omit or invent.

H2: What You'll Need to Prepare
  Numbered checklist of required documents. For each item that takes time to obtain, add a brief note:
  e.g. "Academic transcripts — allow 1–2 weeks from your institution"
  e.g. "Reference letters — 2 required; request from supervisors now"
  e.g. "Personal statement — 500–1,000 words; see tips in 'How to Apply'"
  This section is a preparation checklist, not prose.

H2: How to Apply
  Numbered steps from start to finish:
  1. Where to find the application portal (URL if available from source material)
  2. Account creation / registration process
  3. Key sections of the application form
  4. Submission process and any confirmation steps
  If the source doesn't contain portal details, say so and direct to the official scholarship website.

H2: Key Dates
  A clean, scannable list:
  - Applications open: [date]
  - Application deadline: [date, time, timezone if specified]
  - Shortlisting / interview: [date or approximate period]
  - Results notification: [date]
  - Program start: [date]
  Only include dates confirmed in the source material. Mark unknowns as "TBC" not omitted.

H2: Frequently Asked Questions
  3 Q&As as <h3> tags. Questions that a serious applicant would search for:
  e.g. "Can I apply if I already have a degree from [country]?"
  e.g. "Is this scholarship renewable for a second year?"
  e.g. "Does this cover dependants or family members?"
  Each answer: 2–3 sentences. Plain English. If the answer isn't in the source material, say so.

Tone: Informative and practical. The reader is about to spend weeks on an application — they need facts, not enthusiasm. Do not describe the scholarship as "prestigious" or "life-changing." Let the details speak.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      scholarship_deadline_alert: `IMPACT FORMAT — SCHOLARSHIP: DEADLINE ALERT
This is a time-sensitive article. The reader has seen the scholarship name somewhere and is checking if they can still apply. Your job is to answer that immediately, then help them act.

Headline: "[Scholarship Name] Deadline Is [Specific Date]: What You Still Need to Submit"
The date must be in the headline. If only a month is known, use the month. Never use vague framing like "closing soon."

H2: How Much Time You Have
  State the exact deadline: date, time, and timezone if specified. Then calculate days remaining from article publication. Be explicit: "As of [publication date], you have X days."
  If the deadline has already passed, say so immediately and redirect to the next cycle.

H2: The Scholarship at a Glance
  3–4 sentences only: what it offers, who it's for, where it's based. Link to the official scholarship page.
  This section is for readers who haven't seen the scholarship before. Keep it tight.

H2: Your Application Checklist — What's Still Required
  Numbered list of all required documents. Flag items with the longest lead times at the top:
  - Items that take days or weeks (transcripts, reference letters, medical certificates): flagged with "START NOW"
  - Items you can prepare quickly (personal statement, CV): listed below
  If any document requires third-party action (e.g. references), state that explicitly.

H2: Common Mistakes That Get Applications Rejected
  3–5 specific mistakes known to cause rejection for this scholarship type or generally. Be concrete:
  Not "ensure you meet the criteria" — instead "applying with an undergraduate degree when the scholarship requires a completed bachelor's before the program start date."
  Not "proofread carefully" — instead "submitting a personal statement that doesn't address the scholarship's stated selection criteria."

H2: How to Submit Before the Deadline
  Numbered submission steps. Include:
  - Portal URL (if available in source)
  - What format documents should be in
  - Whether a confirmation email is sent
  - What to do if the portal is unresponsive near the deadline

H2: Frequently Asked Questions
  3 Q&As as <h3> tags focused on deadline-specific concerns:
  e.g. "Can I submit after the deadline if my internet was down?"
  e.g. "Is the deadline the same for all nationalities?"
  e.g. "Can I update my application after submitting?"
  2–3 sentences per answer. If unknown, say so.

Tone: Urgent and practical. This article's only job is to get prepared readers to submit complete applications before the deadline. No padding, no inspiration — just the information they need to act.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      scholarship_how_to_apply: `IMPACT FORMAT — SCHOLARSHIP: HOW TO APPLY
This is a process guide for a specific scholarship. The reader intends to apply. They need to know what the process actually involves — not a generic guide, but the specific steps for this program.

Headline: "How to Apply for the [Scholarship Name]: A Step-by-Step Guide for [Year]"
Under 14 words. Year must be included if known from source material.

H2: Check Your Eligibility Before You Begin
  Lay out the eligibility criteria as a decision checklist. Use a format the reader can check off:
  - Nationality: [which passport holders]
  - Degree level: [what's required]
  - Field: [eligible disciplines]
  - Academic standard: [GPA / classification requirement]
  - Language: [IELTS/TOEFL requirement if any]
  - Age: [if applicable]
  End with: "If you meet all of the above, proceed. If any criterion doesn't apply to you, check the official guidelines before proceeding — some programs have exceptions not listed here."

H2: Documents You Need to Prepare
  Full list. For each document, state: what it is, what the scholarship specifically requires (length, format, who must sign it), and how long it typically takes to obtain.
  Group by lead time:
  - Documents requiring weeks (transcripts, sealed references, police clearance)
  - Documents you write yourself (personal statement, research proposal, CV)
  This is not a generic list — draw from the source material for requirements specific to this scholarship.

H2: Writing Your Personal Statement
  What the selection committee is actually looking for — draw from the scholarship's stated values, criteria, and mission if available in source material.
  2–3 specific tips grounded in what this scholarship values (e.g. leadership, academic excellence, development impact).
  What to avoid: 2 common personal statement mistakes for this type of scholarship.
  Length and format requirement if stated.
  Do NOT provide a personal statement template or example — that's a different article.

H2: Completing the Application Portal
  Numbered walk-through of the online application:
  1. How to create an account or access the portal
  2. Main sections of the form and what each asks for
  3. How to upload documents (accepted formats, file size limits if known)
  4. How referees are notified (automatic email or manual prompt)
  5. How to review before submitting
  6. Submission confirmation — what you receive

H2: After You Apply: What Happens Next
  Timeline from submission to result:
  - When shortlisting typically happens
  - Whether there is an interview stage (format: in-person, video call, panel)
  - How and when results are communicated
  - What to do if you don't hear back by the stated date

H2: Frequently Asked Questions
  3 Q&As as <h3> tags. Process-specific questions:
  e.g. "Can I apply to multiple programs under the same scholarship?"
  e.g. "What happens if my referee misses the reference deadline?"
  e.g. "Can I apply in the same year I'm completing my degree?"
  2–3 sentences per answer from source material. Mark unknowns as "not specified in official guidelines — contact the scholarship body directly."

Tone: Clear, methodical, specific. The reader is about to invest significant time — they deserve a guide that reflects the actual process, not a generic template. Every sentence should reduce uncertainty or save them time.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

      scholarship_results: `IMPACT FORMAT — SCHOLARSHIP: RESULTS ANNOUNCED
This is a news-style article reporting scholarship results. The primary audience is: (a) unsuccessful applicants deciding whether to reapply, and (b) prospective applicants researching what it takes to win.

Headline: "[Scholarship Name] [Year] Winners Announced: [Number] Scholars Selected from [Number] Countries / Applications"
Use real numbers from the source material. If numbers aren't available, use: "[Scholarship Name] [Year] Cohort Announced: What the New Class Tells Future Applicants"
Never use "prestigious" or "coveted" in the headline.

H2: The [Year] Cohort at a Glance
  Who was selected: total number of scholars, countries represented, degree levels (if available), fields of study breakdown.
  If the source includes notable names or institutions, include them factually.
  Keep this section data-led. If numbers aren't in the source, note that and report what is available.

H2: What This Year's Selection Reveals
  Patterns in the cohort that tell prospective applicants something useful:
  - Were certain fields, nationalities, or degree levels overrepresented?
  - Did the scholarship body release any statement about selection priorities this cycle?
  - Were there any changes to the cohort profile compared to previous years (if source material includes this)?
  This section requires careful reading of the source — do not fabricate trends. If the source doesn't contain enough information to identify patterns, say so honestly and keep this section brief.

H2: What Unsuccessful Applicants Should Know
  For the many who didn't make it this round:
  - Did the scholarship body provide any feedback or guidance?
  - Can they reapply, and if so, when?
  - What the reapplication timeline looks like
  If no guidance is available in the source, say: "The scholarship body has not released specific feedback for unsuccessful applicants. [Scholarship name] does / does not allow reapplication — check the official guidelines."

H2: How to Prepare for the Next Round
  Specific preparation steps based on what this year's cohort suggests:
  - Academic preparation (if a GPA or classification pattern is evident)
  - Experience or profile development (if themes emerge from winner profiles)
  - Application timeline (when applications for the next cycle typically open)
  These must trace to the source material or well-established facts about this scholarship. Do not invent success patterns.

H2: Key Dates for the Next Application Cycle
  Only include confirmed dates from source material. If not yet announced, state: "Application dates for the [next year] cycle have not yet been announced. Check [official URL or scholarship name] for updates."

H2: Frequently Asked Questions
  3 Q&As as <h3> tags. Questions from the perspective of both unsuccessful applicants and new prospects:
  e.g. "Were the results released later than usual this year?"
  e.g. "How many people applied vs. how many were selected?"
  e.g. "What's the best way to strengthen a reapplication?"
  2–3 sentences per answer. Base answers on source material only.

Tone: Factual and useful. The reader may be disappointed — acknowledge that implicitly through the practical focus on next steps, not through emotive language. Report results accurately; analyse patterns fairly; and give future applicants something concrete to work with.
The FAQ is the final section. Do not add a separate conclusion after it.
`,

    };

    return `IMPACT FORMAT ENGAGED — override standard headline and structure:\n\n${nicheHint}${blocks[format]}\n`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PERSONA BLOCK
  // ═══════════════════════════════════════════════════════════════════════

  private buildPersonaBlock(persona: WriterPersona, mode: ContentMode, keyword: string): string {
    const descriptions: Record<WriterPersona, string> = {
      seasoned_journalist:
        `You are a seasoned journalist with 15 years covering this beat. You've seen the hype cycles come and go. You write with authority but without condescension — you know things, but you remember what it was like not to know them. Your prose is economical. You don't waste sentences.`,

      practitioner_expert:
        `You are a practitioner who has actually done this, not just read about it. You write from experience. You know the parts that textbooks get wrong. You know the shortcuts that work and the ones that blow up. You're generous with what you know because you remember struggling to find it.`,

      curious_analyst:
        `You are a naturally curious analyst who finds the interesting angle in everything. You notice the thing other writers miss. You ask the second question, not just the first. Your writing has a slightly investigative quality — you're always pulling a thread to see where it leads.`,

      direct_explainer:
        `You are someone who is genuinely good at explaining things. You have no patience for jargon that exists to impress rather than clarify. You find the analogy that makes it click. You write for the reader who is smart but new to this — and you respect that reader.`,

      critical_thinker:
        `You are a critical thinker who takes received wisdom seriously enough to question it. You don't contrarian for sport — you genuinely test claims. You distinguish between what the evidence shows and what people assume it shows. Your writing has intellectual backbone.`,

      industry_insider:
        `You are an industry insider who knows how things actually work, not how they're supposed to work. You know the gap between the press release and the reality. You write with the quiet confidence of someone who's been in the room when decisions were made.`,
    };

    return `${descriptions[persona]}

You are writing about: "${keyword}"

`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HUMAN WRITING SIGNALS BLOCK
  // ═══════════════════════════════════════════════════════════════════════

  private buildHumanSignalsBlock(mode: ContentMode, options: PromptOptions): string {
    const isFormally = mode === 'academic';
    const isTechnical = mode === 'technical';

    return `HUMAN WRITING PATTERNS — apply these throughout:

PARAGRAPH RHYTHM:
- Vary paragraph length deliberately. Mix short (1-2 sentences) with longer (4-5 sentences).
- Use a one-sentence paragraph for emphasis at least once. It earns its own space.
- Don't open every paragraph the same way. Vary the construction.

SENTENCE VARIETY:
- Mix sentence length. Short follows long. Long follows short.
- Starting a sentence with "And", "But", "Yet", or "Because" is fine — occasional use only, where it creates rhythm.
- Active voice as the default. Passive voice when the subject genuinely doesn't matter.

${isFormally ? '' : `CONTRACTIONS:
- Use contractions where they sound natural: it's, you'll, that's, don't, won't.
- Avoid them in headings and very formal sentences.
- Overusing them sounds chatty; never using them sounds stiff.

`}EMBEDDED SIGNALS — use SOME of these naturally, not all of them:
- A brief rhetorical question mid-article that you immediately answer: "So why does this matter? Because..."
- Light asides when something genuinely warrants flagging: "Worth noting here:" or "This is the part most guides skip."
- "Curiously" or "what's striking is" when it's actually true, not as filler.
- A moment of honest qualification: "This works well in most cases. It breaks down when..."
- Acknowledge a reader's likely objection before they raise it — once, where it matters most.

${isTechnical ? '' : `TONAL VARIATION:
- The article should have slightly different energy in different sections. An opener can carry more tension or surprise; a middle section can be more measured; a conclusion can be sharper or warmer.
- Don't sustain exactly the same register from line one to the last paragraph.

`}WHAT NOT TO DO:
- Don't use all of these signals at once — that's just a different kind of robotic.
- Don't manufacture warmth. Genuine economy of language reads better than forced friendliness.
- Don't mistake "human" for "chatty". Hemingway was human. So was Orwell.

`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OPENING STYLE BLOCK
  // ═══════════════════════════════════════════════════════════════════════

  private buildOpeningStyleBlock(style: OpeningStyle, mode: ContentMode, keyword: string): string {
    const styles: Record<OpeningStyle, string> = {
      anecdote: `OPENING STYLE — ANECDOTE:
Open with a brief, specific scene or moment that drops the reader into the subject.
Not a generic scenario. A specific one. Name a place, a situation, a person's predicament (real or representative).
Two or three sentences maximum. Then pivot immediately to what it reveals about the topic.
The anecdote must earn its place — it connects directly to the main point, not just sets atmosphere.

`,
      stat: `OPENING STYLE — STRIKING STATISTIC:
Open with a specific, surprising, or counterintuitive number that reframes how the reader thinks about the topic.
The stat should feel like a gut-punch or a revelation, not a background figure.
Immediately follow with one sentence that explains why it matters or what it means.
Don't lead with a boring stat. If the number isn't interesting, it's the wrong stat.

`,
      scene: `OPENING STYLE — SCENE-SETTING:
Open by placing the reader somewhere concrete — a moment in time, a specific context, a situation unfolding.
Use present tense for immediacy. Be specific: not "a company" but "a mid-sized logistics firm in Lagos". Not "a researcher" but "a computational biologist at Johns Hopkins".
Two or three sentences to establish the scene, then pull back to the broader point.

`,
      provocative: `OPENING STYLE — PROVOCATIVE STATEMENT:
Open with a claim that will make the reader stop and think "wait, really?" or "that's not what I thought".
The statement should be defensible — you're reframing, not trolling.
State it plainly, without softening. Then spend the rest of the opening paragraph earning it.

`,
      direct_answer: `OPENING STYLE — DIRECT ANSWER:
Open by answering the main question immediately, in the first sentence.
No preamble. No "In recent years...". No "Many people wonder...".
State the answer. Then spend the rest of the opening paragraph giving it context and nuance.
This is the most trustworthy opening for readers who came with a specific question.

`,
      contradiction: `OPENING STYLE — CONTRADICTION OR TENSION:
Open by naming a gap between what people believe and what's actually true — or between two things that are both true but seem to conflict.
"X is widely believed. The reality is more complicated." Or: "X is true. So is the opposite. Here's why that matters."
The contradiction should be genuine, not manufactured. Don't fake tension.

`,
      question_in_body: `OPENING STYLE — SCENE THEN QUESTION:
Open with a brief concrete scene or observation (2-3 sentences), then pose a single sharp question that the article will answer.
The question should be one the reader is now genuinely asking because of the scene you just set.
Don't open with the question — earn it first. Then answer it fully in the body.

`,
    };

    return styles[style];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WRITING RULES BLOCKS
  // ═══════════════════════════════════════════════════════════════════════

  private buildWritingRulesBlock(mode: ContentMode, options: PromptOptions): string {
    switch (mode) {
      case 'news':
        return `NEWS WRITING RULES:

LEAD: Answer Who, What, When, Where, Why in the first 2-3 sentences. Most important fact first. Specific details, not generalities.

STRUCTURE: Inverted pyramid — most important facts first, supporting details next, context last. But if the story is better told chronologically, do that. Structure serves the story.

ATTRIBUTION: Every claim needs a source. Quote directly when you have the words. Paraphrase with attribution when you don't. Never fabricate quotes.

SPECIFICS: Real names, titles, organisations, locations, dates. "A source said" is not journalism.

TONE: Neutral and factual. Active voice. Short sentences. If a sentence needs a semicolon, consider two sentences instead.

AUTHORITY SECTION: One section brings in the relevant official, regulator, or expert perspective — briefly, factually. 1-2 paragraphs. Adapt to the subject: legal, financial, health, sports, tech, whatever applies.

`;

      case 'academic':
        return `ACADEMIC WRITING RULES:

REGISTER: Formal throughout. No contractions. No colloquialisms.

VOICE: Third person as default. First person acceptable for stated positions: "This article argues..."

HEDGING: Use epistemic language where certainty isn't established — "the evidence suggests", "one interpretation holds", "this may indicate". Reserve strong language for established facts.

PARAGRAPH DISCIPLINE: Every paragraph needs a topic sentence, evidence, analysis of what it means, and a link to the broader argument. No paragraph that doesn't advance the thesis.

COUNTERARGUMENTS: Engage the strongest opposing view honestly. Refute it with evidence. Don't strawman.

PROSE OVER LISTS: Main body in paragraphs. Lists only where enumeration genuinely aids clarity.

`;

      case 'technical':
        return `TECHNICAL WRITING RULES:

VOICE: Imperative. Direct. "Click", "Run", "Navigate to". Second person ("you") throughout. Never passive.

PRECISION: Exact terminology. Exact button names. Exact paths. Exact syntax.

STEPS: One action per step. State the expected outcome: "Click Install. A green confirmation banner should appear."

CALLOUTS — use only where genuinely needed:
- NOTE: important information the reader must not miss
- WARNING: actions that could cause data loss or errors
- TIP: genuine shortcuts or best practices

PREREQUISITES: List before step one. Tools, versions, accounts, prior knowledge.

CODE: All code, commands, file paths in <code> tags.

`;

      case 'commercial':
        return `COMMERCIAL/REVIEW WRITING RULES:

VERDICT FIRST: State your overall verdict early. Don't make the reader scroll to find out what you think.

SPECIFICITY: Vague praise is worthless. "The UI is clean" tells the reader nothing. "The dashboard puts the three most-used actions on a single visible row" tells them something.

BALANCE: Include genuine negatives. A review with no criticism isn't trusted.

WHO IT'S FOR: Be explicit about the ideal user and the user who should look elsewhere.

COMPARISONS: Name the main alternative. Compare directly on the dimensions that matter most.

EVIDENCE: Specific observations beat generalizations. "Export completed in under three seconds" beats "export is fast".

`;

      case 'opinion':
        return `OPINION/EDITORIAL RULES:

THESIS: State your position in the first two paragraphs. Don't bury the argument.

CONVICTION: Write with conviction. Hedge only where genuinely uncertain — hedging the main argument is a structural weakness.

ARGUMENT: Each body section makes one argument. Lead with the claim, support with evidence, connect back to the thesis.

COUNTERARGUMENT: Engage the strongest opposing view directly. Name it honestly. Refute it. If your argument can't survive honest engagement with the opposition, it's not ready.

TONE: Authoritative, not preachy. Make the case — don't repeat it three times expecting it to land harder.

`;

      case 'listicle':
        return `LISTICLE RULES:

ITEM STRUCTURE: Each item needs a numbered H3, an opening sentence that states what it is or why it matters, 2-3 sentences of specific detail, and one concrete example or tip.

PARALLELISM: Items consistent in depth and length. An item twice as long as the others breaks the rhythm.

SCANABILITY: A reader should understand the list just from reading the H3s.

SPECIFICITY: Every item must have something concrete — a name, a number, a technique. Vague items waste the reader's time.

ORDERING: Choose an order that serves the reader — importance, difficulty, sequence, or theme. State the ordering principle in the intro.

`;

      default: // seo_blog
        return `SEO BLOG RULES:

ANSWER FIRST: The main question gets answered in the first 2-3 sentences. No preamble.

SNIPPET PARAGRAPH: In the second or third paragraph, write a 40-60 word self-contained answer to the primary keyword question. One <p> tag. This is your featured snippet candidate.

HEADINGS: Section headings should match real search queries where possible. "How does X work?" not "Overview of X Mechanisms".

PARAGRAPHS: 2-4 sentences maximum. One idea per paragraph.

TONE: Smart and direct. Explain things clearly without being condescending. Use "you" throughout.

AUDIENCE: ${this.getAudienceDescription(options.targetAudience || 'general audience')}

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
Specific, factual, under 12 words. No colon splits. Active voice. Real names, numbers, or locations where available.
Good: "EFCC Arrests 47 in Lagos as Online Fraud Sweep Expands"
Bad: "Understanding the Current Situation Regarding Fraud in Nigeria"

`;
      case 'academic':
        return `HEADLINE:
Descriptive noun phrase that states topic and scope precisely. Colons acceptable.
Not a question. Specific about what the article actually covers.
Good: "Digital Currency Adoption in Sub-Saharan Africa: Economic Consequences and Policy Implications"
Bad: "Exploring the Complex Landscape of Digital Finance"

`;
      case 'technical':
        return `HEADLINE:
Task-completion framing. Tell the reader exactly what they will be able to do.
Include the specific tool, technology, or context.
Good: "How to Deploy a Node.js App to AWS EC2: A Step-by-Step Guide"
Bad: "A Comprehensive Guide to Server Deployment Solutions"

`;
      case 'commercial':
        return `HEADLINE:
Review or comparison framing. Specific product name. No unearned superlatives.
Good: "Notion vs Obsidian: Which Note-Taking App Is Right for You in 2025?"
Bad: "The Ultimate Transformative Guide to the Best Note-Taking Apps"

`;
      case 'opinion':
        return `HEADLINE:
Sharp, takes a position, creates mild tension. Under 12 words. Not a question — state the argument.
Good: "Nigeria's Startup Scene Is Overrated — and the Numbers Prove It"
Bad: "Exploring Whether Nigeria's Startup Scene Lives Up to the Hype"

`;
      case 'listicle':
        return `HEADLINE:
Specific number + topic + concrete benefit. No filler.
Good: "12 Free Tools That Will Double Your Writing Productivity"
Bad: "The Most Comprehensive List of Amazing Writing Tools You Need to Know About"

`;
      default: // seo_blog
        return `HEADLINE:
Clear, specific, under 12 words. Reader knows immediately what they'll get.
Include the primary keyword naturally.
Good: "How to Write a Cover Letter That Gets Responses (With Examples)"
Bad: "Navigating the Complex World of Cover Letters: A Comprehensive Guide"

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
Start with <h1>. Go straight into the article.

CHOOSE the structure that serves the story:
A) INVERTED PYRAMID: Lead (5Ws) → Key details → Supporting context → Background → Authority commentary
B) CHRONOLOGICAL: If the sequence of events is the story, tell it in order — still front-load the most important fact in the lead
C) THEMATIC: If the story has multiple distinct angles, organise by theme

Whichever structure: 4-6 H2 sections, each covering ONE idea. Every section earns its place.

`;

      case 'academic':
        return `ARTICLE STRUCTURE:
Start with <h1>.

STANDARD STRUCTURE (default):
1. ABSTRACT (H2): 150-200 words — problem, approach, key findings, significance
2. INTRODUCTION (H2): Background → problem statement → thesis (central argument, stated clearly)
3. BODY SECTIONS (3-5 H2s): Each develops one component of the argument — topic sentence → evidence → analysis → link to thesis
4. DISCUSSION (H2): Interpret evidence, acknowledge limitations, engage counterarguments
5. CONCLUSION (H2): Restate thesis, summarise evidence, broader implications, further research

ALTERNATIVE (essayistic): Skip formal abstract. Open with a compelling framing, state thesis by end of introduction, develop argument in 4-6 thematic sections.

HEADING STYLE: Descriptive noun phrases. "The Role of X in Y" not "What Is the Role of X?"

`;

      case 'technical':
        return `ARTICLE STRUCTURE:
Start with <h1>. Choose the structure that matches what the reader needs to accomplish.

FOR STEP-BY-STEP GUIDES:
1. Brief overview (no heading): what this covers, who it's for, what they'll achieve — 2-3 sentences
2. PREREQUISITES (H2)
3. PHASE HEADINGS (H2) with numbered steps within each phase
4. TROUBLESHOOTING (H2): 3-5 common errors with specific fixes
5. NEXT STEPS (H2)

FOR EXPLAINERS / HOW-IT-WORKS:
Organise by concept, not by step. Each H2 covers one component. Build from foundational to advanced.

FOR REFERENCE ARTICLES:
Scannable. H2 per major category. H3 per specific item.

`;

      case 'commercial':
        return `ARTICLE STRUCTURE:
Start with <h1>. Structure for the reader trying to make a decision.

FOR SINGLE PRODUCT REVIEWS:
1. QUICK VERDICT (H2)
2. OVERVIEW (H2)
3. KEY FEATURES (H2) — by real-world impact, not spec sheet
4. PROS (H2)
5. CONS (H2)
6. WHO IT'S FOR / WHO SHOULD AVOID IT (H2)
7. HOW IT COMPARES (H2)
8. FINAL VERDICT (H2)

FOR COMPARISONS / ROUNDUPS:
Lead with the decision framework. Cover each option. Give a clear recommendation for different use cases.

`;

      case 'opinion':
        return `ARTICLE STRUCTURE:
Start with <h1>. Choose the structure that best serves the argument.

THESIS-FIRST (most common):
Opening: Hook → thesis stated clearly
Body: 3-4 H2 sections, each making one supporting argument
Counterargument (H2): Honest engagement with the strongest opposing view
Broader implication (H2, optional)
Conclusion: Position restated, stronger than the opening

CASE-TO-PRINCIPLE:
Opening: A specific case or event
Build: What this case reveals about a broader principle
Argument: The principle defended
Counterargument
Conclusion: Why the principle matters beyond this case

Whichever: thesis clear by end of opening. Conclusion stronger than the opening, not softer.

`;

      case 'listicle':
        return `ARTICLE STRUCTURE:
Start with <h1>.

INTRO (no H2): 3-4 sentences — why this list matters, who it's for, the ordering principle.

LIST ITEMS: Each gets a numbered H3 (<h3>1. Item Title</h3>).
Per item: what it is → why it matters → one concrete example or tip. 2-4 sentences. Consistent length.

STRUCTURAL VARIATIONS (choose if appropriate):
- CLUSTERED: Group items into 2-3 themed H2 clusters, numbered H3s within each
- RANKED: Items in clear order of importance — make the ranking logic explicit
- TIERED: Basic → intermediate → advanced — label the tiers

CONCLUSION: 2-3 sentences. Key takeaway, how to use the list. Don't summarise the list.

`;

      default: // seo_blog
        return `ARTICLE STRUCTURE:
Start with <h1>. Choose the structure that matches the search intent.

FOR DEFINITIONAL / EXPLAINER ("What is X", "How does X work"):
Direct answer → Context → How it works → Why it matters → Common misconceptions → FAQ

FOR HOW-TO ("How to X", "Steps to X"):
Direct answer → Prerequisites → Steps (H2 per phase) → Common mistakes → FAQ

FOR COMPARISON ("X vs Y", "Best X for Y"):
Quick answer → Decision framework → Option A → Option B → Head-to-head → Recommendation

FOR INFORMATIONAL DEEP DIVES:
Main point → Context → Evidence → Implications → Practical application → FAQ

Whichever: short paragraphs, question-based H2s where possible, featured snippet paragraph in the first third.

`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONCLUSION BLOCKS
  // ═══════════════════════════════════════════════════════════════════════

  private buildConclusionBlock(mode: ContentMode, options: PromptOptions): string {
    const cta = options.callToAction
      ? `\nInclude this call-to-action naturally — don't bolt it on at the end: ${options.callToAction}\n`
      : '';

    switch (mode) {
      case 'news':
        return `CONCLUSION:
2-3 paragraphs. Don't summarise — add. What happens next? What should readers watch for? What's the broader implication?
The last paragraph should give the reader something to think about, not just a recap.
Do NOT use "In conclusion".
${cta}\n`;

      case 'academic':
        return `CONCLUSION:
3-4 paragraphs:
1. Restate the thesis — different words from the introduction
2. What the evidence shows and why it matters
3. Broader implications for the field, practice, or policy
4. Limitations and directions for further research
Do NOT use "In conclusion" or "To summarise". End with the implication that matters most.
${cta}\n`;

      case 'technical':
        return `CONCLUSION:
1-2 paragraphs:
1. Confirm what was accomplished: "You have now successfully..."
2. What to do next: where to go, what to explore, how to build on this
Don't summarise the steps. Point forward.
${cta}\n`;

      case 'commercial':
        return `CONCLUSION — FINAL VERDICT:
2-3 paragraphs:
1. The recommendation, stated plainly — buy it or don't, and the one-sentence reason
2. Who the ideal buyer/user is
3. One final note: best deal, best time to buy, or the best alternative for readers who decide against it
${cta}\n`;

      case 'opinion':
        return `CONCLUSION:
2-3 paragraphs:
1. Restate the position — stronger than the opening, now that the case has been made
2. What this means, what needs to change, what readers should take from it
3. Final line: sharp, memorable, resonant. Not a question. Not soft.
Don't soften the argument at the end. This is where it lands.
${cta}\n`;

      case 'listicle':
        return `CONCLUSION:
2-3 sentences only:
- The most important takeaway from the list
- How to apply or use what was covered
- Optional: one sentence pointing to the logical next step
Don't summarise the list. The reader just read it.
${cta}\n`;

      default: // seo_blog
        return `CONCLUSION:
2-3 paragraphs. Don't summarise — the reader just read it.
End with a clear takeaway and a logical next step.
Do NOT say "In conclusion".
${cta}\n`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LINKS BLOCK
  // ═══════════════════════════════════════════════════════════════════════

  private buildLinksBlock(mode: ContentMode, options: PromptOptions): string {
    let prompt = `LINKS — INCLUDE AT LEAST 5:\n\n`;

    if (options.sourceUrl) {
      const sourceName = options.sourceName || 'the original source';
      prompt += `LINK 1 — PRIMARY SOURCE (required):
Attribute naturally mid-sentence: "According to ${sourceName}..." or "As ${sourceName} reported..."
URL: ${options.sourceUrl}
Format: <a href="${options.sourceUrl}" target="_blank" rel="noopener noreferrer">${sourceName}</a>

`;
    } else {
      prompt += `LINK 1 — PRIMARY SOURCE (required):
Find and attribute the most authoritative original source for this topic naturally in the text.
Format: <a href="SOURCE_URL" target="_blank" rel="noopener noreferrer">source name</a>

`;
    }

    prompt += `LINK 2 — AUTHORITATIVE REFERENCE (required):
${this.getModeAuthorityGuidance(mode)}
Use naturally: "According to [body]..." or "Under [body] guidelines..." or "As [body] defines it..."
Format: <a href="OFFICIAL_URL" target="_blank" rel="noopener noreferrer">Body Name</a>

`;

    if (options.internalLinkSuggestions?.length) {
      const maxInternal = Math.min(options.internalLinkSuggestions.length, options.maxInternalLinks || 3);
      prompt += `LINKS 3-${2 + maxInternal} — INTERNAL LINKS (required):
Weave these into the article where they naturally connect — don't force them, find the sentence where they belong:

${options.internalLinkSuggestions.slice(0, maxInternal).map((link, i) =>
  `${i + 3}. "${link.title}" — ${link.url}${link.description ? `\n   Context: ${link.description}` : ''}`
).join('\n\n')}

Format: <a href="URL">descriptive anchor text that reads naturally in context</a>

`;
    } else {
      prompt += `LINKS 3-4 — RELATED CONTENT (required):
Link to 2 relevant previously published articles. Anchor text should read naturally — not "click here".
Format: <a href="/relevant-url">descriptive anchor text</a>

`;
    }

    prompt += `LINK 5 — ADDITIONAL EXTERNAL REFERENCE (required):
One more credible external source. Wikipedia for background definitions, Reuters/AP/BBC for context, official body, academic institution.
Only use URLs you are confident exist. Do NOT fabricate URLs.
Format: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>

`;

    return prompt;
  }

  private getModeAuthorityGuidance(mode: ContentMode): string {
    switch (mode) {
      case 'news':        return "The relevant regulator, official body, or authority for this story's subject matter.";
      case 'academic':    return 'A peer-reviewed journal, academic institution, or authoritative research body.';
      case 'technical':   return 'The official documentation for the tool, language, or technology being discussed.';
      case 'commercial':  return 'The official product website, or a major independent review platform (Consumer Reports, Wirecutter, G2).';
      case 'opinion':     return "A credible source providing data, research, or authoritative perspective on the editorial's subject.";
      case 'listicle':    return 'An authoritative source that validates or contextualises the list topic.';
      default:            return 'The most relevant official, governmental, or authoritative organisation for this topic.';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SYSTEM MESSAGE
  // ═══════════════════════════════════════════════════════════════════════

  buildSystemMessage(): string {
    return `You are a professional writer with range: you write news, academic analysis, technical guides, product reviews, opinion pieces, listicles, and SEO content — and each sounds like a different kind of writer wrote it, because that's what good writing requires.

YOUR CORE PRINCIPLES:

1. SOUND HUMAN
Write the way a skilled person writes, not the way software generates text. Varied sentence length, varied paragraph length, an occasional short sentence that stands alone, a rhetorical question answered immediately, a light aside when something genuinely warrants it. Not all at once. Naturally.

2. FOLLOW THE MODE
Each content type has its own conventions. A news article sounds like a news article. Academic sounds scholarly. Technical sounds direct and precise. A review sounds like someone who actually used the thing. Commit to the mode — don't blend the registers.

3. SPECIFICS OVER GENERICS
Real names, real numbers, real places, real organisations. Vague writing signals the writer doesn't know the subject. Specific writing signals they do.

4. STRUCTURAL INTELLIGENCE
The structure options in the prompt are starting points, not cages. If the content is better served by a different organisation, use it. Good writers choose structure; they don't fill templates.

5. NO PADDING
Every sentence earns its place. If a sentence restates what the previous sentence said, cut it.

6. IMAGES IN THE ARTICLE
When images are provided, place them in the body where they add context:
<figure><img src="..." alt="..." style="max-width:100%;height:auto;"/><figcaption>caption</figcaption></figure>
First image after the opening section. Never skip provided images.

7. ALL 5 LINKS ARE MANDATORY
Primary source, authority reference, 2 internal links, 1 additional external. All 5. No exceptions.

8. ONE H1 ONLY
The headline appears once, at the top, as <h1>. Never repeated in the body.

9. FORMATTING
Semantic HTML only: h1, h2, h3, p, figure, img, figcaption, a, ul, ol, li. No markdown.

WORDS AND PHRASES YOU NEVER USE:
delve, realm, landscape, crucial, vital, game-changing, transformative, unveiling,
navigating, empowering, it is worth noting, in today's world, in an era of,
as we can see, to summarise, in conclusion, this is important because,
comprehensive guide, in-depth look, exploring the, tapestry, multifaceted,
leveraging, synergy, holistic, paradigm, cutting-edge, state-of-the-art`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODE DEFAULTS
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
      default:
        return { wordCount: 1500, includeFAQ: true,  includeStatistics: true,  includeExamples: true,  includeComparisons: false, includeConclusion: true };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private buildSEOGuidance(keyword: string, focus?: string, density?: number): string {
    let guidance = `Use "${keyword}" naturally in the headline, opening paragraph, and 2-3 times in the body. Don't stuff it — if it sounds forced, rephrase. `;
    switch (focus) {
      case 'primary_keyword':   guidance += `Keep focus on the exact phrase throughout.`; break;
      case 'semantic_keywords': guidance += `Cover related concepts and semantic variations — don't just repeat the keyword.`; break;
      case 'long_tail':         guidance += `Incorporate natural long-tail variations in headings and body text.`; break;
      default:                  guidance += `Balance keyword use with natural language. Readability first.`;
    }
    if (density && density > 0) guidance += ` Target approximately ${density}% keyword density — but never sacrifice readability to hit a number.`;
    return guidance;
  }

  private getAudienceDescription(audience: string): string {
    if (audience.toLowerCase().includes('beginner')) return "Reader has no prior knowledge — explain everything, assume nothing, use analogies.";
    if (audience.toLowerCase().includes('expert') || audience.toLowerCase().includes('advanced')) return "Reader knows the basics — skip them. Focus on depth, nuance, and the things that aren't obvious.";
    return "Reader is intelligent and curious but not a specialist. Explain clearly without being condescending.";
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