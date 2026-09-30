import { CustomError } from '../types';

export const DEFAULT_CHUNK_SIZE = 1500;
export const DEFAULT_OVERLAP = 50;
export const MIN_CHUNK_SIZE = 100;
export const MAX_CHUNK_SIZE = 10000;
export const MAX_OVERLAP = 1000;

export interface Chunk {
  text: string;
  index: number;
}

export interface ChunkConfig {
  chunkSize: number;
  chunkOverlap: number;
}

export function validateChunkConfig(
  size: unknown,
  overlap: unknown
): ChunkConfig {
  const s = typeof size === 'number' ? size : DEFAULT_CHUNK_SIZE;
  const o = typeof overlap === 'number' ? overlap : DEFAULT_OVERLAP;

  if (!Number.isInteger(s) || s < MIN_CHUNK_SIZE || s > MAX_CHUNK_SIZE) {
    throw new CustomError(
      `chunkSize must be an integer between ${MIN_CHUNK_SIZE} and ${MAX_CHUNK_SIZE}`,
      400,
      'INVALID_CHUNK_SIZE'
    );
  }
  if (!Number.isInteger(o) || o < 0 || o > MAX_OVERLAP) {
    throw new CustomError(
      `chunkOverlap must be an integer between 0 and ${MAX_OVERLAP}`,
      400,
      'INVALID_CHUNK_OVERLAP'
    );
  }
  if (o >= s) {
    throw new CustomError(
      `chunkOverlap must be less than chunkSize`,
      400,
      'INVALID_CHUNK_OVERLAP'
    );
  }
  return { chunkSize: s, chunkOverlap: o };
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