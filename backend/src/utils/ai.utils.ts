import { ContentGenerationParams, ContentTone, ContentLength, ContentType } from '../types/content.types';

export class AIUtils {
  // Generate content generation prompts
  static generateContentPrompt(params: ContentGenerationParams): string {
    const {
      keywords,
      title,
      tone = 'professional',
      length = 'medium',
      type = 'blog',
      targetAudience,
      additionalInstructions,
    } = params;

    let prompt = `Write a ${this.getLengthDescription(length)} ${type} post`;
    
    if (title) {
      prompt += ` with the title: "${title}"`;
    }
    
    prompt += ` that targets the following keywords: ${keywords.join(', ')}.`;
    
    prompt += ` The tone should be ${tone}.`;
    
    if (targetAudience) {
      prompt += ` The target audience is: ${targetAudience}.`;
    }
    
    prompt += ` Please include:
- An engaging introduction
- Well-structured content with clear headings
- SEO-optimized content that naturally incorporates the keywords
- A compelling conclusion
- Meta title and meta description
- A concise excerpt/summary`;

    if (additionalInstructions) {
      prompt += `\n\nAdditional instructions: ${additionalInstructions}`;
    }

    prompt += `\n\nPlease format the response as JSON with the following structure:
{
  "title": "SEO-optimized title",
  "content": "Full article content with HTML formatting",
  "excerpt": "Brief summary (150-160 characters)",
  "metaTitle": "SEO meta title (50-60 characters)",
  "metaDescription": "SEO meta description (150-160 characters)",
  "slug": "url-friendly-slug",
  "outline": ["Main point 1", "Main point 2", "Main point 3"],
  "suggestions": ["Improvement suggestion 1", "Improvement suggestion 2"]
}`;

    return prompt;
  }

  // Generate keyword research prompt
  static generateKeywordResearchPrompt(
    seedKeyword: string,
    includeQuestions: boolean = true,
    includeLongTail: boolean = true
  ): string {
    let prompt = `Generate a comprehensive keyword research report for the seed keyword: "${seedKeyword}".`;
    
    prompt += ` Please provide:
- Primary keyword variations and synonyms
- Related keywords with different search intents
- Search volume estimates (realistic numbers)
- Keyword difficulty scores (0-100)
- Competition levels (low/medium/high)
- Estimated cost-per-click values`;

    if (includeQuestions) {
      prompt += `\n- Question-based keywords that people might search for`;
    }

    if (includeLongTail) {
      prompt += `\n- Long-tail keyword variations`;
    }

    prompt += `\n\nPlease format the response as JSON with this structure:
{
  "seedKeyword": "${seedKeyword}",
  "totalKeywords": 0,
  "keywords": [
    {
      "keyword": "example keyword",
      "searchVolume": 1000,
      "difficulty": 45,
      "cpc": 1.25,
      "competition": "medium",
      "relatedKeywords": ["related1", "related2"],
      "questions": ["How to...?", "What is...?"],
      "longTailKeywords": ["long tail variation 1", "long tail variation 2"]
    }
  ],
  "suggestions": {
    "lowCompetition": [],
    "highVolume": [],
    "longTail": [],
    "questions": []
  }
}`;

    return prompt;
  }

  // Generate content optimization prompt
  static generateOptimizationPrompt(content: {
    title: string;
    content: string;
    keywords: string[];
  }): string {
    const prompt = `Analyze and provide optimization suggestions for the following content:

Title: ${content.title}
Keywords: ${content.keywords.join(', ')}
Content: ${content.content}

Please analyze the content for:
1. SEO optimization (keyword usage, density, placement)
2. Readability and structure
3. Content quality and engagement
4. Technical SEO elements
5. User experience factors

Provide specific, actionable recommendations for improvement.

Format the response as JSON:
{
  "seoScore": 85,
  "readabilityScore": 90,
  "keywordDensity": {
    "primary keyword": 2.5,
    "secondary keyword": 1.8
  },
  "suggestions": [
    "Add more internal links",
    "Improve meta description",
    "Include more subheadings"
  ],
  "improvements": [
    "The keyword density is optimal",
    "Content structure is well organized",
    "Consider adding more examples"
  ]
}`;

    return prompt;
  }

