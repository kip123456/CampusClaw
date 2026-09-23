export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  school: string;
  studentId: string;
  role: UserRole;
  name: string;
  passwordHash?: string;
  createdAt: number;
}

export interface ClassInfo {
  id: string;
  school: string;
  name: string;
  description?: string;
  creatorId: string;
  createdAt: number;
}

export interface Material {
  id: string;
  classId: string;
  originalName: string;
  storedPath: string;
  size: number;
  uploadedBy?: string;
  uploadedAt: number;
}

export interface KnowledgeBase {
  id: string;
  classId: string;
  name: string;
  isDefault: boolean;
  createdAt: number;
}

export interface KBDocument {
  id: string;
  kbId: string;
  originalName: string;
  storedPath: string;
  mime?: string;
  chunkCount: number;
  indexedAt: number;
}

export interface AuthenticatedRequest extends Express.Request {
  user: {
    userId: string;
    school: string;
    studentId: string;
    role: UserRole;
    name: string;
  };
}

export class CustomError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}