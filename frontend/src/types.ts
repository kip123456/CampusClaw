export interface User {
  userId: string;
  school: string;
  studentId: string;
  role: 'admin' | 'teacher' | 'student';
  name: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ClassSummary {
  classId: string;
  school: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface MyClasses {
  asTeacher: ClassSummary[];
  asStudent: ClassSummary[];
}

export interface ClassDetail {
  classId: string;
  school: string;
  name: string;
  description?: string;
  memberCount: number;
  defaultKbId: string;
}

export interface MemberInfo {
  userId: string;
  school: string;
  studentId: string;
  name: string;
}

export interface MembersResponse {
  teachers: MemberInfo[];
  students: MemberInfo[];
}

export interface Material {
  fileId: string;
  originalName: string;
  size: number;
  uploadedAt: number;
  uploadedBy?: string;
}

export interface KnowledgeBase {
  kbId: string;
  classId: string;
  name: string;
  isDefault: boolean;
  createdAt: number;
}

export interface KBDocument {
  documentId: string;
  originalName: string;
  chunkCount: number;
  indexedAt: number;
}

export interface QueryResult {
  chunk: string;
  distance: number;
  documentId: string;
  chunkIndex: number;
}