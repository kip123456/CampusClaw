import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher, getClassSchool } from '../middleware/guards';
import { resolvePath, saveFile } from '../lib/storage';
import { CustomError } from '../types';
import { enqueueIndexTask } from '../lib/index-queue';
import { deleteDocumentChunks, queryChunks } from '../lib/chroma';
import { embedSingle } from '../lib/embed';
import { validateChunkConfig, DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP } from '../lib/chunk';
import { answerWithRAG } from '../lib/qa';
import { isLLMConfigured } from '../lib/llm';

export const kbsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

kbsRouter.post(
  '/:classId/kbs',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const { name, chunkSize, chunkOverlap } = req.body || {};
    if (!name) throw new CustomError('Missing required field: name', 400, 'BAD_REQUEST');

    const { chunkSize: cs, chunkOverlap: co } = validateChunkConfig(
      chunkSize ?? DEFAULT_CHUNK_SIZE,
      chunkOverlap ?? DEFAULT_OVERLAP
    );

    if (name === '默认知识库') {
      const existing = db
        .prepare('SELECT id FROM knowledge_bases WHERE class_id = ? AND name = ?')
        .get(classId, name) as any;
      if (existing) return res.status(200).json({ kbId: existing.id, classId, name, isDefault: true, chunkSize: existing.chunk_size ?? cs, chunkOverlap: existing.chunk_overlap ?? co });
    }

    const dup = db
      .prepare('SELECT id FROM knowledge_bases WHERE class_id = ? AND name = ?')
      .get(classId, name);
    if (dup) throw new CustomError('KB name already exists in this class', 409, 'CONFLICT');

    const kbId = generateId();
    db.prepare(
      `INSERT INTO knowledge_bases (id, class_id, name, is_default, created_at, chunk_size, chunk_overlap) VALUES (?, ?, ?, 0, ?, ?, ?)`
    ).run(kbId, classId, name, Date.now(), cs, co);
    res.status(201).json({ kbId, classId, name, isDefault: false, chunkSize: cs, chunkOverlap: co });
  }
);

kbsRouter.get(
  '/:classId/kbs',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const kbs = db
      .prepare(
        `SELECT id as kbId, class_id as classId, name, is_default as isDefault, created_at as createdAt,
                chunk_size as chunkSize, chunk_overlap as chunkOverlap
         FROM knowledge_bases WHERE class_id = ? ORDER BY is_default DESC, created_at ASC`
      )
      .all(classId);
    res.json(kbs);
  }
);

kbsRouter.delete(
  '/:classId/kbs/:kbId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, kbId } = req.params;
    const kb = db
      .prepare('SELECT * FROM knowledge_bases WHERE id = ? AND class_id = ?')
      .get(kbId, classId) as any;
    if (!kb) throw new CustomError('KB not found', 404, 'NOT_FOUND');
    if (kb.is_default) throw new CustomError('Cannot delete default KB', 400, 'BAD_REQUEST');

    db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(kbId);
    res.json({ success: true });
  }
);

const ALLOWED_EXTS = ['.pdf', '.txt', '.md'];

kbsRouter.post(
  '/:classId/kbs/:kbId/documents',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, kbId } = req.params;
    upload.single('file')(req, res, (err) => {
      if (err) throw new CustomError(err.message || 'Upload failed', 400, 'UPLOAD_ERROR');
      if (!req.file) throw new CustomError('No file uploaded', 400, 'NO_FILE');

      const kb = db
        .prepare('SELECT * FROM knowledge_bases WHERE id = ? AND class_id = ?')
        .get(kbId, classId) as any;
      if (!kb) throw new CustomError('KB not found', 404, 'NOT_FOUND');

      const classSchool = getClassSchool(classId);
      if (!classSchool) throw new CustomError('Class not found', 404, 'CLASS_NOT_FOUND');

      const ext = '.' + req.file.originalname.split('.').pop()!.toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        throw new CustomError(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTS.join(', ')}`, 400, 'BAD_REQUEST');
      }

      const docId = generateId();
      const storageDir = resolvePath(classSchool, classId, 'kbs', kbId, 'docs');
      const { fullPath } = saveFile(storageDir, docId, req.file.originalname, req.file.buffer);

      const mimeMap: Record<string, string> = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown' };
      db.prepare(
        `INSERT INTO kb_documents (id, kb_id, original_name, stored_path, mime, chunk_count, uploaded_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded')`
      ).run(docId, kbId, req.file.originalname, fullPath, mimeMap[ext], 0, Date.now());

      res.status(201).json({
        documentId: docId,
        originalName: req.file.originalname,
        chunkCount: 0,
        status: 'uploaded',
        indexedAt: null,
        errorMessage: null,
      });
    });
  }
);

