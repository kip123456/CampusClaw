import { db } from '../db';
import { chat, chatStream, LLMMessage, LLMTool, ToolCall, isLLMConfigured } from './llm';
import { executeTool } from './tool-handlers';
import { selectSkills, loadSkillsByIds } from './skill-selector';
import { listBuiltinToolSchemas, getBuiltinTool } from './tool-handlers';
import { createMcpConfigFromDb, callTool as callMcpTool } from './mcp-client';
import { debugLog, resetDebugLog } from './debug-log';

export interface AgentLoopEvent {
  type: 'skill_load' | 'tool_start' | 'tool_end' | 'message' | 'done' | 'error';
  skillId?: string;
  skillName?: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: any;
  toolError?: string;
  content?: string;
  message?: string;
  answer?: string;
}

export interface RunAgentLoopOptions {
  agentId: string;
  classId: string;
  userId: string;
  userMessage: string;
  systemPrompt?: string | null;
  history?: { role: 'user' | 'assistant'; content: string }[];
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  answer: string;
  events: AgentLoopEvent[];
}

const MAX_ITERATIONS = 5;

async function getAgentTools(agentId: string): Promise<any[]> {
  const toolRows = db
    .prepare(
      `SELECT t.id as toolId, t.name, t.description, t.input_schema_json as inputSchemaJson, t.source, t.handler_key as handlerKey, t.mcp_server_id as mcpServerId, t.mcp_tool_name as mcpToolName, t.enabled
       FROM tools t JOIN agent_tools at ON t.id = at.tool_id
       WHERE at.agent_id = ? AND t.enabled = 1`
    )
    .all(agentId) as any[];

  return toolRows.map((t) => {
    let inputSchema: Record<string, any> = {};
    try { inputSchema = JSON.parse(t.inputSchemaJson || '{}'); } catch {}

    const builtin = t.source === 'builtin' ? getBuiltinTool(t.handlerKey) : null;
    const description = builtin?.description || t.description || `Tool: ${t.name}`;
    const finalSchema = builtin?.inputSchema || inputSchema || { type: 'object', properties: {} };

    return {
      toolId: t.toolId,
      name: t.name,
      description,
      inputSchema: finalSchema,
      source: t.source,
      handlerKey: t.handlerKey,
      mcpServerId: t.mcpServerId,
      mcpToolName: t.mcpToolName,
    };
  });
}

