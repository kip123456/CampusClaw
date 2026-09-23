import { db } from '../db';
import { CustomError } from '../types';

export function getClassSchool(classId: string): string | null {
  const row = db.prepare('SELECT school FROM classes WHERE id = ?').get(classId) as { school: string } | undefined;
  return row?.school ?? null;
}

export function guardSchool(req: any, _res: any, next: any): void {
  const user = req.user;
  if (!user) throw new CustomError('Authentication required', 401, 'NO_AUTH');
  if (user.role === 'admin') return next();

  const classId = req.params.classId;
  if (!classId) return next();

  const school = getClassSchool(classId);
  if (!school) {
    throw new CustomError('Class not found', 404, 'CLASS_NOT_FOUND');
  }
  if (school !== user.school) {
    throw new CustomError('Forbidden: school mismatch', 403, 'SCHOOL_MISMATCH');
  }
  next();
}

export function isClassMember(classId: string, userId: string): boolean {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  if (!user) return false;
  if (user.role === 'admin') return true;

  const t = db.prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?').get(classId, userId);
  if (t) return true;
  const s = db.prepare('SELECT 1 FROM class_students WHERE class_id = ? AND user_id = ?').get(classId, userId);
  return !!s;
}

export function guardClassMember(req: any, _res: any, next: any): void {
  const user = req.user;
  if (!user) throw new CustomError('Authentication required', 401, 'NO_AUTH');
  if (user.role === 'admin') return next();

  const classId = req.params.classId;
  if (!classId) return next();

  if (!isClassMember(classId, user.userId)) {
    throw new CustomError('Forbidden: not a class member', 403, 'NOT_MEMBER');
  }
  next();
}

export function isClassTeacher(classId: string, userId: string): boolean {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  if (!user) return false;
  if (user.role === 'admin') return true;
  const t = db.prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?').get(classId, userId);
  return !!t;
}

export function guardClassTeacher(req: any, _res: any, next: any): void {
  const user = req.user;
  if (!user) throw new CustomError('Authentication required', 401, 'NO_AUTH');
  if (user.role === 'admin') return next();

  const classId = req.params.classId;
  if (!classId) {
    if (user.role !== 'teacher') {
      throw new CustomError('Forbidden: teacher or admin required', 403, 'FORBIDDEN');
    }
    return next();
  }

  if (!isClassTeacher(classId, user.userId)) {
    throw new CustomError('Forbidden: not a class teacher', 403, 'NOT_TEACHER');
  }
  next();
}