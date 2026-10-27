import { db } from '../db';
import { retrieveAndCite } from './qa';
import { queryChunks } from './chroma';
import { embedSingle } from './embed';

export interface ToolContext {
  classId: string;
  userId: string;
}

export interface BuiltinToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface BuiltinTool {
  handlerKey: string;
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (args: any, ctx: ToolContext) => Promise<any>;
}

function getClassKBs(classId: string): string[] {
  const rows = db
    .prepare('SELECT id FROM knowledge_bases WHERE class_id = ?')
    .all(classId) as { id: string }[];
  return rows.map((r) => r.id);
}

export const BUILTIN_TOOLS: BuiltinTool[] = [
  {
    handlerKey: 'rag_search',
    name: 'rag_search',
    description: 'Search the class knowledge bases for relevant content. Use this when the user asks about course materials, documents, or any topic that might be covered in the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query or question to look up in the knowledge bases' },
        topK: { type: 'integer', description: 'Number of results to return (default 5, max 10)' },
      },
      required: ['query'],
    },
    async execute(args, ctx) {
      const query = String(args.query || '').trim();
      if (!query) throw new Error('query is required');
      const topK = Math.min(Math.max(Number(args.topK) || 5, 1), 10);

      const kbIds = getClassKBs(ctx.classId);
      if (kbIds.length === 0) {
        return { results: [], note: 'No knowledge bases configured for this class' };
      }

      const citations = await retrieveAndCite(query, kbIds, ctx.classId, topK);
      return {
        query,
        results: citations.map((c) => ({
          chunk: c.chunk,
          documentName: c.originalName,
          documentId: c.documentId,
        })),
        count: citations.length,
      };
    },
  },
  {
    handlerKey: 'exponentiate',
    name: 'exponentiate',
    description: 'Calculate base raised to a power (base^exponent). Useful for math calculations.',
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'number', description: 'The base number' },
        exponent: { type: 'number', description: 'The exponent (power)' },
      },
      required: ['base', 'exponent'],
    },
    async execute(args, _ctx) {
      const base = Number(args.base);
      const exp = Number(args.exponent);
      if (isNaN(base) || isNaN(exp)) throw new Error('base and exponent must be numbers');
      const result = Math.pow(base, exp);
      return { base, exponent: exp, result };
    },
  },
  {
    handlerKey: 'list_class_materials',
    name: 'list_class_materials',
    description: 'List all materials (PDFs, documents) uploaded to this class. Shows name, uploader, and upload time.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Maximum number of materials to return (default 20)' },
      },
    },
    async execute(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const rows = db
        .prepare(
          `SELECT m.id as materialId, m.original_name as name, m.file_size as fileSize, m.uploaded_at as uploadedAt, u.username as uploadedBy
           FROM materials m LEFT JOIN users u ON m.uploaded_by = u.id
           WHERE m.class_id = ? ORDER BY m.uploaded_at DESC LIMIT ?`
        )
        .all(ctx.classId, limit) as any[];
      return { materials: rows, count: rows.length };
    },
  },
  {
    handlerKey: 'class_member_stats',
    name: 'class_member_stats',
    description: 'Get statistics about class members: total teachers, total students, and class name.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async execute(_args, ctx) {
      const cls = db.prepare('SELECT name FROM classes WHERE id = ?').get(ctx.classId) as any;
      const teacherCount = (db.prepare('SELECT COUNT(*) as c FROM class_teachers WHERE class_id = ?').get(ctx.classId) as any).c;
      const studentCount = (db.prepare('SELECT COUNT(*) as c FROM class_students WHERE class_id = ?').get(ctx.classId) as any).c;
      return {
        className: cls?.name || 'Unknown',
        teacherCount,
        studentCount,
        total: teacherCount + studentCount,
      };
    },
  },
];

const handlerMap = new Map<string, BuiltinTool>();
for (const t of BUILTIN_TOOLS) {
  handlerMap.set(t.handlerKey, t);
}

export function getBuiltinTool(handlerKey: string): BuiltinTool | undefined {
  return handlerMap.get(handlerKey);
}

export function listBuiltinToolSchemas(): BuiltinToolSchema[] {
  return BUILTIN_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function executeTool(
  handlerKey: string,
  args: any,
  ctx: ToolContext
): Promise<any> {
  const tool = handlerMap.get(handlerKey);
  if (!tool) throw new Error(`Unknown builtin tool: ${handlerKey}`);
  return await tool.execute(args, ctx);
}