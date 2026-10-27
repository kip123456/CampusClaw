import { Router, Request, Response } from 'express';
import { db } from '../db';
import { generateId } from '../config';
import { authMiddleware } from '../middleware/auth';
import { guardSchool, guardClassMember } from '../middleware/guards';
import { CustomError } from '../types';
import { streamAgentLoop } from '../lib/agent-loop';
import { isLLMConfigured } from '../lib/llm';
import { wrap } from '../lib/async';

export const agentMessagesRouter = Router();

agentMessagesRouter.post(
  '/:classId/agents/:agentId/chat',
  authMiddleware,
  guardSchool,
  guardClassMember,
  wrap(async (req: Request, res: Response) => {
    if (!isLLMConfigured()) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'LLM not configured — set LLM_BASE_URL and LLM_MODEL in .env',
      });
    }

    const { classId, agentId } = req.params;
    const user = (req as any).user;
    const { message, conversationId } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new CustomError('message must be a non-empty string', 400, 'BAD_REQUEST');
    }

    const agent = db.prepare(`SELECT * FROM agents WHERE id = ? AND class_id = ?`).get(agentId, classId) as any;
    if (!agent) throw new CustomError('Agent not found', 404, 'NOT_FOUND');

    const isTeacherOrAdmin = user.role === 'admin' ||
      !!db.prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?').get(classId, user.userId);
    if (!isTeacherOrAdmin && agent.visibility === 'teachers') {
      throw new CustomError('Agent not found', 404, 'NOT_FOUND');
    }

    let convoId: string;
    if (conversationId) {
      const conv = db.prepare('SELECT * FROM agent_conversations WHERE id = ? AND agent_id = ? AND user_id = ?').get(conversationId, agentId, user.userId);
      if (!conv) throw new CustomError('Conversation not found', 404, 'NOT_FOUND');
      convoId = conversationId;
    } else {
      convoId = generateId();
      db.prepare(
        `INSERT INTO agent_conversations (id, agent_id, user_id, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)`
      ).run(convoId, agentId, user.userId, Date.now(), Date.now());
    }

    const prevMessages = db
      .prepare(
        `SELECT role, content FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC LIMIT 20`
      )
      .all(convoId) as { role: 'user' | 'assistant'; content: string }[];

    const userMsgId = generateId();
    db.prepare(`INSERT INTO agent_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`)
      .run(userMsgId, convoId, message, Date.now());

    db.prepare(`UPDATE agent_conversations SET last_message_at = ? WHERE id = ?`).run(Date.now(), convoId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    let closed = false;
    const controller = new AbortController();

    const cleanupAgent = res.on('close', () => {
      closed = true;
      controller.abort();
    });

    let fullAnswer = '';
    let savedAssistant = false;

    const saveAssistantMsg = () => {
      if (savedAssistant) return;
      savedAssistant = true;
      const assistantMsgId = generateId();
      db.prepare(
        `INSERT INTO agent_messages (id, conversation_id, role, content, citations, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`
      ).run(assistantMsgId, convoId, fullAnswer || '(no content)', null, Date.now());
      db.prepare(`UPDATE agent_conversations SET last_message_at = ? WHERE id = ?`).run(Date.now(), convoId);
    };

    try {
      const stream = streamAgentLoop({
        agentId,
        classId,
        userId: user.userId,
        userMessage: message,
        systemPrompt: agent.system_prompt,
        history: prevMessages,
        signal: controller.signal,
      });

      for await (const evt of stream) {
        if (closed) break;

        if (evt.type === 'skill_load') {
          res.write(`data: ${JSON.stringify({ type: 'skill_load', skillId: evt.skillId, skillName: evt.skillName })}\n\n`);
        } else if (evt.type === 'tool_start') {
          res.write(`data: ${JSON.stringify({ type: 'tool_start', toolName: evt.toolName, toolArgs: evt.toolArgs })}\n\n`);
        } else if (evt.type === 'tool_end') {
          res.write(`data: ${JSON.stringify({ type: 'tool_end', toolName: evt.toolName, toolResult: evt.toolResult, toolError: evt.toolError })}\n\n`);
        } else if (evt.type === 'message' && evt.content) {
          fullAnswer += evt.content;
          res.write(`data: ${JSON.stringify({ type: 'message', content: evt.content })}\n\n`);
        } else if (evt.type === 'done') {
          fullAnswer = evt.answer ?? fullAnswer;
          const payload = { type: 'done', conversationId: convoId, answer: fullAnswer };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          saveAssistantMsg();
          break;
        } else if (evt.type === 'error') {
          res.write(`data: ${JSON.stringify({ type: 'error', message: evt.message || 'Unknown error' })}\n\n`);
          saveAssistantMsg();
          break;
        }
      }
    } catch (err: any) {
      if (!closed) {
        try {
          res.write(`data: ${JSON.stringify({ type: 'error', message: err?.message || 'Unknown stream error' })}\n\n`);
        } catch {}
      }
      saveAssistantMsg();
    } finally {
      if (!closed) {
        try { res.end(); } catch {}
      }
      cleanupAgent.removeAllListeners();
    }
  })
);

