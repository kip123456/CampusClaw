import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher, getClassSchool } from '../middleware/guards';
import { resolvePath, saveFile, fileExists, deleteFile } from '../lib/storage';
import { CustomError } from '../types';

export const materialsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

materialsRouter.post(
  '/:classId/materials',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const user = (req as any).user;

    upload.single('file')(req, res, (err) => {
      if (err) {
        throw new CustomError(err.message || 'Upload failed', 400, 'UPLOAD_ERROR');
      }
      if (!req.file) {
        throw new CustomError('No file uploaded', 400, 'NO_FILE');
      }

      const classSchool = getClassSchool(classId);
      if (!classSchool) throw new CustomError('Class not found', 404, 'CLASS_NOT_FOUND');

      const materialId = generateId();
      const storageDir = resolvePath(classSchool, classId, 'materials');
      const { fullPath } = saveFile(storageDir, materialId, req.file.originalname, req.file.buffer);

      db.prepare(
        `INSERT INTO materials (id, class_id, original_name, stored_path, size, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        materialId,
        classId,
        req.file.originalname,
        fullPath,
        req.file.size,
        user.userId,
        Date.now()
      );

      res.status(201).json({
        fileId: materialId,
        originalName: req.file.originalname,
        size: req.file.size,
        uploadedAt: Date.now(),
      });
    });
  }
);

materialsRouter.get(
  '/:classId/materials',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const materials = db
      .prepare(
        `SELECT m.id as fileId, m.original_name as originalName, m.size, m.uploaded_at as uploadedAt,
                m.uploaded_by as uploadedBy
         FROM materials m WHERE m.class_id = ?`
      )
      .all(classId);
    res.json(materials);
  }
);

materialsRouter.get(
  '/:classId/materials/:fileId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const { classId, fileId } = req.params;
    const material = db
      .prepare('SELECT * FROM materials WHERE id = ? AND class_id = ?')
      .get(fileId, classId) as any;
    if (!material) throw new CustomError('Material not found', 404, 'NOT_FOUND');
    if (!fileExists(material.stored_path)) {
      res.status(404).json({ error: 'FILE_MISSING', message: 'File not found on disk' });
      return;
    }
    res.download(material.stored_path, material.original_name, {
      headers: { 'Content-Type': 'application/pdf' },
    });
  }
);

materialsRouter.delete(
  '/:classId/materials/:fileId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, fileId } = req.params;
    const material = db
      .prepare('SELECT * FROM materials WHERE id = ? AND class_id = ?')
      .get(fileId, classId) as any;
    if (!material) throw new CustomError('Material not found', 404, 'NOT_FOUND');
    deleteFile(material.stored_path);
    db.prepare('DELETE FROM materials WHERE id = ?').run(fileId);
    res.json({ success: true });
  }
);