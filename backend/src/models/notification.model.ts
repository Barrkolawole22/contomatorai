// backend/src/models/notification.model.ts - Notifications Model
import mongoose, { Document, Schema, Model } from 'mongoose';

export interface INotification extends Document {
  // Basic notification information
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'update' | 'reminder' | 'promotion';
  category: 'system' | 'user' | 'content' | 'billing' | 'security' | 'maintenance' | 'feature';
  
  // Recipient information
  recipientId?: mongoose.Types.ObjectId; // Specific user, null for broadcast
  recipientType: 'user' | 'admin' | 'all' | 'role_based';
  targetRoles?: string[]; // For role-based notifications
  
  // Notification behavior
  priority: 'low' | 'medium' | 'high' | 'urgent';
  persistent: boolean; // Should remain until manually dismissed
  autoExpire: boolean;
  expiresAt?: Date;
  
  // Display settings
  showInApp: boolean;
  showAsPopup: boolean;
  sendEmail: boolean;
  sendPush: boolean;
  
  // Interaction tracking
  isRead: boolean;
  readAt?: Date;
  isDismissed: boolean;
  dismissedAt?: Date;
  clicked: boolean;
  clickedAt?: Date;
  
  // Action buttons
  actions?: Array<{
    id: string;
    label: string;
    url?: string;
    action?: string;
    style: 'primary' | 'secondary' | 'danger' | 'success';
  }>;
  
  // Metadata
  metadata?: {
    sourceId?: string;
    sourceType?: string;
    relatedEntity?: {
      type: string;
      id: mongoose.Types.ObjectId;
    };
    customData?: any;
  };
  
  // Creator information
  createdBy?: mongoose.Types.ObjectId;
  createdBySystem: boolean;
  
  // Scheduling
  scheduledFor?: Date;
  sent: boolean;
  sentAt?: Date;
  
  // Analytics
  viewCount: number;
  clickCount: number;
  dismissCount: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  markAsRead(userId?: mongoose.Types.ObjectId): Promise<void>;
  markAsDismissed(userId?: mongoose.Types.ObjectId): Promise<void>;
  recordClick(): Promise<void>;
  isExpired(): boolean;
  canBeSeenBy(userId: string, userRole: string): boolean;
}

const NotificationSchema: Schema<INotification> = new Schema(
  {
    // Basic notification information
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    type: {
      type: String,
      enum: {
        values: ['info', 'success', 'warning', 'error', 'update', 'reminder', 'promotion'],
        message: 'Type must be one of: info, success, warning, error, update, reminder, promotion'
      },
      default: 'info',
      index: true,
    },
    category: {
      type: String,
      enum: {
        values: ['system', 'user', 'content', 'billing', 'security', 'maintenance', 'feature'],
        message: 'Category must be one of: system, user, content, billing, security, maintenance, feature'
      },
      default: 'system',
      index: true,
    },
    
    // Recipient information
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    recipientType: {
      type: String,
      enum: {
        values: ['user', 'admin', 'all', 'role_based'],
        message: 'Recipient type must be one of: user, admin, all, role_based'
      },
      required: true,
      index: true,
    },
    targetRoles: [{
      type: String,
      enum: ['user', 'admin', 'super_admin', 'moderator'],
    }],
    
    // Notification behavior
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'urgent'],
        message: 'Priority must be one of: low, medium, high, urgent'
      },
      default: 'medium',
      index: true,
    },
    persistent: {
      type: Boolean,
      default: false,
    },
    autoExpire: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
    
    // Display settings
    showInApp: {
      type: Boolean,
      default: true,
    },
    showAsPopup: {
      type: Boolean,
      default: false,
    },
    sendEmail: {
      type: Boolean,
      default: false,
    },
    sendPush: {
      type: Boolean,
      default: false,
    },
    
    // Interaction tracking
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    isDismissed: {
      type: Boolean,
      default: false,
      index: true,
    },
    dismissedAt: {
      type: Date,
    },
    clicked: {
      type: Boolean,
      default: false,
    },
    clickedAt: {
      type: Date,
    },
    
    // Action buttons
    actions: [{
      id: {
        type: String,
        required: true,
      },
      label: {
        type: String,
        required: true,
        trim: true,
        maxlength: [50, 'Action label cannot exceed 50 characters'],
      },
      url: {
        type: String,
        trim: true,
      },
      action: {
        type: String,
        trim: true,
      },
      style: {
        type: String,
        enum: ['primary', 'secondary', 'danger', 'success'],
        default: 'primary',
      },
    }],
    
    // Metadata
    metadata: {
      sourceId: {
        type: String,
        trim: true,
      },
      sourceType: {
        type: String,
        trim: true,
      },
      relatedEntity: {
        type: {
          type: String,
          trim: true,
        },
        id: {
          type: Schema.Types.ObjectId,
        },
      },
      customData: {
        type: Schema.Types.Mixed,
      },
    },
    
    // Creator information
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    createdBySystem: {
      type: Boolean,
      default: true,
    },
    
    // Scheduling
    scheduledFor: {
      type: Date,
      index: true,
    },
    sent: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentAt: {
      type: Date,
    },
    
    // Analytics
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    clickCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dismissCount: {
      type: Number,
      default: 0,
      min: 0,
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
NotificationSchema.index({ recipientId: 1, isRead: 1, isDismissed: 1 });
NotificationSchema.index({ recipientType: 1, targetRoles: 1 });
NotificationSchema.index({ type: 1, category: 1 });
NotificationSchema.index({ priority: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 });
NotificationSchema.index({ scheduledFor: 1, sent: 1 });
NotificationSchema.index({ createdAt: -1 });

// Pre-save middleware
NotificationSchema.pre<INotification>('save', function (next) {
  // Set default expiration if auto-expire is enabled
  if (this.isNew && this.autoExpire && !this.expiresAt) {
    const daysToExpire = this.priority === 'urgent' ? 3 : 
                        this.priority === 'high' ? 7 : 
                        this.priority === 'medium' ? 14 : 30;
    this.expiresAt = new Date(Date.now() + daysToExpire * 24 * 60 * 60 * 1000);
  }
  
  // Set sent timestamp if marking as sent
  if (this.isModified('sent') && this.sent && !this.sentAt) {
    this.sentAt = new Date();
  }
  
  next();
});

// Instance methods
NotificationSchema.methods.markAsRead = async function(userId?: mongoose.Types.ObjectId): Promise<void> {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    this.viewCount += 1;
    await this.save();
  }
};

