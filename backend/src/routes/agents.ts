import { Router, Request, Response } from 'express';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember, guardClassTeacher } from '../middleware/guards';
import { CustomError } from '../types';

export const agentsRouter = Router();

agentsRouter.post(
  '/:classId/agents',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const { name, description, systemPrompt, kbIds, skillIds, visibility } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new CustomError('Missing required field: name', 400, 'BAD_REQUEST');
    }

    const vis = visibility ?? 'all';
    if (vis !== 'all' && vis !== 'teachers') {
      throw new CustomError('visibility must be "all" or "teachers"', 400, 'BAD_REQUEST');
    }

    const sp = systemPrompt ?? null;
    if (sp !== null && typeof sp === 'string' && sp.length > 4000) {
      throw new CustomError('systemPrompt exceeds 4000 characters', 400, 'BAD_REQUEST');
    }

    const kbList: string[] = Array.isArray(kbIds) ? kbIds : [];
    const skillList: string[] = Array.isArray(skillIds) ? skillIds : [];

    if (kbList.length > 0) {
      const kbRows = db
        .prepare(`SELECT id FROM knowledge_bases WHERE class_id = ? AND id IN (${kbList.map(() => '?').join(',')})`)
        .all(classId, ...kbList) as { id: string }[];
      if (kbRows.length !== kbList.length) {
        const valid = new Set(kbRows.map((r) => r.id));
        const invalid = kbList.filter((id) => !valid.has(id));
        throw new CustomError(`Invalid kbIds: ${invalid.join(', ')}`, 400, 'BAD_REQUEST');
      }
    }

    if (skillList.length > 0) {
      const skillRows = db
        .prepare(`SELECT id FROM skills WHERE class_id = ? AND id IN (${skillList.map(() => '?').join(',')})`)
        .all(classId, ...skillList) as { id: string }[];
      if (skillRows.length !== skillList.length) {
        const valid = new Set(skillRows.map((r) => r.id));
        const invalid = skillList.filter((id) => !valid.has(id));
        throw new CustomError(`Invalid skillIds: ${invalid.join(', ')}`, 400, 'BAD_REQUEST');
      }
    }

    const dup = db
      .prepare('SELECT id FROM agents WHERE class_id = ? AND name = ?')
      .get(classId, name.trim());
    if (dup) throw new CustomError('Agent name already exists in this class', 409, 'CONFLICT');

    const agentId = generateId();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO agents (id, class_id, name, description, system_prompt, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(agentId, classId, name.trim(), description ?? null, sp, vis, Date.now());

      for (const kbId of kbList) {
        db.prepare(`INSERT INTO agent_kbs (agent_id, kb_id) VALUES (?, ?)`).run(agentId, kbId);
      }
      for (const skillId of skillList) {
        db.prepare(`INSERT INTO agent_skills (agent_id, skill_id) VALUES (?, ?)`).run(agentId, skillId);
      }
    });
    tx();

    res.status(201).json({
      agentId,
      classId,
      name: name.trim(),
      description: description ?? null,
      systemPrompt: sp,
      visibility: vis,
      kbIds: kbList,
      skillIds: skillList,
      createdAt: Date.now(),
    });
  }
);

agentsRouter.get(
  '/:classId/agents',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const classId = req.params.classId;
    const user = (req as any).user;
    const isTeacherOrAdmin = user.role === 'admin' ||
      !!db.prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?').get(classId, user.userId);

    const rows: any[] = isTeacherOrAdmin
      ? db.prepare(
          `SELECT id as agentId, class_id as classId, name, description, visibility, created_at as createdAt FROM agents WHERE class_id = ? ORDER BY created_at ASC`
        ).all(classId)
      : db.prepare(
          `SELECT id as agentId, class_id as classId, name, description, visibility, created_at as createdAt FROM agents WHERE class_id = ? AND visibility = 'all' ORDER BY created_at ASC`
        ).all(classId);

    for (const r of rows) {
      r.kbCount = (db.prepare('SELECT COUNT(*) as c FROM agent_kbs WHERE agent_id = ?').get(r.agentId) as any).c;
      r.skillCount = (db.prepare('SELECT COUNT(*) as c FROM agent_skills WHERE agent_id = ?').get(r.agentId) as any).c;
    }

    res.json(rows);
  }
);

agentsRouter.get(
  '/:classId/agents/:agentId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const { classId, agentId } = req.params;
    const user = (req as any).user;
    const isTeacherOrAdmin = user.role === 'admin' ||
      !!db.prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?').get(classId, user.userId);

    const row = db.prepare(`SELECT * FROM agents WHERE id = ? AND class_id = ?`).get(agentId, classId) as any;
    if (!row) throw new CustomError('Agent not found', 404, 'NOT_FOUND');

    if (!isTeacherOrAdmin && row.visibility === 'teachers') {
      throw new CustomError('Agent not found', 404, 'NOT_FOUND');
    }

    const kbs = db.prepare(
      `SELECT ak.kb_id as kbId, kb.name as name FROM agent_kbs ak JOIN knowledge_bases kb ON ak.kb_id = kb.id WHERE ak.agent_id = ?`
    ).all(agentId) as { kbId: string; name: string }[];
    const skills = db.prepare(
      `SELECT ask.skill_id as skillId, s.name as name FROM agent_skills ask JOIN skills s ON ask.skill_id = s.id WHERE ask.agent_id = ?`
    ).all(agentId) as { skillId: string; name: string }[];

    const result: any = {
      agentId: row.id,
      classId: row.class_id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      createdAt: row.created_at,
      kbs,
      skills,
      kbIds: kbs.map((k) => k.kbId),
      skillIds: skills.map((s) => s.skillId),
    };

    if (isTeacherOrAdmin) {
      result.systemPrompt = row.system_prompt;
    }

    res.json(result);
  }
);

