import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { hash } from '../lib/password';
import { generateId } from '../config';
import { CustomError } from '../types';
import { wrap } from '../lib/async';

export const adminRouter = Router();

adminRouter.post(
  '/users',
  authMiddleware,
  requireRole('admin'),
  wrap(async (req: Request, res: Response) => {
    const { school, studentId, password, role, name } = req.body || {};
    if (!school || !studentId || !password || !role || !name) {
      throw new CustomError(
        'Missing required fields: school, studentId, password, role, name',
        400,
        'BAD_REQUEST'
      );
    }
    if (!['teacher', 'student'].includes(role)) {
      throw new CustomError('role must be teacher or student', 400, 'BAD_REQUEST');
    }
    const existing = db
      .prepare('SELECT id FROM users WHERE school = ? AND student_id = ?')
      .get(school, studentId);
    if (existing) {
      throw new CustomError('User with this school + studentId already exists', 409, 'CONFLICT');
    }
    const passwordHash = await hash(password);
    const id = generateId();
    db.prepare(
      `INSERT INTO users (id, school, student_id, role, name, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, school, studentId, role, name, passwordHash, Date.now());

    const created = db.prepare('SELECT id, school, student_id, role, name FROM users WHERE id = ?').get(id) as any;
    res.status(201).json({
      userId: created.id,
      school: created.school,
      studentId: created.student_id,
      role: created.role,
      name: created.name,
    });
  }));