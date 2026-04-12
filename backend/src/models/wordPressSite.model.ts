// backend/src/models/wordPressSite.model.ts - WordPress Sites Model
import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IWordPressSite extends Document {
  // Basic site information
  name: string;
  url: string;
  apiUrl: string;
  description?: string;
  
  // Authentication
  username: string;
  applicationPassword: string; // WordPress Application Password
  authMethod: 'basic' | 'oauth' | 'jwt';
  
  // Site status and health
  status: 'connected' | 'disconnected' | 'error' | 'maintenance';
  isActive: boolean;
  lastSync: Date;
  lastHealthCheck: Date;
  healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  
  // WordPress information
  wpVersion?: string;
  phpVersion?: string;
  mysqlVersion?: string;
  theme?: {
    name: string;
    version: string;
    author: string;
  };
  
  // Site statistics
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  totalPages: number;
  
  // Performance metrics
  averageResponseTime: number; // in milliseconds
  uptime: number; // percentage
  lastResponseTime?: number;
  
  // User association
  userId: mongoose.Types.ObjectId;
  
  // Publishing settings
  autoPublish: boolean;
  defaultCategory?: string;
  defaultStatus: 'publish' | 'draft' | 'private' | 'pending';
  enableSEO: boolean;
  
  // Categories and tags sync
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    description?: string;
    count: number;
  }>;
  
  tags: Array<{
    id: number;
    name: string;
    slug: string;
    description?: string;
    count: number;
  }>;
  
  // Security and monitoring
  securityChecks: {
    sslEnabled: boolean;
    wpUpdated: boolean;
    strongPasswords: boolean;
    loginAttempts: number;
    lastLoginAttempt?: Date;
  };
  
  // Plugin information
  plugins: Array<{
    name: string;
    version: string;
    status: 'active' | 'inactive';
    needsUpdate: boolean;
    description?: string;
  }>;
  
  // Error tracking
  lastError?: {
    message: string;
    code: string;
    timestamp: Date;
    details?: any;
  };
  
  // Sync settings
  syncSettings: {
    enableAutoSync: boolean;
    syncInterval: number; // in minutes
    lastAutoSync?: Date;
    syncCategories: boolean;
    syncTags: boolean;
    syncMedia: boolean;
  };
  
  // Content publishing stats
  publishingStats: {
    totalPublished: number;
    thisMonth: number;
    thisWeek: number;
    failed: number;
    pending: number;
  };
  
  // Site configuration
  siteConfig: {
    timezone: string;
    dateFormat: string;
    timeFormat: string;
    startOfWeek: number;
    language: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  testConnection(): Promise<boolean>;
  syncTaxonomies(): Promise<void>;
  healthCheck(): Promise<void>;
  updateStats(): Promise<void>;
  publishPost(postData: any): Promise<any>;
}

