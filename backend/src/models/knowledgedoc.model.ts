// backend/src/models/knowledgedoc.model.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IChunk {
  chunkIndex: number;
  text: string;
  embedding: number[];
  wordCount: number;
}

export interface IKnowledgeDoc extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  fileName: string;
  fileType: 'docx' | 'txt';
  filePath: string;
  fileSize: number;
  status: 'processing' | 'ready' | 'failed';
  processingError?: string;
  chunks: IChunk[];
  totalChunks: number;
  totalWords: number;
  createdAt: Date;
  updatedAt: Date;
}

const ChunkSchema = new Schema<IChunk>(
  {
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    wordCount: { type: Number, required: true },
  },
  { _id: false }
);

const KnowledgeDocSchema = new Schema<IKnowledgeDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    fileName: { type: String, required: true },
    fileType: { type: String, enum: ['docx', 'txt'], required: true },
    filePath: { type: String, required: true },
    fileSize: { type: Number, required: true },
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
      index: true,
    },
    processingError: { type: String },
    chunks: { type: [ChunkSchema], default: [] },
    totalChunks: { type: Number, default: 0 },
    totalWords: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IKnowledgeDoc>('KnowledgeDoc', KnowledgeDocSchema);
