import { config } from '../config';

const TIMEOUT_MS = 30_000;

export function isLLMConfigured(): boolean {
  return !!(config.llmBaseUrl && config.llmModel);
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