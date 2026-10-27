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
  skillContent?: string;
  version?: string;
  importSource?: string;
  importUrl?: string;
  triggers?: string[];
  storagePath?: string;
  createdAt: number;
}

export interface Tool {
  toolId: string;
  classId: string;
  name: string;
  description: string | null;
  inputSchema: Record<string, any>;
  source: 'builtin' | 'mcp';
  handlerKey?: string;
  mcpServerId?: string;
  mcpToolName?: string;
  enabled: boolean;
  createdAt: number;
}

export interface McpServer {
  mcpServerId: string;
  classId: string;
  name: string;
  url: string;
  transport: string;
  authType: 'none' | 'bearer' | 'api_key' | 'basic';
  status: 'untested' | 'connected' | 'error';
  lastError?: string | null;
  createdAt: number;
}

export interface AgentToolRef {
  toolId: string;
  name: string;
  source: 'builtin' | 'mcp';
  handlerKey?: string;
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
  toolCount?: number;
  kbs?: { kbId: string; name: string }[];
  skills?: { skillId: string; name: string }[];
  tools?: AgentToolRef[];
  kbIds?: string[];
  skillIds?: string[];
  toolIds?: string[];
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

export interface SSEEvent {
  type: 'skill_load' | 'tool_start' | 'tool_end' | 'message' | 'done' | 'error';
  content?: string;
  conversationId?: string;
  answer?: string;
  citations?: Citation[];
  message?: string;
  skillId?: string;
  skillName?: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: any;
  toolError?: string;
}