NotificationSchema.methods.markAsDismissed = async function(userId?: mongoose.Types.ObjectId): Promise<void> {
  if (!this.isDismissed) {
    this.isDismissed = true;
    this.dismissedAt = new Date();
    this.dismissCount += 1;
    await this.save();
  }
};

NotificationSchema.methods.recordClick = async function(): Promise<void> {
  this.clicked = true;
  this.clickedAt = new Date();
  this.clickCount += 1;
  
  // Auto-mark as read when clicked
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    this.viewCount += 1;
  }
  
  await this.save();
};

NotificationSchema.methods.isExpired = function(): boolean {
  if (!this.autoExpire || !this.expiresAt) {
    return false;
  }
  return new Date() > this.expiresAt;
};

NotificationSchema.methods.canBeSeenBy = function(userId: string, userRole: string): boolean {
  // Check if expired
  if (this.isExpired()) {
    return false;
  }
  
  // Check if scheduled for future
  if (this.scheduledFor && new Date() < this.scheduledFor) {
    return false;
  }
  
  // Check recipient type
  switch (this.recipientType) {
    case 'user':
      return this.recipientId?.toString() === userId;
    case 'admin':
      return ['admin', 'super_admin', 'moderator'].includes(userRole);
    case 'all':
      return true;
    case 'role_based':
      return this.targetRoles?.includes(userRole) || false;
    default:
      return false;
  }
};

// Static methods
NotificationSchema.statics.findForUser = function(userId: string, userRole: string) {
  const query = {
    $and: [
      {
        $or: [
          { recipientId: userId },
          { recipientType: 'all' },
          { recipientType: 'admin', $expr: { $in: [userRole, ['admin', 'super_admin', 'moderator']] } },
          { recipientType: 'role_based', targetRoles: userRole }
        ]
      },
      {
        $or: [
          { autoExpire: false },
          { expiresAt: { $gt: new Date() } },
          { expiresAt: null }
        ]
      },
      {
        $or: [
          { scheduledFor: { $lte: new Date() } },
          { scheduledFor: null }
        ]
      }
    ]
  };
  
  return this.find(query).sort({ priority: 1, createdAt: -1 });
};

NotificationSchema.statics.findUnread = function(userId: string, userRole: string) {
  return (this as any).findForUser(userId, userRole).where({ isRead: false });
};

NotificationSchema.statics.findByPriority = function(priority: string) {
  return this.find({ priority }).sort({ createdAt: -1 });
};

NotificationSchema.statics.findExpired = function() {
  return this.find({
    autoExpire: true,
    expiresAt: { $lt: new Date() }
  });
};

NotificationSchema.statics.findScheduled = function() {
  return this.find({
    sent: false,
    scheduledFor: { $lte: new Date() }
  });
};

NotificationSchema.statics.createSystemNotification = async function(data: {
  title: string;
  message: string;
  type?: string;
  category?: string;
  recipientType: string;
  recipientId?: string;
  targetRoles?: string[];
  priority?: string;
  actions?: any[];
  metadata?: any;
}) {
  const notification = new this({
    ...data,
    createdBySystem: true,
    showInApp: true,
  });
  
  return await notification.save();
};

NotificationSchema.statics.broadcast = async function(data: {
  title: string;
  message: string;
  type?: string;
  category?: string;
  priority?: string;
  actions?: any[];
}) {
  const notification = new this({
    ...data,
    recipientType: 'all',
    createdBySystem: true,
    showInApp: true,
    showAsPopup: data.priority === 'urgent',
  });
  
  return await notification.save();
};

const Notification: Model<INotification> = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;