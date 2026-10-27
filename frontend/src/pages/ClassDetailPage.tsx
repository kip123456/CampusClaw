import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import type { Material, KnowledgeBase, KBDocument, QueryResult, User, MembersResponse, Citation, QAResponse, Skill, Agent, Tool, McpServer } from '../types';

export default function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user: User | null = userStr ? JSON.parse(userStr) : null;

  const [tab, setTab] = useState<'materials' | 'kbs' | 'members' | 'skills' | 'tools' | 'mcps' | 'agents'>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [activeKb, setActiveKb] = useState<string>('');
  const [selectedKbIds, setSelectedKbIds] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const materialInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [newKbName, setNewKbName] = useState('');
  const [showNewKb, setShowNewKb] = useState(false);
  const [newKbChunkSize, setNewKbChunkSize] = useState(1500);
  const [newKbChunkOverlap, setNewKbChunkOverlap] = useState(50);
  const [showChunkOverride, setShowChunkOverride] = useState<Record<string, boolean>>({});
  const [overrideChunkSize, setOverrideChunkSize] = useState<Record<string, number>>({});
  const [overrideChunkOverlap, setOverrideChunkOverlap] = useState<Record<string, number>>({});

  const [qaMode, setQaMode] = useState<'query' | 'qa'>('query');
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaResult, setQaResult] = useState<QAResponse | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);
  const [expandedCitation, setExpandedCitation] = useState<number | null>(null);

  const [members, setMembers] = useState<MembersResponse>({ teachers: [], students: [] });
  const [memberTab, setMemberTab] = useState<'teachers' | 'students'>('students');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [addSchool, setAddSchool] = useState(user?.school || '');
  const [addStudentId, setAddStudentId] = useState('');
  const [addMsg, setAddMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [showNewSkill, setShowNewSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillPrompt, setNewSkillPrompt] = useState('');
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [skillImportMode, setSkillImportMode] = useState(false);
  const [skillImportUrl, setSkillImportUrl] = useState('');
  const skillZipInputRef = useRef<HTMLInputElement>(null);

  const [tools, setTools] = useState<Tool[]>([]);
  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [showNewMcp, setShowNewMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newMcpTransport, setNewMcpTransport] = useState<'http' | 'sse'>('http');
  const [newMcpAuthType, setNewMcpAuthType] = useState<'none' | 'bearer' | 'api_key' | 'basic'>('none');
  const [newMcpAuthConfig, setNewMcpAuthConfig] = useState('');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [newAgentSystemPrompt, setNewAgentSystemPrompt] = useState('');
  const [newAgentVisibility, setNewAgentVisibility] = useState<'all' | 'teachers'>('all');
  const [newAgentKbIds, setNewAgentKbIds] = useState<Set<string>>(new Set());
  const [newAgentSkillIds, setNewAgentSkillIds] = useState<Set<string>>(new Set());
  const [newAgentToolIds, setNewAgentToolIds] = useState<Set<string>>(new Set());

  const isTeacherOrAdmin = user && (user.role === 'teacher' || user.role === 'admin');

  useEffect(() => {
    if (tab === 'materials') loadMaterials();
    if (tab === 'kbs') loadKbs();
    if (tab === 'members') loadMembers();
    if (tab === 'skills') loadSkills();
    if (tab === 'tools' && isTeacherOrAdmin) loadTools();
    if (tab === 'mcps' && isTeacherOrAdmin) loadMcps();
    if (tab === 'agents') {
      loadAgents();
      if (isTeacherOrAdmin) { loadKbs(); loadSkills(); loadTools(); }
    }
  }, [tab, classId]);

  useEffect(() => {
    if (activeKb && tab === 'kbs') loadDocs();
  }, [activeKb]);

  useEffect(() => {
    if (kbs.length > 0 && selectedKbIds.size === 0) {
      setSelectedKbIds(new Set(kbs.map((kb) => kb.kbId)));
    }
  }, [kbs]);

  async function loadMaterials() {
    try {
      const res = await api.get<Material[]>(`/classes/${classId}/materials`);
      setMaterials(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadKbs() {
    try {
      const res = await api.get<KnowledgeBase[]>(`/classes/${classId}/kbs`);
      setKbs(res.data);
      if (!activeKb && res.data.length > 0) {
        setActiveKb(res.data[0].kbId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadDocs() {
    try {
      const res = await api.get<KBDocument[]>(`/classes/${classId}/kbs/${activeKb}/documents`);
      setDocs(res.data);
      setQueryResults([]);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleMaterialUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/classes/${classId}/materials`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadMsg('PDF 上传成功');
      setTimeout(() => setUploadMsg(''), 2000);
      loadMaterials();
    } catch (err: any) {
      setUploadMsg(err.response?.data?.message || '上传失败');
      setTimeout(() => setUploadMsg(''), 2000);
    }
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeKb) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/classes/${classId}/kbs/${activeKb}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadMsg('文档上传成功');
      setTimeout(() => setUploadMsg(''), 2000);
      loadDocs();
    } catch (err: any) {
      setUploadMsg(err.response?.data?.message || '上传失败');
      setTimeout(() => setUploadMsg(''), 2000);
    }
  }

  async function handleCreateKb() {
    if (!newKbName.trim()) return;
    try {
      const res = await api.post(`/classes/${classId}/kbs`, {
        name: newKbName.trim(),
        chunkSize: newKbChunkSize,
        chunkOverlap: newKbChunkOverlap,
      });
      setActiveKb(res.data.kbId);
      setNewKbName('');
      setNewKbChunkSize(1500);
      setNewKbChunkOverlap(50);
      setShowNewKb(false);
      loadKbs();
    } catch (err: any) {
      alert(err.response?.data?.message || '创建失败');
    }
  }

  async function handleIndexDoc(docId: string, cs?: number, co?: number) {
    try {
      await api.post(`/classes/${classId}/kbs/${activeKb}/documents/${docId}/index`, {
        chunkSize: cs,
        chunkOverlap: co,
      });
      setDocs((prev) => prev.map((d) => (d.documentId === docId ? { ...d, status: 'indexing' } : d)));
      setShowChunkOverride((prev) => ({ ...prev, [docId]: false }));
      setTimeout(() => loadDocs(), 3000);
    } catch (err: any) {
      alert(err.response?.data?.message || '触发索引失败');
    }
  }

  async function handleIndexAll() {
    try {
      const res = await api.post(`/classes/${classId}/kbs/${activeKb}/index-all`);
      setUploadMsg(`已入队 ${res.data.enqueued} 个文档`);
      setTimeout(() => setUploadMsg(''), 2000);
      setDocs((prev) => prev.map((d) => (d.status !== 'ready' ? { ...d, status: 'indexing' } : d)));
      setTimeout(() => loadDocs(), 3000);
    } catch (err: any) {
      alert(err.response?.data?.message || '批量索引失败');
    }
  }

  async function handleQuery() {
    if (!query.trim() || selectedKbIds.size === 0) return;
    setLoading(true);
    try {
      const kbIds = Array.from(selectedKbIds);
      const res = await api.post<QueryResult[]>(`/classes/${classId}/kbs/query`, { kbIds, query, topK: 5 });
      setQueryResults(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || '检索失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleQA() {
    if (!qaInput.trim() || selectedKbIds.size === 0) return;
    setQaLoading(true);
    setQaError(null);
    setQaResult(null);
    setExpandedCitation(null);
    try {
      const kbIds = Array.from(selectedKbIds);
      const res = await api.post<QAResponse>(`/classes/${classId}/kbs/qa`, { kbIds, question: qaInput.trim(), topK: 5 });
      setQaResult(res.data);
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message || '问答失败';
      if (status === 503) {
        setQaError('LLM 未配置 — 请在 .env 中设置 LLM_BASE_URL 和 LLM_MODEL');
      } else {
        setQaError(msg);
      }
    } finally {
      setQaLoading(false);
    }
  }

  function renderAnswerWithCitations(answer: string, citations: Citation[]) {
    if (!answer) return null;
    const citationMap = new Map(citations.map((c) => [c.id, c]));
    const regex = /\[(\d+)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(answer)) !== null) {
      if (match.index > lastIndex) {
        parts.push(answer.slice(lastIndex, match.index));
      }
      const num = parseInt(match[1], 10);
      const hasCitation = citationMap.has(num);
      parts.push(
        hasCitation ? (
          <sup
            key={`cit-${match.index}`}
            onClick={() => setExpandedCitation(expandedCitation === num ? null : num)}
            style={{ color: '#007aff', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
            title={`点击展开引用 [${num}]`}
          >
            [{num}]
          </sup>
        ) : (
          <sup key={`cit-${match.index}`} style={{ color: '#8e8e93' }}>[{num}]</sup>
        )
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < answer.length) {
      parts.push(answer.slice(lastIndex));
    }
    return parts;
  }

  async function handleDownloadMaterial(fileId: string, name: string) {
    try {
      const res = await api.get(`/classes/${classId}/materials/${fileId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('下载失败');
    }
  }

  async function loadMembers() {
    try {
      const res = await api.get<MembersResponse>(`/classes/${classId}/members`);
      setMembers(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadSkills() {
    try {
      const res = await api.get<Skill[]>(`/classes/${classId}/skills`);
      setSkills(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateSkill() {
    if (!newSkillName.trim()) return;
    try {
      await api.post(`/classes/${classId}/skills`, {
        name: newSkillName.trim(),
        description: newSkillDesc.trim() || null,
        skillContent: newSkillPrompt.trim(),
      });
      setNewSkillName('');
      setNewSkillDesc('');
      setNewSkillPrompt('');
      setShowNewSkill(false);
      loadSkills();
    } catch (err: any) {
      alert(err.response?.data?.message || '创建技能失败');
    }
  }

  async function handleUpdateSkill() {
    if (!editingSkill || !newSkillName.trim()) return;
    try {
      await api.put(`/classes/${classId}/skills/${editingSkill.skillId}`, {
        name: newSkillName.trim(),
        description: newSkillDesc.trim() || null,
        skillContent: newSkillPrompt.trim(),
      });
      setEditingSkill(null);
      setNewSkillName('');
      setNewSkillDesc('');
      setNewSkillPrompt('');
      loadSkills();
    } catch (err: any) {
      alert(err.response?.data?.message || '更新技能失败');
    }
  }

  async function handleDeleteSkill(skillId: string) {
    if (!confirm('确定删除此技能吗？')) return;
    try {
      await api.delete(`/classes/${classId}/skills/${skillId}`);
      loadSkills();
    } catch (err: any) {
      alert(err.response?.data?.message || '删除失败');
    }
  }

  function startEditSkill(skill: Skill) {
    setEditingSkill(skill);
    setNewSkillName(skill.name);
    setNewSkillDesc(skill.description || '');
    setNewSkillPrompt(skill.skillContent || '');
    setShowNewSkill(true);
  }

  async function loadTools() {
    try {
      const res = await api.get<Tool[]>(`/classes/${classId}/tools`);
      setTools(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadMcps() {
    try {
      const res = await api.get<McpServer[]>(`/classes/${classId}/mcp-servers`);
      setMcps(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteTool(toolId: string) {
    if (!confirm('确定删除此工具吗？')) return;
    try {
      await api.delete(`/classes/${classId}/tools/${toolId}`);
      loadTools();
    } catch (err: any) {
      alert(err.response?.data?.message || '删除失败');
    }
  }

  async function handleBindTool(toolId: string, agentId: string) {
    try {
      await api.post(`/classes/${classId}/tools/${toolId}/bind`, { agentId });
      loadTools();
      loadAgents();
    } catch (err: any) {
      alert(err.response?.data?.message || '绑定失败');
    }
  }

  async function handleUnbindTool(toolId: string, agentId: string) {
    try {
      await api.delete(`/classes/${classId}/tools/${toolId}/bind`, { data: { agentId } });
      loadTools();
      loadAgents();
    } catch (err: any) {
      alert(err.response?.data?.message || '解绑失败');
    }
  }

  async function handleTestMcp(mcpServerId: string) {
    try {
      const res = await api.get(`/classes/${classId}/mcp-servers/${mcpServerId}/test`);
      alert(res.data.message || '测试成功');
      loadMcps();
    } catch (err: any) {
      alert(err.response?.data?.message || '连接失败');
      loadMcps();
    }
  }

  async function handleImportMcpTools(mcpServerId: string) {
    try {
      const res = await api.post(`/classes/${classId}/mcp-servers/${mcpServerId}/import`);
      const data = res.data as { imported: string[]; skipped: string[]; total: number };
      alert(`导入完成：成功 ${data.imported.length} 个，跳过 ${data.skipped.length} 个`);
      loadMcps();
      if (tab === 'tools') loadTools();
    } catch (err: any) {
      alert(err.response?.data?.message || '导入失败');
    }
  }

  async function handleCreateMcp() {
    if (!newMcpName.trim() || !newMcpUrl.trim()) return;
    let authConfig: any = {};
    if (newMcpAuthType !== 'none' && newMcpAuthConfig.trim()) {
      try {
        authConfig = JSON.parse(newMcpAuthConfig);
      } catch {
        alert('authConfig 必须是合法 JSON');
        return;
      }
    }
    try {
      await api.post(`/classes/${classId}/mcp-servers`, {
        name: newMcpName.trim(),
        url: newMcpUrl.trim(),
        transport: newMcpTransport,
        authType: newMcpAuthType,
        authConfig,
      });
      setNewMcpName('');
      setNewMcpUrl('');
      setNewMcpTransport('http');
      setNewMcpAuthType('none');
      setNewMcpAuthConfig('');
      setShowNewMcp(false);
      loadMcps();
    } catch (err: any) {
      alert(err.response?.data?.message || '创建失败');
    }
  }

  async function handleDeleteMcp(mcpServerId: string) {
    if (!confirm('删除 MCP Server 会同时删除通过它导入的所有工具。确定？')) return;
    try {
      await api.delete(`/classes/${classId}/mcp-servers/${mcpServerId}`);
      loadMcps();
      loadTools();
    } catch (err: any) {
      alert(err.response?.data?.message || '删除失败');
    }
  }

  async function handleImportSkillUrl() {
    if (!skillImportUrl.trim()) return;
    try {
      await api.post(`/classes/${classId}/skills/import`, { source: 'url', location: skillImportUrl.trim() });
      setSkillImportUrl('');
      setSkillImportMode(false);
      loadSkills();
    } catch (err: any) {
      alert(err.response?.data?.message || '导入失败');
    }
  }

  async function handleSkillZipUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/classes/${classId}/skills/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (skillZipInputRef.current) skillZipInputRef.current.value = '';
      setSkillImportMode(false);
      loadSkills();
    } catch (err: any) {
      alert(err.response?.data?.message || '导入失败');
    }
  }

  async function loadAgents() {
    try {
      const res = await api.get<Agent[]>(`/classes/${classId}/agents`);
      setAgents(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateOrUpdateAgent() {
    if (!newAgentName.trim()) return;
    const payload = {
      name: newAgentName.trim(),
      description: newAgentDesc.trim() || null,
      systemPrompt: newAgentSystemPrompt.trim() || null,
      visibility: newAgentVisibility,
      kbIds: Array.from(newAgentKbIds),
      skillIds: Array.from(newAgentSkillIds),
      toolIds: Array.from(newAgentToolIds),
    };
    try {
      if (editingAgent) {
        await api.put(`/classes/${classId}/agents/${editingAgent.agentId}`, payload);
      } else {
        await api.post(`/classes/${classId}/agents`, payload);
      }
      setEditingAgent(null);
      setShowNewAgent(false);
      resetAgentForm();
      loadAgents();
    } catch (err: any) {
      alert(err.response?.data?.message || '保存智能体失败');
    }
  }

  async function handleDeleteAgent(agentId: string) {
    if (!confirm('确定删除此智能体吗？相关的对话和消息也会被删除。')) return;
    try {
      await api.delete(`/classes/${classId}/agents/${agentId}`);
      loadAgents();
    } catch (err: any) {
      alert(err.response?.data?.message || '删除失败');
    }
  }

  function startEditAgent(agent: Agent) {
    setEditingAgent(agent);
    setNewAgentName(agent.name);
    setNewAgentDesc(agent.description || '');
    setNewAgentSystemPrompt(agent.systemPrompt || '');
    setNewAgentVisibility(agent.visibility);
    setNewAgentKbIds(new Set(agent.kbs?.map((k) => k.kbId) || []));
    setNewAgentSkillIds(new Set(agent.skills?.map((s) => s.skillId) || []));
    setNewAgentToolIds(new Set(agent.tools?.map((t) => t.toolId) || []));
    setShowNewAgent(true);
  }

  function resetAgentForm() {
    setNewAgentName('');
    setNewAgentDesc('');
    setNewAgentSystemPrompt('');
    setNewAgentVisibility('all');
    setNewAgentKbIds(new Set());
    setNewAgentSkillIds(new Set());
    setNewAgentToolIds(new Set());
  }

  function toggleAgentKb(kbId: string) {
    setNewAgentKbIds((prev) => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId); else next.add(kbId);
      return next;
    });
  }

  function toggleAgentSkill(skillId: string) {
    setNewAgentSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId); else next.add(skillId);
      return next;
    });
  }

  function toggleAgentTool(toolId: string) {
    setNewAgentToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId); else next.add(toolId);
      return next;
    });
  }

  async function handleAddMember(role: 'student' | 'teacher') {
    if (!addSchool.trim() || !addStudentId.trim()) return;
    setAddMsg(null);
    try {
      await api.post(`/classes/${classId}/${role}s`, {
        targetSchool: addSchool.trim(),
        targetStudentId: addStudentId.trim(),
      });
      setAddMsg({ type: 'success', text: `添加成功！` });
      setAddStudentId('');
      loadMembers();
      setTimeout(() => {
        setAddMsg(null);
        if (role === 'student') setShowAddStudent(false);
        else setShowAddTeacher(false);
      }, 1200);
    } catch (err: any) {
      setAddMsg({ type: 'error', text: err.response?.data?.message || '添加失败' });
    }
  }

  function toggleKbSelection(kbId: string) {
    setSelectedKbIds((prev) => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId);
      else next.add(kbId);
      return next;
    });
  }

  function selectAllKbs() {
    setSelectedKbIds(new Set(kbs.map((kb) => kb.kbId)));
  }

  function invertKbSelection() {
    setSelectedKbIds((prev) => {
      const next = new Set<string>();
      for (const kb of kbs) {
        if (!prev.has(kb.kbId)) next.add(kb.kbId);
      }
      return next;
    });
  }

  const statusBadge = (status: KBDocument['status']) => {
    const map: Record<KBDocument['status'], { label: string; color: string }> = {
      uploaded: { label: '待索引', color: '#8e8e93' },
      indexing: { label: '索引中...', color: '#007aff' },
      ready: { label: '就绪', color: '#34c759' },
      failed: { label: '失败', color: '#ff3b30' },
    };
    const s = map[status];
    return (
      <span style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 10,
        background: s.color + '22',
        color: s.color,
        fontWeight: 500,
      }}>
        {s.label}
      </span>
    );
  };

  const currentKb = kbs.find((kb) => kb.kbId === activeKb);

  return (
    <div>
      <Link to="/classes" style={{ color: '#007aff', marginBottom: 16, display: 'inline-block' }}>← 返回班级列表</Link>

      <div className="tabs">
        <div className={`tab ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}>教学资料</div>
        <div className={`tab ${tab === 'kbs' ? 'active' : ''}`} onClick={() => setTab('kbs')}>知识库</div>
        <div className={`tab ${tab === 'agents' ? 'active' : ''}`} onClick={() => setTab('agents')}>智能体</div>
        {isTeacherOrAdmin && (
          <>
            <div className={`tab ${tab === 'skills' ? 'active' : ''}`} onClick={() => setTab('skills')}>技能</div>
            <div className={`tab ${tab === 'tools' ? 'active' : ''}`} onClick={() => setTab('tools')}>工具</div>
            <div className={`tab ${tab === 'mcps' ? 'active' : ''}`} onClick={() => setTab('mcps')}>MCP Servers</div>
          </>
        )}
        <div className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>成员管理</div>
      </div>

      {uploadMsg && <div className={uploadMsg.includes('成功') || uploadMsg.includes('已入队') ? 'success' : 'error'}>{uploadMsg}</div>}

      {tab === 'materials' && (
        <div>
          {isTeacherOrAdmin && (
            <div className="upload-area">
              <p style={{ marginBottom: 12, color: '#6e6e73' }}>上传 PDF 教学资料</p>
              <input type="file" accept=".pdf,application/pdf" ref={materialInputRef} onChange={handleMaterialUpload} style={{ display: 'none' }} />
              <button onClick={() => materialInputRef.current?.click()}>选择文件上传</button>
            </div>
          )}
          <div className="card" style={{ padding: 0 }}>
            {materials.length === 0 ? (
              <div style={{ padding: 20, color: '#8e8e93', textAlign: 'center' }}>暂无资料</div>
            ) : (
              materials.map((m) => (
                <div key={m.fileId} className="list-item">
                  <div>
                    <div style={{ fontWeight: 500 }}>📄 {m.originalName}</div>
                    <div style={{ fontSize: 12, color: '#8e8e93' }}>{(m.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button onClick={() => handleDownloadMaterial(m.fileId, m.originalName)}>下载</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'kbs' && (
        <div className="grid-2">
          <div className="kb-list">
            <h4 style={{ marginBottom: 12 }}>知识库列表 (检索多选)</h4>
            {kbs.length > 1 && (
              <div style={{ marginBottom: 8, fontSize: 12, display: 'flex', gap: 8 }}>
                <a onClick={selectAllKbs} style={{ color: '#007aff', cursor: 'pointer' }}>全选</a>
                <span style={{ color: '#c7c7cc' }}>|</span>
                <a onClick={invertKbSelection} style={{ color: '#007aff', cursor: 'pointer' }}>反选</a>
              </div>
            )}
            {kbs.map((kb) => (
              <div
                key={kb.kbId}
                className={`kb-item ${activeKb === kb.kbId ? 'active' : ''}`}
                onClick={() => setActiveKb(kb.kbId)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={selectedKbIds.has(kb.kbId)}
                  onChange={() => toggleKbSelection(kb.kbId)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ cursor: 'pointer' }}
                />
                <span>{kb.isDefault && '⭐ '}{kb.name}</span>
              </div>
            ))}
            {isTeacherOrAdmin && !showNewKb && (
              <button style={{ marginTop: 12, width: '100%' }} onClick={() => setShowNewKb(true)}>+ 新建知识库</button>
            )}
            {showNewKb && (
              <div style={{ marginTop: 12 }}>
                <input type="text" value={newKbName} onChange={(e) => setNewKbName(e.target.value)} placeholder="知识库名称" />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 11, color: '#8e8e93', marginBottom: 2 }}>Chunk 大小 (100-10000)</label>
                    <input
                      type="number"
                      value={newKbChunkSize}
                      onChange={(e) => setNewKbChunkSize(Number(e.target.value))}
                      min={100}
                      max={10000}
                      step={100}
                      style={{ padding: '6px 8px', fontSize: 13 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 11, color: '#8e8e93', marginBottom: 2 }}>重叠 (0-1000)</label>
                    <input
                      type="number"
                      value={newKbChunkOverlap}
                      onChange={(e) => setNewKbChunkOverlap(Number(e.target.value))}
                      min={0}
                      max={1000}
                      step={10}
                      style={{ padding: '6px 8px', fontSize: 13 }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 4 }}>默认 1500/50，chunkOverlap 必须小于 chunkSize</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleCreateKb} style={{ flex: 1 }}>确定</button>
                  <button onClick={() => { setShowNewKb(false); setNewKbName(''); setNewKbChunkSize(1500); setNewKbChunkOverlap(50); }} style={{ flex: 1, background: '#8e8e93' }}>取消</button>
                </div>
              </div>
            )}
          </div>
          <div>
            {activeKb && (
              <>
                {isTeacherOrAdmin && (
                  <div className="upload-area">
                    <p style={{ marginBottom: 12, color: '#6e6e73' }}>上传文档（PDF/TXT/MD）→ 上传后需手动触发索引</p>
                    <input type="file" accept=".pdf,.txt,.md" ref={docInputRef} onChange={handleDocUpload} style={{ display: 'none' }} />
                    <button onClick={() => docInputRef.current?.click()}>选择文件上传</button>
                  </div>
                )}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ margin: 0 }}>
                      知识库文档
                      {currentKb && (
                        <span style={{ fontSize: 11, color: '#8e8e93', fontWeight: 'normal', marginLeft: 8 }}>
                          默认 chunk: {currentKb.chunkSize}/{currentKb.chunkOverlap}
                        </span>
                      )}
                    </h4>
                    {isTeacherOrAdmin && docs.some((d) => d.status !== 'ready') && (
                      <button onClick={handleIndexAll} style={{ padding: '4px 12px', fontSize: 12 }}>
                        索引全部待索引 ({docs.filter((d) => d.status !== 'ready').length})
                      </button>
                    )}
                  </div>
                  {docs.length === 0 ? (
                    <div style={{ color: '#8e8e93' }}>暂无文档</div>
                  ) : (
                    docs.map((d) => {
                      const showOverride = !!showChunkOverride[d.documentId];
                      const initCs = overrideChunkSize[d.documentId] ?? currentKb?.chunkSize ?? 1500;
                      const initCo = overrideChunkOverlap[d.documentId] ?? currentKb?.chunkOverlap ?? 50;
                      return (
                        <div key={d.documentId} className="list-item" style={{ flexWrap: 'wrap', gap: 4 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500 }}>📄 {d.originalName}</div>
                            <div style={{ fontSize: 12, color: '#8e8e93' }}>
                              {d.chunkCount} chunks
                              {d.chunkSize != null && d.chunkOverlap != null ? ` · ${d.chunkSize}/${d.chunkOverlap}` : ''}
                              {d.indexedAt ? ` · ${new Date(d.indexedAt).toLocaleString()}` : ''}
                            </div>
                            {d.status === 'failed' && d.errorMessage && (
                              <div style={{ fontSize: 11, color: '#ff3b30', marginTop: 2 }}>{d.errorMessage}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {statusBadge(d.status)}
                            {isTeacherOrAdmin && d.status !== 'indexing' && (
                              <>
                                <button
                                  onClick={() => {
                                    setShowChunkOverride((prev) => ({ ...prev, [d.documentId]: !showOverride }));
                                    setOverrideChunkSize((prev) => ({ ...prev, [d.documentId]: initCs }));
                                    setOverrideChunkOverlap((prev) => ({ ...prev, [d.documentId]: initCo }));
                                  }}
                                  style={{ padding: '2px 6px', fontSize: 11, background: '#e5e5ea', color: '#007aff' }}
                                  title="调整 chunk 参数后索引"
                                >
                                  ⚙
                                </button>
                                <button
                                  onClick={() => handleIndexDoc(d.documentId)}
                                  style={{ padding: '2px 10px', fontSize: 11 }}
                                >
                                  {d.status === 'ready' ? '重新索引' : '开始索引'}
                                </button>
                              </>
                            )}
                          </div>
                          {showOverride && (
                            <div style={{ width: '100%', padding: '8px 12px', background: '#f2f2f7', borderRadius: 8, marginTop: 4 }}>
                              <div style={{ fontSize: 12, color: '#6e6e73', marginBottom: 6 }}>
                                覆盖默认 chunk 配置 (留空使用 KB 默认)
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ display: 'block', fontSize: 11, color: '#8e8e93', marginBottom: 2 }}>Chunk 大小</label>
                                  <input
                                    type="number"
                                    value={overrideChunkSize[d.documentId] ?? initCs}
                                    onChange={(e) => setOverrideChunkSize((prev) => ({ ...prev, [d.documentId]: Number(e.target.value) }))}
                                    min={100}
                                    max={10000}
                                    step={100}
                                    style={{ padding: '4px 6px', fontSize: 12 }}
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ display: 'block', fontSize: 11, color: '#8e8e93', marginBottom: 2 }}>重叠</label>
                                  <input
                                    type="number"
                                    value={overrideChunkOverlap[d.documentId] ?? initCo}
                                    onChange={(e) => setOverrideChunkOverlap((prev) => ({ ...prev, [d.documentId]: Number(e.target.value) }))}
                                    min={0}
                                    max={1000}
                                    step={10}
                                    style={{ padding: '4px 6px', fontSize: 12 }}
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    handleIndexDoc(
                                      d.documentId,
                                      overrideChunkSize[d.documentId],
                                      overrideChunkOverlap[d.documentId]
                                    );
                                  }}
                                  style={{ padding: '4px 10px', fontSize: 12, alignSelf: 'flex-end' }}
                                >
                                  用此配置索引
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="card">
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, borderBottom: '1px solid #e5e5ea', paddingBottom: 8 }}>
                    <span
                      onClick={() => setQaMode('query')}
                      style={{
                        cursor: 'pointer',
                        fontWeight: qaMode === 'query' ? 600 : 400,
                        color: qaMode === 'query' ? '#007aff' : '#8e8e93',
                        fontSize: 14,
                        padding: '4px 0',
                        borderBottom: qaMode === 'query' ? '2px solid #007aff' : '2px solid transparent',
                      }}
                    >
                      向量检索 {selectedKbIds.size > 0 && <span style={{ fontSize: 12, color: '#8e8e93', fontWeight: 'normal' }}>({selectedKbIds.size} 个 KB)</span>}
                    </span>
                    {isTeacherOrAdmin && (
                      <span
                        onClick={() => setQaMode('qa')}
                        style={{
                          cursor: 'pointer',
                          fontWeight: qaMode === 'qa' ? 600 : 400,
                          color: qaMode === 'qa' ? '#007aff' : '#8e8e93',
                          fontSize: 14,
                          padding: '4px 0',
                          borderBottom: qaMode === 'qa' ? '2px solid #007aff' : '2px solid transparent',
                        }}
                      >
                        知识问答 {selectedKbIds.size > 0 && <span style={{ fontSize: 12, color: '#8e8e93', fontWeight: 'normal' }}>({selectedKbIds.size} 个 KB)</span>}
                      </span>
                    )}
                  </div>

                  {qaMode === 'query' && (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <input
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="输入自然语言查询..."
                          style={{ marginBottom: 0, flex: 1 }}
                          onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                        />
                        <button onClick={handleQuery} disabled={loading || !query.trim() || selectedKbIds.size === 0}>
                          {loading ? '搜索中...' : '搜索'}
                        </button>
                      </div>
                      {selectedKbIds.size === 0 && (
                        <div style={{ color: '#ff9500', fontSize: 13, marginBottom: 8 }}>请先选择至少一个知识库进行检索</div>
                      )}
                      {queryResults.map((r, i) => (
                        <div key={i} className="query-result">
                          <div className="chunk">{r.chunk}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <div style={{ fontSize: 12, color: '#007aff' }}>📄 {r.originalName} · chunk #{r.chunkIndex}</div>
                            <div className="distance">distance: {r.distance.toFixed(4)}</div>
                          </div>
                          <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 2 }}>
                            {r.startOffset != null && r.endOffset != null
                              ? `位置: 第 ${r.startOffset}-${r.endOffset} 字符`
                              : '位置: 未知（旧索引文档，重新索引可补齐）'}
                          </div>
                        </div>
                      ))}
                      {queryResults.length === 0 && query && !loading && selectedKbIds.size > 0 && (
                        <div style={{ color: '#8e8e93', fontSize: 13 }}>无匹配结果</div>
                      )}
                    </>
                  )}

                  {qaMode === 'qa' && (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <input
                          type="text"
                          value={qaInput}
                          onChange={(e) => setQaInput(e.target.value)}
                          placeholder="向知识库提问..."
                          style={{ marginBottom: 0, flex: 1 }}
                          onKeyDown={(e) => e.key === 'Enter' && handleQA()}
                        />
                        <button onClick={handleQA} disabled={qaLoading || !qaInput.trim() || selectedKbIds.size === 0}>
                          {qaLoading ? '思考中...' : '提问'}
                        </button>
                      </div>
                      {selectedKbIds.size === 0 && (
                        <div style={{ color: '#ff9500', fontSize: 13, marginBottom: 8 }}>请先选择至少一个知识库进行问答</div>
                      )}
                      {qaError && (
                        <div style={{ color: '#ff3b30', fontSize: 13, marginBottom: 8 }}>⚠ {qaError}</div>
                      )}
                      {qaResult && (
                        <>
                          <div style={{
                            background: '#f2f2f7',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 12,
                            fontSize: 14,
                            lineHeight: 1.7,
                            whiteSpace: 'pre-wrap',
                          }}>
                            {renderAnswerWithCitations(qaResult.answer, qaResult.citations)}
                          </div>
                          {(() => {
                            const citedIds = new Set<number>();
                            const m = qaResult.answer.match(/\[(\d+)\]/g);
                            if (m) for (const x of m) citedIds.add(parseInt(x.slice(1, -1), 10));
                            const citedCitations = qaResult.citations.filter((c) => citedIds.has(c.id));
                            if (citedCitations.length === 0) return null;
                            return (
                              <>
                                <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 6, fontWeight: 500 }}>
                                  引用的知识库片段 ({citedCitations.length})
                                </div>
                                {citedCitations.map((c) => {
                                  const isOpen = expandedCitation === c.id;
                                  return (
                                    <div
                                      key={c.id}
                                      style={{
                                        border: '1px solid #e5e5ea',
                                        borderRadius: 8,
                                        marginBottom: 6,
                                        overflow: 'hidden',
                                      }}
                                    >
                                      <div
                                        onClick={() => setExpandedCitation(isOpen ? null : c.id)}
                                        style={{
                                          padding: '8px 12px',
                                          cursor: 'pointer',
                                          background: isOpen ? '#fff5e6' : '#fafafa',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          fontSize: 12,
                                        }}
                                      >
                                        <span>
                                          <strong style={{ color: '#007aff' }}>[{c.id}]</strong>{' '}
                                          📄 {c.originalName} · chunk #{c.chunkIndex} ·{' '}
                                          {c.startOffset != null && c.endOffset != null
                                            ? `第 ${c.startOffset}-${c.endOffset} 字符`
                                            : '未知位置'}
                                        </span>
                                        <span style={{ color: '#8e8e93' }}>{isOpen ? '▼' : '▶'}</span>
                                      </div>
                                      {isOpen && (
                                        <div style={{ padding: '10px 12px', fontSize: 13, background: '#fff', borderTop: '1px solid #e5e5ea', whiteSpace: 'pre-wrap' }}>
                                          {c.chunk}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </>
                      )}
                      {!qaResult && !qaError && !qaLoading && qaInput && (
                        <div style={{ color: '#8e8e93', fontSize: 13 }}>点击"提问"开始知识问答</div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div
              className={`tab ${memberTab === 'students' ? 'active' : ''}`}
              onClick={() => setMemberTab('students')}
              style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '2px solid transparent' }}
            >
              学生 ({members.students.length})
            </div>
            <div
              className={`tab ${memberTab === 'teachers' ? 'active' : ''}`}
              onClick={() => setMemberTab('teachers')}
              style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '2px solid transparent' }}
            >
              教师 ({members.teachers.length})
            </div>
          </div>

          {isTeacherOrAdmin && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => { setShowAddStudent(!showAddStudent); setShowAddTeacher(false); setAddMsg(null); }}>
                + 添加学生
              </button>
              {user?.role === 'admin' && (
                <button onClick={() => { setShowAddTeacher(!showAddTeacher); setShowAddStudent(false); setAddMsg(null); }} style={{ background: '#34c759' }}>
                  + 添加教师
                </button>
              )}
            </div>
          )}

          {(showAddStudent || showAddTeacher) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h4 style={{ marginTop: 0 }}>
                {showAddStudent ? '添加学生' : '添加教师'}
              </h4>
              {addMsg && <div className={addMsg.type} style={{ marginBottom: 12 }}>{addMsg.text}</div>}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>学校</label>
                  <input
                    type="text"
                    value={addSchool}
                    onChange={(e) => setAddSchool(e.target.value)}
                    placeholder={user?.school || '如 TestUni'}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>学号</label>
                  <input
                    type="text"
                    value={addStudentId}
                    onChange={(e) => setAddStudentId(e.target.value)}
                    placeholder={showAddStudent ? '如 s001' : '如 t001'}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => handleAddMember(showAddStudent ? 'student' : 'teacher')}
                  disabled={!addSchool.trim() || !addStudentId.trim()}
                >
                  确认添加
                </button>
                <button
                  onClick={() => { setShowAddStudent(false); setShowAddTeacher(false); setAddMsg(null); }}
                  style={{ background: '#8e8e93' }}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            {(memberTab === 'students' ? members.students : members.teachers).length === 0 ? (
              <div style={{ padding: 20, color: '#8e8e93', textAlign: 'center' }}>暂无{memberTab === 'students' ? '学生' : '教师'}</div>
            ) : (
              (memberTab === 'students' ? members.students : members.teachers).map((m) => (
                <div key={m.userId} className="list-item">
                  <div>
                    <div style={{ fontWeight: 500 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: '#8e8e93' }}>{m.school} / {m.studentId}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'skills' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>技能列表</h4>
            {isTeacherOrAdmin && !showNewSkill && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSkillImportMode(!skillImportMode)}>
                  {skillImportMode ? '取消导入' : '+ 导入技能'}
                </button>
                <button onClick={() => setShowNewSkill(true)}>+ 新建技能</button>
              </div>
            )}
          </div>

          {skillImportMode && isTeacherOrAdmin && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h4 style={{ marginTop: 0 }}>导入外部技能</h4>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>方式 1: 上传 ZIP 包（包含 SKILL.md）</label>
                <input
                  type="file"
                  accept=".zip"
                  ref={skillZipInputRef}
                  onChange={handleSkillZipUpload}
                  style={{ padding: '6px 8px', fontSize: 13 }}
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>方式 2: 远程 URL</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={skillImportUrl}
                    onChange={(e) => setSkillImportUrl(e.target.value)}
                    placeholder="https://example.com/skill.zip"
                    style={{ flex: 1 }}
                  />
                  <button onClick={handleImportSkillUrl} disabled={!skillImportUrl.trim()}>导入</button>
                </div>
              </div>
            </div>
          )}

          {showNewSkill && isTeacherOrAdmin && (
            <div className="card">
              <h4 style={{ marginTop: 0 }}>{editingSkill ? '编辑技能' : '新建技能'}</h4>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>名称 *</label>
              <input
                type="text"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                placeholder="例如：考试出题"
              />
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>描述</label>
              <input
                type="text"
                value={newSkillDesc}
                onChange={(e) => setNewSkillDesc(e.target.value)}
                placeholder="简短描述这个技能的用途"
              />
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>
                Skill Content (Markdown) — 将作为 SKILL.md 正文
              </label>
              <textarea
                value={newSkillPrompt}
                onChange={(e) => setNewSkillPrompt(e.target.value)}
                rows={5}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d1d6', borderRadius: 8, fontSize: 14, marginBottom: 12, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="当需要此技能时，指导智能体如何回答..."
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={editingSkill ? handleUpdateSkill : handleCreateSkill} disabled={!newSkillName.trim()}>
                  {editingSkill ? '保存修改' : '创建'}
                </button>
                <button
                  style={{ background: '#8e8e93' }}
                  onClick={() => {
                    setShowNewSkill(false);
                    setEditingSkill(null);
                    setNewSkillName('');
                    setNewSkillDesc('');
                    setNewSkillPrompt('');
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            {skills.length === 0 ? (
              <div style={{ padding: 20, color: '#8e8e93', textAlign: 'center' }}>
                暂无技能 — 技能是可复用的 SKILL.md 工作流，可被智能体绑定使用
              </div>
            ) : (
              skills.map((s) => (
                <div key={s.skillId} className="list-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>⚡ {s.name}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      {s.version && <span style={{ fontSize: 11, background: '#007aff22', color: '#007aff', padding: '1px 6px', borderRadius: 8 }}>v{s.version}</span>}
                      {s.importSource && <span style={{ fontSize: 11, background: '#ff950022', color: '#ff9500', padding: '1px 6px', borderRadius: 8 }}>📦 {s.importSource}</span>}
                    </div>
                    {s.description && (
                      <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 2 }}>{s.description}</div>
                    )}
                    {s.skillContent && isTeacherOrAdmin && (
                      <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 4, background: '#f2f2f7', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                        {s.skillContent.length > 200 ? s.skillContent.slice(0, 200) + '...' : s.skillContent}
                      </div>
                    )}
                  </div>
                  {isTeacherOrAdmin && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => startEditSkill(s)}
                        style={{ padding: '4px 12px', fontSize: 12, background: '#ff9500' }}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteSkill(s.skillId)}
                        style={{ padding: '4px 12px', fontSize: 12, background: '#ff3b30' }}
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>智能体列表</h4>
            {isTeacherOrAdmin && !showNewAgent && (
              <button onClick={() => setShowNewAgent(true)}>+ 新建智能体</button>
            )}
          </div>

          {showNewAgent && isTeacherOrAdmin && (
            <div className="card">
              <h4 style={{ marginTop: 0 }}>{editingAgent ? '编辑智能体' : '新建智能体'}</h4>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>名称 *</label>
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="例如：课程助教"
              />
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>描述</label>
              <input
                type="text"
                value={newAgentDesc}
                onChange={(e) => setNewAgentDesc(e.target.value)}
                placeholder="简短描述这个智能体的用途"
              />
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>系统提示词</label>
              <textarea
                value={newAgentSystemPrompt}
                onChange={(e) => setNewAgentSystemPrompt(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d1d6', borderRadius: 8, fontSize: 14, marginBottom: 12, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="定义智能体的角色和行为方式..."
              />
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>可见性</label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <label style={{ fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="visibility"
                    value="all"
                    checked={newAgentVisibility === 'all'}
                    onChange={() => setNewAgentVisibility('all')}
                    style={{ width: 'auto', marginRight: 4 }}
                  />
                  所有成员可用
                </label>
                <label style={{ fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="visibility"
                    value="teachers"
                    checked={newAgentVisibility === 'teachers'}
                    onChange={() => setNewAgentVisibility('teachers')}
                    style={{ width: 'auto', marginRight: 4 }}
                  />
                  仅教师可用
                </label>
              </div>

              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>绑定知识库</label>
              {kbs.length === 0 ? (
                <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 8 }}>暂无知识库，请先创建</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {kbs.map((kb) => (
                    <label
                      key={kb.kbId}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 14,
                        border: `1px solid ${newAgentKbIds.has(kb.kbId) ? '#007aff' : '#d1d1d6'}`,
                        background: newAgentKbIds.has(kb.kbId) ? '#007aff22' : '#fff',
                        color: newAgentKbIds.has(kb.kbId) ? '#007aff' : '#6e6e73',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newAgentKbIds.has(kb.kbId)}
                        onChange={() => toggleAgentKb(kb.kbId)}
                        style={{ display: 'none' }}
                      />
                      📚 {kb.name}
                    </label>
                  ))}
                </div>
              )}

              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>绑定技能</label>
              {skills.length === 0 ? (
                <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 12 }}>暂无技能，可先在"技能"标签页创建</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {skills.map((s) => (
                    <label
                      key={s.skillId}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 14,
                        border: `1px solid ${newAgentSkillIds.has(s.skillId) ? '#ff9500' : '#d1d1d6'}`,
                        background: newAgentSkillIds.has(s.skillId) ? '#ff950022' : '#fff',
                        color: newAgentSkillIds.has(s.skillId) ? '#ff9500' : '#6e6e73',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newAgentSkillIds.has(s.skillId)}
                        onChange={() => toggleAgentSkill(s.skillId)}
                        style={{ display: 'none' }}
                      />
                      ⚡ {s.name}
                    </label>
                  ))}
                </div>
              )}

              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>绑定工具</label>
              {tools.length === 0 ? (
                <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 12 }}>暂无工具 — 内置工具和 MCP 导入的工具都会在此显示</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {tools.map((t) => {
                    const isBuiltin = t.source === 'builtin';
                    const active = newAgentToolIds.has(t.toolId);
                    return (
                      <label
                        key={t.toolId}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 14,
                          border: `1px solid ${active ? '#34c759' : '#d1d1d6'}`,
                          background: active ? '#34c75922' : '#fff',
                          color: active ? '#34c759' : '#6e6e73',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleAgentTool(t.toolId)}
                          style={{ display: 'none' }}
                        />
                        🪛 {t.name} <span style={{ fontSize: 10, opacity: 0.7 }}>[{isBuiltin ? '内置' : 'MCP'}]</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleCreateOrUpdateAgent} disabled={!newAgentName.trim()}>
                  {editingAgent ? '保存修改' : '创建智能体'}
                </button>
                <button
                  style={{ background: '#8e8e93' }}
                  onClick={() => {
                    setShowNewAgent(false);
                    setEditingAgent(null);
                    resetAgentForm();
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {agents.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: '#8e8e93' }}>
              暂无智能体 — 智能体可以结合知识库、技能和工具进行问答
            </div>
          ) : (
            agents.map((a) => (
              <div key={a.agentId} className="agent-card" onClick={() => navigate(`/classes/${classId}/agents/${a.agentId}/chat`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>🤖 {a.name}</div>
                    {a.description && (
                      <div style={{ fontSize: 13, color: '#6e6e73', marginBottom: 8 }}>{a.description}</div>
                    )}
                    <div>
                      <span className="tag visibility">{a.visibility === 'all' ? '所有人可见' : '仅教师'}</span>
                      {a.kbCount ? <span className="tag kb">📚 {a.kbCount} 个知识库</span> : null}
                      {a.skillCount ? <span className="tag skill">⚡ {a.skillCount} 个技能</span> : null}
                      {a.toolCount ? <span className="tag" style={{ background: '#34c75922', color: '#34c759', border: '1px solid #34c759' }}>🪛 {a.toolCount} 个工具</span> : null}
                    </div>
                  </div>
                  {isTeacherOrAdmin && (
                    <div style={{ display: 'flex', gap: 8, marginLeft: 12 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => startEditAgent(a)}
                        style={{ padding: '4px 12px', fontSize: 12, background: '#ff9500' }}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteAgent(a.agentId)}
                        style={{ padding: '4px 12px', fontSize: 12, background: '#ff3b30' }}
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'tools' && isTeacherOrAdmin && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>工具列表</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadTools}>刷新</button>
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {tools.length === 0 ? (
              <div style={{ padding: 20, color: '#8e8e93', textAlign: 'center' }}>
                暂无工具 — 内置工具会自动初始化，MCP 导入的工具可在 MCP Servers 标签页批量导入
              </div>
            ) : (
              tools.map((t) => {
                const isBuiltin = t.source === 'builtin';
                const boundAgents = agents.filter((a) => a.tools?.some((at) => at.toolId === t.toolId));
                return (
                  <div key={t.toolId} className="list-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        🪛 {t.name}
                        <span style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 8,
                          background: isBuiltin ? '#34c75922' : '#007aff22',
                          color: isBuiltin ? '#34c759' : '#007aff',
                        }}>
                          {isBuiltin ? '内置' : 'MCP'}
                        </span>
                      </div>
                      {t.description && (
                        <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 2 }}>{t.description}</div>
                      )}
                      {t.handlerKey && (
                        <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 2 }}>handler: {t.handlerKey}</div>
                      )}
                      {!t.enabled && (
                        <div style={{ fontSize: 11, color: '#ff3b30', marginTop: 2 }}>已禁用</div>
                      )}
                      {boundAgents.length > 0 && (
                        <div style={{ fontSize: 11, color: '#34c759', marginTop: 4 }}>
                          已绑定: {boundAgents.map((a) => a.name).join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {boundAgents.length === 0 && agents.length > 0 && (
                        <select
                          onChange={(e) => { if (e.target.value) { handleBindTool(t.toolId, e.target.value); e.target.value = ''; } }}
                          defaultValue=""
                          style={{ padding: '4px 6px', fontSize: 12 }}
                        >
                          <option value="" disabled>绑定到 Agent</option>
                          {agents.map((a) => (
                            <option key={a.agentId} value={a.agentId}>{a.name}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handleDeleteTool(t.toolId)}
                        style={{ padding: '4px 12px', fontSize: 12, background: '#ff3b30' }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === 'mcps' && isTeacherOrAdmin && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>MCP Servers</h4>
            {!showNewMcp && <button onClick={() => setShowNewMcp(true)}>+ 注册 MCP Server</button>}
          </div>

          {showNewMcp && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h4 style={{ marginTop: 0 }}>注册 MCP Server</h4>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>名称 *</label>
              <input
                type="text"
                value={newMcpName}
                onChange={(e) => setNewMcpName(e.target.value)}
                placeholder="例如：本地算术计算服务"
              />
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>URL *</label>
              <input
                type="text"
                value={newMcpUrl}
                onChange={(e) => setNewMcpUrl(e.target.value)}
                placeholder="https://your-mcp-server.com/mcp"
              />
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>传输协议</label>
              <select value={newMcpTransport} onChange={(e) => setNewMcpTransport(e.target.value as any)}>
                <option value="http">HTTP (Streamable Transport)</option>
                <option value="sse">SSE (Server-Sent Events)</option>
              </select>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>认证方式</label>
              <select value={newMcpAuthType} onChange={(e) => setNewMcpAuthType(e.target.value as any)}>
                <option value="none">无认证</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key (自定义 Header)</option>
                <option value="basic">Basic Auth</option>
              </select>
              {newMcpAuthType !== 'none' && (
                <>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>authConfig (JSON)</label>
                  <textarea
                    value={newMcpAuthConfig}
                    onChange={(e) => setNewMcpAuthConfig(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d1d6', borderRadius: 8, fontSize: 14, marginBottom: 12, resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder={newMcpAuthType === 'bearer' ? '{"token": "your-token"}' : newMcpAuthType === 'api_key' ? '{"header": "X-API-Key", "value": "your-key"}' : '{"username": "user", "password": "pass"}'}
                  />
                </>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreateMcp} disabled={!newMcpName.trim() || !newMcpUrl.trim()}>
                  注册
                </button>
                <button style={{ background: '#8e8e93' }} onClick={() => { setShowNewMcp(false); setNewMcpName(''); setNewMcpUrl(''); setNewMcpTransport('http'); setNewMcpAuthType('none'); setNewMcpAuthConfig(''); }}>
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            {mcps.length === 0 ? (
              <div style={{ padding: 20, color: '#8e8e93', textAlign: 'center' }}>
                暂无 MCP Server — 注册后可测试连接并批量导入远端工具
              </div>
            ) : (
              mcps.map((m) => (
                <div key={m.mcpServerId} className="list-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>🔌 {m.name}</div>
                    <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 2, wordBreak: 'break-all' }}>{m.url}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 8,
                          background: m.status === 'connected' ? '#34c75922' : m.status === 'error' ? '#ff3b3022' : '#8e8e9322',
                          color: m.status === 'connected' ? '#34c759' : m.status === 'error' ? '#ff3b30' : '#8e8e93',
                        }}
                      >
                        {m.status === 'connected' ? '● 已连接' : m.status === 'error' ? '● 错误' : '○ 未测试'}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 8,
                          background: m.transport === 'sse' ? '#af52de22' : '#007aff22',
                          color: m.transport === 'sse' ? '#af52de' : '#007aff',
                        }}
                      >
                        {m.transport?.toUpperCase() || 'HTTP'}
                      </span>
                      <span style={{ fontSize: 11, color: '#8e8e93' }}>auth: {m.authType}</span>
                      {m.lastError && (
                        <span style={{ fontSize: 11, color: '#ff3b30' }}>{m.lastError}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleTestMcp(m.mcpServerId)} style={{ padding: '4px 12px', fontSize: 12 }}>
                      测试连接
                    </button>
                    <button onClick={() => handleImportMcpTools(m.mcpServerId)} style={{ padding: '4px 12px', fontSize: 12, background: '#007aff', color: '#fff' }}>
                      批量导入
                    </button>
                    <button onClick={() => handleDeleteMcp(m.mcpServerId)} style={{ padding: '4px 12px', fontSize: 12, background: '#ff3b30' }}>
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}