const WordPressSiteSchema: Schema<IWordPressSite> = new Schema(
  {
    // Basic site information
    name: {
      type: String,
      required: [true, 'Site name is required'],
      trim: true,
      maxlength: [100, 'Site name cannot exceed 100 characters'],
    },
    url: {
      type: String,
      required: [true, 'Site URL is required'],
      trim: true,
      validate: {
        validator: function(v: string) {
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Site URL must be a valid HTTP/HTTPS URL'
      }
    },
    apiUrl: {
      type: String,
      required: [true, 'API URL is required'],
      trim: true,
      validate: {
        validator: function(v: string) {
          return /^https?:\/\/.+\/wp-json\/wp\/v2/.test(v);
        },
        message: 'API URL must be a valid WordPress REST API URL'
      }
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    
    // Authentication
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
    },
    applicationPassword: {
      type: String,
      required: [true, 'Application password is required'],
      select: false, // Don't include in queries by default
    },
    authMethod: {
      type: String,
      enum: ['basic', 'oauth', 'jwt'],
      default: 'basic',
    },
    
    // Site status and health
    status: {
      type: String,
      enum: {
        values: ['connected', 'disconnected', 'error', 'maintenance'],
        message: 'Status must be one of: connected, disconnected, error, maintenance'
      },
      default: 'disconnected',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastSync: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastHealthCheck: {
      type: Date,
      default: Date.now,
    },
    healthStatus: {
      type: String,
      enum: ['healthy', 'warning', 'critical', 'unknown'],
      default: 'unknown',
      index: true,
    },
    
    // WordPress information
    wpVersion: {
      type: String,
      trim: true,
    },
    phpVersion: {
      type: String,
      trim: true,
    },
    mysqlVersion: {
      type: String,
      trim: true,
    },
    theme: {
      name: {
        type: String,
        trim: true,
      },
      version: {
        type: String,
        trim: true,
      },
      author: {
        type: String,
        trim: true,
      },
    },
    
    // Site statistics
    totalPosts: {
      type: Number,
      default: 0,
      min: 0,
    },
    publishedPosts: {
      type: Number,
      default: 0,
      min: 0,
    },
    draftPosts: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPages: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    // Performance metrics
    averageResponseTime: {
      type: Number,
      default: 0,
      min: 0,
    },
    uptime: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    lastResponseTime: {
      type: Number,
      min: 0,
    },
    
    // User association
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    
    // Publishing settings
    autoPublish: {
      type: Boolean,
      default: false,
    },
    defaultCategory: {
      type: String,
      trim: true,
    },
    defaultStatus: {
      type: String,
      enum: ['publish', 'draft', 'private', 'pending'],
      default: 'draft',
    },
    enableSEO: {
      type: Boolean,
      default: true,
    },
    
    // Categories and tags sync
    categories: [{
      id: {
        type: Number,
        required: true,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      slug: {
        type: String,
        required: true,
        trim: true,
      },
      description: {
        type: String,
        trim: true,
      },
      count: {
        type: Number,
        default: 0,
        min: 0,
      },
    }],
    
    tags: [{
      id: {
        type: Number,
        required: true,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      slug: {
        type: String,
        required: true,
        trim: true,
      },
      description: {
        type: String,
        trim: true,
      },
      count: {
        type: Number,
        default: 0,
        min: 0,
      },
    }],
    
    // Security and monitoring
    securityChecks: {
      sslEnabled: {
        type: Boolean,
        default: false,
      },
      wpUpdated: {
        type: Boolean,
        default: false,
      },
      strongPasswords: {
        type: Boolean,
        default: false,
      },
      loginAttempts: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastLoginAttempt: {
        type: Date,
      },
    },
    
    // Plugin information
    plugins: [{
      name: {
        type: String,
        required: true,
        trim: true,
      },
      version: {
        type: String,
        required: true,
        trim: true,
      },
      status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'inactive',
      },
      needsUpdate: {
        type: Boolean,
        default: false,
      },
      description: {
        type: String,
        trim: true,
      },
    }],
    
    // Error tracking
    lastError: {
      message: {
        type: String,
        trim: true,
      },
      code: {
        type: String,
        trim: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      details: {
        type: Schema.Types.Mixed,
      },
    },
    
    // Sync settings
    syncSettings: {
      enableAutoSync: {
        type: Boolean,
        default: false,
      },
      syncInterval: {
        type: Number,
        default: 60, // 60 minutes
        min: 5,
        max: 1440, // 24 hours
      },
      lastAutoSync: {
        type: Date,
      },
      syncCategories: {
        type: Boolean,
        default: true,
      },
      syncTags: {
        type: Boolean,
        default: true,
      },
      syncMedia: {
        type: Boolean,
        default: false,
      },
    },
    
    // Content publishing stats
    publishingStats: {
      totalPublished: {
        type: Number,
        default: 0,
        min: 0,
      },
      thisMonth: {
        type: Number,
        default: 0,
        min: 0,
      },
      thisWeek: {
        type: Number,
        default: 0,
        min: 0,
      },
      failed: {
        type: Number,
        default: 0,
        min: 0,
      },
      pending: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    
    // Site configuration
    siteConfig: {
      timezone: {
        type: String,
        default: 'UTC',
      },
      dateFormat: {
        type: String,
        default: 'F j, Y',
      },
      timeFormat: {
        type: String,
        default: 'g:i a',
      },
      startOfWeek: {
        type: Number,
        default: 1, // Monday
        min: 0,
        max: 6,
      },
      language: {
        type: String,
        default: 'en_US',
      },
    },
  },
  { 
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        // Remove sensitive data
        delete ret.applicationPassword;
        delete ret.__v;
        ret.id = ret._id;
        delete ret._id;
        return ret;
      }
    }
  }
);

// Indexes for better performance
WordPressSiteSchema.index({ userId: 1, status: 1 });
WordPressSiteSchema.index({ url: 1 }, { unique: true });
WordPressSiteSchema.index({ lastSync: -1 });

// Pre-save middleware
WordPressSiteSchema.pre<IWordPressSite>('save', function (next) {
  // Ensure API URL ends with wp-json/wp/v2
  if (this.isModified('apiUrl') && !this.apiUrl.endsWith('/wp-json/wp/v2')) {
    if (this.apiUrl.endsWith('/')) {
      this.apiUrl += 'wp-json/wp/v2';
    } else {
      this.apiUrl += '/wp-json/wp/v2';
    }
  }
  
  // Update health status based on last health check
  if (this.lastHealthCheck) {
    const hoursSinceCheck = (Date.now() - this.lastHealthCheck.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCheck > 24) {
      this.healthStatus = 'unknown';
    }
  }
  
  next();
});

// Instance methods
WordPressSiteSchema.methods.testConnection = async function(): Promise<boolean> {
  try {
    const axios = require('axios');
    const auth = Buffer.from(`${this.username}:${this.applicationPassword}`).toString('base64');
    
    const startTime = Date.now();
    const response = await axios.get(this.apiUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 seconds
    });
    
    const responseTime = Date.now() - startTime;
    this.lastResponseTime = responseTime;
    this.lastHealthCheck = new Date();
    
    if (response.status === 200) {
      this.status = 'connected';
      this.healthStatus = responseTime > 3000 ? 'warning' : 'healthy';
      await this.save();
      return true;
    }
    
    return false;
  } catch (error: any) {
    this.status = 'error';
    this.healthStatus = 'critical';
    this.lastError = {
      message: error.message || 'Connection failed',
      code: error.code || 'CONNECTION_ERROR',
      timestamp: new Date(),
      details: error.response?.data || null,
    };
    await this.save();
    return false;
  }
};

WordPressSiteSchema.methods.syncTaxonomies = async function(): Promise<void> {
  try {
    const axios = require('axios');
    const auth = Buffer.from(`${this.username}:${this.applicationPassword}`).toString('base64');
    
    // Sync categories
    const categoriesResponse = await axios.get(`${this.apiUrl}/categories?per_page=100`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    this.categories = categoriesResponse.data.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      count: cat.count || 0,
    }));
    
    // Sync tags
    const tagsResponse = await axios.get(`${this.apiUrl}/tags?per_page=100`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    this.tags = tagsResponse.data.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      description: tag.description || '',
      count: tag.count || 0,
    }));
    
    this.lastSync = new Date();
    this.syncSettings.lastAutoSync = new Date();
    await this.save();
    
  } catch (error: any) {
    this.lastError = {
      message: 'Failed to sync taxonomies',
      code: 'SYNC_ERROR',
      timestamp: new Date(),
      details: error.message,
    };
    await this.save();
    throw error;
  }
};