kbsRouter.get(
  '/:classId/kbs/:kbId/documents',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const { classId, kbId } = req.params;
    const kb = db
      .prepare('SELECT id FROM knowledge_bases WHERE id = ? AND class_id = ?')
      .get(kbId, classId);
    if (!kb) throw new CustomError('KB not found', 404, 'NOT_FOUND');

    const docs = db
      .prepare(
        `SELECT id as documentId, original_name as originalName, chunk_count as chunkCount,
                uploaded_at as uploadedAt, status, indexed_at as indexedAt, error_message as errorMessage,
                chunk_size as chunkSize, chunk_overlap as chunkOverlap
         FROM kb_documents WHERE kb_id = ? ORDER BY uploaded_at DESC`
      )
      .all(kbId);
    res.json(docs);
  }
);

kbsRouter.post(
  '/:classId/kbs/:kbId/documents/:docId/index',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, kbId, docId } = req.params;
    const { chunkSize, chunkOverlap } = req.body || {};

    const doc = db
      .prepare(
        `SELECT d.*, k.class_id, c.school
         FROM kb_documents d
         JOIN knowledge_bases k ON k.id = d.kb_id
         JOIN classes c ON c.id = k.class_id
         WHERE d.id = ? AND d.kb_id = ? AND k.class_id = ?`
      )
      .get(docId, kbId, classId) as any;
    if (!doc) throw new CustomError('Document not found', 404, 'NOT_FOUND');

    if (doc.status === 'indexing') {
      throw new CustomError('Document is already indexing', 409, 'INDEXING');
    }

    const cs = chunkSize !== undefined ? chunkSize : undefined;
    const co = chunkOverlap !== undefined ? chunkOverlap : undefined;
    if (cs !== undefined || co !== undefined) {
      validateChunkConfig(cs ?? DEFAULT_CHUNK_SIZE, co ?? DEFAULT_OVERLAP);
    }

    const taskId = enqueueIndexTask(docId, kbId, classId, doc.school, cs, co);
    db.prepare(`UPDATE kb_documents SET status = 'indexing', error_message = NULL WHERE id = ?`).run(docId);

    res.status(202).json({ taskId, documentId: docId, status: 'indexing' });
  }
);

kbsRouter.post(
  '/:classId/kbs/:kbId/index-all',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, kbId } = req.params;

    const kb = db
      .prepare(
        `SELECT k.*, c.school
         FROM knowledge_bases k
         JOIN classes c ON c.id = k.class_id
         WHERE k.id = ? AND k.class_id = ?`
      )
      .get(kbId, classId) as any;
    if (!kb) throw new CustomError('KB not found', 404, 'NOT_FOUND');

    const docs = db
      .prepare(`SELECT id FROM kb_documents WHERE kb_id = ? AND status != 'ready'`)
      .all(kbId) as { id: string }[];

    const taskIds: string[] = [];
    for (const d of docs) {
      if (d.id === undefined || d.id === null || d.id === '') continue;
      const taskId = enqueueIndexTask(d.id, kbId, classId, kb.school);
      taskIds.push(taskId);
      db.prepare(`UPDATE kb_documents SET status = 'indexing', error_message = NULL WHERE id = ?`).run(d.id);
    }

    res.status(202).json({ taskIds, enqueued: taskIds.length });
  }
);

kbsRouter.delete(
  '/:classId/kbs/:kbId/documents/:docId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, kbId, docId } = req.params;

    const doc = db
      .prepare(
        `SELECT * FROM kb_documents WHERE id = ? AND kb_id = ? AND kb_id IN (
          SELECT id FROM knowledge_bases WHERE class_id = ?
        )`
      )
      .get(docId, kbId, classId) as any;
    if (!doc) throw new CustomError('Document not found', 404, 'NOT_FOUND');

    if (doc.status === 'indexing') {
      throw new CustomError('Cannot delete document while indexing', 409, 'INDEXING');
    }

    deleteDocumentChunks(docId).catch(() => {});
    db.prepare(`DELETE FROM kb_documents WHERE id = ?`).run(docId);

    res.json({ success: true });
  }
);

