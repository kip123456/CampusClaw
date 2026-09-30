import { db } from '../db';
import {
  claimNextPending,
  markTaskDone,
  markTaskFailed,
  resetProcessingTasks,
} from './index-queue';
import { indexDocument } from './indexer';

let running = false;
let loopPromise: Promise<void> | null = null;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop(): Promise<void> {
  while (running) {
    const taskId = claimNextPending();
    if (!taskId) {
      await sleep(500);
      continue;
    }

    const task = db
      .prepare(
        `SELECT t.*, d.stored_path, d.mime,
                k.chunk_size AS kb_chunk_size, k.chunk_overlap AS kb_chunk_overlap
         FROM index_tasks t
         JOIN kb_documents d ON d.id = t.document_id
         LEFT JOIN knowledge_bases k ON k.id = t.kb_id
         WHERE t.id = ?`
      )
      .get(taskId) as any;

    if (!task) {
      markTaskFailed(taskId, 'Document not found');
      continue;
    }

    const effectiveChunkSize = task.chunk_size ?? task.kb_chunk_size ?? undefined;
    const effectiveChunkOverlap = task.chunk_overlap ?? task.kb_chunk_overlap ?? undefined;

    console.log(`[INDEX] Processing task ${taskId} for doc ${task.document_id} (chunkSize=${effectiveChunkSize}, overlap=${effectiveChunkOverlap})`);

    try {
      const result = await indexDocument(
        {
          id: task.document_id,
          kb_id: task.kb_id,
          class_id: task.class_id,
          school: task.school,
          stored_path: task.stored_path,
          mime: task.mime,
        },
        effectiveChunkSize,
        effectiveChunkOverlap
      );

      db.prepare(
        `UPDATE kb_documents SET status = 'ready', chunk_count = ?, indexed_at = ?, chunk_size = ?, chunk_overlap = ? WHERE id = ?`
      ).run(result.chunkCount, Date.now(), effectiveChunkSize ?? null, effectiveChunkOverlap ?? null, task.document_id);
      markTaskDone(taskId);
      console.log(`[INDEX] Task ${taskId} done (${result.chunkCount} chunks)`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      db.prepare(
        `UPDATE kb_documents SET status = 'failed', error_message = ? WHERE id = ?`
      ).run(msg.slice(0, 2000), task.document_id);
      markTaskFailed(taskId, msg);
      console.error(`[INDEX] Task ${taskId} failed:`, msg);
    }
  }
}

export function startIndexWorker(): void {
  if (running) return;
  const resetCount = resetProcessingTasks();
  if (resetCount > 0) {
    console.log(`[INDEX] Reset ${resetCount} stale processing tasks back to pending`);
  }
  running = true;
  loopPromise = runLoop();
  console.log('[INDEX] Worker started');
}

export function stopIndexWorker(): void {
  if (!running) return;
  running = false;
  console.log('[INDEX] Worker stopping (will finish current task)...');
}