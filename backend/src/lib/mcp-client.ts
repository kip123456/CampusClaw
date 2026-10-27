import { decrypt } from './crypto';

export interface McpServerConfig {
  id?: string;
  name?: string;
  url: string;
  transport: string;
  authType: 'none' | 'bearer' | 'api_key' | 'basic';
  authConfig: Record<string, any>;
}

const TIMEOUT_MS = 10_000;

function buildAuthHeaders(config: McpServerConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  switch (config.authType) {
    case 'bearer': {
      const token = config.authConfig.token || config.authConfig.bearer || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;
      break;
    }
    case 'api_key': {
      const header = config.authConfig.header || 'X-API-Key';
      const value = config.authConfig.value || '';
      if (header && value) headers[header] = value;
      break;
    }
    case 'basic': {
      const username = config.authConfig.username || '';
      const password = config.authConfig.password || '';
      const encoded = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
      break;
    }
  }

  return headers;
}

async function jsonRpcRequest<T>(
  config: McpServerConfig,
  method: string,
  params: any
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = config.url.replace(/\/+$/, '') + '/mcp';
    const res = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(config),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch {}
      throw new Error(`HTTP ${res.status}: ${body}`);
    }

    const json: any = await res.json();
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function connect(config: McpServerConfig): Promise<{ protocolVersion: string; serverInfo: any }> {
  const result = await jsonRpcRequest<any>(config, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'CampusClaw', version: '1.0.0' },
  });
  return {
    protocolVersion: result.protocolVersion || 'unknown',
    serverInfo: result.serverInfo || {},
  };
}

export async function listTools(config: McpServerConfig): Promise<McpTool[]> {
  const result = await jsonRpcRequest<any>(config, 'tools/list', {});
  return result.tools || [];
}

export async function callTool(
  config: McpServerConfig,
  toolName: string,
  args: any
): Promise<McpToolCallResult> {
  try {
    const result = await jsonRpcRequest<any>(config, 'tools/call', {
      name: toolName,
      arguments: args || {},
    });

    if (result.isError) {
      const text = (result.content || []).find((c: any) => c.type === 'text')?.text || 'Unknown MCP error';
      return { isError: true, content: text };
    }

    const text = (result.content || []).find((c: any) => c.type === 'text')?.text || JSON.stringify(result.content);
    return { isError: false, content: text };
  } catch (err: any) {
    return { isError: true, content: err?.message || 'MCP call failed' };
  }
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  input_schema?: Record<string, any>;
}

export interface McpToolCallResult {
  isError: boolean;
  content: string;
}

import { db } from '../db';

const decryptedCache = new Map<string, Record<string, any>>();

function getDecryptedAuth(mcpServerId: string, encrypted: string): Record<string, any> {
  if (decryptedCache.has(mcpServerId)) {
    return decryptedCache.get(mcpServerId)!;
  }
  try {
    const plain = decrypt(encrypted);
    const parsed = JSON.parse(plain);
    decryptedCache.set(mcpServerId, parsed);
    return parsed;
  } catch {
    return {};
  }
}

export function clearMcpAuthCache(mcpServerId?: string): void {
  if (mcpServerId) {
    decryptedCache.delete(mcpServerId);
  } else {
    decryptedCache.clear();
  }
}

export async function createMcpConfigFromDb(mcpServerId: string): Promise<McpServerConfig | null> {
  const row = db
    .prepare(
      `SELECT id, name, url, transport, auth_type, auth_config_json FROM mcp_servers WHERE id = ?`
    )
    .get(mcpServerId) as any;
  if (!row) return null;

  let authConfig: Record<string, any> = {};
  if (row.auth_config_json) {
    const plain = getDecryptedAuth(row.id, row.auth_config_json);
    authConfig = plain;
  }

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport: row.transport,
    authType: row.auth_type,
    authConfig,
  };
}