import { db } from '../db';
import { generateId } from '../config';

export function enqueueIndexTask(
  documentId: string,
  kbId: string,
  classId: string,
  school: string,
  chunkSize?: number,
  chunkOverlap?: number
): string {
  const taskId = generateId();
  db.prepare(
    `INSERT INTO index_tasks (id, document_id, kb_id, class_id, school, status, created_at, chunk_size, chunk_overlap)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).run(taskId, documentId, kbId, classId, school, Date.now(), chunkSize ?? null, chunkOverlap ?? null);
  return taskId;
}

export function claimNextPending(): string | null {
  const tx = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT id FROM index_tasks
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get() as { id: string } | undefined;
    if (!row) return null;
    db.prepare(`UPDATE index_tasks SET status = 'processing', started_at = ? WHERE id = ?`).run(Date.now(), row.id);
    return row.id;
  });
  return tx();
}

export function markTaskDone(taskId: string): void {
  db.prepare(`UPDATE index_tasks SET status = 'done', finished_at = ? WHERE id = ?`).run(Date.now(), taskId);
}

export function markTaskFailed(taskId: string, error: string): void {
  db.prepare(`UPDATE index_tasks SET status = 'failed', error_message = ?, finished_at = ? WHERE id = ?`).run(
    error.slice(0, 2000),
    Date.now(),
    taskId
  );
}

export function resetProcessingTasks(): number {
  const info = db.prepare(`UPDATE index_tasks SET status = 'pending', started_at = NULL WHERE status = 'processing'`).run();
  return info.changes;
}