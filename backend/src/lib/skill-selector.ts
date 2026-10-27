import { db } from '../db';
import { embedSingle } from './embed';
import { loadSkillContent, SkillFrontmatter } from './skill-loader';

interface SkillIndex {
  skillId: string;
  classId: string;
  name: string;
  description: string;
  triggers: string[];
  storagePath: string;
}

let skillIndexCache: SkillIndex[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

function refreshIndex(): void {
  const now = Date.now();
  if (skillIndexCache && now - cacheTimestamp < CACHE_TTL_MS) return;

  const rows = db.prepare(
    `SELECT id, class_id, name, description, triggers_json, storage_path FROM skills WHERE storage_path IS NOT NULL`
  ).all() as any[];

  skillIndexCache = rows.map((r) => ({
    skillId: r.id,
    classId: r.class_id,
    name: r.name,
    description: r.description || '',
    triggers: (() => { try { return JSON.parse(r.triggers_json); } catch { return []; } })(),
    storagePath: r.storage_path,
  }));
  cacheTimestamp = now;
}

export function invalidateSkillCache(): void {
  skillIndexCache = null;
  cacheTimestamp = 0;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function selectSkills(
  userMessage: string,
  classId: string,
  candidateSkillIds: string[],
  topN: number = 3
): Promise<string[]> {
  if (candidateSkillIds.length <= topN) {
    return candidateSkillIds;
  }

  refreshIndex();

  const candidates = (skillIndexCache || []).filter(
    (s) => s.classId === classId && candidateSkillIds.includes(s.skillId)
  );

  if (candidates.length === 0) return [];
  if (candidates.length <= topN) return candidates.map((c) => c.skillId);

  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await embedSingle(userMessage);
  } catch {
    queryEmbedding = null;
  }

  const msgLower = userMessage.toLowerCase();
  const scored = candidates.map((c) => {
    let score = 0;

    if (queryEmbedding) {
      const descEmbedding = embedSingle(`${c.name} ${c.description}`).catch(() => null);
      score = score;
    }

    const triggerMatches = c.triggers.filter((t) => t && msgLower.includes(t.toLowerCase())).length;
    score += triggerMatches * 0.2;

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (queryEmbedding) {
    for (const s of scored) {
      try {
        const descEmb = await embedSingle(`${s.name} ${s.description}`);
        s.score += cosineSimilarity(queryEmbedding, descEmb);
      } catch { /* skip */ }
    }
    scored.sort((a, b) => b.score - a.score);
  }

  return scored.slice(0, topN).map((c) => c.skillId);
}

export interface LoadedSkill {
  skillId: string;
  name: string;
  description?: string;
  body: string;
}

export function loadSkillsByIds(skillIds: string[]): LoadedSkill[] {
  const result: LoadedSkill[] = [];

  for (const skillId of skillIds) {
    const row = db.prepare(
      `SELECT id, name, description, storage_path FROM skills WHERE id = ?`
    ).get(skillId) as any;

    if (!row) continue;

    const content = row.storage_path ? loadSkillContent(row.storage_path) : null;
    const body = content?.body || '';

    if (!body && row.prompt) {
      result.push({
        skillId: row.id,
        name: row.name,
        description: row.description,
        body: row.prompt,
      });
    } else if (body) {
      result.push({
        skillId: row.id,
        name: content?.frontmatter.name || row.name,
        description: content?.frontmatter.description || row.description,
        body,
      });
    }
  }

  return result;
}