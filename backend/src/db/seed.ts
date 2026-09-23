import { db } from './index';
import { hash } from '../lib/password';
import { generateId } from '../config';

export async function seed(): Promise<void> {
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (count > 0) {
    console.log('[SEED] Users table not empty, skipping admin creation');
    return;
  }

  const { config } = await import('../config');
  const passwordHash = await hash(config.adminInitialPassword);
  db.prepare(
    `INSERT INTO users (id, school, student_id, role, name, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateId(),
    'admin',
    'admin',
    'admin',
    'admin',
    passwordHash,
    Date.now()
  );
  console.log('[SEED] Default admin account created (studentId=admin, school=admin)');
}