agentMessagesRouter.get(
  '/:classId/agents/:agentId/conversations',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const { classId, agentId } = req.params;
    const user = (req as any).user;

    const agent = db.prepare(`SELECT id, visibility FROM agents WHERE id = ? AND class_id = ?`).get(agentId, classId) as any;
    if (!agent) throw new CustomError('Agent not found', 404, 'NOT_FOUND');

    const isTeacherOrAdmin = user.role === 'admin' ||
      !!db.prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?').get(classId, user.userId);
    if (!isTeacherOrAdmin && agent.visibility === 'teachers') {
      throw new CustomError('Agent not found', 404, 'NOT_FOUND');
    }

    const convs = db
      .prepare(
        `SELECT c.id as conversationId, c.agent_id as agentId, c.created_at as createdAt, c.last_message_at as lastMessageAt,
                (SELECT COUNT(*) FROM agent_messages m WHERE m.conversation_id = c.id) as messageCount
         FROM agent_conversations c
         WHERE c.agent_id = ? AND c.user_id = ?
         ORDER BY c.last_message_at DESC`
      )
      .all(agentId, user.userId);

    res.json(convs);
  }
);

agentMessagesRouter.get(
  '/:classId/agents/:agentId/conversations/:conversationId/messages',
  authMiddleware,
  guardSchool,
  guardClassMember,
  (req: Request, res: Response) => {
    const { classId, agentId, conversationId } = req.params;
    const user = (req as any).user;

    const agent = db.prepare(`SELECT id, visibility FROM agents WHERE id = ? AND class_id = ?`).get(agentId, classId) as any;
    if (!agent) throw new CustomError('Agent not found', 404, 'NOT_FOUND');

    const isTeacherOrAdmin = user.role === 'admin' ||
      !!db.prepare('SELECT 1 FROM class_teachers WHERE class_id = ? AND user_id = ?').get(classId, user.userId);
    if (!isTeacherOrAdmin && agent.visibility === 'teachers') {
      throw new CustomError('Agent not found', 404, 'NOT_FOUND');
    }

    const conv = db.prepare('SELECT * FROM agent_conversations WHERE id = ? AND agent_id = ? AND user_id = ?').get(conversationId, agentId, user.userId);
    if (!conv) throw new CustomError('Conversation not found', 404, 'NOT_FOUND');

    const msgs = db
      .prepare(
        `SELECT id as messageId, role, content, citations, created_at as createdAt FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC`
      )
      .all(conversationId) as any[];

    for (const m of msgs) {
      if (m.citations) {
        try {
          m.citations = JSON.parse(m.citations);
        } catch {
          m.citations = [];
        }
      }
    }

    res.json(msgs);
  }
);