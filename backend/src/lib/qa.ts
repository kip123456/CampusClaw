import { embedSingle } from './embed';
import { queryChunks } from './chroma';
import { chat, isLLMConfigured } from './llm';

export interface Citation {
  id: number;
  chunk: string;
  documentId: string;
  originalName: string;
  chunkIndex: number;
  startOffset: number | null;
  endOffset: number | null;
}

export interface QAResult {
  answer: string;
  citations: Citation[];
}

function buildPrompt(chunks: Citation[], question: string): { system: string; user: string } {
  const system =
    '你是一个教学助手，回答教师的问题。\n' +
    '请仅基于提供的知识库片段回答问题。\n' +
    '如果知识库中没有相关内容，请诚实说明"知识库中没有相关内容"，不要编造答案。\n' +
    '你可以（但不必须）引用知识库中的片段。引用时，请在回答对应的位置用 [N] 标记，N 是片段编号。\n' +
    '每个片段只会以一段文本和它的编号展示，请根据编号引用。';

  let userBody = '';
  if (chunks.length === 0) {
    userBody += '## 知识库片段\n\n（知识库中没有检索到相关片段）\n\n';
  } else {
    userBody += '## 知识库片段\n\n';
    for (const c of chunks) {
      userBody += `[${c.id}] ${c.chunk}\n\n`;
    }
  }
  userBody += `## 问题\n${question}`;

  return { system, user: userBody };
}

export async function answerWithRAG(
  question: string,
  kbIds: string[],
  classId: string,
  topK: number = 5
): Promise<QAResult> {
  if (!isLLMConfigured()) {
    throw new Error('LLM API not configured: LLM_BASE_URL or LLM_MODEL missing');
  }

  const queryEmbedding = await embedSingle(question);
  const results = await queryChunks(queryEmbedding, kbIds, classId, topK);

  const docIds = [...new Set(results.map((r) => r.documentId).filter(Boolean))];
  const originalNameMap = new Map<string, string>();
  if (docIds.length > 0) {
    const { db } = await import('../db');
    const rows = db
      .prepare(
        `SELECT id as documentId, original_name as originalName FROM kb_documents WHERE id IN (${docIds.map(() => '?').join(',')})`
      )
      .all(...docIds) as { documentId: string; originalName: string }[];
    for (const r of rows) {
      originalNameMap.set(r.documentId, r.originalName);
    }
  }

  const citations: Citation[] = results.map((r, i) => ({
    id: i + 1,
    chunk: r.chunk,
    documentId: r.documentId,
    originalName: originalNameMap.get(r.documentId) || '',
    chunkIndex: r.chunkIndex,
    startOffset: r.startOffset,
    endOffset: r.endOffset,
  }));

  const { system, user } = buildPrompt(citations, question);
  const answer = await chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  return { answer, citations };
}