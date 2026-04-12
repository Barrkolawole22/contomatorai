import mongoose, { Schema, model, Document } from 'mongoose';

export interface ISite extends Document {
  name: string;
  url: string;
  apiUrl: string;
  username: string;
  applicationPassword: string;
  owner: Schema.Types.ObjectId;
  isActive: boolean;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  tags: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  lastSync: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const siteSchema = new Schema<ISite>({
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
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Invalid URL format'
    }
  },
  apiUrl: {
    type: String,
    required: [true, 'API URL is required'],
    trim: true,
    validate: {
      validator: function(v: string) {
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Invalid API URL format'
    }
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true,
  },
  applicationPassword: {
    type: String,
    required: [true, 'Application password is required'],
    select: false, // Don't include in queries by default for security
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner is required'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  categories: [{
    id: { type: Number, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
  }],
  tags: [{
    id: { type: Number, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
  }],
  lastSync: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for performance
siteSchema.index({ owner: 1 });
siteSchema.index({ owner: 1, url: 1 }, { unique: true });

// FIXED: Prevent model overwrite error
const Site = (mongoose.models.Site as mongoose.Model<ISite>) || model<ISite>('Site', siteSchema);
export default Site;