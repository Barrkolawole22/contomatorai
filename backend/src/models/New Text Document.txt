// backend/src/models/sitemap-url.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ISitemapUrl extends Document {
  siteId: mongoose.Types.ObjectId;
  url: string;
  title?: string;
  category?: string;
  keywords?: string[];
  description?: string;
  lastModified?: Date;
  changeFreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  isIndexed: boolean;
  crawledAt: Date;
  status: 'active' | 'broken' | 'redirected';
  responseTime?: number;
  statusCode?: number;
  createdAt: Date;
  updatedAt: Date;
}

const SitemapUrlSchema = new Schema<ISitemapUrl>({
  siteId: {
    type: Schema.Types.ObjectId,
    ref: 'Site',
    required: true,
    index: true
  },
  url: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  },
  keywords: [{
    type: String
  }],
  description: {
    type: String,
    default: ''
  },
  lastModified: {
    type: Date
  },
  changeFreq: {
    type: String,
    enum: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'],
    default: 'weekly'
  },
  priority: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  isIndexed: {
    type: Boolean,
    default: false
  },
  crawledAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'broken', 'redirected'],
    default: 'active'
  },
  responseTime: {
    type: Number
  },
  statusCode: {
    type: Number
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
SitemapUrlSchema.index({ siteId: 1, url: 1 }, { unique: true });
SitemapUrlSchema.index({ siteId: 1, category: 1 });
SitemapUrlSchema.index({ siteId: 1, isIndexed: 1 });
SitemapUrlSchema.index({ keywords: 1 });

export default mongoose.model<ISitemapUrl>('SitemapUrl', SitemapUrlSchema);