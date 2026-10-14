import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import type { Agent, AgentConversation, AgentMessage, Citation } from '../types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export default function AgentChatPage() {
  const { classId, agentId } = useParams<{ classId: string; agentId: string }>();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fullAnswerRef = useRef('');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!classId || !agentId) return;
    api.get<Agent>(`/classes/${classId}/agents/${agentId}`)
      .then((res) => setAgent(res.data))
      .catch(() => setError('智能体不存在或无权限访问'));
  }, [classId, agentId]);

  useEffect(() => {
    if (!classId || !agentId) return;
    api.get<AgentConversation[]>(`/classes/${classId}/agents/${agentId}/conversations`)
      .then((res) => setConversations(res.data))
      .catch(() => {});
  }, [classId, agentId]);

  useEffect(() => {
    if (!activeConvId || !classId || !agentId) return;
    api.get<AgentMessage[]>(`/classes/${classId}/agents/${agentId}/conversations/${activeConvId}/messages`)
      .then((res) => {
        setMessages(res.data.map((m) => ({
          role: m.role,
          content: m.content,
          citations: m.citations?.length > 0 ? m.citations : undefined,
        })));
      })
      .catch(() => {});
  }, [activeConvId, classId, agentId]);

  async function sendMessage() {
    if (!input.trim() || sending || !classId || !agentId) return;
    const text = input.trim();
    setInput('');
    setError(null);

    const userMsg: ChatMessage = { role: 'user', content: text };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', isStreaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setSending(true);
    fullAnswerRef.current = '';

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/classes/${classId}/agents/${agentId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          message: text,
          conversationId: activeConvId || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '请求失败');
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;

          try {
            const event = JSON.parse(dataStr);
            if (event.type === 'message' && event.content) {
              fullAnswerRef.current += event.content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant' && last.isStreaming) {
                  const updated = [...prev];
                  updated[prev.length - 1] = { ...last, content: fullAnswerRef.current };
                  return updated;
                }
                return prev;
              });
            } else if (event.type === 'done') {
              setMessages((prev) => {
                const updated = [...prev];
                if (updated.length > 0) {
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: event.answer || fullAnswerRef.current,
                    citations: event.citations,
                    isStreaming: false,
                  };
                }
                return updated;
              });
              if (event.conversationId) {
                setActiveConvId(event.conversationId);
                setConversations((prev) => {
                  if (prev.some((c) => c.conversationId === event.conversationId)) return prev;
                  return [{ conversationId: event.conversationId, agentId, userId: '', createdAt: Date.now(), lastMessageAt: Date.now(), messageCount: 2 }, ...prev];
                });
              }
            } else if (event.type === 'error') {
              throw new Error(event.message || '智能体回复出错');
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].isStreaming) {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              isStreaming: false,
              content: fullAnswerRef.current + '\n\n[已停止生成]',
            };
          }
          return updated;
        });
      } else {
        setError(err.message || '请求失败');
        setMessages((prev) => prev.filter((m) => !m.isStreaming));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleNewChat() {
    setActiveConvId(null);
    setMessages([]);
    setError(null);
  }

  function renderWithCitations(content: string, citations?: Citation[]) {
    if (!content) return null;
    if (!citations || citations.length === 0) return content;
    const citationMap = new Map(citations.map((c) => [c.id, c]));
    const regex = /\[(\d+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      const num = parseInt(match[1], 10);
      if (citationMap.has(num)) {
        parts.push(
          <sup key={`c-${match.index}`} style={{ color: '#007aff', fontWeight: 600 }}>[{num}]</sup>
        );
      } else {
        parts.push(<sup key={`c-${match.index}`} style={{ color: '#8e8e93' }}>[{num}]</sup>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return parts;
  }

  const citedCitations = (() => {
    if (messages.length === 0) return [];
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.citations);
    if (!last?.citations) return [];
    const text = last.content;
    const citedIds = new Set<number>();
    const m = text.match(/\[(\d+)\]/g);
    if (m) for (const x of m) citedIds.add(parseInt(x.slice(1, -1), 10));
    return last.citations.filter((c) => citedIds.has(c.id));
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      <Link to={`/classes/${classId}`} style={{ color: '#007aff', marginBottom: 12, display: 'inline-block' }}>
        ← 返回班级
      </Link>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>🤖 {agent?.name || '加载中...'}</div>
            {agent?.description && (
              <div style={{ fontSize: 12, color: '#6e6e73' }}>{agent.description}</div>
            )}
            {agent && (
              <div style={{ marginTop: 8 }}>
                {agent.kbs.map((kb) => (
                  <span key={kb.kbId} className="tag kb">📚 {kb.name}</span>
                ))}
                {agent.skills.map((s) => (
                  <span key={s.skillId} className="tag skill">⚡ {s.name}</span>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleNewChat} style={{ marginBottom: 12 }}>+ 新对话</button>
          <div className="card" style={{ padding: 0, flex: 1, overflow: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ padding: 16, color: '#8e8e93', fontSize: 13, textAlign: 'center' }}>暂无历史对话</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.conversationId}
                  className={`conversation-item ${activeConvId === c.conversationId ? 'active' : ''}`}
                  onClick={() => setActiveConvId(c.conversationId)}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>对话 #{c.conversationId.slice(0, 6)}</div>
                  <div style={{ fontSize: 11, color: '#8e8e93' }}>
                    {c.messageCount} 条 · {new Date(c.lastMessageAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#8e8e93', marginTop: 80 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 16, marginBottom: 8 }}>开始与 {agent?.name || '智能体'} 对话</div>
                <div style={{ fontSize: 13 }}>输入你的问题，智能体会结合绑定的知识库和技能来回答</div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`chat-message ${m.role}`}>
                  <div className="chat-avatar">{m.role === 'user' ? '我' : 'AI'}</div>
                  <div className="chat-bubble">
                    {m.isStreaming && m.content ? (
                      <>
                        {m.content}
                        <span style={{ display: 'inline-block', width: 2, height: 14, background: '#007aff', marginLeft: 2, animation: 'blink 1s infinite' }} />
                      </>
                    ) : (
                      renderWithCitations(m.content, m.citations)
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {citedCitations.length > 0 && (
            <div style={{ padding: '8px 20px', borderTop: '1px solid #e5e5ea', maxHeight: 120, overflow: 'auto' }}>
              <div style={{ fontSize: 11, color: '#8e8e93', marginBottom: 4 }}>引用来源：</div>
              {citedCitations.map((c) => (
                <span key={c.id} className="tag kb" style={{ marginRight: 6 }}>
                  [{c.id}] {c.originalName}
                </span>
              ))}
            </div>
          )}

          {error && <div className="error" style={{ margin: '8px 20px' }}>⚠ {error}</div>}

          <div style={{ padding: 16, borderTop: '1px solid #e5e5ea', display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的问题..."
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
              disabled={sending}
              style={{ marginBottom: 0 }}
            />
            {sending ? (
              <button onClick={handleStop} style={{ background: '#ff3b30' }}>停止</button>
            ) : (
              <button onClick={sendMessage} disabled={!input.trim()}>发送</button>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }`}</style>
    </div>
  );
}