// backend/src/services/knowledgebase.service.ts
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import KnowledgeDoc, { IKnowledgeDoc } from '../models/knowledgedoc.model';
import logger from '../config/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Projection to exclude the potentially massive chunks array from list queries
const WITHOUT_CHUNKS = { chunks: 0 } as const;

export class KnowledgebaseService {
  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Save the uploaded file, create a DB record with status "processing",
   * then kick off async processing (chunk + embed). Returns immediately so
   * the HTTP response is fast.
   */
  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    description?: string
  ): Promise<IKnowledgeDoc> {
    const fileExt = path.extname(file.originalname).toLowerCase().slice(1) as 'docx' | 'txt';
    const title = path.basename(file.originalname, path.extname(file.originalname));

    const doc = new KnowledgeDoc({
      userId,
      title,
      description,
      fileName: file.originalname,
      fileType: fileExt,
      filePath: file.path,
      fileSize: file.size,
      status: 'processing',
    });

    await doc.save();

    // Fire-and-forget — errors are caught inside processDocument
    this.processDocument(doc._id.toString(), file.path, fileExt).catch((err) => {
      logger.error(`Background processing failed for doc ${doc._id}:`, err);
    });

    return doc;
  }

  /** List all documents for a user (no chunk data returned). */
  async getDocuments(userId: string): Promise<IKnowledgeDoc[]> {
    return KnowledgeDoc.find({ userId }, WITHOUT_CHUNKS).sort({ createdAt: -1 }).lean() as unknown as IKnowledgeDoc[];
  }

  /** Single document metadata (no chunk data). */
  async getDocumentById(userId: string, docId: string): Promise<IKnowledgeDoc | null> {
    return KnowledgeDoc.findOne({ _id: docId, userId }, WITHOUT_CHUNKS).lean() as unknown as IKnowledgeDoc | null;
  }

  /** Delete a document from MongoDB and disk. */
  async deleteDocument(userId: string, docId: string): Promise<boolean> {
    const doc = await KnowledgeDoc.findOne({ _id: docId, userId });
    if (!doc) return false;

    if (fs.existsSync(doc.filePath)) {
      try {
        fs.unlinkSync(doc.filePath);
      } catch (err) {
        logger.warn(`Could not delete file ${doc.filePath}:`, err);
      }
    }

    await KnowledgeDoc.deleteOne({ _id: docId });
    return true;
  }

  /**
   * RAG retrieval: embed the topic, score every chunk from the specified docs
   * via cosine similarity, return the top-5 chunks as a formatted string.
   */
  async retrieveContext(
    userId: string,
    docIds: string[],
    topic: string
  ): Promise<string> {
    const docs = await KnowledgeDoc.find({
      _id: { $in: docIds },
      userId,
      status: 'ready',
    });

    if (docs.length === 0) return '';

    const topicEmbedding = await this.generateEmbedding(topic);

    const scored: Array<{ text: string; score: number }> = [];

    for (const doc of docs) {
      for (const chunk of doc.chunks) {
        if (chunk.embedding?.length > 0) {
          const score = this.cosineSimilarity(topicEmbedding, chunk.embedding);
          scored.push({ text: chunk.text, score });
        }
      }
    }

    if (scored.length === 0) return '';

    scored.sort((a, b) => b.score - a.score);
    const top5 = scored.slice(0, 5);

    return top5
      .map((c, i) => `[Source Excerpt ${i + 1}]\n${c.text}`)
      .join('\n\n---\n\n');
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  private async processDocument(
    docId: string,
    filePath: string,
    fileType: 'docx' | 'txt'
  ): Promise<void> {
    try {
      logger.info(`📄 Processing knowledgebase doc ${docId} (${fileType})`);

      const text =
        fileType === 'docx'
          ? await this.extractTextFromDocx(filePath)
          : await fs.promises.readFile(filePath, 'utf-8');

      if (!text || text.trim().length === 0) {
        throw new Error('Document is empty or could not be read');
      }

      const rawChunks = this.chunkText(text);
      logger.info(`📄 Doc ${docId}: ${rawChunks.length} chunks, generating embeddings…`);

      const processedChunks = [];

      for (let i = 0; i < rawChunks.length; i++) {
        const chunkText = rawChunks[i];
        const embedding = await this.generateEmbedding(chunkText);
        const wordCount = chunkText.split(/\s+/).filter((w) => w.length > 0).length;
        processedChunks.push({ chunkIndex: i, text: chunkText, embedding, wordCount });

        // Respect Gemini free-tier rate limits (~1 500 RPM)
        if (i < rawChunks.length - 1) {
          await this.delay(120);
        }
      }

      const totalWords = processedChunks.reduce((sum, c) => sum + c.wordCount, 0);

      await KnowledgeDoc.findByIdAndUpdate(docId, {
        chunks: processedChunks,
        totalChunks: processedChunks.length,
        totalWords,
        status: 'ready',
      });

      logger.info(`✅ Doc ${docId} ready: ${processedChunks.length} chunks, ${totalWords} words`);
    } catch (error: any) {
      logger.error(`❌ Doc ${docId} processing failed:`, error);
      await KnowledgeDoc.findByIdAndUpdate(docId, {
        status: 'failed',
        processingError: error.message,
      });
    }
  }

  async extractTextFromDocx(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  /**
   * Split text into ~chunkSize-word chunks with overlap words of overlap
   * so context isn't lost at boundaries.
   */
  chunkText(text: string, chunkSize: number = 400, overlap: number = 50): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const chunks: string[] = [];
    let i = 0;

    while (i < words.length) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim().length > 0) chunks.push(chunk);
      i += chunkSize - overlap;
    }

    return chunks;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new KnowledgebaseService();
