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
    chunk_size INTEGER NOT NULL DEFAULT 1500,
    chunk_overlap INTEGER NOT NULL DEFAULT 50,
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
    uploaded_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','indexing','ready','failed')),
    indexed_at INTEGER,
    error_message TEXT,
    chunk_size INTEGER,
    chunk_overlap INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_kb_docs_kb ON kb_documents(kb_id)`,
  `CREATE TABLE IF NOT EXISTS index_tasks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    kb_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    school TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
    error_message TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    chunk_size INTEGER,
    chunk_overlap INTEGER
  )`,
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
  `CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prompt TEXT,
    storage_path TEXT,
    description TEXT,
    version TEXT DEFAULT '1.0.0',
    import_source TEXT DEFAULT 'builtin',
    import_url TEXT,
    triggers_json TEXT DEFAULT '[]',
    created_at INTEGER NOT NULL,
    UNIQUE(class_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    visibility TEXT NOT NULL DEFAULT 'all' CHECK(visibility IN ('all','teachers')),
    created_at INTEGER NOT NULL,
    UNIQUE(class_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS agent_kbs (
    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
    kb_id TEXT REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    PRIMARY KEY(agent_id, kb_id)
  )`,
  `CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
    skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY(agent_id, skill_id)
  )`,
  `CREATE TABLE IF NOT EXISTS agent_conversations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_message_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_convs_agent_user ON agent_conversations(agent_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    citations TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_conv ON agent_messages(conversation_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    transport TEXT NOT NULL DEFAULT 'http' CHECK(transport IN ('http','sse')),
    auth_type TEXT NOT NULL DEFAULT 'none' CHECK(auth_type IN ('none','bearer','api_key','basic')),
    auth_config_json TEXT DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'untested' CHECK(status IN ('untested','connected','error')),
    last_error TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(class_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    input_schema_json TEXT DEFAULT '{}',
    source TEXT NOT NULL CHECK(source IN ('builtin','mcp')),
    handler_key TEXT,
    mcp_server_id TEXT REFERENCES mcp_servers(id) ON DELETE SET NULL,
    mcp_tool_name TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    created_at INTEGER NOT NULL,
    UNIQUE(class_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS agent_tools (
    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
    tool_id TEXT REFERENCES tools(id) ON DELETE CASCADE,
    PRIMARY KEY(agent_id, tool_id)
  )`,
];

export function initSchema(): void {
  for (const stmt of schemaStatements) {
    db.exec(stmt);
  }

  const kbDocInfo = db.prepare('PRAGMA table_info(kb_documents)').all() as { name: string }[];
  const kbDocCols = new Set(kbDocInfo.map((c) => c.name));

  if (!kbDocCols.has('status')) {
    db.exec(`ALTER TABLE kb_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','indexing','ready','failed'))`);
    console.log('[DB] Migrated: kb_documents.status column added');
  }
  if (!kbDocCols.has('indexed_at')) {
    db.exec(`ALTER TABLE kb_documents ADD COLUMN indexed_at INTEGER`);
    console.log('[DB] Migrated: kb_documents.indexed_at column added');
  }
  if (!kbDocCols.has('error_message')) {
    db.exec(`ALTER TABLE kb_documents ADD COLUMN error_message TEXT`);
    console.log('[DB] Migrated: kb_documents.error_message column added');
  }
  if (!kbDocCols.has('chunk_size')) {
    db.exec(`ALTER TABLE kb_documents ADD COLUMN chunk_size INTEGER`);
    console.log('[DB] Migrated: kb_documents.chunk_size column added');
  }
  if (!kbDocCols.has('chunk_overlap')) {
    db.exec(`ALTER TABLE kb_documents ADD COLUMN chunk_overlap INTEGER`);
    console.log('[DB] Migrated: kb_documents.chunk_overlap column added');
  }

  const kbInfo = db.prepare('PRAGMA table_info(knowledge_bases)').all() as { name: string }[];
  const kbCols = new Set(kbInfo.map((c) => c.name));

  if (!kbCols.has('chunk_size')) {
    db.exec(`ALTER TABLE knowledge_bases ADD COLUMN chunk_size INTEGER NOT NULL DEFAULT 1500`);
    console.log('[DB] Migrated: knowledge_bases.chunk_size column added');
  }
  if (!kbCols.has('chunk_overlap')) {
    db.exec(`ALTER TABLE knowledge_bases ADD COLUMN chunk_overlap INTEGER NOT NULL DEFAULT 50`);
    console.log('[DB] Migrated: knowledge_bases.chunk_overlap column added');
  }

  const taskInfo = db.prepare('PRAGMA table_info(index_tasks)').all() as { name: string }[];
  const taskCols = new Set(taskInfo.map((c) => c.name));

  if (!taskCols.has('chunk_size')) {
    db.exec(`ALTER TABLE index_tasks ADD COLUMN chunk_size INTEGER`);
    console.log('[DB] Migrated: index_tasks.chunk_size column added');
  }
  if (!taskCols.has('chunk_overlap')) {
    db.exec(`ALTER TABLE index_tasks ADD COLUMN chunk_overlap INTEGER`);
    console.log('[DB] Migrated: index_tasks.chunk_overlap column added');
  }

  try {
    const msgInfo = db.prepare('PRAGMA table_info(agent_messages)').all() as { name: string }[];
    const msgCols = new Set(msgInfo.map((c) => c.name));
    if (msgInfo.length > 0 && !msgCols.has('citations')) {
      db.exec(`ALTER TABLE agent_messages ADD COLUMN citations TEXT`);
      console.log('[DB] Migrated: agent_messages.citations column added');
    }
  } catch {}

  const skillInfo = db.prepare('PRAGMA table_info(skills)').all() as { name: string }[];
  const skillCols = new Set(skillInfo.map((c) => c.name));

  if (!skillCols.has('storage_path')) {
    db.exec(`ALTER TABLE skills ADD COLUMN storage_path TEXT`);
    console.log('[DB] Migrated: skills.storage_path column added');
  }
  if (!skillCols.has('version')) {
    db.exec(`ALTER TABLE skills ADD COLUMN version TEXT DEFAULT '1.0.0'`);
    console.log('[DB] Migrated: skills.version column added');
  }
  if (!skillCols.has('import_source')) {
    db.exec(`ALTER TABLE skills ADD COLUMN import_source TEXT DEFAULT 'builtin'`);
    console.log('[DB] Migrated: skills.import_source column added');
  }
  if (!skillCols.has('import_url')) {
    db.exec(`ALTER TABLE skills ADD COLUMN import_url TEXT`);
    console.log('[DB] Migrated: skills.import_url column added');
  }
  if (!skillCols.has('triggers_json')) {
    db.exec(`ALTER TABLE skills ADD COLUMN triggers_json TEXT DEFAULT '[]'`);
    console.log('[DB] Migrated: skills.triggers_json column added');
  }

  const mcpInfo = db.prepare('PRAGMA table_info(mcp_servers)').all() as { name: string }[];
  if (mcpInfo.length > 0) {
    const mcpCols = new Set(mcpInfo.map((c) => c.name));
    if (!mcpCols.has('transport')) {
      db.exec(`ALTER TABLE mcp_servers ADD COLUMN transport TEXT NOT NULL DEFAULT 'http'`);
      console.log('[DB] Migrated: mcp_servers.transport column added');
    }
  }
}