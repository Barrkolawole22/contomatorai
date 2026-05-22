import mongoose, { Schema, Document } from 'mongoose';

export interface IPipelineRun extends Document {
  userId: mongoose.Types.ObjectId;
  pipelineConfigId: mongoose.Types.ObjectId;
  status: 'running' | 'completed' | 'failed';
  articlesGenerated: number;
  articlesPublished: number;
  runErrors: string[];
  runAt: Date;
  completedAt?: Date;
  results: Array<{
    topic: string;
    contentId?: mongoose.Types.ObjectId;
    status: 'generated' | 'published' | 'failed';
    error?: string;
  }>;
}

const pipelineRunSchema = new Schema<IPipelineRun>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  pipelineConfigId: { type: Schema.Types.ObjectId, ref: 'PipelineConfig', required: true },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  articlesGenerated: { type: Number, default: 0 },
  articlesPublished: { type: Number, default: 0 },
  runErrors: [{ type: String }],
  runAt: { type: Date, default: Date.now },
  completedAt: Date,
  results: [{
    topic: String,
    contentId: { type: Schema.Types.ObjectId, ref: 'Content' },
    status: { type: String, enum: ['generated', 'published', 'failed'] },
    error: String
  }]
}, { timestamps: true });

export default mongoose.model<IPipelineRun>('PipelineRun', pipelineRunSchema);