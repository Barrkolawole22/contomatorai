// backend/src/utils/prompt-builder.ts - SIMPLIFIED VERSION
// NOTE: This file is now OPTIONAL as prompts are built directly in the services
// You can delete this file if you're using the new openai.service.ts and groq.service.ts

interface PromptOptions {
  keyword: string;
  tone?: string;
  wordCount?: number;
  targetAudience?: string;
  contentIntent?: 'informational' | 'navigational' | 'commercial' | 'transactional';
  writingStyle?: 'conversational' | 'academic' | 'journalistic' | 'technical' | 'creative';
  includeIntroduction?: boolean;
  includeConclusion?: boolean;
  includeFAQ?: boolean;
  includeStatistics?: boolean;
  includeExamples?: boolean;
  includeComparisons?: boolean;
  callToAction?: string;
  customPrompt?: string;
  additionalContext?: string;
  extraInstructions?: string;
  seoFocus?: string;
  targetKeywordDensity?: number;
}

export class PromptBuilder {
  /**
   * @deprecated Use the simplified prompt builder in openai.service.ts or groq.service.ts instead
   * This method is kept for backwards compatibility only
   */
  static buildComprehensivePrompt(options: PromptOptions): string {
    const {
      keyword,
      tone = 'professional',
      wordCount = 1500,
      targetAudience = 'general audience',
      writingStyle = 'conversational',
    } = options;

    // Simple, focused prompt
    return `Write a comprehensive ${wordCount}-word article about "${keyword}".

TARGET: ${wordCount} words

TONE: ${tone}
AUDIENCE: ${targetAudience}  
STYLE: ${writingStyle}

STRUCTURE:
- Compelling H1 title
- Strong introduction
- 4-6 main sections with H2 headings
- Concrete examples and details
- Natural conclusion

RULES:
✓ Provide unique value in every paragraph
✓ Use specific examples and data
✓ Write COMPLETE content with proper ending
✗ NO placeholder text
✗ NO repetitive lists
✗ NO incomplete sentences

FORMAT: Use clean HTML with <h1>, <h2>, <h3>, <p> tags.

${options.customPrompt ? `\nADDITIONAL: ${options.customPrompt}` : ''}

Begin writing now.`;
  }
}