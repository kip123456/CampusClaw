import { config } from '../config';

const BATCH_SIZE = 100;
const TIMEOUT_MS = 30_000;

async function fetchEmbeddings(texts: string[]): Promise<number[][]> {
  if (!config.embedBaseUrl || !config.embedModel) {
    throw new Error('Embedding API not configured: EMBED_BASE_URL or EMBED_MODEL missing');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = config.embedBaseUrl.replace(/\/+$/, '') + '/embeddings';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.embedApiKey}`,
      },
      body: JSON.stringify({
        model: config.embedModel,
        input: texts,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch {}
      throw new Error(`Embedding API error: ${res.status} ${res.statusText} ${body}`);
    }

    const json: any = await res.json();
    if (!json.data || !Array.isArray(json.data)) {
      throw new Error(`Embedding API unexpected response: ${JSON.stringify(json).slice(0, 200)}`);
    }

    const results: number[][] = [];
    for (const item of json.data) {
      if (Array.isArray(item.embedding)) {
        results.push(item.embedding);
      } else {
        throw new Error('Embedding API response missing embedding array');
      }
    }
    return results;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Embedding API timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function embed(text: string | string[]): Promise<number[][]> {
  const texts = Array.isArray(text) ? text : [text];
  if (texts.length === 0) return [];

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchResults = await fetchEmbeddings(batch);
    results.push(...batchResults);
  }
  return results;
}

export async function embedSingle(text: string): Promise<number[]> {
  const result = await embed([text]);
  return result[0];
}