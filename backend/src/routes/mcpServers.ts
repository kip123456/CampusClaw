import { Router, Request, Response } from 'express';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher } from '../middleware/guards';
import { CustomError } from '../types';
import { encrypt } from '../lib/crypto';
import { connect, listTools, clearMcpAuthCache } from '../lib/mcp-client';

export const mcpServersRouter = Router();

mcpServersRouter.post(
  '/:classId/mcp-servers',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const { name, url, transport, authType, authConfig } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new CustomError('Missing required field: name', 400, 'BAD_REQUEST');
    }
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw new CustomError('Missing or invalid url (must start with http)', 400, 'BAD_REQUEST');
    }
    const validTransport = ['http', 'sse'];
    if (transport && !validTransport.includes(transport)) {
      throw new CustomError(`transport must be 'http' or 'sse'`, 400, 'BAD_REQUEST');
    }
    const validAuthTypes = ['none', 'bearer', 'api_key', 'basic'];
    if (authType && !validAuthTypes.includes(authType)) {
      throw new CustomError(`authType must be one of: ${validAuthTypes.join(', ')}`, 400, 'BAD_REQUEST');
    }

    const dup = db.prepare('SELECT id FROM mcp_servers WHERE class_id = ? AND name = ?').get(classId, name.trim());
    if (dup) throw new CustomError('MCP server name already exists in this class', 409, 'CONFLICT');

    const serverId = generateId();
    const transportFinal = (transport || 'http').toLowerCase();
    const authTypeFinal = authType || 'none';
    let encryptedAuth = '{}';
    if (authConfig && typeof authConfig === 'object' && Object.keys(authConfig).length > 0) {
      encryptedAuth = encrypt(JSON.stringify(authConfig));
    }

    db.prepare(
      `INSERT INTO mcp_servers (id, class_id, name, url, transport, auth_type, auth_config_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'untested', ?)`
    ).run(serverId, classId, name.trim(), url, transportFinal, authTypeFinal, encryptedAuth, Date.now());

    const row = db
      .prepare(
        `SELECT id as mcpServerId, class_id as classId, name, url, transport, auth_type as authType, status, created_at as createdAt FROM mcp_servers WHERE id = ?`
      )
      .get(serverId);
    res.status(201).json(row);
  }
);

mcpServersRouter.get(
  '/:classId/mcp-servers',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const rows = db
      .prepare(
        `SELECT id as mcpServerId, class_id as classId, name, url, transport, auth_type as authType, status, last_error as lastError, created_at as createdAt FROM mcp_servers WHERE class_id = ? ORDER BY created_at ASC`
      )
      .all(classId);
    res.json(rows);
  }
);

mcpServersRouter.get(
  '/:classId/mcp-servers/:mcpServerId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const { classId, mcpServerId } = req.params;
    const row = db
      .prepare(
        `SELECT id as mcpServerId, class_id as classId, name, url, transport, auth_type as authType, status, last_error as lastError, created_at as createdAt FROM mcp_servers WHERE id = ? AND class_id = ?`
      )
      .get(mcpServerId, classId);
    if (!row) throw new CustomError('MCP server not found', 404, 'NOT_FOUND');
    res.json(row);
  }
);

mcpServersRouter.get(
  '/:classId/mcp-servers/:mcpServerId/test',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  wrapMcpTest(async (req) => {
    const { mcpServerId } = req.params;
    const row = db.prepare(`SELECT * FROM mcp_servers WHERE id = ?`).get(mcpServerId) as any;
    if (!row) throw new CustomError('MCP server not found', 404, 'NOT_FOUND');

    clearMcpAuthCache(mcpServerId);
    let authConfig: Record<string, any> = {};
    if (row.auth_config_json) {
      try { authConfig = JSON.parse(
        row.auth_config_json.startsWith('{') ? row.auth_config_json : require('../lib/crypto').decrypt(row.auth_config_json)
      ); } catch {}
    }

    try {
      await connect({
        id: row.id,
        url: row.url,
        transport: row.transport,
        authType: row.auth_type,
        authConfig,
      });
      db.prepare(`UPDATE mcp_servers SET status = 'connected', last_error = NULL WHERE id = ?`).run(mcpServerId);
      return { ok: true, message: 'Connection successful' };
    } catch (err: any) {
      db.prepare(`UPDATE mcp_servers SET status = 'error', last_error = ? WHERE id = ?`).run(err?.message || 'Unknown error', mcpServerId);
      throw new CustomError(`Connection failed: ${err?.message || 'Unknown error'}`, 502, 'BAD_GATEWAY');
    }
  })
);

