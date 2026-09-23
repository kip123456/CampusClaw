import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

export function resolvePath(school: string, classId: string, ...parts: string[]): string {
  return path.join(
    config.storageRoot,
    'schools',
    school,
    'classes',
    classId,
    ...parts
  );
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function saveFile(
  storageDir: string,
  uuid: string,
  originalName: string,
  buffer: Buffer
): { storedPath: string; fullPath: string } {
  ensureDir(storageDir);
  const fileName = `${uuid}_${originalName}`;
  const fullPath = path.join(storageDir, fileName);
  fs.writeFileSync(fullPath, buffer);
  return { storedPath: fullPath, fullPath };
}

export function deleteFile(fullPath: string): void {
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // ignore
  }
}

export function fileExists(fullPath: string): boolean {
  return fs.existsSync(fullPath);
}