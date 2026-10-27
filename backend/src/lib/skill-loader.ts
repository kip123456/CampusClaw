import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

export interface SkillFrontmatter {
  name: string;
  description?: string;
  version?: string;
  triggers?: string[];
}

export interface ParsedSkillFile {
  frontmatter: SkillFrontmatter;
  body: string;
}

function parseFrontmatterBlock(block: string): Record<string, any> {
  const lines = block.split(/\r?\n/);
  const fm: Record<string, any> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) { i++; continue; }

    const key = line.slice(0, idx).trim();
    let inlineValue: any = line.slice(idx + 1).trim();

    if (inlineValue === '' || inlineValue === '|' || inlineValue === '>') {
      const listItems: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        const listMatch = nextLine.match(/^\s*-\s*(.+)$/);
        if (listMatch) {
          let v = listMatch[1].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          listItems.push(v);
          j++;
        } else {
          break;
        }
      }
      if (listItems.length > 0) {
        fm[key] = listItems;
      }
      i = j;
      continue;
    }

    if ((inlineValue.startsWith('"') && inlineValue.endsWith('"')) ||
        (inlineValue.startsWith("'") && inlineValue.endsWith("'"))) {
      inlineValue = inlineValue.slice(1, -1);
    } else if (inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
      try { inlineValue = JSON.parse(inlineValue); } catch { /* keep string */ }
    } else if (!isNaN(Number(inlineValue)) && inlineValue !== '') {
      inlineValue = Number(inlineValue);
    }
    fm[key] = inlineValue;
    i++;
  }

  return fm;
}

function extractSkillSections(content: string): { frontmatterBlock: string; body: string } | null {
  const trimmed = content.trimStart();
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  return { frontmatterBlock: match[1], body: match[2] };
}

export function parseSkillFile(filePath: string): ParsedSkillFile {
  const content = fs.readFileSync(filePath, 'utf-8');

  const sections = extractSkillSections(content);
  if (!sections) {
    return {
      frontmatter: { name: path.basename(path.dirname(filePath)) },
      body: content,
    };
  }

  const fm = parseFrontmatterBlock(sections.frontmatterBlock);

  return {
    frontmatter: {
      name: String(fm.name || path.basename(path.dirname(filePath))),
      description: fm.description ? String(fm.description) : undefined,
      version: fm.version ? String(fm.version) : undefined,
      triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
    },
    body: sections.body,
  };
}

function parseSkillFileFromText(content: string): ParsedSkillFile {
  const sections = extractSkillSections(content);
  if (!sections) {
    return { frontmatter: { name: 'unknown' }, body: content };
  }

  const fm = parseFrontmatterBlock(sections.frontmatterBlock);

  return {
    frontmatter: {
      name: String(fm.name || 'unknown'),
      description: fm.description ? String(fm.description) : undefined,
      version: fm.version ? String(fm.version) : undefined,
      triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
    },
    body: sections.body,
  };
}

export function loadSkillContent(storagePath: string): { frontmatter: SkillFrontmatter; body: string } | null {
  const skillMdPath = path.join(storagePath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  return parseSkillFile(skillMdPath);
}

export function createSkillMd(
  skillId: string,
  name: string,
  description: string | null | undefined,
  skillContent: string,
  triggers: string[] = []
): { storagePath: string; skillMdPath: string; parsedTriggers: string[] } {
  const storagePath = path.resolve(path.join(config.storageSkillsDir, skillId));
  const skillMdPath = path.join(storagePath, 'SKILL.md');

  const sections = extractSkillSections(skillContent);

  if (sections) {
    const parsed = parseFrontmatterBlock(sections.frontmatterBlock);
    const mergedTriggers = Array.isArray(parsed.triggers) && parsed.triggers.length > 0
      ? parsed.triggers
      : triggers;

    const lines: string[] = ['---'];
    lines.push(`name: "${String(parsed.name || name).replace(/"/g, '\\"')}"`);
    const desc = parsed.description || description;
    if (desc) lines.push(`description: "${String(desc).replace(/"/g, '\\"')}"`);
    lines.push(`version: "${String(parsed.version || '1.0.0')}"`);
    lines.push(`triggers: ${JSON.stringify(mergedTriggers)}`);
    lines.push('---');
    lines.push('');
    lines.push(sections.body);

    fs.mkdirSync(storagePath, { recursive: true });
    fs.writeFileSync(skillMdPath, lines.join('\n'), 'utf-8');

    return { storagePath, skillMdPath, parsedTriggers: mergedTriggers };
  }

  const lines: string[] = ['---'];
  lines.push(`name: "${name.replace(/"/g, '\\"')}"`);
  if (description) lines.push(`description: "${description.replace(/"/g, '\\"')}"`);
  lines.push(`version: "1.0.0"`);
  lines.push(`triggers: ${JSON.stringify(triggers)}`);
  lines.push('---');
  lines.push('');
  lines.push(skillContent);

  fs.mkdirSync(storagePath, { recursive: true });
  fs.writeFileSync(skillMdPath, lines.join('\n'), 'utf-8');

  return { storagePath, skillMdPath, parsedTriggers: triggers };
}

export function deleteSkillFolder(storagePath: string): void {
  try {
    if (fs.existsSync(storagePath)) {
      fs.rmSync(storagePath, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
}