function wrapMcpTest(handler: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent) res.json(result);
    } catch (err: any) {
      if (!res.headersSent) {
        if (err instanceof CustomError) {
          res.status(err.status).json({ error: err.code, message: err.message });
        } else {
          res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message });
        }
      }
    }
  };
}

mcpServersRouter.post(
  '/:classId/mcp-servers/:mcpServerId/import',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  async (req: Request, res: Response) => {
    const { classId, mcpServerId } = req.params;

    const server = db.prepare(`SELECT * FROM mcp_servers WHERE id = ? AND class_id = ?`).get(mcpServerId, classId) as any;
    if (!server) throw new CustomError('MCP server not found', 404, 'NOT_FOUND');

    clearMcpAuthCache(mcpServerId);
    let authConfig: Record<string, any> = {};
    if (server.auth_config_json) {
      try {
        authConfig = JSON.parse(
          server.auth_config_json.startsWith('{') ? server.auth_config_json : require('../lib/crypto').decrypt(server.auth_config_json)
        );
      } catch {}
    }

    const tools = await listTools({
      id: server.id,
      url: server.url,
      transport: server.transport,
      authType: server.auth_type,
      authConfig,
    });

    const imported: string[] = [];
    const skipped: string[] = [];

    const tx = db.transaction(() => {
      for (const mcpTool of tools) {
        const existing = db
          .prepare('SELECT id FROM tools WHERE class_id = ? AND mcp_server_id = ? AND mcp_tool_name = ?')
          .get(classId, mcpServerId, mcpTool.name);
        if (existing) {
          skipped.push(mcpTool.name);
          continue;
        }

        const dupName = db
          .prepare('SELECT id FROM tools WHERE class_id = ? AND name = ? AND (mcp_server_id IS NULL OR mcp_server_id != ?)')
          .get(classId, mcpTool.name, mcpServerId);
        if (dupName) {
          skipped.push(mcpTool.name + ' (name conflict)');
          continue;
        }

        const toolId = generateId();
        const schema = mcpTool.inputSchema || mcpTool.input_schema || { type: 'object', properties: {} };
        db.prepare(
          `INSERT INTO tools (id, class_id, name, description, input_schema_json, source, mcp_server_id, mcp_tool_name, enabled, created_at) VALUES (?, ?, ?, ?, ?, 'mcp', ?, ?, 1, ?)`
        ).run(toolId, classId, mcpTool.name, mcpTool.description || null, JSON.stringify(schema), mcpServerId, mcpTool.name, Date.now());
        imported.push(mcpTool.name);
      }
    });
    tx();

    res.json({ imported, skipped, total: tools.length });
  }
);

mcpServersRouter.delete(
  '/:classId/mcp-servers/:mcpServerId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, mcpServerId } = req.params;

    const existing = db.prepare(`SELECT id FROM mcp_servers WHERE id = ? AND class_id = ?`).get(mcpServerId, classId);
    if (!existing) throw new CustomError('MCP server not found', 404, 'NOT_FOUND');

    const tx = db.transaction(() => {
      const tools = db.prepare('SELECT id FROM tools WHERE mcp_server_id = ?').all(mcpServerId) as { id: string }[];
      for (const tool of tools) {
        db.prepare(`DELETE FROM agent_tools WHERE tool_id = ?`).run(tool.id);
      }
      db.prepare(`DELETE FROM tools WHERE mcp_server_id = ?`).run(mcpServerId);
      db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).run(mcpServerId);
    });
    tx();

    clearMcpAuthCache(mcpServerId);
    res.json({ success: true });
  }
);