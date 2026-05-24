// backend/src/services/knowledgebase.service.ts
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import KnowledgeDoc, { IKnowledgeDoc } from '../models/knowledgedoc.model';
import logger from '../config/logger';

const MAX_WORDS = 4000; // ~10 pages safety cap

export class KnowledgebaseService {

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

    this.processDocument(doc._id.toString(), file.path, fileExt).catch((err) => {
      logger.error(`Background processing failed for doc ${doc._id}:`, err);
    });

    return doc;
  }

  async getDocuments(userId: string): Promise<IKnowledgeDoc[]> {
    return KnowledgeDoc.find({ userId }, { fullText: 0 })
      .sort({ createdAt: -1 })
      .lean() as unknown as IKnowledgeDoc[];
  }

  async getDocumentById(userId: string, docId: string): Promise<IKnowledgeDoc | null> {
    return KnowledgeDoc.findOne({ _id: docId, userId }, { fullText: 0 })
      .lean() as unknown as IKnowledgeDoc | null;
  }

  async deleteDocument(userId: string, docId: string): Promise<boolean> {
    const doc = await KnowledgeDoc.findOne({ _id: docId, userId });
    if (!doc) return false;

    if (fs.existsSync(doc.filePath)) {
      try { fs.unlinkSync(doc.filePath); } catch (err) {
        logger.warn(`Could not delete file ${doc.filePath}:`, err);
      }
    }

    await KnowledgeDoc.deleteOne({ _id: docId });
    return true;
  }

  /**
   * Returns full text of selected docs, ready to inject into the Gemini prompt.
   * No embeddings, no chunking — the full content is the context.
   */
  async retrieveContext(
    userId: string,
    docIds: string[]
  ): Promise<string> {
    const docs = await KnowledgeDoc.find({
      _id: { $in: docIds },
      userId,
      status: 'ready',
    }).select('title fullText');

    if (docs.length === 0) return '';

    return docs
      .map((doc) => `=== Knowledge Document: ${doc.title} ===\n${doc.fullText}`)
      .join('\n\n');
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async processDocument(
    docId: string,
    filePath: string,
    fileType: 'docx' | 'txt'
  ): Promise<void> {
    try {
      logger.info(`📄 Processing doc ${docId} (${fileType})`);

      const rawText =
        fileType === 'docx'
          ? await this.extractTextFromDocx(filePath)
          : await fs.promises.readFile(filePath, 'utf-8');

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Document is empty or could not be read');
      }

      // Enforce word cap — reject oversized docs early
      const words = rawText.trim().split(/\s+/);
      if (words.length > MAX_WORDS) {
        throw new Error(
          `Document too large: ${words.length} words (max ${MAX_WORDS}). Please upload a shorter document.`
        );
      }

      const fullText = rawText.trim();
      const totalWords = words.length;

      await KnowledgeDoc.findByIdAndUpdate(docId, {
        fullText,
        totalWords,
        status: 'ready',
      });

      logger.info(`✅ Doc ${docId} ready: ${totalWords} words`);
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
}

export default new KnowledgebaseService();