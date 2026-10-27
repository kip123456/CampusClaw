import { config } from '../config';
import { debugLog } from './debug-log';

const TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 120_000;

export function isLLMConfigured(): boolean {
  return !!(config.llmBaseUrl && config.llmModel);
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ChatOptions {
  tools?: LLMTool[];
}

export interface ChatStreamCallbacks {
  onDelta?: (delta: string) => void;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
}

export async function chat(
  messages: LLMMessage[],
  options?: ChatOptions
): Promise<ChatResult> {
  if (!isLLMConfigured()) {
    throw new Error('LLM API not configured: LLM_BASE_URL or LLM_MODEL missing');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = config.llmBaseUrl.replace(/\/+$/, '') + '/chat/completions';
    const body: any = {
      model: config.llmModel,
      messages,
    };
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    debugLog('=== LLM REQUEST ===');
    debugLog('URL:', url);
    debugLog('model:', body.model);
    debugLog('messages.count:', body.messages.length);
    body.messages.forEach((m: any, i: number) => {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      debugLog(`  msg[${i}] role=${m.role} contentLen=${c.length} content=`, c);
      if (m.tool_calls) debugLog(`  msg[${i}] tool_calls=`, JSON.stringify(m.tool_calls));
      if (m.tool_call_id) debugLog(`  msg[${i}] tool_call_id=`, m.tool_call_id);
    });
    if (body.tools) {
      debugLog('tools.count:', body.tools.length);
      body.tools.forEach((t: any, i: number) => debugLog(`  tool[${i}]=`, JSON.stringify(t)));
    }
    debugLog('=== END REQUEST ===');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llmApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch {}
      throw new Error(`LLM API error: ${res.status} ${res.statusText} ${body}`);
    }

    const json: any = await res.json();
    const msg = json?.choices?.[0]?.message;
    if (!msg) {
      throw new Error(`LLM API unexpected response: ${JSON.stringify(json).slice(0, 200)}`);
    }

    const content: string | null = typeof msg.content === 'string' ? msg.content.trim() : null;
    const toolCalls: ToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    debugLog('=== LLM RESPONSE ===');
    debugLog('content:', content ?? '(null)');
    debugLog('tool_calls:', JSON.stringify(toolCalls));
    debugLog('=== END RESPONSE ===');

    return { content, toolCalls };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`LLM API timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface StreamChunk {
  content: string;
}

export interface ChatStreamResult {
  [Symbol.asyncIterator](): AsyncIterator<string>;
  fullAnswer: Promise<string>;
}

interface StreamState {
  full: string;
  resolveFull: (v: string) => void;
  rejectFull: (e: unknown) => void;
}

async function* streamLLM(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  state: StreamState,
  externalSignal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const onExternalAbort = () => {
    controller.abort();
  };
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort);
    }
  }

  try {
    const url = config.llmBaseUrl.replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llmApiKey}`,
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      let body = '';
      try { body = await res.text(); } catch {}
      throw new Error(`LLM API error: ${res.status} ${res.statusText} ${body}`);
    }

    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (!event) continue;

        const lines = event.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') break;

          let json: any;
          try { json = JSON.parse(data); } catch { continue; }

          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            state.full += delta;
            yield delta;
          }
        }
      }
    }

    state.resolveFull(state.full.trim());
  } catch (err: any) {
    if (err?.name === 'AbortError' || externalSignal?.aborted) {
      state.rejectFull(new Error(externalSignal?.aborted ? 'Stream aborted by client' : 'LLM stream aborted'));
    } else {
      state.rejectFull(err);
    }
    throw err;
  } finally {
    if (reader) {
      try { await reader.cancel(); } catch {}
    }
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export function chatStream(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  externalSignal?: AbortSignal
): ChatStreamResult {
  if (!isLLMConfigured()) {
    throw new Error('LLM API not configured: LLM_BASE_URL or LLM_MODEL missing');
  }

  const state: StreamState = {
    full: '',
    resolveFull: () => {},
    rejectFull: () => {},
  };

  const fullAnswerPromise = new Promise<string>((res, rej) => {
    state.resolveFull = res;
    state.rejectFull = rej;
  });

  const gen = streamLLM(messages, state, externalSignal);

  return {
    [Symbol.asyncIterator]() {
      return gen;
    },
    fullAnswer: fullAnswerPromise,
  };
}