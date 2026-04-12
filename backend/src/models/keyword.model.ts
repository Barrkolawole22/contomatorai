import mongoose, { Schema, model, Document } from 'mongoose';

export interface IKeyword extends Document {
  keyword: string;
  volume?: number;
  difficulty?: number;
  cpc?: number;
  searchIntent?: string;
  source: string;
  userId: mongoose.Types.ObjectId;
  siteId?: mongoose.Types.ObjectId;
  status: string;
  contentId?: mongoose.Types.ObjectId;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const KeywordSchema: Schema = new Schema(
  {
    keyword: {
      type: String,
      required: true,
      trim: true,
    },
    volume: {
      type: Number,
      default: null,
    },
    difficulty: {
      type: Number,
      default: null,
    },
    cpc: {
      type: Number,
      default: null,
    },
    searchIntent: {
      type: String,
      enum: ['informational', 'navigational', 'transactional', 'commercial', 'unknown'],
      default: 'unknown',
    },
    source: {
      type: String,
      enum: ['manual', 'google_trends', 'serp', 'ai_suggested'],
      default: 'manual',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    siteId: {
      type: Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'used', 'skipped'],
      default: 'pending',
    },
    contentId: {
      type: Schema.Types.ObjectId,
      ref: 'Content',
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Create a compound index for uniqueness per user
KeywordSchema.index({ keyword: 1, userId: 1 }, { unique: true });

// FIXED: Prevent model overwrite error
const Keyword = mongoose.model<IKeyword>('Keyword', KeywordSchema);
export default Keyword;