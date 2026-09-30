import * as fs from 'fs';
import { chunkText } from './chunk';
import { upsertChunks, deleteDocumentChunks } from './chroma';
import { extractPdfText } from './pdf-extract';

export interface DocRow {
  id: string;
  kb_id: string;
  class_id: string;
  school: string;
  stored_path: string;
  mime?: string;
}

export interface IndexResult {
  chunkCount: number;
}

export async function indexDocument(
  docRow: DocRow,
  chunkSize?: number,
  chunkOverlap?: number
): Promise<IndexResult> {
  if (!fs.existsSync(docRow.stored_path)) {
    throw new Error(`File not found: ${docRow.stored_path}`);
  }

  let text: string;
  if (docRow.mime === 'application/pdf') {
    const buf = fs.readFileSync(docRow.stored_path);
    text = await extractPdfText(buf);
  } else {
    text = fs.readFileSync(docRow.stored_path, 'utf-8');
  }

  const chunks = chunkText(text, chunkSize, chunkOverlap);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  await upsertChunks(
    docRow.kb_id,
    docRow.id,
    docRow.school,
    docRow.class_id,
    chunks
  );

  return { chunkCount: chunks.length };
}

export async function reindexDocument(
  docRow: DocRow,
  chunkSize?: number,
  chunkOverlap?: number
): Promise<IndexResult> {
  await deleteDocumentChunks(docRow.id);
  return indexDocument(docRow, chunkSize, chunkOverlap);
}