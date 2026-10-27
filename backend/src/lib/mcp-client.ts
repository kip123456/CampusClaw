import { decrypt } from './crypto';
import { db } from '../db';

export type McpTransport = 'http' | 'sse';

export interface McpServerConfig {
  id?: string;
  name?: string;
  url: string;
  transport: McpTransport | string;
  authType: 'none' | 'bearer' | 'api_key' | 'basic';
  authConfig: Record<string, any>;
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

const HTTP_TIMEOUT_MS = 10_000;
const SSE_CONNECT_TIMEOUT_MS = 10_000;
const SSE_REQUEST_TIMEOUT_MS = 30_000;
const SSE_IDLE_TTL_MS = 5 * 60 * 1000;
const SSE_CLEANUP_INTERVAL_MS = 60_000;

function buildAuthHeaders(config: McpServerConfig, contentType = 'application/json'): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
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

function joinUrl(base: string, relative: string): string {
  try {
    const u = new URL(relative, base);
    return u.toString();
  } catch {
    return relative;
  }
}

// ===== SSE Parser =====

export interface SseEvent {
  event: string;
  data: string;
}

export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  let rest = '';

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLast = i === blocks.length - 1;
    if (isLast && !block.endsWith('\n')) {
      rest = block;
      continue;
    }

    const lines = block.split(/\r?\n/);
    let eventType = '';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const field = line.slice(0, colonIdx);
      let value = line.slice(colonIdx + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') eventType = value;
      else if (field === 'data') dataLines.push(value);
    }

    if (dataLines.length > 0) {
      events.push({ event: eventType || 'message', data: dataLines.join('\n') });
    }
  }

  return { events, rest };
}

// ===== SSE Connection Management =====

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

interface SseConnection {
  endpointUrl: string;
  streamReader: ReadableStreamDefaultReader<string>;
  responseStream: ReadableStream<string>;
  pendingRequests: Map<number, PendingRequest>;
  buffer: string;
  readerLoopPromise: Promise<void>;
  createdAt: number;
  lastUsedAt: number;
  closed: boolean;
}

const sseConnections = new Map<string, SseConnection>();
let sseCleanupTimer: NodeJS.Timeout | null = null;

function ensureSseCleanupTimer(): void {
  if (sseCleanupTimer) return;
  sseCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, conn] of sseConnections) {
      if (conn.closed) {
        sseConnections.delete(id);
        continue;
      }
      if (now - conn.lastUsedAt > SSE_IDLE_TTL_MS) {
        closeSseConnection(id, conn);
      }
    }
  }, SSE_CLEANUP_INTERVAL_MS);
  sseCleanupTimer.unref?.();
}

function closeSseConnection(id: string, conn: SseConnection): void {
  if (conn.closed) return;
  conn.closed = true;
  try {
    conn.streamReader.cancel();
  } catch {}
  for (const [, pending] of conn.pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error('SSE connection closed'));
  }
  conn.pendingRequests.clear();
  sseConnections.delete(id);
}

export function deleteSseConnection(mcpServerId: string): void {
  const conn = sseConnections.get(mcpServerId);
  if (conn) closeSseConnection(mcpServerId, conn);
}

async function establishSseConnection(config: McpServerConfig): Promise<SseConnection> {
  ensureSseCleanupTimer();

  const url = config.url;
  const headers = buildAuthHeaders(config);
  headers['Accept'] = 'text/event-stream';
  delete headers['Content-Type'];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SSE_CONNECT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`SSE connection failed: ${err?.message || err}`);
  }

  if (!response.ok || !response.body) {
    clearTimeout(timer);
    let body = '';
    try { body = await response.text(); } catch {}
    throw new Error(`SSE connection failed: HTTP ${response.status}: ${body}`);
  }

  const responseStream = response.body as unknown as ReadableStream<string>;
  const streamReader = responseStream.getReader();
  const pendingRequests = new Map<number, PendingRequest>();

  const endpointUrl = await new Promise<string>((resolve, reject) => {
    let timeoutFired = false;
    const endpointTimer = setTimeout(() => {
      timeoutFired = true;
      reject(new Error('SSE connection timeout: endpoint event not received'));
    }, SSE_CONNECT_TIMEOUT_MS);

    (async () => {
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await streamReader.read();
          if (done) {
            if (!timeoutFired) reject(new Error('SSE connection closed before endpoint event'));
            return;
          }
          buffer += value;
          const { events, rest } = parseSseBuffer(buffer);
          buffer = rest;
          for (const evt of events) {
            if (evt.event === 'endpoint') {
              clearTimeout(endpointTimer);
              const full = joinUrl(url, evt.data.trim());
              resolve(full);
              return;
            }
          }
        }
      } catch (err) {
        if (!timeoutFired) {
          clearTimeout(endpointTimer);
          reject(err);
        }
      }
    })();
  });

  clearTimeout(timer);

  const conn: SseConnection = {
    endpointUrl,
    streamReader,
    responseStream,
    pendingRequests,
    buffer: '',
    readerLoopPromise: Promise.resolve(),
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    closed: false,
  };

  conn.readerLoopPromise = (async () => {
    try {
      while (!conn.closed) {
        const { done, value } = await streamReader.read();
        if (done) break;
        conn.buffer += value;
        const { events, rest } = parseSseBuffer(conn.buffer);
        conn.buffer = rest;
        for (const evt of events) {
          if (evt.event === 'message') {
            try {
              const json = JSON.parse(evt.data);
              const id = json.id;
              if (id != null && pendingRequests.has(id)) {
                const pending = pendingRequests.get(id)!;
                pendingRequests.delete(id);
                clearTimeout(pending.timer);
                if (json.error) {
                  pending.reject(new Error(json.error.message || JSON.stringify(json.error)));
                } else {
                  pending.resolve(json.result);
                }
              }
            } catch {
              // ignore malformed message events
            }
          }
        }
      }
    } catch {
      // reader loop ended
    } finally {
      if (!conn.closed) {
        conn.closed = true;
        for (const [, pending] of pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error('SSE connection lost'));
        }
        pendingRequests.clear();
        sseConnections.delete(config.id || '');
      }
    }
  })();

  return conn;
}

