import Database from 'better-sqlite3';
import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

if (!fs.existsSync(path.dirname(config.sqlitePath))) {
  fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
}

export const db = new Database(config.sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const schemaStatements: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    school TEXT NOT NULL,
    student_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(school, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    school TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    creator_id TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school)`,
  `CREATE TABLE IF NOT EXISTS class_teachers (
    class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(class_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS class_students (
    class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(class_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_bases (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL CHECK(is_default IN (0,1)),
    created_at INTEGER NOT NULL,
    UNIQUE(class_id, name)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_default_unique ON knowledge_bases(class_id) WHERE is_default = 1`,
  `CREATE TABLE IF NOT EXISTS kb_documents (
    id TEXT PRIMARY KEY,
    kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    uploaded_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_kb_docs_kb ON kb_documents(kb_id)`,
  `CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by TEXT REFERENCES users(id),
    uploaded_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_materials_class ON materials(class_id)`,
];

export function initSchema(): void {
  for (const stmt of schemaStatements) {
    db.exec(stmt);
  }
}