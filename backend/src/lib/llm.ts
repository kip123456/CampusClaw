import { config } from '../config';

const TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 120_000;

export function isLLMConfigured(): boolean {
  return !!(config.llmBaseUrl && config.llmModel);
}

export interface ChatStreamCallbacks {
  onDelta?: (delta: string) => void;
}

export async function chat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<string> {
  if (!isLLMConfigured()) {
    throw new Error('LLM API not configured: LLM_BASE_URL or LLM_MODEL missing');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch {}
      throw new Error(`LLM API error: ${res.status} ${res.statusText} ${body}`);
    }

    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error(`LLM API unexpected response: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return content.trim();
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