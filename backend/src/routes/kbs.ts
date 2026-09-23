import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher, getClassSchool } from '../middleware/guards';
import { resolvePath, saveFile } from '../lib/storage';
import { CustomError } from '../types';

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
    const { name } = req.body || {};
    if (!name) throw new CustomError('Missing required field: name', 400, 'BAD_REQUEST');

    if (name === '默认知识库') {
      const existing = db
        .prepare('SELECT id FROM knowledge_bases WHERE class_id = ? AND name = ?')
        .get(classId, name) as any;
      if (existing) return res.status(200).json({ kbId: existing.id, classId, name, isDefault: true });
    }

    const dup = db
      .prepare('SELECT id FROM knowledge_bases WHERE class_id = ? AND name = ?')
      .get(classId, name);
    if (dup) throw new CustomError('KB name already exists in this class', 409, 'CONFLICT');

    const kbId = generateId();
    db.prepare(
      `INSERT INTO knowledge_bases (id, class_id, name, is_default, created_at) VALUES (?, ?, ?, 0, ?)`
    ).run(kbId, classId, name, Date.now());
    res.status(201).json({ kbId, classId, name, isDefault: false });
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
        `SELECT id as kbId, class_id as classId, name, is_default as isDefault, created_at as createdAt
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
        `INSERT INTO kb_documents (id, kb_id, original_name, stored_path, mime, chunk_count, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(docId, kbId, req.file.originalname, fullPath, mimeMap[ext], 0, Date.now());

      res.status(201).json({
        documentId: docId,
        originalName: req.file.originalname,
        chunks: 0,
        status: 'uploaded',
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
        `SELECT id as documentId, original_name as originalName, chunk_count as chunkCount, uploaded_at as uploadedAt
         FROM kb_documents WHERE kb_id = ? ORDER BY uploaded_at DESC`
      )
      .all(kbId);
    res.json(docs);
  }
);

kbsRouter.post(
  '/:classId/kbs/:kbId/query',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      message: 'Vector query is not implemented in MVP. Reserved for future iteration.',
    });
  }
);