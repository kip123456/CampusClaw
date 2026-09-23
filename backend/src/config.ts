import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  jwtSecret: process.env.JWT_SECRET!,
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD!,
  storageRoot: process.env.STORAGE_ROOT || './data',
  sqlitePath: process.env.SQLITE_PATH || './data/campusclaw.db',
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  port: parseInt(process.env.PORT || '3000', 10),
};

const missing: string[] = [];
if (!config.jwtSecret) missing.push('JWT_SECRET');
if (!config.adminInitialPassword) missing.push('ADMIN_INITIAL_PASSWORD');

if (missing.length > 0) {
  console.error(`[CONFIG] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

export function generateId(): string {
  return uuidv4();
}