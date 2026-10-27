import * as crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const keyStr = config.mcpAuthEncryptionKey;
  if (!keyStr) {
    throw new Error('MCP_AUTH_ENCRYPTION_KEY not configured');
  }
  const hash = crypto.createHash('sha256').update(keyStr).digest();
  return hash;
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buffer = Buffer.from(ciphertext, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}