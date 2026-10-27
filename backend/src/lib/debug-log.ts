import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config';

let initialized = false;
const buffers: string[] = [];

function ensureLogDir() {
  if (!config.debugLogFile) return;
  const dir = dirname(config.debugLogFile);
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch {}
  }
}

export function debugLog(...parts: any[]): void {
  if (!config.debugLogFile) return;
  ensureLogDir();
  const stamp = new Date().toISOString();
  const line = parts.map((p) => typeof p === 'string' ? p : JSON.stringify(p, null, 2)).join(' ');
  buffers.push(`[${stamp}] ${line}\n`);
  if (!initialized) {
    initialized = true;
    process.nextTick(flushBuffers);
  }
}

function flushBuffers() {
  if (!config.debugLogFile) return;
  if (buffers.length === 0) {
    setTimeout(flushBuffers, 200);
    return;
  }
  const chunk = buffers.join('');
  buffers.length = 0;
  try {
    writeFileSync(config.debugLogFile, chunk, { flag: 'a' });
  } catch (e) {
    console.error('[debugLog] write failed:', e);
  }
  setTimeout(flushBuffers, 200);
}

export function resetDebugLog() {
  if (!config.debugLogFile) return;
  try { writeFileSync(config.debugLogFile, ''); } catch {}
}