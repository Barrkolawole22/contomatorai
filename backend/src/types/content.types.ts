export interface InternalLink {
  url: string;
  anchorText: string;
  addedAt?: string;
}

export interface Content {
  id: string;
  title: string;
  body: string;
  summary?: string;
  keywords?: string[];
  status: ContentStatus;
  type: ContentType;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  metadata?: ContentMetadata;
  tags?: string[];
  wordCount?: number;
  readingTime?: number;
  seoScore?: number;
  aiGenerated: boolean;
  seoAnalysis?: SEOAnalysis;
  wordPressPublications?: WordPressPublication[];
  excerpt?: string;
  publishedUrl?: string;
  wordpressSite?: string;
  internalLinks?: InternalLink[];
  scheduledFor?: string;
}

export type ContentStatus = 'draft' | 'published' | 'archived' | 'scheduled';

export type ContentType = 'blog' | 'article' | 'landing' | 'product' | 'custom';

export type ContentTone = 'professional' | 'casual' | 'friendly' | 'authoritative' | 'conversational';

export type ContentLength = 'short' | 'medium' | 'long';

export interface ContentGenerationParams {
  title?: string;
  topic?: string;
  type: ContentType;
  keywords?: string[];
  outline?: string;
  prompt?: string;
  tone?: ContentTone | string;
  length?: ContentLength;
  targetAudience?: string;
  userId?: string;
  siteId?: string;
  wordCount?: number;
  additionalInstructions?: string;
  [key: string]: any;
}

export interface GeneratedContent {
  title: string;
  body: string;
  summary?: string;
  keywords?: string[];
  metaTitle?: string;
  metaDescription?: string;
  excerpt?: string;
  tags?: string[];
  wordCount?: number;
  readingTime?: number;
}

export interface ContentData {
  title: string;
  body: string;
  type: ContentType;
  status: ContentStatus;
  userId: string;
  summary?: string;
  keywords?: string[];
  tags?: string[];
  metadata?: ContentMetadata;
  excerpt?: string;
  aiGenerated?: boolean;
  scheduledFor?: string;
  internalLinks?: InternalLink[];
}

export interface ContentMetadata {
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  canonicalUrl?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  slug?: string;
}

export interface SEOAnalysis {
  score: number;
  readabilityScore: number;
  keywordDensity: number;
  issues: SEOIssue[];
  recommendations: string[];
}

export interface SEOIssue {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details?: string;
}

export interface WordPressPublication {
  id: string;
  siteId: string;
  siteName: string;
  postId: number;
  postUrl: string;
  status: string;
  publishedAt: string;
}

export interface ContentCreationRequest {
  title: string;
  type: ContentType;
  keywords?: string[];
  outline?: string;
  prompt?: string;
  tone?: string;
  length?: ContentLength;
  targetAudience?: string;
}

export interface ContentUpdateRequest {
  title?: string;
  body?: string;
  summary?: string;
  keywords?: string[];
  status?: ContentStatus;
  type?: ContentType;
  tags?: string[];
  metadata?: ContentMetadata;
  excerpt?: string;
  scheduledFor?: string;
  internalLinks?: InternalLink[];
}

export interface ContentFilterOptions {
  status?: ContentStatus;
  type?: ContentType;
  search?: string;
  tag?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'publishedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface ContentListResponse {
  content: Content[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}