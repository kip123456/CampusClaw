import type { Request, Response, NextFunction } from 'express';
import { verify } from '../lib/auth';
import { CustomError } from '../types';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new CustomError('Missing or invalid Authorization header', 401, 'NO_TOKEN');
  }
  const token = header.slice(7);
  const payload = verify(token);
  (req as any).user = {
    userId: payload.userId,
    school: payload.school,
    studentId: payload.studentId,
    role: payload.role,
    name: payload.name,
  };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      throw new CustomError('Authentication required', 401, 'NO_AUTH');
    }
    if (!roles.includes(user.role)) {
      throw new CustomError(`Forbidden: requires one of roles [${roles.join(',')}]`, 403, 'FORBIDDEN');
    }
    next();
  };
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.path} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
}