kbsRouter.post(
  '/:classId/kbs/query',
  authMiddleware,
  guardSchool,
  guardClassMember,
  async (req: Request, res: Response) => {
    const classId = req.params.classId;
    const { kbIds, query, topK } = req.body || {};

    if (!Array.isArray(kbIds) || kbIds.length === 0) {
      throw new CustomError('kbIds must be a non-empty array', 400, 'BAD_REQUEST');
    }
    if (kbIds.length > 20) {
      throw new CustomError('kbIds must not exceed 20 items', 400, 'BAD_REQUEST');
    }
    if (!query || typeof query !== 'string') {
      throw new CustomError('query must be a non-empty string', 400, 'BAD_REQUEST');
    }

    const kbRows = db
      .prepare(`SELECT id FROM knowledge_bases WHERE class_id = ? AND id IN (${kbIds.map(() => '?').join(',')})`)
      .all(classId, ...kbIds) as { id: string }[];
    if (kbRows.length !== kbIds.length) {
      const validIds = new Set(kbRows.map((r) => r.id));
      const invalid = kbIds.filter((id: string) => !validIds.has(id));
      throw new CustomError(`Invalid kbIds: ${invalid.join(', ')}`, 400, 'BAD_REQUEST');
    }

    const effectiveTopK = Math.min(topK ?? 5, 20);

    const queryEmbedding = await embedSingle(query);
    const results = await queryChunks(queryEmbedding, kbIds, classId, effectiveTopK);

    const docIds = [...new Set(results.map((r) => r.documentId).filter(Boolean))];
    const docMap = new Map<string, string>();
    if (docIds.length > 0) {
      const docRows = db
        .prepare(
          `SELECT id as documentId, original_name as originalName FROM kb_documents WHERE id IN (${docIds.map(() => '?').join(',')})`
        )
        .all(...docIds) as { documentId: string; originalName: string }[];
      for (const d of docRows) {
        docMap.set(d.documentId, d.originalName);
      }
    }

    const withOriginals = results.map((r) => ({
      chunk: r.chunk,
      distance: r.distance,
      documentId: r.documentId,
      originalName: docMap.get(r.documentId) || '',
      chunkIndex: r.chunkIndex,
      startOffset: r.startOffset,
      endOffset: r.endOffset,
    }));

    res.json(withOriginals);
  }
);

kbsRouter.post(
  '/:classId/kbs/qa',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  async (req: Request, res: Response) => {
    if (!isLLMConfigured()) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'LLM not configured — set LLM_BASE_URL and LLM_MODEL in .env',
      });
    }

    const classId = req.params.classId;
    const { kbIds, question, topK } = req.body || {};

    if (!Array.isArray(kbIds) || kbIds.length === 0) {
      throw new CustomError('kbIds must be a non-empty array', 400, 'BAD_REQUEST');
    }
    if (kbIds.length > 20) {
      throw new CustomError('kbIds must not exceed 20 items', 400, 'BAD_REQUEST');
    }
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new CustomError('question must be a non-empty string', 400, 'BAD_REQUEST');
    }

    const kbRows = db
      .prepare(`SELECT id FROM knowledge_bases WHERE class_id = ? AND id IN (${kbIds.map(() => '?').join(',')})`)
      .all(classId, ...kbIds) as { id: string }[];
    if (kbRows.length !== kbIds.length) {
      const validIds = new Set(kbRows.map((r) => r.id));
      const invalid = kbIds.filter((id: string) => !validIds.has(id));
      throw new CustomError(`Invalid kbIds: ${invalid.join(', ')}`, 400, 'BAD_REQUEST');
    }

    const effectiveTopK = Math.min(topK ?? 5, 15);

    try {
      const result = await answerWithRAG(question, kbIds, classId, effectiveTopK);
      res.json(result);
    } catch (err: any) {
      if (err?.message?.includes('LLM API')) {
        return res.status(502).json({ error: 'LLM_ERROR', message: err.message });
      }
      throw err;
    }
  }
);

kbsRouter.post(
  '/:classId/kbs/:kbId/query',
  authMiddleware,
  (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'GONE',
      message: 'Use POST /api/classes/:classId/kbs/query instead',
    });
  }
);