async function executeToolCall(
  tc: ToolCall,
  availableTools: Awaited<ReturnType<typeof getAgentTools>>,
  ctx: { classId: string; userId: string }
): Promise<string> {
  const tool = availableTools.find((t) => t.name === tc.function.name);
  if (!tool) {
    return JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
  }

  let args: any = {};
  try {
    args = JSON.parse(tc.function.arguments || '{}');
  } catch {
    return JSON.stringify({ error: `Invalid JSON arguments: ${tc.function.arguments}` });
  }

  if (tool.source === 'builtin' && tool.handlerKey) {
    const result = await executeTool(tool.handlerKey, args, ctx);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  if (tool.source === 'mcp' && tool.mcpServerId) {
    const mcpConfig = await createMcpConfigFromDb(tool.mcpServerId);
    if (!mcpConfig) {
      return JSON.stringify({ error: `MCP server ${tool.mcpServerId} not found` });
    }
    const mcpToolName = tool.mcpToolName || tool.name;
    const mcpResult = await callMcpTool(mcpConfig, mcpToolName, args);
    if (mcpResult.isError) {
      return JSON.stringify({ error: mcpResult.content });
    }
    return mcpResult.content;
  }

  return JSON.stringify({ error: `Tool ${tool.name} execution not supported` });
}

export async function runAgentLoop(options: RunAgentLoopOptions): Promise<AgentLoopResult> {
  if (!isLLMConfigured()) {
    throw new Error('LLM API not configured');
  }

  const { agentId, classId, userId, userMessage, systemPrompt, history, signal } = options;
  const events: AgentLoopEvent[] = [];

  resetDebugLog();
  debugLog('====== AGENT LOOP START ======');
  debugLog('agentId:', agentId, 'classId:', classId, 'userId:', userId);
  debugLog('userMessage:', userMessage);
  debugLog('history.count:', history?.length ?? 0);
  debugLog('systemPrompt (from agent):', systemPrompt ?? '(use default)');

  const availableTools = await getAgentTools(agentId);
  const llmTools: LLMTool[] = availableTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const skillRows = db.prepare(
    `SELECT skill_id as skillId FROM agent_skills WHERE agent_id = ?`
  ).all(agentId) as { skillId: string }[];
  const candidateSkillIds = skillRows.map((r) => r.skillId);

  let selectedSkillIds: string[] = [];
  try {
    selectedSkillIds = await selectSkills(userMessage, classId, candidateSkillIds, 3);
  } catch {
    selectedSkillIds = candidateSkillIds.slice(0, 3);
  }

  const loadedSkills = loadSkillsByIds(selectedSkillIds);
  for (const s of loadedSkills) {
    events.push({ type: 'skill_load', skillId: s.skillId, skillName: s.name });
  }

  let systemMsg = systemPrompt || '你是一个聪明的教学助手，帮助教师完成各种教学任务。';
  if (loadedSkills.length > 0) {
    systemMsg += '\n\n## 可用技能\n';
    for (const s of loadedSkills) {
      systemMsg += `\n### ${s.name}\n`;
      if (s.description) systemMsg += `${s.description}\n`;
      systemMsg += `${s.body}\n`;
    }
  }
  if (availableTools.length > 0) {
    systemMsg += '\n\n你可以使用可用工具来获取信息。当你需要查询数据、执行计算或完成特定任务时，请调用相应的工具。';
  }

  const messages: LLMMessage[] = [{ role: 'system', content: systemMsg }];
  if (history && history.length > 0) {
    for (const h of history) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: h.content });
      }
    }
  }
  messages.push({ role: 'user', content: userMessage });

  debugLog('final systemMsg:', systemMsg);
  debugLog('availableTools:', JSON.stringify(availableTools.map(t => ({ name: t.name, source: t.source, description: t.description }))));
  debugLog('selectedSkills:', JSON.stringify(loadedSkills.map(s => ({ name: s.name, bodyLen: s.body.length }))));

  let finalAnswer = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) {
      throw new Error('Agent loop aborted');
    }

    const result = await chat(messages, { tools: llmTools });

    if (result.toolCalls.length === 0) {
      finalAnswer = result.content || '';
      break;
    }

    if (iteration === MAX_ITERATIONS - 1) {
      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls,
      });

      for (const tc of result.toolCalls) {
        events.push({
          type: 'tool_start',
          toolName: tc.function.name,
          toolArgs: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
        });
      }

      for (const tc of result.toolCalls) {
        let toolOutput: string;
        try {
          toolOutput = await executeToolCall(tc, availableTools, { classId, userId });
        } catch (err: any) {
          toolOutput = JSON.stringify({ error: err?.message || 'Tool execution failed' });
        }
        events.push({
          type: 'tool_end',
          toolName: tc.function.name,
          toolResult: (() => { try { return JSON.parse(toolOutput); } catch { return toolOutput; } })(),
        });
      }

      const finalResult = await chat(messages);
      finalAnswer = finalResult.content || '';
      break;
    }

    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    });

    for (const tc of result.toolCalls) {
      let parsedArgs: any = {};
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch {}
      events.push({
        type: 'tool_start',
        toolName: tc.function.name,
        toolArgs: parsedArgs,
      });
    }

    for (const tc of result.toolCalls) {
      let toolOutput: string;
      try {
        toolOutput = await executeToolCall(tc, availableTools, { classId, userId });
      } catch (err: any) {
        toolOutput = JSON.stringify({ error: err?.message || 'Tool execution failed' });
        events.push({
          type: 'tool_end',
          toolName: tc.function.name,
          toolError: err?.message,
        });
        continue;
      }

      let parsedResult: any = toolOutput;
      try { parsedResult = JSON.parse(toolOutput); } catch {}

      events.push({
        type: 'tool_end',
        toolName: tc.function.name,
        toolResult: parsedResult,
      });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolOutput,
      });
    }
  }

  return { answer: finalAnswer, events };
}

export interface StreamAgentLoopOptions extends RunAgentLoopOptions {}

