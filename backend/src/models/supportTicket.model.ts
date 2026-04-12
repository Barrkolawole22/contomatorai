// backend/src/models/supportTicket.model.ts - Support Tickets Model
import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ISupportTicket extends Document {
  // Basic ticket information
  ticketNumber: string;
  subject: string;
  description: string;
  category: 'bug' | 'feature' | 'question' | 'billing' | 'technical' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_for_customer' | 'resolved' | 'closed';
  
  // User information
  userId: mongoose.Types.ObjectId;
  userEmail: string;
  userName: string;
  
  // Assignment
  assignedTo?: mongoose.Types.ObjectId;
  assignedAt?: Date;
  
  // Tags and labels
  tags: string[];
  labels: string[];
  
  // Communication
  messages: Array<{
    id: string;
    content: string;
    sender: mongoose.Types.ObjectId;
    senderType: 'user' | 'admin' | 'system';
    isPublic: boolean;
    attachments?: Array<{
      name: string;
      url: string;
      type: string;
      size: number;
    }>;
    timestamp: Date;
  }>;
  
  // Metrics and tracking
  firstResponseTime?: number; // in minutes
  resolutionTime?: number; // in minutes
  responseCount: number;
  viewCount: number;
  
  // Satisfaction
  satisfactionRating?: number; // 1-5 stars
  satisfactionComment?: string;
  satisfactionDate?: Date;
  
  // System information
  browserInfo?: {
    userAgent: string;
    browser: string;
    version: string;
    os: string;
  };
  
  systemInfo?: {
    apiVersion: string;
    userPlan: string;
    lastLogin: Date;
    errorLogs?: string[];
  };
  
  // Escalation
  escalated: boolean;
  escalatedAt?: Date;
  escalatedTo?: mongoose.Types.ObjectId;
  escalationReason?: string;
  
  // SLA tracking
  slaBreached: boolean;
  slaTarget?: Date;
  slaActual?: Date;
  
  // Knowledge base
  relatedArticles: Array<{
    id: mongoose.Types.ObjectId;
    title: string;
    url: string;
  }>;
  
  // Resolution
  resolution?: {
    summary: string;
    steps: string[];
    resolvedBy: mongoose.Types.ObjectId;
    resolvedAt: Date;
    followUpRequired: boolean;
    followUpDate?: Date;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  
  // Instance methods
  addMessage(content: string, sender: mongoose.Types.ObjectId, senderType: string, isPublic?: boolean): Promise<void>;
  assignTo(adminId: mongoose.Types.ObjectId): Promise<void>;
  escalate(adminId: mongoose.Types.ObjectId, reason: string): Promise<void>;
  resolve(summary: string, steps: string[], resolvedBy: mongoose.Types.ObjectId): Promise<void>;
  close(): Promise<void>;
  calculateMetrics(): void;
}

const SupportTicketSchema: Schema<ISupportTicket> = new Schema(
  {
    // Basic ticket information
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    category: {
      type: String,
      enum: {
        values: ['bug', 'feature', 'question', 'billing', 'technical', 'other'],
        message: 'Category must be one of: bug, feature, question, billing, technical, other'
      },
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'urgent'],
        message: 'Priority must be one of: low, medium, high, urgent'
      },
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed'],
        message: 'Status must be one of: open, in_progress, waiting_for_customer, resolved, closed'
      },
      default: 'open',
      index: true,
    },
    
    // User information
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    
    // Assignment
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedAt: {
      type: Date,
    },
    
    // Tags and labels
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    labels: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    
    // Communication
    messages: [{
      id: {
        type: String,
        required: true,
        default: () => new mongoose.Types.ObjectId().toString(),
      },
      content: {
        type: String,
        required: true,
        maxlength: [10000, 'Message content cannot exceed 10000 characters'],
      },
      sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      senderType: {
        type: String,
        enum: ['user', 'admin', 'system'],
        required: true,
      },
      isPublic: {
        type: Boolean,
        default: true,
      },
      attachments: [{
        name: {
          type: String,
          required: true,
          trim: true,
        },
        url: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          required: true,
        },
        size: {
          type: Number,
          required: true,
          min: 0,
        },
      }],
      timestamp: {
        type: Date,
        default: Date.now,
      },
    }],
    
    // Metrics and tracking
    firstResponseTime: {
      type: Number, // in minutes
      min: 0,
    },
    resolutionTime: {
      type: Number, // in minutes
      min: 0,
    },
    responseCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    // Satisfaction
    satisfactionRating: {
      type: Number,
      min: 1,
      max: 5,
    },
    satisfactionComment: {
      type: String,
      trim: true,
      maxlength: [1000, 'Satisfaction comment cannot exceed 1000 characters'],
    },
    satisfactionDate: {
      type: Date,
    },
    
    // System information
    browserInfo: {
      userAgent: {
        type: String,
        trim: true,
      },
      browser: {
        type: String,
        trim: true,
      },
      version: {
        type: String,
        trim: true,
      },
      os: {
        type: String,
        trim: true,
      },
    },
    
    systemInfo: {
      apiVersion: {
        type: String,
        trim: true,
      },
      userPlan: {
        type: String,
        trim: true,
      },
      lastLogin: {
        type: Date,
      },
      errorLogs: [{
        type: String,
      }],
    },
    
    // Escalation
    escalated: {
      type: Boolean,
      default: false,
      index: true,
    },
    escalatedAt: {
      type: Date,
    },
    escalatedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    escalationReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Escalation reason cannot exceed 500 characters'],
    },
    
    // SLA tracking
    slaBreached: {
      type: Boolean,
      default: false,
      index: true,
    },
    slaTarget: {
      type: Date,
    },
    slaActual: {
      type: Date,
    },
    
    // Knowledge base
    relatedArticles: [{
      id: {
        type: Schema.Types.ObjectId,
        ref: 'KnowledgeBaseArticle',
      },
      title: {
        type: String,
        trim: true,
      },
      url: {
        type: String,
        trim: true,
      },
    }],
    
    // Resolution
    resolution: {
      summary: {
        type: String,
        trim: true,
        maxlength: [2000, 'Resolution summary cannot exceed 2000 characters'],
      },
      steps: [{
        type: String,
        trim: true,
      }],
      resolvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      resolvedAt: {
        type: Date,
      },
      followUpRequired: {
        type: Boolean,
        default: false,
      },
      followUpDate: {
        type: Date,
      },
    },
    
    // Timestamps
    closedAt: {
      type: Date,
    },
  },
  { 
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes for better performance
SupportTicketSchema.index({ userId: 1, status: 1 });
SupportTicketSchema.index({ assignedTo: 1, status: 1 });
SupportTicketSchema.index({ category: 1, priority: 1 });
SupportTicketSchema.index({ createdAt: -1 });
SupportTicketSchema.index({ status: 1, priority: 1 });
SupportTicketSchema.index({ escalated: 1, status: 1 });
SupportTicketSchema.index({ tags: 1 });

// Pre-save middleware
SupportTicketSchema.pre<ISupportTicket>('save', function (next) {
  // Generate ticket number if new
  if (this.isNew && !this.ticketNumber) {
    this.ticketNumber = `TK-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  }
  
  // Calculate SLA target for new tickets
  if (this.isNew && !this.slaTarget) {
    const slaHours = this.priority === 'urgent' ? 2 : 
                    this.priority === 'high' ? 8 : 
                    this.priority === 'medium' ? 24 : 72;
    this.slaTarget = new Date(Date.now() + slaHours * 60 * 60 * 1000);
  }
  
  // Check SLA breach
  if (this.slaTarget && !this.slaActual && ['resolved', 'closed'].includes(this.status)) {
    this.slaActual = new Date();
    this.slaBreached = this.slaActual > this.slaTarget;
  }
  
  // Update closed date
  if (this.isModified('status') && this.status === 'closed' && !this.closedAt) {
    this.closedAt = new Date();
  }
  
  // Calculate metrics
  this.calculateMetrics();
  
  next();
});

// Instance methods
SupportTicketSchema.methods.addMessage = async function(
  content: string, 
  sender: mongoose.Types.ObjectId, 
  senderType: string, 
  isPublic: boolean = true
): Promise<void> {
  this.messages.push({
    id: new mongoose.Types.ObjectId().toString(),
    content,
    sender,
    senderType,
    isPublic,
    timestamp: new Date(),
  });
  
  this.responseCount += 1;
  
  // Set first response time if this is the first admin response
  if (senderType === 'admin' && !this.firstResponseTime) {
    const timeDiff = Date.now() - this.createdAt.getTime();
    this.firstResponseTime = Math.floor(timeDiff / (1000 * 60)); // in minutes
  }
  
  // Update status if waiting for customer and customer responds
  if (this.status === 'waiting_for_customer' && senderType === 'user') {
    this.status = 'open';
  }
  
  await this.save();
};

SupportTicketSchema.methods.assignTo = async function(adminId: mongoose.Types.ObjectId): Promise<void> {
  this.assignedTo = adminId;
  this.assignedAt = new Date();
  
  if (this.status === 'open') {
    this.status = 'in_progress';
  }
  
  await this.save();
};

SupportTicketSchema.methods.escalate = async function(
  adminId: mongoose.Types.ObjectId, 
  reason: string
): Promise<void> {
  this.escalated = true;
  this.escalatedAt = new Date();
  this.escalatedTo = adminId;
  this.escalationReason = reason;
  this.priority = this.priority === 'urgent' ? 'urgent' : 
                 this.priority === 'high' ? 'urgent' :
                 this.priority === 'medium' ? 'high' : 'medium';
  
  await this.save();
};

SupportTicketSchema.methods.resolve = async function(
  summary: string, 
  steps: string[], 
  resolvedBy: mongoose.Types.ObjectId
): Promise<void> {
  this.status = 'resolved';
  this.resolution = {
    summary,
    steps,
    resolvedBy,
    resolvedAt: new Date(),
    followUpRequired: false,
  };
  
  // Calculate resolution time
  const timeDiff = Date.now() - this.createdAt.getTime();
  this.resolutionTime = Math.floor(timeDiff / (1000 * 60)); // in minutes
  
  await this.save();
};

SupportTicketSchema.methods.close = async function(): Promise<void> {
  this.status = 'closed';
  this.closedAt = new Date();
  
  if (!this.resolutionTime) {
    const timeDiff = Date.now() - this.createdAt.getTime();
    this.resolutionTime = Math.floor(timeDiff / (1000 * 60)); // in minutes
  }
  
  await this.save();
};

SupportTicketSchema.methods.calculateMetrics = function(): void {
  // Update response count based on admin messages
  this.responseCount = this.messages.filter(msg => msg.senderType === 'admin').length;
  
  // Calculate first response time if not already set
  if (!this.firstResponseTime) {
    const firstAdminResponse = this.messages.find(msg => msg.senderType === 'admin');
    if (firstAdminResponse) {
      const timeDiff = firstAdminResponse.timestamp.getTime() - this.createdAt.getTime();
      this.firstResponseTime = Math.floor(timeDiff / (1000 * 60)); // in minutes
    }
  }
};

// Static methods
SupportTicketSchema.statics.findByUser = function(userId: string) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

SupportTicketSchema.statics.findOpen = function() {
  return this.find({ status: { $in: ['open', 'in_progress', 'waiting_for_customer'] } })
    .sort({ priority: 1, createdAt: 1 }); // Urgent first, then oldest
};

SupportTicketSchema.statics.findEscalated = function() {
  return this.find({ escalated: true, status: { $ne: 'closed' } })
    .sort({ escalatedAt: -1 });
};

SupportTicketSchema.statics.findSLABreached = function() {
  return this.find({ slaBreached: true })
    .sort({ createdAt: -1 });
};

SupportTicketSchema.statics.findByAssignee = function(adminId: string) {
  return this.find({ assignedTo: adminId, status: { $ne: 'closed' } })
    .sort({ priority: 1, createdAt: 1 });
};

const SupportTicket: Model<ISupportTicket> = mongoose.models.SupportTicket || mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);

export default SupportTicket;