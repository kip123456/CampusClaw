import { Router, Request, Response } from 'express';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher } from '../middleware/guards';
import { CustomError } from '../types';
import { getBuiltinTool, BUILTIN_TOOLS } from '../lib/tool-handlers';

export const toolsRouter = Router();

function ensureBuiltinTools(classId: string): void {
  for (const bt of BUILTIN_TOOLS) {
    const existing = db
      .prepare('SELECT id FROM tools WHERE class_id = ? AND handler_key = ?')
      .get(classId, bt.handlerKey);
    if (!existing) {
      db.prepare(
        `INSERT INTO tools (id, class_id, name, description, input_schema_json, source, handler_key, enabled, created_at) VALUES (?, ?, ?, ?, ?, 'builtin', ?, 1, ?)`
      ).run(
        generateId(),
        classId,
        bt.name,
        bt.description,
        JSON.stringify(bt.inputSchema),
        bt.handlerKey,
        Date.now()
      );
    }
  }
}

toolsRouter.get(
  '/:classId/tools',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    ensureBuiltinTools(classId);

    const rows = db
      .prepare(
        `SELECT id as toolId, class_id as classId, name, description, input_schema_json as inputSchemaJson, source, handler_key as handlerKey, mcp_server_id as mcpServerId, mcp_tool_name as mcpToolName, enabled, created_at as createdAt FROM tools WHERE class_id = ? ORDER BY source ASC, name ASC`
      )
      .all(classId) as any[];

    for (const r of rows) {
      try { r.inputSchema = JSON.parse(r.inputSchemaJson || '{}'); } catch { r.inputSchema = {}; }
      delete r.inputSchemaJson;
      r.enabled = !!r.enabled;
    }

    res.json(rows);
  }
);

toolsRouter.get(
  '/:classId/tools/:toolId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const { classId, toolId } = req.params;
    const row = db
      .prepare(
        `SELECT id as toolId, class_id as classId, name, description, input_schema_json as inputSchemaJson, source, handler_key as handlerKey, mcp_server_id as mcpServerId, mcp_tool_name as mcpToolName, enabled, created_at as createdAt FROM tools WHERE id = ? AND class_id = ?`
      )
      .get(toolId, classId) as any;
    if (!row) throw new CustomError('Tool not found', 404, 'NOT_FOUND');

    try { row.inputSchema = JSON.parse(row.inputSchemaJson || '{}'); } catch { row.inputSchema = {}; }
    delete row.inputSchemaJson;
    row.enabled = !!row.enabled;

    res.json(row);
  }
);

toolsRouter.put(
  '/:classId/tools/:toolId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, toolId } = req.params;
    const { enabled, description } = req.body || {};

    const existing = db.prepare(`SELECT * FROM tools WHERE id = ? AND class_id = ?`).get(toolId, classId) as any;
    if (!existing) throw new CustomError('Tool not found', 404, 'NOT_FOUND');

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      throw new CustomError('enabled must be boolean', 400, 'BAD_REQUEST');
    }
    if (description !== undefined && description !== null && typeof description === 'string' && description.length > 500) {
      throw new CustomError('description exceeds 500 characters', 400, 'BAD_REQUEST');
    }

    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;
    const newDesc = description !== undefined ? (description === null ? null : String(description)) : existing.description;

    db.prepare(`UPDATE tools SET enabled = ?, description = ? WHERE id = ?`).run(newEnabled, newDesc, toolId);

    const row = db
      .prepare(
        `SELECT id as toolId, class_id as classId, name, description, input_schema_json as inputSchemaJson, source, handler_key as handlerKey, enabled FROM tools WHERE id = ?`
      )
      .get(toolId) as any;
    try { row.inputSchema = JSON.parse(row.inputSchemaJson || '{}'); } catch { row.inputSchema = {}; }
    delete row.inputSchemaJson;
    row.enabled = !!row.enabled;

    res.json(row);
  }
);

toolsRouter.delete(
  '/:classId/tools/:toolId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, toolId } = req.params;

    const existing = db.prepare(`SELECT * FROM tools WHERE id = ? AND class_id = ?`).get(toolId, classId) as any;
    if (!existing) throw new CustomError('Tool not found', 404, 'NOT_FOUND');

    if (existing.source === 'builtin') {
      throw new CustomError('Cannot delete builtin tools (they can be disabled)', 400, 'BAD_REQUEST');
    }

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM agent_tools WHERE tool_id = ?`).run(toolId);
      db.prepare(`DELETE FROM tools WHERE id = ?`).run(toolId);
    });
    tx();

    res.json({ success: true });
  }
);