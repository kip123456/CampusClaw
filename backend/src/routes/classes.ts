import { Router, Request, Response } from 'express';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware, requireRole } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher, isClassTeacher, getClassSchool } from '../middleware/guards';
import { CustomError } from '../types';

export const classesRouter = Router();

classesRouter.get(
  '/me/classes',
  authMiddleware,
  (req: Request, res: Response) => {
    const user = (req as any).user;
    const asTeacher = db
      .prepare(
        `SELECT c.id as classId, c.school, c.name, c.description, c.created_at as createdAt
         FROM class_teachers ct JOIN classes c ON c.id = ct.class_id
         WHERE ct.user_id = ?`
      )
      .all(user.userId);
    const asStudent = db
      .prepare(
        `SELECT c.id as classId, c.school, c.name, c.description, c.created_at as createdAt
         FROM class_students cs JOIN classes c ON c.id = cs.class_id
         WHERE cs.user_id = ?`
      )
      .all(user.userId);
    res.json({ asTeacher, asStudent });
  }
);

classesRouter.post(
  '/',
  authMiddleware,
  requireRole('teacher', 'admin'),
  (req: Request, res: Response) => {
    const user = (req as any).user;
    const { name, description, school } = req.body || {};
    if (!name) {
      throw new CustomError('Missing required field: name', 400, 'BAD_REQUEST');
    }
    const classSchool = user.role === 'admin' && school ? school : user.school;
    const classId = generateId();
    const defaultKbId = generateId();
    const now = Date.now();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO classes (id, school, name, description, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(classId, classSchool, name, description || null, user.userId, now);
      db.prepare(
        `INSERT INTO knowledge_bases (id, class_id, name, is_default, created_at) VALUES (?, ?, ?, 1, ?)`
      ).run(defaultKbId, classId, '默认知识库', now);
      if (user.role !== 'admin') {
        db.prepare(
          `INSERT OR IGNORE INTO class_teachers (class_id, user_id) VALUES (?, ?)`
        ).run(classId, user.userId);
      }
    });
    tx();

    res.status(201).json({
      classId,
      school: classSchool,
      name,
      description: description || null,
      memberCount: user.role === 'admin' ? 0 : 1,
      defaultKbId,
    });
  }
);

classesRouter.post(
  '/:classId/teachers',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const user = (req as any).user;
    const { targetSchool, targetStudentId } = req.body || {};
    if (!targetSchool || !targetStudentId) {
      throw new CustomError('Missing required fields: targetSchool, targetStudentId', 400, 'BAD_REQUEST');
    }
    const classId = req.params.classId;
    const target = db
      .prepare('SELECT * FROM users WHERE school = ? AND student_id = ?')
      .get(targetSchool, targetStudentId) as any;
    if (!target) throw new CustomError('Target user not found', 404, 'NOT_FOUND');
    if (target.role !== 'teacher') {
      throw new CustomError('Target user is not a teacher', 400, 'BAD_REQUEST');
    }

    const classSchool = getClassSchool(classId);
    if (!classSchool) throw new CustomError('Class not found', 404, 'CLASS_NOT_FOUND');
    if (user.role !== 'admin' && target.school !== classSchool) {
      throw new CustomError('Target school does not match class school', 403, 'SCHOOL_MISMATCH');
    }

    const existing = db
      .prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?')
      .get(classId, target.id);
    if (existing) throw new CustomError('Already in class', 409, 'CONFLICT');

    db.prepare('INSERT INTO class_teachers (class_id, user_id) VALUES (?, ?)').run(classId, target.id);
    res.json({ success: true });
  }
);

classesRouter.post(
  '/:classId/students',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const user = (req as any).user;
    const { targetSchool, targetStudentId } = req.body || {};
    if (!targetSchool || !targetStudentId) {
      throw new CustomError('Missing required fields: targetSchool, targetStudentId', 400, 'BAD_REQUEST');
    }
    const classId = req.params.classId;
    const target = db
      .prepare('SELECT * FROM users WHERE school = ? AND student_id = ?')
      .get(targetSchool, targetStudentId) as any;
    if (!target) throw new CustomError('Target user not found', 404, 'NOT_FOUND');
    if (target.role !== 'student') {
      throw new CustomError('Target user is not a student', 400, 'BAD_REQUEST');
    }

    const classSchool = getClassSchool(classId);
    if (!classSchool) throw new CustomError('Class not found', 404, 'CLASS_NOT_FOUND');
    if (user.role !== 'admin' && target.school !== classSchool) {
      throw new CustomError('Target school does not match class school', 403, 'SCHOOL_MISMATCH');
    }

    const existing = db
      .prepare('SELECT 1 FROM class_students WHERE class_id = ? AND user_id = ?')
      .get(classId, target.id);
    if (existing) throw new CustomError('Already in class', 409, 'CONFLICT');

    db.prepare('INSERT INTO class_students (class_id, user_id) VALUES (?, ?)').run(classId, target.id);
    res.json({ success: true });
  }
);

classesRouter.get(
  '/:classId/members',
  authMiddleware,
  guardClassMember,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const teachers = db
      .prepare(
        `SELECT u.id as userId, u.school, u.student_id as studentId, u.name
         FROM class_teachers ct JOIN users u ON u.id = ct.user_id
         WHERE ct.class_id = ?`
      )
      .all(classId);
    const students = db
      .prepare(
        `SELECT u.id as userId, u.school, u.student_id as studentId, u.name
         FROM class_students cs JOIN users u ON u.id = cs.user_id
         WHERE cs.class_id = ?`
      )
      .all(classId);
    res.json({ teachers, students });
  }
);