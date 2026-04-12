import mongoose, { Schema, Document, Model } from 'mongoose';

// ✅ NEW: Internal Link interface
export interface IInternalLink {
  url: string;
  anchorText: string;
  addedAt: Date;
}

export interface IContent extends Document {
  // Basic content fields (your existing)
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  
  // SEO fields (your existing)
  keyword: string;
  keywords?: string[];
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  
  // Ownership and site association (your existing)
  userId: mongoose.Types.ObjectId;
  siteId: mongoose.Types.ObjectId;
  
  // Content metadata (your existing - keep as is)
  status: 'draft' | 'ready' | 'generating' | 'publishing' | 'scheduled' | 'published' | 'failed';
  type: 'post' | 'page' | 'article' | 'blog';
  tone: string;
  wordCount: number;
  readingTime?: number;
  
  // WordPress integration - FIXED: tags should be strings for tag names, numbers for IDs
  categories: number[]; // Keep as numbers (WordPress category IDs)
  tags: string[]; // 🔧 CHANGED: From number[] to string[] for tag names
  tagIds?: number[]; // 🔧 NEW: Optional field for WordPress tag IDs
  featuredImage?: string;
  publishDate?: Date;
  publishedPostId?: number;
  publishedUrl?: string;
  publishedAt?: Date; // ✅ NEW: For frontend display
  wordpressSite?: string; // ✅ NEW: Site name for display
  
  // ✅ NEW: Internal Links
  internalLinks: IInternalLink[];
  
  // AI generation metadata (your existing)
  aiGenerated: boolean;
  aiModel?: string;
  generationOptions?: {
    tone: string;
    wordCount: number;
    includeHeadings: boolean;
    includeIntroduction: boolean;
    includeConclusion: boolean;
    extraInstructions?: string;
  };
  
  // Content quality metrics (your existing)
  seoScore?: number;
  readabilityScore?: number;
  qualityScore?: number;
  
  // Publishing history (your existing)
  publishHistory: Array<{
    action: 'created' | 'updated' | 'published' | 'scheduled' | 'failed';
    timestamp: Date;
    details?: string;
    wordpressPostId?: number;
    error?: string;
  }>;
  
  // Performance tracking (your existing)
  analytics?: {
    views?: number;
    clicks?: number;
    shares?: number;
    lastTracked?: Date;
  };

  // 🔥 NEW: Admin-specific fields (add these for admin dashboard)
  reviewStatus?: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  reviewNotes?: string;
  reviewedAt?: Date;
  reviewerId?: mongoose.Types.ObjectId;
  
  // 🔥 NEW: Content format (for admin filtering)
  contentFormat?: 'html' | 'markdown' | 'plaintext';
  
  // 🔥 NEW: Generation source (for admin analytics)
  generatedBy?: 'openai' | 'gemini' | 'groq' | 'claude' | 'manual' | 'template';
  
  // ✅ NEW: Post Scheduling fields
  scheduledPublishDate?: Date;
  timezone?: string;
  publishError?: string;
  
  // Timestamps (your existing)
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods (your existing + new)
  updateWordCount(): void;
  calculateReadingTime(): number;
  calculateSEOScore(): number;
  addToPublishHistory(action: string, details?: any): void;
  isPublished(): boolean;
  canEdit(): boolean;
  generateSlug(): string;
  updateQualityScore(): Promise<void>; // NEW: For admin quality analysis
}

