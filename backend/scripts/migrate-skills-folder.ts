import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../src/config';
import { db } from '../src/db/schema';

function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const fm: Record<string, any> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value: any = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    else if (value.startsWith('[') && value.endsWith(']')) {
      try { value = JSON.parse(value); } catch { /* keep string */ }
    } else if (!isNaN(Number(value))) value = Number(value);
    fm[key] = value;
  }
  return { frontmatter: fm, body: match[2] };
}

function buildSkillMd(skill: { name: string; description: string | null; version?: string; triggers?: string[]; prompt?: string | null }): string {
  const lines: string[] = ['---'];
  lines.push(`name: "${skill.name.replace(/"/g, '\\"')}"`);
  if (skill.description) lines.push(`description: "${skill.description.replace(/"/g, '\\"')}"`);
  lines.push(`version: "${skill.version || '1.0.0'}"`);
  const triggers = skill.triggers && skill.triggers.length > 0 ? skill.triggers : [];
  lines.push(`triggers: ${JSON.stringify(triggers)}`);
  lines.push('---');
  lines.push('');
  if (skill.prompt) {
    lines.push(skill.prompt);
  }
  return lines.join('\n');
}

function main() {
  const skills = db.prepare('SELECT id, name, description, prompt FROM skills WHERE prompt IS NOT NULL AND prompt != ""').all() as any[];

  console.log(`[MIGRATE] Found ${skills.length} skills with prompt to migrate...`);

  if (!fs.existsSync(config.storageSkillsDir)) {
    fs.mkdirSync(config.storageSkillsDir, { recursive: true });
  }

  let migrated = 0;

  for (const skill of skills) {
    const skillDir = path.join(config.storageSkillsDir, skill.id);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(skillMdPath)) {
      const existing = fs.readFileSync(skillMdPath, 'utf-8');
      const { frontmatter } = parseFrontmatter(existing);
      const storagePath = path.resolve(skillDir);
      db.prepare(
        `UPDATE skills SET storage_path = ?, version = ?, triggers_json = ? WHERE id = ?`
      ).run(storagePath, frontmatter.version || '1.0.0', JSON.stringify(frontmatter.triggers || []), skill.id);
      console.log(`  [SKIP] ${skill.name} (${skill.id}) — SKILL.md already exists, just updating DB fields`);
      continue;
    }

    const skillMd = buildSkillMd({
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt,
    });

    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillMdPath, skillMd, 'utf-8');

    const storagePath = path.resolve(skillDir);
    db.prepare(
      `UPDATE skills SET storage_path = ?, version = ?, triggers_json = ?, import_source = 'legacy' WHERE id = ?`
    ).run(storagePath, '1.0.0', '[]', skill.id);

    migrated++;
    console.log(`  [OK] ${skill.name} (${skill.id}) → ${skillDir}`);
  }

  console.log(`[MIGRATE] Complete. Migrated ${migrated} / ${skills.length} skills.`);
}

main();