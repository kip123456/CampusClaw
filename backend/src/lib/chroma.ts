import { ChromaClient } from 'chromadb';
import { config } from '../config';

let client: ChromaClient | null = null;

export function getChromaClient(): ChromaClient {
  if (!client) {
    client = new ChromaClient({ path: config.chromaUrl });
  }
  return client;
}

const COLLECTION_NAME = 'campusclaw-kbs';

export async function getOrCreateCollection() {
  const c = getChromaClient();
  return c.getOrCreateCollection({ name: COLLECTION_NAME });
}

export interface ChunkInput {
  text: string;
  index: number;
}

export async function upsertChunks(
  kbId: string,
  documentId: string,
  school: string,
  chunks: ChunkInput[]
): Promise<void> {
  if (chunks.length === 0) return;
  const collection = await getOrCreateCollection();
  const ids = chunks.map((_, i) => `${documentId}_${i}`);
  const metadatas = chunks.map((c) => ({
    kbId,
    documentId,
    school,
    chunkIndex: c.index,
  }));
  const documents = chunks.map((c) => c.text);
  await collection.upsert({ ids, documents, metadatas });
}

export interface QueryResult {
  chunk: string;
  distance: number;
  documentId: string;
  chunkIndex: number;
}

export async function queryChunks(
  kbId: string,
  school: string,
  queryEmbedding: number[],
  topK: number = 5
): Promise<QueryResult[]> {
  const collection = await getOrCreateCollection();
  const where = { kbId, school };
  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    where,
    nResults: topK,
  });
  const results: QueryResult[] = [];
  if (result.ids && result.ids.length > 0) {
    const ids = result.ids[0];
    const docs = result.documents?.[0] || [];
    const distances = result.distances?.[0] || [];
    const metadatas = result.metadatas?.[0] || [];
    for (let i = 0; i < ids.length; i++) {
      const meta = metadatas[i] as Record<string, any> | undefined;
      results.push({
        chunk: docs[i] || '',
        distance: distances[i] ?? Infinity,
        documentId: meta?.documentId || '',
        chunkIndex: meta?.chunkIndex ?? i,
      });
    }
  }
  results.sort((a, b) => a.distance - b.distance);
  return results;
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const collection = await getOrCreateCollection();
  try {
    await collection.delete({ where: { documentId } });
  } catch {
    // ignore
  }
}