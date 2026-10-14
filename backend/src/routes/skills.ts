import { Router, Request, Response } from 'express';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher } from '../middleware/guards';
import { CustomError } from '../types';

export const skillsRouter = Router();

skillsRouter.post(
  '/:classId/skills',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const { name, prompt, description } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new CustomError('Missing required field: name', 400, 'BAD_REQUEST');
    }
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new CustomError('Missing required field: prompt', 400, 'BAD_REQUEST');
    }
    if (prompt.length > 4000) {
      throw new CustomError('prompt exceeds 4000 characters', 400, 'BAD_REQUEST');
    }
    if (description !== undefined && description !== null && typeof description === 'string' && description.length > 500) {
      throw new CustomError('description exceeds 500 characters', 400, 'BAD_REQUEST');
    }

    const dup = db
      .prepare('SELECT id FROM skills WHERE class_id = ? AND name = ?')
      .get(classId, name.trim());
    if (dup) throw new CustomError('Skill name already exists in this class', 409, 'CONFLICT');

    const skillId = generateId();
    db.prepare(
      `INSERT INTO skills (id, class_id, name, prompt, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(skillId, classId, name.trim(), prompt, description ?? null, Date.now());

    const row = db
      .prepare(
        `SELECT id as skillId, class_id as classId, name, prompt, description, created_at as createdAt FROM skills WHERE id = ?`
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
        `SELECT id as skillId, class_id as classId, name, description, created_at as createdAt FROM skills WHERE class_id = ? ORDER BY created_at ASC`
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
      createdAt: row.created_at,
    };
    if (isTeacher) {
      result.prompt = row.prompt;
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
    const { name, prompt, description } = req.body || {};

    const existing = db
      .prepare(`SELECT * FROM skills WHERE id = ? AND class_id = ?`)
      .get(skillId, classId) as any;
    if (!existing) throw new CustomError('Skill not found', 404, 'NOT_FOUND');

    const newName = name !== undefined ? String(name).trim() : existing.name;
    const newPrompt = prompt !== undefined ? String(prompt) : existing.prompt;
    const newDesc = description !== undefined ? (description === null ? null : String(description)) : existing.description;

    if (!newName) throw new CustomError('name cannot be empty', 400, 'BAD_REQUEST');
    if (!newPrompt || newPrompt.trim().length === 0) {
      throw new CustomError('prompt cannot be empty', 400, 'BAD_REQUEST');
    }
    if (newPrompt.length > 4000) {
      throw new CustomError('prompt exceeds 4000 characters', 400, 'BAD_REQUEST');
    }
    if (newDesc !== null && typeof newDesc === 'string' && newDesc.length > 500) {
      throw new CustomError('description exceeds 500 characters', 400, 'BAD_REQUEST');
    }

    if (newName !== existing.name) {
      const dup = db
        .prepare('SELECT id FROM skills WHERE class_id = ? AND name = ? AND id != ?')
        .get(classId, newName, skillId);
      if (dup) throw new CustomError('Skill name already exists in this class', 409, 'CONFLICT');
    }

    db.prepare(
      `UPDATE skills SET name = ?, prompt = ?, description = ? WHERE id = ?`
    ).run(newName, newPrompt, newDesc, skillId);

    const row = db
      .prepare(
        `SELECT id as skillId, class_id as classId, name, prompt, description, created_at as createdAt FROM skills WHERE id = ?`
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
      .prepare(`SELECT id FROM skills WHERE id = ? AND class_id = ?`)
      .get(skillId, classId);
    if (!existing) throw new CustomError('Skill not found', 404, 'NOT_FOUND');

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM agent_skills WHERE skill_id = ?`).run(skillId);
      db.prepare(`DELETE FROM skills WHERE id = ?`).run(skillId);
    });
    tx();

    res.json({ success: true });
  }
);