  // Generate quick keyword suggestions prompt
  static generateKeywordSuggestionsPrompt(seedKeyword: string, limit: number): string {
    return `Generate ${limit} related keyword suggestions for: "${seedKeyword}".
    
Focus on:
- Semantic variations
- Different search intents (informational, commercial, transactional)  
- Long-tail variations
- Question-based keywords

Return as a simple JSON array of strings:
["keyword 1", "keyword 2", "keyword 3", ...]`;
  }

  // Parse AI response safely
  static parseAIResponse<T>(response: string): T {
    try {
      // Clean the response - remove markdown code blocks if present
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      return JSON.parse(cleanedResponse);
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error}`);
    }
  }

  // Calculate word count
  static calculateWordCount(text: string): number {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0).length;
  }

  // Generate SEO-friendly slug
  static generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim()
      .substring(0, 60); // Limit length
  }

  // Extract keywords from content
  static extractKeywords(content: string, excludeCommon: boolean = true): string[] {
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ];

    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);

    if (excludeCommon) {
      return words.filter(word => !commonWords.includes(word));
    }

    return words;
  }

  // Calculate keyword density
  static calculateKeywordDensity(content: string, keyword: string): number {
    const totalWords = this.calculateWordCount(content);
    const keywordOccurrences = (content.toLowerCase().match(
      new RegExp(keyword.toLowerCase(), 'g')
    ) || []).length;

    return totalWords > 0 ? (keywordOccurrences / totalWords) * 100 : 0;
  }

  // Validate content length requirements
  static validateContentLength(content: string, targetLength: ContentLength): {
    isValid: boolean;
    actualWords: number;
    expectedRange: { min: number; max: number };
  } {
    const wordCount = this.calculateWordCount(content);
    const ranges = {
      short: { min: 300, max: 600 },
      medium: { min: 600, max: 1200 },
      long: { min: 1200, max: 2500 },
    };

    const expectedRange = ranges[targetLength];
    const isValid = wordCount >= expectedRange.min && wordCount <= expectedRange.max;

    return {
      isValid,
      actualWords: wordCount,
      expectedRange,
    };
  }

  // Get content length description for prompts
  private static getLengthDescription(length: ContentLength): string {
    switch (length) {
      case 'short':
        return '300-600 word';
      case 'medium':
        return '600-1200 word';
      case 'long':
        return '1200-2500 word';
      default:
        return '600-1200 word';
    }
  }

  // Estimate reading time
  static estimateReadingTime(content: string): number {
    const wordCount = this.calculateWordCount(content);
    const wordsPerMinute = 200; // Average reading speed
    return Math.ceil(wordCount / wordsPerMinute);
  }

  // Generate content outline
  static generateOutlineFromContent(content: string): string[] {
    const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
    const headings: string[] = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      headings.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    return headings.length > 0 ? headings : [];
  }

  // Clean HTML content for plain text
  static stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  // Validate content quality
  static validateContentQuality(content: {
    title: string;
    content: string;
    keywords: string[];
  }): {
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check title length
    if (content.title.length < 30) {
      issues.push('Title is too short');
      recommendations.push('Make title more descriptive (30-60 characters)');
      score -= 10;
    } else if (content.title.length > 60) {
      issues.push('Title is too long');
      recommendations.push('Shorten title to under 60 characters');
      score -= 5;
    }

    // Check content length
    const wordCount = this.calculateWordCount(content.content);
    if (wordCount < 300) {
      issues.push('Content is too short');
      recommendations.push('Add more valuable content (minimum 300 words)');
      score -= 20;
    }

    // Check keyword usage
    let keywordUsed = false;
    content.keywords.forEach(keyword => {
      const density = this.calculateKeywordDensity(content.content, keyword);
      if (density === 0) {
        issues.push(`Keyword "${keyword}" not found in content`);
        recommendations.push(`Include "${keyword}" naturally in your content`);
        score -= 10;
      } else if (density > 3) {
        issues.push(`Keyword "${keyword}" used too frequently (${density.toFixed(1)}%)`);
        recommendations.push(`Reduce keyword density for "${keyword}" to 1-3%`);
        score -= 5;
      } else {
        keywordUsed = true;
      }
    });

    // Check for headings
    const headings = this.generateOutlineFromContent(content.content);
    if (headings.length === 0) {
      issues.push('No headings found');
      recommendations.push('Add H2/H3 headings to structure your content');
      score -= 15;
    }

    // Ensure score doesn't go below 0
    score = Math.max(0, score);

    return {
      score,
      issues,
      recommendations,
    };
  }

  // Generate meta description from content
  static generateMetaDescription(content: string, maxLength: number = 160): string {
    const plainText = this.stripHtml(content);
    const sentences = plainText.split('.').filter(s => s.trim().length > 0);
    
    let metaDescription = '';
    for (const sentence of sentences) {
      const testDescription = metaDescription + sentence.trim() + '. ';
      if (testDescription.length <= maxLength) {
        metaDescription = testDescription;
      } else {
        break;
      }
    }

    return metaDescription.trim() || plainText.substring(0, maxLength - 3) + '...';
  }

  // Extract excerpt from content
  static generateExcerpt(content: string, maxLength: number = 155): string {
    const plainText = this.stripHtml(content);
    
    if (plainText.length <= maxLength) {
      return plainText;
    }

    // Find the last complete sentence within the limit
    const truncated = plainText.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentenceEnd > maxLength * 0.7) {
      return plainText.substring(0, lastSentenceEnd + 1);
    }

    // If no good sentence break, find last word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    return plainText.substring(0, lastSpace) + '...';
  }

  // Validate AI response structure
  static validateContentResponse(response: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const requiredFields = ['title', 'content', 'excerpt', 'metaTitle', 'metaDescription', 'slug'];

    for (const field of requiredFields) {
      if (!response[field] || typeof response[field] !== 'string') {
        errors.push(`Missing or invalid ${field}`);
      }
    }

    if (response.keywords && !Array.isArray(response.keywords)) {
      errors.push('Keywords must be an array');
    }

    if (response.outline && !Array.isArray(response.outline)) {
      errors.push('Outline must be an array');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Generate content variations
  static generateContentVariationPrompt(
    originalContent: string,
    variationType: 'shorter' | 'longer' | 'different-tone' | 'different-angle',
    tone?: ContentTone
  ): string {
    let prompt = `Based on the following content, create a variation that is `;

    switch (variationType) {
      case 'shorter':
        prompt += 'more concise and focused, maintaining the key points but reducing length by 30-50%';
        break;
      case 'longer':
        prompt += 'more comprehensive and detailed, expanding on the key points with additional examples and insights';
        break;
      case 'different-tone':
        prompt += `rewritten in a ${tone || 'conversational'} tone while maintaining the same information`;
        break;
      case 'different-angle':
        prompt += 'approached from a different perspective or angle while covering the same topic';
        break;
    }

    prompt += `:\n\nOriginal Content:\n${originalContent}\n\nPlease provide the variation in the same JSON format as the original.`;

    return prompt;
  }

  // Content performance scoring
  static scoreContentPerformance(metrics: {
    wordCount: number;
    keywordDensity: Record<string, number>;
    headingCount: number;
    readabilityScore?: number;
    seoScore?: number;
  }): {
    overallScore: number;
    breakdown: {
      length: number;
      keywords: number;
      structure: number;
      readability: number;
      seo: number;
    };
  } {
    const breakdown = {
      length: this.scoreLengthMetric(metrics.wordCount),
      keywords: this.scoreKeywordMetrics(metrics.keywordDensity),
      structure: this.scoreStructureMetric(metrics.headingCount),
      readability: metrics.readabilityScore || 70,
      seo: metrics.seoScore || 70,
    };

    const overallScore = Math.round(
      (breakdown.length + breakdown.keywords + breakdown.structure + 
       breakdown.readability + breakdown.seo) / 5
    );

    return {
      overallScore,
      breakdown,
    };
  }

  private static scoreLengthMetric(wordCount: number): number {
    if (wordCount < 300) return 30;
    if (wordCount < 500) return 60;
    if (wordCount < 800) return 85;
    if (wordCount < 1500) return 95;
    if (wordCount < 2500) return 90;
    return 75; // Very long content
  }

  private static scoreKeywordMetrics(keywordDensity: Record<string, number>): number {
    const densities = Object.values(keywordDensity);
    if (densities.length === 0) return 0;

    let score = 0;
    for (const density of densities) {
      if (density === 0) score += 0;
      else if (density < 0.5) score += 40;
      else if (density <= 2.5) score += 90;
      else if (density <= 4) score += 70;
      else score += 30;
    }

    return Math.round(score / densities.length);
  }

  private static scoreStructureMetric(headingCount: number): number {
    if (headingCount === 0) return 20;
    if (headingCount < 3) return 60;
    if (headingCount <= 6) return 90;
    if (headingCount <= 10) return 85;
    return 70; // Too many headings
  }
}