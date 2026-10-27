import { embedSingle } from './embed';
import { queryChunks } from './chroma';
import { chat, chatStream, isLLMConfigured } from './llm';

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

export interface BuildRAGPromptOptions {
  systemPrompt?: string | null;
  skillPrompts?: { name: string; description?: string; prompt: string }[];
}

export function buildRAGPrompt(
  chunks: Citation[],
  question: string,
  options?: BuildRAGPromptOptions
): { system: string; user: string } {
  const ragConstraints =
    '请仅基于提供的知识库片段回答问题。\n' +
    '如果知识库中没有相关内容，请诚实说明"知识库中没有相关内容"，不要编造答案。\n' +
    '你可以（但不必须）引用知识库中的片段。引用时，请在回答对应的位置用 [N] 标记，N 是片段编号。\n' +
    '每个片段只会以一段文本和它的编号展示，请根据编号引用。';

  let system: string;
  if (options?.systemPrompt && options.systemPrompt.trim()) {
    system = options.systemPrompt.trim() + '\n' + ragConstraints;
  } else {
    system = '你是一个教学助手，回答教师的问题。\n' + ragConstraints;
  }

  let userBody = '';

  if (options?.skillPrompts && options.skillPrompts.length > 0) {
    userBody += '## 可用技能\n\n';
    for (const s of options.skillPrompts) {
      userBody += `- 【${s.name}】`;
      if (s.description) userBody += `：${s.description}`;
      userBody += `\n  Prompt:\n  ${s.prompt}\n\n`;
    }
    userBody += '请在回答中灵活运用上述技能。\n\n';
  }

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

export async function retrieveAndCite(
  question: string,
  kbIds: string[],
  classId: string,
  topK: number
): Promise<Citation[]> {
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

  return results.map((r, i) => ({
    id: i + 1,
    chunk: r.chunk,
    documentId: r.documentId,
    originalName: originalNameMap.get(r.documentId) || '',
    chunkIndex: r.chunkIndex,
    startOffset: r.startOffset,
    endOffset: r.endOffset,
  }));
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

  const citations = await retrieveAndCite(question, kbIds, classId, topK);
  const { system, user } = buildRAGPrompt(citations, question);
  const answer = (await chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])).content || '';

  return { answer, citations };
}