async function getOrCreateSseConnection(config: McpServerConfig): Promise<SseConnection> {
  const id = config.id;
  if (!id) {
    throw new Error('McpServerConfig.id is required for SSE transport');
  }

  let conn = sseConnections.get(id);
  if (conn && !conn.closed) {
    conn.lastUsedAt = Date.now();
    return conn;
  }

  conn = await establishSseConnection(config);
  sseConnections.set(id, conn);
  return conn;
}

// ===== HTTP Transport =====

async function httpJsonRpcRequest<T>(
  config: McpServerConfig,
  method: string,
  params: any,
  timeoutMs: number = HTTP_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestId = Math.floor(Math.random() * 1_000_000_000);
    const url = config.url.replace(/\/+$/, '') + '/mcp';
    const res = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(config),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
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

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    let json: any;

    if (contentType.includes('text/event-stream')) {
      const raw = await res.text();
      const { events } = parseSseBuffer(raw);
      const msgEvent = events.find((e) => {
        if (e.event !== 'message') return false;
        try {
          const parsed = JSON.parse(e.data);
          return parsed.id === requestId;
        } catch { return false; }
      });
      if (!msgEvent) {
        const anyMsg = events.find((e) => e.event === 'message');
        if (anyMsg) {
          try { json = JSON.parse(anyMsg.data); } catch {
            throw new Error('Failed to parse SSE message event as JSON');
          }
        } else {
          throw new Error('No JSON-RPC response found in SSE stream');
        }
      } else {
        json = JSON.parse(msgEvent.data);
      }
    } else {
      const text = await res.text();
      if (!text.trim()) {
        throw new Error('Empty response body from MCP server');
      }
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Failed to parse response as JSON: ${text.slice(0, 200)}`);
      }
    }

    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

// ===== SSE Transport =====

let sseRequestIdCounter = 0;

async function sseJsonRpcRequest<T>(
  config: McpServerConfig,
  method: string,
  params: any
): Promise<T> {
  const conn = await getOrCreateSseConnection(config);

  if (conn.closed) {
    // reconnect
    deleteSseConnection(config.id!);
    const newConn = await establishSseConnection(config);
    sseConnections.set(config.id!, newConn);
    return sseJsonRpcRequest<T>(config, method, params);
  }

  conn.lastUsedAt = Date.now();

  const requestId = ++sseRequestIdCounter;

  const pendingPromise = new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.pendingRequests.delete(requestId);
      reject(new Error(`SSE request timeout (${SSE_REQUEST_TIMEOUT_MS}ms)`));
    }, SSE_REQUEST_TIMEOUT_MS);

    conn.pendingRequests.set(requestId, {
      resolve: resolve as (v: any) => void,
      reject,
      timer,
    });
  });

  const controller = new AbortController();
  const postTimer = setTimeout(() => controller.abort(), SSE_REQUEST_TIMEOUT_MS);

  try {
    const postRes = await fetch(conn.endpointUrl, {
      method: 'POST',
      headers: buildAuthHeaders(config),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!postRes.ok) {
      let body = '';
      try { body = await postRes.text(); } catch {}
      throw new Error(`SSE POST HTTP ${postRes.status}: ${body}`);
    }
  } catch (err) {
    clearTimeout(postTimer);
    conn.pendingRequests.delete(requestId);
    throw err;
  }

  clearTimeout(postTimer);
  return pendingPromise;
}

// ===== Public API =====

function jsonRpcRequest<T>(
  config: McpServerConfig,
  method: string,
  params: any
): Promise<T> {
  const transport = (config.transport || 'http').toLowerCase();
  if (transport === 'sse') {
    return sseJsonRpcRequest<T>(config, method, params);
  }
  return httpJsonRpcRequest<T>(config, method, params);
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
  const transport = (config.transport || 'http').toLowerCase();
  const timeoutMs = transport === 'sse' ? SSE_REQUEST_TIMEOUT_MS : 30_000;

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

export function clearMcpAuthCache(mcpServerId?: string): void {
  if (mcpServerId) {
    decryptedCache.delete(mcpServerId);
    deleteSseConnection(mcpServerId);
  } else {
    decryptedCache.clear();
    for (const id of Array.from(sseConnections.keys())) {
      deleteSseConnection(id);
    }
  }
}

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

  const transport = (row.transport || 'http').toLowerCase() as McpTransport;
  if (transport !== 'http' && transport !== 'sse') {
    throw new Error(`Unsupported MCP transport: ${row.transport}`);
  }

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport,
    authType: row.auth_type,
    authConfig,
  };
}