const ContentSchema: Schema<IContent> = new Schema<IContent>(
  {
    // Basic content information (your existing)
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
    },
    excerpt: {
      type: String,
      maxlength: [500, 'Excerpt cannot exceed 500 characters'],
      default: undefined,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    
    // SEO and keyword fields (your existing)
    keyword: {
      type: String,
      required: [true, 'Primary keyword is required'],
      trim: true,
      index: true,
    },
    keywords: {
      type: [String],
      default: [],
      validate: {
        validator: function(keywords: string[]) {
          return keywords.length <= 10;
        },
        message: 'Cannot have more than 10 keywords'
      }
    },
    metaTitle: {
      type: String,
      maxlength: [60, 'Meta title cannot exceed 60 characters'],
      default: undefined,
    },
    metaDescription: {
      type: String,
      maxlength: [160, 'Meta description cannot exceed 160 characters'],
      default: undefined,
    },
    focusKeyword: {
      type: String,
      trim: true,
      default: undefined,
    },
    
    // Ownership and associations (your existing)
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    siteId: {
      type: Schema.Types.ObjectId,
      ref: 'Site',
      required: [false, 'Site ID is not required'],
      index: true,
    },
    
    // Content status and type (your existing - perfect!)
    status: {
      type: String,
      enum: {
        values: ['draft', 'ready', 'generating', 'publishing', 'scheduled', 'published', 'failed'],
        message: 'Status must be one of: draft, ready, generating, publishing, scheduled, published, failed'
      },
      default: 'draft',
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['post', 'page', 'article', 'blog'],
        message: 'Type must be one of: post, page, article, blog'
      },
      default: 'post',
    },
    tone: {
      type: String,
      enum: ['informative', 'conversational', 'professional', 'friendly', 'authoritative', 'casual'],
      default: 'informative',
    },
    
    // Content metrics (your existing)
    wordCount: {
      type: Number,
      default: 0,
      min: [0, 'Word count cannot be negative'],
    },
    readingTime: {
      type: Number,
      default: 0,
      min: [0, 'Reading time cannot be negative'],
    },
    
    // WordPress fields - FIXED TAGS SCHEMA
    categories: {
      type: [Number],
      default: [],
      validate: {
        validator: function(categories: number[]) {
          return categories.length <= 5;
        },
        message: 'Cannot assign more than 5 categories'
      }
    },
    // 🔧 MAIN FIX: Changed tags from [Number] to [String]
    tags: {
      type: [String], // ✅ FIXED: Now accepts string array
      default: [],
      validate: {
        validator: function(tags: string[]) {
          return tags.length <= 10;
        },
        message: 'Cannot assign more than 10 tags'
      }
    },
    // 🔧 NEW: Optional field for WordPress tag IDs (when publishing)
    tagIds: {
      type: [Number],
      default: [],
      validate: {
        validator: function(tagIds: number[]) {
          return tagIds.length <= 10;
        },
        message: 'Cannot assign more than 10 tag IDs'
      }
    },
    featuredImage: {
      type: String,
      default: undefined,
    },
    
    // Publishing information (your existing)
    publishDate: {
      type: Date,
      default: undefined,
      index: true,
    },
    publishedPostId: {
      type: Number,
      default: undefined,
      index: true,
    },
    publishedUrl: {
      type: String,
      default: undefined,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    wordpressSite: {
      type: String,
      default: null,
    },
    
    // ✅ NEW: Internal Links field
    internalLinks: {
      type: [{
        url: {
          type: String,
          required: true,
          trim: true,
        },
        anchorText: {
          type: String,
          required: true,
          trim: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        }
      }],
      default: [],
      validate: {
        validator: function(links: IInternalLink[]) {
          return links.length <= 20;
        },
        message: 'Cannot have more than 20 internal links'
      }
    },
    
    // AI generation metadata (your existing)
    aiGenerated: {
      type: Boolean,
      default: false,
      index: true,
    },
    aiModel: {
      type: String,
      default: undefined,
    },
    generationOptions: {
      type: {
        tone: String,
        wordCount: Number,
        includeHeadings: Boolean,
        includeIntroduction: Boolean,
        includeConclusion: Boolean,
        extraInstructions: String,
      },
      default: undefined,
    },
    
    // Quality scores (your existing)
    seoScore: {
      type: Number,
      default: 0,
      min: [0, 'SEO score cannot be negative'],
      max: [100, 'SEO score cannot exceed 100'],
    },
    readabilityScore: {
      type: Number,
      default: 0,
      min: [0, 'Readability score cannot be negative'],
      max: [100, 'Readability score cannot exceed 100'],
    },
    qualityScore: {
      type: Number,
      default: 0,
      min: [0, 'Quality score cannot be negative'],
      max: [100, 'Quality score cannot exceed 100'],
      index: true,
    },
    
    // Publishing history (your existing)
    publishHistory: {
      type: [{
        action: {
          type: String,
          enum: ['created', 'updated', 'published', 'scheduled', 'failed'],
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
          required: true,
        },
        details: String,
        wordpressPostId: Number,
        error: String,
      }],
      default: [],
    },
    
    // Performance analytics (your existing)
    analytics: {
      type: {
        views: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
        lastTracked: Date,
      },
      default: undefined,
    },

    // Admin-specific fields
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'needs_revision'],
      default: 'pending',
      index: true,
    },
    reviewNotes: {
      type: String,
      default: undefined,
    },
    reviewedAt: {
      type: Date,
      default: undefined,
    },
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    
    // Content format
    contentFormat: {
      type: String,
      enum: ['html', 'markdown', 'plaintext'],
      default: 'html',
    },
    
    // Generation source for admin analytics
    generatedBy: {
      type: String,
      enum: ['openai', 'gemini', 'groq', 'claude', 'manual', 'template'],
      default: 'manual',
      index: true,
    },

    // ✅ NEW: Post Scheduling fields
    scheduledPublishDate: {
      type: Date,
      index: true,
      default: undefined,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    publishError: {
      type: String,
      default: undefined,
    },
  },
  { 
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        // Clean up the returned object
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound indexes for better query performance (your existing + new)
ContentSchema.index({ userId: 1, status: 1 });
ContentSchema.index({ userId: 1, siteId: 1 });
ContentSchema.index({ userId: 1, createdAt: -1 });
ContentSchema.index({ siteId: 1, status: 1, publishDate: 1 });
ContentSchema.index({ keyword: 'text', title: 'text' }); // Text search

// 🔥 NEW: Admin-specific indexes
ContentSchema.index({ reviewStatus: 1, createdAt: -1 });
ContentSchema.index({ qualityScore: -1 });
ContentSchema.index({ generatedBy: 1, createdAt: -1 });

// ✅ NEW: Scheduler-specific indexes
ContentSchema.index({ status: 1, scheduledPublishDate: 1 });
ContentSchema.index({ scheduledPublishDate: 1 });

// Middleware to update word count and reading time before saving (your existing)
ContentSchema.pre<IContent>('save', function (next) {
  if (this.isModified('content')) {
    this.updateWordCount();
    this.readingTime = this.calculateReadingTime();
    
    // Generate slug from title if not provided
    if (!this.slug && this.title) {
      this.slug = this.generateSlug();
    }
    
    // Set focus keyword to primary keyword if not set
    if (!this.focusKeyword && this.keyword) {
      this.focusKeyword = this.keyword;
    }
    
    // Add keywords array if not set
    if (!this.keywords || this.keywords.length === 0) {
      this.keywords = [this.keyword];
    }
  }
  
  next();
});

// All your existing instance methods (keep exactly as they are)
ContentSchema.methods.updateWordCount = function (): void {
  if (this.content) {
    const plainText = this.content.replace(/<[^>]*>/g, ' ');
    const words = plainText.trim().split(/\s+/).filter(word => word.length > 0);
    this.wordCount = words.length;
  } else {
    this.wordCount = 0;
  }
};

ContentSchema.methods.calculateReadingTime = function (): number {
  return this.wordCount > 0 ? Math.ceil(this.wordCount / 200) : 0;
};

ContentSchema.methods.calculateSEOScore = function (): number {
  let score = 0;
  
  // Title checks (30 points)
  if (this.title && this.title.length >= 30 && this.title.length <= 60) score += 15;
  if (this.title && this.keyword && this.title.toLowerCase().includes(this.keyword.toLowerCase())) score += 15;
  
  // Content checks (40 points)
  if (this.wordCount >= 300) score += 10;
  if (this.wordCount >= 1000) score += 10;
  if (this.content && this.keyword) {
    const keywordCount = (this.content.toLowerCase().match(new RegExp(this.keyword.toLowerCase(), 'g')) || []).length;
    const keywordDensity = (keywordCount / this.wordCount) * 100;
    if (keywordDensity >= 0.5 && keywordDensity <= 2.5) score += 20;
  }
  
  // Meta description (15 points)
  if (this.metaDescription && this.metaDescription.length >= 120 && this.metaDescription.length <= 160) score += 15;
  
  // Structure checks (15 points)
  if (this.content && this.content.includes('<h2>')) score += 10;
  if (this.excerpt && this.excerpt.length > 0) score += 5;
  
  return Math.min(score, 100);
};

ContentSchema.methods.addToPublishHistory = function (action: string, details?: any): void {
  this.publishHistory.push({
    action,
    timestamp: new Date(),
    details: details?.message || details,
    wordpressPostId: details?.postId,
    error: details?.error,
  });
};

ContentSchema.methods.isPublished = function (): boolean {
  return this.status === 'published' && this.publishedPostId !== undefined;
};

ContentSchema.methods.canEdit = function (): boolean {
  return ['draft', 'ready', 'failed'].includes(this.status);
};

ContentSchema.methods.generateSlug = function (): string {
  return this.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// 🔥 NEW: Quality score calculation for admin analytics - UPDATED for string tags
ContentSchema.methods.updateQualityScore = async function(): Promise<void> {
  let score = 0;
  
  // Title quality (0-20 points)
  if (this.title && this.title.length >= 30 && this.title.length <= 60) {
    score += 20;
  } else if (this.title && this.title.length >= 20) {
    score += 15;
  } else if (this.title) {
    score += 10;
  }
  
  // Content length (0-20 points)
  if (this.wordCount >= 1500) {
    score += 20;
  } else if (this.wordCount >= 1000) {
    score += 15;
  } else if (this.wordCount >= 500) {
    score += 10;
  } else if (this.wordCount >= 300) {
    score += 5;
  }
  
  // Meta description (0-15 points)
  if (this.metaDescription && this.metaDescription.length >= 120 && this.metaDescription.length <= 160) {
    score += 15;
  } else if (this.metaDescription && this.metaDescription.length >= 100) {
    score += 10;
  } else if (this.metaDescription) {
    score += 5;
  }
  
  // Keywords (0-15 points)
  if (this.keywords && this.keywords.length >= 5) {
    score += 15;
  } else if (this.keywords && this.keywords.length >= 3) {
    score += 10;
  } else if (this.keywords && this.keywords.length >= 1) {
    score += 5;
  }
  
  // Featured image (0-10 points)
  if (this.featuredImage) {
    score += 10;
  }
  
  // Categories and tags (0-10 points) - UPDATED for string tags
  if (this.categories.length > 0 && this.tags.length > 0) {
    score += 10;
  } else if (this.categories.length > 0 || this.tags.length > 0) {
    score += 5;
  }
  
  // Excerpt (0-10 points)
  if (this.excerpt && this.excerpt.length >= 100) {
    score += 10;
  } else if (this.excerpt) {
    score += 5;
  }
  
  this.qualityScore = Math.min(score, 100);
  await this.save();
};

// Static methods (your existing + new)
ContentSchema.statics.findByUser = function (userId: string) {
  return this.find({ userId }).populate('siteId', 'name url');
};

ContentSchema.statics.findBySite = function (siteId: string) {
  return this.find({ siteId }).populate('userId', 'name email');
};

ContentSchema.statics.findPublished = function () {
  return this.find({ status: 'published' });
};

ContentSchema.statics.findScheduled = function () {
  return this.find({ 
    status: 'scheduled', 
    publishDate: { $gte: new Date() } 
  });
};

ContentSchema.statics.findByKeyword = function (keyword: string) {
  return this.find({ 
    $or: [
      { keyword: new RegExp(keyword, 'i') },
      { keywords: { $in: [new RegExp(keyword, 'i')] } }
    ]
  });
};

// 🔥 NEW: Admin-specific static methods
ContentSchema.statics.findForReview = function () {
  return this.find({ reviewStatus: 'pending' })
    .populate('userId', 'name email')
    .sort({ createdAt: 1 }); // Oldest first
};

ContentSchema.statics.findByQualityScore = function (minScore = 0, maxScore = 100) {
  return this.find({ 
    qualityScore: { $gte: minScore, $lte: maxScore } 
  }).sort({ qualityScore: -1 });
};

ContentSchema.statics.findByGeneratedBy = function (source: string) {
  return this.find({ generatedBy: source })
    .sort({ createdAt: -1 });
};

// Virtual for formatted publish date (your existing)
ContentSchema.virtual('formattedPublishDate').get(function () {
  return this.publishDate ? this.publishDate.toISOString().split('T')[0] : null;
});

// Virtual for content preview (your existing)
ContentSchema.virtual('preview').get(function () {
  if (!this.content) return '';
  const plainText = this.content.replace(/<[^>]*>/g, ' ');
  return plainText.substring(0, 200) + (plainText.length > 200 ? '...' : '');
});

// Prevent model overwrite error (your existing)
const Content = mongoose.model<IContent>('Content', ContentSchema);
export default Content;