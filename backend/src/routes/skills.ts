import { Router, Request, Response } from 'express';
import { db } from '../db';
import { generateId, config } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher } from '../middleware/guards';
import { CustomError } from '../types';
import { createSkillMd, deleteSkillFolder, loadSkillContent } from '../lib/skill-loader';
import { invalidateSkillCache } from '../lib/skill-selector';
import * as path from 'path';

export const skillsRouter = Router();

function readSkillContentFromDbRow(row: any): string {
  if (row.storage_path) {
    const parsed = loadSkillContent(row.storage_path);
    if (parsed) return parsed.body;
  }
  return row.prompt || '';
}

skillsRouter.post(
  '/:classId/skills',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const { name, description, skillContent, triggers } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new CustomError('Missing required field: name', 400, 'BAD_REQUEST');
    }
    if (!skillContent || typeof skillContent !== 'string' || skillContent.trim().length === 0) {
      throw new CustomError('Missing required field: skillContent', 400, 'BAD_REQUEST');
    }
    if (skillContent.length > 10000) {
      throw new CustomError('skillContent exceeds 10000 characters', 400, 'BAD_REQUEST');
    }
    if (description !== undefined && description !== null && typeof description === 'string' && description.length > 500) {
      throw new CustomError('description exceeds 500 characters', 400, 'BAD_REQUEST');
    }
    let triggerList: string[] = [];
    if (Array.isArray(triggers)) {
      triggerList = triggers.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
    }

    const dup = db
      .prepare('SELECT id FROM skills WHERE class_id = ? AND name = ?')
      .get(classId, name.trim());
    if (dup) throw new CustomError('Skill name already exists in this class', 409, 'CONFLICT');

    const skillId = generateId();
    const { storagePath, parsedTriggers } = createSkillMd(skillId, name.trim(), description ?? null, skillContent, triggerList);

    db.prepare(
      `INSERT INTO skills (id, class_id, name, prompt, storage_path, description, version, import_source, triggers_json, created_at) VALUES (?, ?, ?, ?, ?, ?, '1.0.0', 'builtin', ?, ?)`
    ).run(skillId, classId, name.trim(), skillContent, storagePath, description ?? null, JSON.stringify(parsedTriggers), Date.now());

    invalidateSkillCache();

    const row = db
      .prepare(
        `SELECT id as skillId, class_id as classId, name, description, version, import_source, storage_path as storagePath, triggers_json as triggersJson, created_at as createdAt FROM skills WHERE id = ?`
      )
      .get(skillId) as any;
    res.status(201).json(row);
  }
);

skillsRouter.get(
  '/:classId/skills',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const rows = db
      .prepare(
        `SELECT id as skillId, class_id as classId, name, description, version, import_source, created_at as createdAt FROM skills WHERE class_id = ? ORDER BY created_at ASC`
      )
      .all(classId);
    res.json(rows);
  }
);

skillsRouter.get(
  '/:classId/skills/:skillId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const { classId, skillId } = req.params;
    const user = (req as any).user;
    const isTeacher = user.role === 'admin' ||
      !!db.prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?').get(classId, user.userId);

    const row = db
      .prepare(`SELECT * FROM skills WHERE id = ? AND class_id = ?`)
      .get(skillId, classId) as any;
    if (!row) throw new CustomError('Skill not found', 404, 'NOT_FOUND');

    const result: any = {
      skillId: row.id,
      classId: row.class_id,
      name: row.name,
      description: row.description,
      version: row.version,
      importSource: row.import_source,
      createdAt: row.created_at,
    };

    try {
      result.triggers = row.triggers_json ? JSON.parse(row.triggers_json) : [];
    } catch {
      result.triggers = [];
    }

    if (isTeacher) {
      result.skillContent = readSkillContentFromDbRow(row);
      if (row.storage_path) result.storagePath = row.storage_path;
    }

    res.json(result);
  }
);

skillsRouter.put(
  '/:classId/skills/:skillId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, skillId } = req.params;
    const { name, description, skillContent, triggers } = req.body || {};

    const existing = db
      .prepare(`SELECT * FROM skills WHERE id = ? AND class_id = ?`)
      .get(skillId, classId) as any;
    if (!existing) throw new CustomError('Skill not found', 404, 'NOT_FOUND');

    const newName = name !== undefined ? String(name).trim() : existing.name;
    const newDesc = description !== undefined ? (description === null ? null : String(description)) : existing.description;

    let newContent = skillContent !== undefined ? String(skillContent) : readSkillContentFromDbRow(existing);
    if (!newContent || newContent.trim().length === 0) {
      throw new CustomError('skillContent cannot be empty', 400, 'BAD_REQUEST');
    }
    if (newContent.length > 10000) {
      throw new CustomError('skillContent exceeds 10000 characters', 400, 'BAD_REQUEST');
    }
    if (newDesc !== null && typeof newDesc === 'string' && newDesc.length > 500) {
      throw new CustomError('description exceeds 500 characters', 400, 'BAD_REQUEST');
    }

    let triggerList: string[] = Array.isArray(triggers)
      ? triggers.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
      : (() => { try { return JSON.parse(existing.triggers_json || '[]'); } catch { return []; } })();

    if (!newName) throw new CustomError('name cannot be empty', 400, 'BAD_REQUEST');

    if (newName !== existing.name) {
      const dup = db
        .prepare('SELECT id FROM skills WHERE class_id = ? AND name = ? AND id != ?')
        .get(classId, newName, skillId);
      if (dup) throw new CustomError('Skill name already exists in this class', 409, 'CONFLICT');
    }

    const storagePath = existing.storage_path || path.resolve(path.join(config.storageSkillsDir, skillId));
    createSkillMd(skillId, newName, newDesc, newContent, triggerList);

    db.prepare(
      `UPDATE skills SET name = ?, prompt = ?, storage_path = ?, description = ?, triggers_json = ? WHERE id = ?`
    ).run(newName, newContent, storagePath, newDesc, JSON.stringify(triggerList), skillId);

    invalidateSkillCache();

    const row = db
      .prepare(
        `SELECT id as skillId, class_id as classId, name, description, version, import_source, created_at as createdAt FROM skills WHERE id = ?`
      )
      .get(skillId);
    res.json(row);
  }
);

skillsRouter.delete(
  '/:classId/skills/:skillId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, skillId } = req.params;

    const existing = db
      .prepare(`SELECT * FROM skills WHERE id = ? AND class_id = ?`)
      .get(skillId, classId) as any;
    if (!existing) throw new CustomError('Skill not found', 404, 'NOT_FOUND');

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM agent_skills WHERE skill_id = ?`).run(skillId);
      db.prepare(`DELETE FROM skills WHERE id = ?`).run(skillId);
    });
    tx();

    if (existing.storage_path) {
      deleteSkillFolder(existing.storage_path);
    }

    invalidateSkillCache();

    res.json({ success: true });
  }
);