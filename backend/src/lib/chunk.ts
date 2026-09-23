const DEFAULT_CHUNK_SIZE = 1500;
const DEFAULT_OVERLAP = 50;

export interface Chunk {
  text: string;
  index: number;
}

export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): Chunk[] {
  if (!text || text.trim().length === 0) return [];
  const result: Chunk[] = [];
  let start = 0;
  let index = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let piece = text.slice(start, end);
    if (end < text.length) {
      const lastNewline = piece.lastIndexOf('\n');
      if (lastNewline > chunkSize * 0.5) {
        piece = piece.slice(0, lastNewline);
      }
    }
    if (piece.trim().length > 0) {
      result.push({ text: piece, index });
      index++;
    }
    if (end >= text.length) break;
    start = end - overlap;
    if (start >= end) break;
  }
  return result;
}