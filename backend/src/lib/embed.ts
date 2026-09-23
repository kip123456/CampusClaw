let pipelinePromise: Promise<any> | null = null;

export async function embed(text: string | string[]): Promise<number[][]> {
  const { pipeline } = await import('@xenova/transformers');
  if (!pipelinePromise) {
    pipelinePromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const extractor = await pipelinePromise;
  const texts = Array.isArray(text) ? text : [text];
  const results: number[][] = [];
  for (const t of texts) {
    const output = await extractor(t, { pooling: 'mean', normalize: true });
    const arr = Array.from(output.data) as number[];
    results.push(arr);
  }
  return results;
}

export async function embedSingle(text: string): Promise<number[]> {
  const result = await embed([text]);
  return result[0];
}

export async function warmupEmbed(): Promise<void> {
  try {
    await embed('warmup');
    console.log('[EMBED] Model warmed up');
  } catch (err) {
    console.warn('[EMBED] Warmup failed:', err);
  }
}