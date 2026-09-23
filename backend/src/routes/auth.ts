import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { sign } from '../lib/auth';
import { hash, verify } from '../lib/password';
import { generateId } from '../config';
import { CustomError } from '../types';
import { wrap } from '../lib/async';

export const authRouter = Router();

authRouter.post('/login', wrap(async (req: Request, res: Response) => {
  const { school, studentId, password } = req.body || {};
  if (!school || !studentId || !password) {
    throw new CustomError('Missing required fields: school, studentId, password', 400, 'BAD_REQUEST');
  }
  const user = db
    .prepare('SELECT * FROM users WHERE school = ? AND student_id = ?')
    .get(school, studentId) as any;
  if (!user) {
    throw new CustomError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
  const ok = await verify(password, user.password_hash);
  if (!ok) {
    throw new CustomError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
  const token = sign({
    userId: user.id,
    school: user.school,
    studentId: user.student_id,
    role: user.role,
    name: user.name,
  });
  res.json({
    token,
    user: {
      userId: user.id,
      school: user.school,
      studentId: user.student_id,
      role: user.role,
      name: user.name,
    },
  });
  }));

authRouter.post('/change-password', authMiddleware, wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    throw new CustomError('Missing required fields: oldPassword, newPassword', 400, 'BAD_REQUEST');
  }
  const record = db.prepare('SELECT * FROM users WHERE id = ?').get(user.userId) as any;
  if (!record) throw new CustomError('User not found', 404, 'NOT_FOUND');

  const ok = await verify(oldPassword, record.password_hash);
  if (!ok) {
    throw new CustomError('Old password is incorrect', 400, 'BAD_PASSWORD');
  }
  const newHash = await hash(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.userId);
  res.json({ success: true });
}));