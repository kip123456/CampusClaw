import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  jwtSecret: process.env.JWT_SECRET!,
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD!,
  storageRoot: process.env.STORAGE_ROOT || './data',
  sqlitePath: process.env.SQLITE_PATH || './data/campusclaw.db',
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  port: parseInt(process.env.PORT || '3000', 10),
  embedBaseUrl: process.env.EMBED_BASE_URL || '',
  embedModel: process.env.EMBED_MODEL || '',
  embedDim: parseInt(process.env.EMBED_DIM || '2048', 10),
  embedApiKey: process.env.EMBED_API_KEY || '',
};

const missing: string[] = [];
if (!config.jwtSecret) missing.push('JWT_SECRET');
if (!config.adminInitialPassword) missing.push('ADMIN_INITIAL_PASSWORD');

if (missing.length > 0) {
  console.error(`[CONFIG] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (!config.embedBaseUrl || !config.embedModel) {
  console.warn('[CONFIG] EMBED_BASE_URL or EMBED_MODEL not set — embedding/indexing features will be unavailable. Set these in .env to enable.');
}

export function generateId(): string {
  return uuidv4();
}