import jwt from 'jsonwebtoken';
import { config } from '../config';
import { CustomError } from '../types';

export interface JwtPayload {
  userId: string;
  school: string;
  studentId: string;
  role: string;
  name: string;
}

export function sign(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}

export function verify(token: string): JwtPayload {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
  } catch (err) {
    throw new CustomError('Invalid or expired token', 401, 'INVALID_TOKEN');
  }
}