WordPressSiteSchema.methods.healthCheck = async function(): Promise<void> {
  try {
    const axios = require('axios');
    const auth = Buffer.from(`${this.username}:${this.applicationPassword}`).toString('base64');
    
    // Test basic connection
    const startTime = Date.now();
    const response = await axios.get(this.apiUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    
    const responseTime = Date.now() - startTime;
    this.lastResponseTime = responseTime;
    this.averageResponseTime = this.averageResponseTime 
      ? (this.averageResponseTime + responseTime) / 2 
      : responseTime;
    
    // Check WordPress version and other details
    if (response.data && response.data.description) {
      // Try to get WordPress version from site info
      try {
        const siteResponse = await axios.get(`${this.url}/wp-json/`, {
          timeout: 5000,
        });
        
        if (siteResponse.data) {
          this.wpVersion = siteResponse.data.gmt_offset !== undefined ? 'Available' : 'Unknown';
        }
      } catch (e) {
        // WordPress version detection failed, continue
      }
    }
    
    // Update health status
    if (responseTime < 1000) {
      this.healthStatus = 'healthy';
    } else if (responseTime < 3000) {
      this.healthStatus = 'warning';
    } else {
      this.healthStatus = 'critical';
    }
    
    this.status = 'connected';
    this.lastHealthCheck = new Date();
    
    // Check SSL
    this.securityChecks.sslEnabled = this.url.startsWith('https://');
    
    await this.save();
    
  } catch (error: any) {
    this.status = 'error';
    this.healthStatus = 'critical';
    this.lastError = {
      message: error.message || 'Health check failed',
      code: error.code || 'HEALTH_CHECK_ERROR',
      timestamp: new Date(),
      details: error.response?.data || null,
    };
    this.lastHealthCheck = new Date();
    await this.save();
  }
};

WordPressSiteSchema.methods.updateStats = async function(): Promise<void> {
  try {
    const axios = require('axios');
    const auth = Buffer.from(`${this.username}:${this.applicationPassword}`).toString('base64');
    
    // Get posts statistics
    const postsResponse = await axios.get(`${this.apiUrl}/posts?per_page=1`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    this.totalPosts = parseInt(postsResponse.headers['x-wp-total'] || '0');
    
    // Get published posts
    const publishedResponse = await axios.get(`${this.apiUrl}/posts?status=publish&per_page=1`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    this.publishedPosts = parseInt(publishedResponse.headers['x-wp-total'] || '0');
    
    // Get draft posts
    const draftResponse = await axios.get(`${this.apiUrl}/posts?status=draft&per_page=1`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    this.draftPosts = parseInt(draftResponse.headers['x-wp-total'] || '0');
    
    // Get pages
    const pagesResponse = await axios.get(`${this.apiUrl}/pages?per_page=1`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    this.totalPages = parseInt(pagesResponse.headers['x-wp-total'] || '0');
    
    await this.save();
    
  } catch (error: any) {
    this.lastError = {
      message: 'Failed to update statistics',
      code: 'STATS_ERROR',
      timestamp: new Date(),
      details: error.message,
    };
    await this.save();
  }
};

WordPressSiteSchema.methods.publishPost = async function(postData: any): Promise<any> {
  try {
    const axios = require('axios');
    const auth = Buffer.from(`${this.username}:${this.applicationPassword}`).toString('base64');
    
    const response = await axios.post(`${this.apiUrl}/posts`, postData, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Update publishing stats
    this.publishingStats.totalPublished += 1;
    this.publishingStats.thisMonth += 1;
    this.publishingStats.thisWeek += 1;
    
    await this.save();
    
    return response.data;
    
  } catch (error: any) {
    this.publishingStats.failed += 1;
    this.lastError = {
      message: 'Failed to publish post',
      code: 'PUBLISH_ERROR',
      timestamp: new Date(),
      details: error.response?.data || error.message,
    };
    await this.save();
    throw error;
  }
};

// Static methods
WordPressSiteSchema.statics.findByUser = function(userId: string) {
  return this.find({ userId, isActive: true }).sort({ createdAt: -1 });
};

WordPressSiteSchema.statics.findConnected = function() {
  return this.find({ status: 'connected', isActive: true });
};

WordPressSiteSchema.statics.findHealthy = function() {
  return this.find({ healthStatus: 'healthy', isActive: true });
};

WordPressSiteSchema.statics.needsHealthCheck = function() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.find({ 
    lastHealthCheck: { $lt: oneHourAgo },
    isActive: true 
  });
};

const WordPressSite: Model<IWordPressSite> = mongoose.models.WordPressSite || mongoose.model<IWordPressSite>('WordPressSite', WordPressSiteSchema);

export default WordPressSite;