export async function* streamAgentLoop(
  options: StreamAgentLoopOptions
): AsyncGenerator<AgentLoopEvent, void, unknown> {
  if (!isLLMConfigured()) {
    yield { type: 'error', message: 'LLM API not configured' };
    return;
  }

  const { agentId, classId, userId, userMessage, systemPrompt, history, signal } = options;

  resetDebugLog();
  debugLog('====== STREAM AGENT LOOP START ======');
  debugLog('agentId:', agentId, 'classId:', classId, 'userId:', userId);
  debugLog('userMessage:', userMessage);
  debugLog('history.count:', history?.length ?? 0);
  debugLog('systemPrompt (from agent):', systemPrompt ?? '(use default)');

  const availableTools = await getAgentTools(agentId);
  const llmTools: LLMTool[] = availableTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const skillRows = db.prepare(
    `SELECT skill_id as skillId FROM agent_skills WHERE agent_id = ?`
  ).all(agentId) as { skillId: string }[];
  const candidateSkillIds = skillRows.map((r) => r.skillId);

  let selectedSkillIds: string[] = [];
  try {
    selectedSkillIds = await selectSkills(userMessage, classId, candidateSkillIds, 3);
  } catch {
    selectedSkillIds = candidateSkillIds.slice(0, 3);
  }

  const loadedSkills = loadSkillsByIds(selectedSkillIds);
  for (const s of loadedSkills) {
    yield { type: 'skill_load', skillId: s.skillId, skillName: s.name };
  }

  let systemMsg = systemPrompt || '你是一个聪明的教学助手，帮助教师完成各种教学任务。';
  if (loadedSkills.length > 0) {
    systemMsg += '\n\n## 可用技能\n';
    for (const s of loadedSkills) {
      systemMsg += `\n### ${s.name}\n`;
      if (s.description) systemMsg += `${s.description}\n`;
      systemMsg += `${s.body}\n`;
    }
  }
  if (availableTools.length > 0) {
    systemMsg += '\n\n你可以使用可用工具来获取信息。当你需要查询数据、执行计算或完成特定任务时，请调用相应的工具。';
  }

  const messages: LLMMessage[] = [{ role: 'system', content: systemMsg }];
  if (history && history.length > 0) {
    for (const h of history) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: h.content });
      }
    }
  }
  messages.push({ role: 'user', content: userMessage });

  debugLog('final systemMsg:', systemMsg);
  debugLog('availableTools:', JSON.stringify(availableTools.map(t => ({ name: t.name, source: t.source, description: t.description }))));
  debugLog('selectedSkills:', JSON.stringify(loadedSkills.map(s => ({ name: s.name, bodyLen: s.body.length }))));

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) {
      yield { type: 'error', message: 'Agent loop aborted' };
      return;
    }

    const result = await chat(messages, { tools: llmTools });

    if (result.toolCalls.length === 0) {
      const finalAnswer = result.content || '';
      yield { type: 'message', content: finalAnswer };
      yield { type: 'done', answer: finalAnswer };
      return;
    }

    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    });

    for (const tc of result.toolCalls) {
      let parsedArgs: any = {};
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch {}
      yield {
        type: 'tool_start',
        toolName: tc.function.name,
        toolArgs: parsedArgs,
      };
    }

    for (const tc of result.toolCalls) {
      let toolOutput: string;
      try {
        toolOutput = await executeToolCall(tc, availableTools, { classId, userId });
      } catch (err: any) {
        toolOutput = JSON.stringify({ error: err?.message || 'Tool execution failed' });
        yield {
          type: 'tool_end',
          toolName: tc.function.name,
          toolError: err?.message,
        };
        continue;
      }

      let parsedResult: any = toolOutput;
      try { parsedResult = JSON.parse(toolOutput); } catch {}

      yield {
        type: 'tool_end',
        toolName: tc.function.name,
        toolResult: parsedResult,
      };

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolOutput,
      });
    }

    if (iteration === MAX_ITERATIONS - 1) {
      const finalResult = await chat(messages);
      const finalAnswer = finalResult.content || '';
      yield { type: 'message', content: finalAnswer };
      yield { type: 'done', answer: finalAnswer };
      return;
    }
  }

  yield { type: 'error', message: 'Agent loop exceeded max iterations without final answer' };
}