agentsRouter.put(
  '/:classId/agents/:agentId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, agentId } = req.params;
    const existing = db.prepare(`SELECT * FROM agents WHERE id = ? AND class_id = ?`).get(agentId, classId) as any;
    if (!existing) throw new CustomError('Agent not found', 404, 'NOT_FOUND');

    const { name, description, systemPrompt, kbIds, skillIds, visibility } = req.body || {};

    const newName = name !== undefined ? String(name).trim() : existing.name;
    const newDesc = description !== undefined ? (description === null ? null : String(description)) : existing.description;
    const newSp = systemPrompt !== undefined ? (systemPrompt === null ? null : String(systemPrompt)) : existing.system_prompt;
    const newVis = visibility ?? existing.visibility;

    if (!newName) throw new CustomError('name cannot be empty', 400, 'BAD_REQUEST');
    if (newVis !== 'all' && newVis !== 'teachers') {
      throw new CustomError('visibility must be "all" or "teachers"', 400, 'BAD_REQUEST');
    }
    if (newSp !== null && typeof newSp === 'string' && newSp.length > 4000) {
      throw new CustomError('systemPrompt exceeds 4000 characters', 400, 'BAD_REQUEST');
    }

    let newKbList: string[] | undefined;
    let newSkillList: string[] | undefined;

    if (kbIds !== undefined) {
      newKbList = Array.isArray(kbIds) ? kbIds : [];
      const kbRows = db
        .prepare(`SELECT id FROM knowledge_bases WHERE class_id = ? AND id IN (${newKbList.map(() => '?').join(',')})`)
        .all(classId, ...newKbList) as { id: string }[];
      if (kbRows.length !== newKbList.length) {
        const valid = new Set(kbRows.map((r) => r.id));
        const invalid = newKbList.filter((id) => !valid.has(id));
        throw new CustomError(`Invalid kbIds: ${invalid.join(', ')}`, 400, 'BAD_REQUEST');
      }
    }

    if (skillIds !== undefined) {
      newSkillList = Array.isArray(skillIds) ? skillIds : [];
      const skillRows = db
        .prepare(`SELECT id FROM skills WHERE class_id = ? AND id IN (${newSkillList.map(() => '?').join(',')})`)
        .all(classId, ...newSkillList) as { id: string }[];
      if (skillRows.length !== newSkillList.length) {
        const valid = new Set(skillRows.map((r) => r.id));
        const invalid = newSkillList.filter((id) => !valid.has(id));
        throw new CustomError(`Invalid skillIds: ${invalid.join(', ')}`, 400, 'BAD_REQUEST');
      }
    }

    if (newName !== existing.name) {
      const dup = db
        .prepare('SELECT id FROM agents WHERE class_id = ? AND name = ? AND id != ?')
        .get(classId, newName, agentId);
      if (dup) throw new CustomError('Agent name already exists in this class', 409, 'CONFLICT');
    }

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE agents SET name = ?, description = ?, system_prompt = ?, visibility = ? WHERE id = ?`
      ).run(newName, newDesc, newSp, newVis, agentId);

      if (newKbList !== undefined) {
        db.prepare(`DELETE FROM agent_kbs WHERE agent_id = ?`).run(agentId);
        for (const kbId of newKbList) {
          db.prepare(`INSERT INTO agent_kbs (agent_id, kb_id) VALUES (?, ?)`).run(agentId, kbId);
        }
      }

      if (newSkillList !== undefined) {
        db.prepare(`DELETE FROM agent_skills WHERE agent_id = ?`).run(agentId);
        for (const skillId of newSkillList) {
          db.prepare(`INSERT INTO agent_skills (agent_id, skill_id) VALUES (?, ?)`).run(agentId, skillId);
        }
      }
    });
    tx();

    const kbIdsFinal = (db.prepare('SELECT kb_id as kbId FROM agent_kbs WHERE agent_id = ?').all(agentId) as any[]).map((r) => r.kbId);
    const skillIdsFinal = (db.prepare('SELECT skill_id as skillId FROM agent_skills WHERE agent_id = ?').all(agentId) as any[]).map((r) => r.skillId);

    res.json({
      agentId,
      classId,
      name: newName,
      description: newDesc,
      systemPrompt: newSp,
      visibility: newVis,
      kbIds: kbIdsFinal,
      skillIds: skillIdsFinal,
      createdAt: existing.created_at,
    });
  }
);

agentsRouter.delete(
  '/:classId/agents/:agentId',
  authMiddleware,
  guardSchool,
  guardClassMember,
  guardClassTeacher,
  (req: Request, res: Response) => {
    const { classId, agentId } = req.params;

    const existing = db.prepare(`SELECT id FROM agents WHERE id = ? AND class_id = ?`).get(agentId, classId);
    if (!existing) throw new CustomError('Agent not found', 404, 'NOT_FOUND');

    db.prepare(`DELETE FROM agents WHERE id = ?`).run(agentId);

    res.json({ success: true });
  }
);