import mongoose, { Schema, Document } from 'mongoose';

export interface IPipelineConfig extends Document {
  userId: mongoose.Types.ObjectId;
  siteId: mongoose.Types.ObjectId;
  isActive: boolean;
  schedule: 'hourly' | 'twice_daily' | 'daily' | 'weekly';
  niche: string;
  targetWordCount: number;
  aiModel: 'gemini' | 'gemini-pro' | 'gpt4o' | 'claude';
  previewWindowMinutes: number;
  maxArticlesPerRun: number;
  lastRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pipelineConfigSchema = new Schema<IPipelineConfig>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
  isActive: { type: Boolean, default: true },
  schedule: { type: String, enum: ['hourly', 'twice_daily', 'daily', 'weekly'], required: true },
  niche: { type: String, required: true },
  targetWordCount: { type: Number, default: 1500 },
  aiModel: { type: String, enum: ['gemini', 'gemini-pro', 'gpt4o', 'claude'], default: 'gemini' },
  previewWindowMinutes: { type: Number, default: 60 },
  maxArticlesPerRun: { type: Number, default: 1 },
  lastRunAt: Date,
}, { timestamps: true });

export default mongoose.model<IPipelineConfig>('PipelineConfig', pipelineConfigSchema);