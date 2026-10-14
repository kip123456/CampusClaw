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
  chunkSize: number;
  chunkOverlap: number;
}

export interface KBDocument {
  documentId: string;
  originalName: string;
  chunkCount: number;
  uploadedAt: number;
  status: 'uploaded' | 'indexing' | 'ready' | 'failed';
  indexedAt: number | null;
  errorMessage: string | null;
  chunkSize: number | null;
  chunkOverlap: number | null;
}

export interface IndexTask {
  taskId: string;
  documentId: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
}

export interface QueryResult {
  chunk: string;
  distance: number;
  documentId: string;
  originalName: string;
  chunkIndex: number;
  startOffset: number | null;
  endOffset: number | null;
}

export interface Citation {
  id: number;
  chunk: string;
  documentId: string;
  originalName: string;
  chunkIndex: number;
  startOffset: number | null;
  endOffset: number | null;
}

export interface QAResponse {
  answer: string;
  citations: Citation[];
}

export interface Skill {
  skillId: string;
  classId: string;
  name: string;
  description: string | null;
  prompt?: string;
  createdAt: number;
  createdBy: string;
}

export interface Agent {
  agentId: string;
  classId: string;
  name: string;
  description: string | null;
  systemPrompt?: string | null;
  visibility: 'all' | 'teachers';
  createdAt: number;
  createdBy?: string;
  kbCount?: number;
  skillCount?: number;
  kbs?: { kbId: string; name: string }[];
  skills?: { skillId: string; name: string }[];
  kbIds?: string[];
  skillIds?: string[];
}

export interface AgentConversation {
  conversationId: string;
  agentId: string;
  userId: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

export interface AgentMessage {
  messageId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  citations: Citation[];
}