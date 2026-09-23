import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import type { Material, KnowledgeBase, KBDocument, QueryResult, User, MembersResponse } from '../types';

export default function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const userStr = localStorage.getItem('user');
  const user: User | null = userStr ? JSON.parse(userStr) : null;

  const [tab, setTab] = useState<'materials' | 'kbs' | 'members'>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [activeKb, setActiveKb] = useState<string>('');
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const materialInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [newKbName, setNewKbName] = useState('');
  const [showNewKb, setShowNewKb] = useState(false);

  const [members, setMembers] = useState<MembersResponse>({ teachers: [], students: [] });
  const [memberTab, setMemberTab] = useState<'teachers' | 'students'>('students');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [addSchool, setAddSchool] = useState(user?.school || '');
  const [addStudentId, setAddStudentId] = useState('');
  const [addMsg, setAddMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isTeacherOrAdmin = user && (user.role === 'teacher' || user.role === 'admin');

  useEffect(() => {
    if (tab === 'materials') loadMaterials();
    if (tab === 'kbs') loadKbs();
    if (tab === 'members') loadMembers();
  }, [tab, classId]);

  useEffect(() => {
    if (activeKb && tab === 'kbs') loadDocs();
  }, [activeKb]);

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
      setUploadMsg('文档上传并向量化成功');
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
      const res = await api.post(`/classes/${classId}/kbs`, { name: newKbName.trim() });
      setActiveKb(res.data.kbId);
      setNewKbName('');
      setShowNewKb(false);
      loadKbs();
    } catch (err: any) {
      alert(err.response?.data?.message || '创建失败');
    }
  }

  async function handleQuery() {
    if (!query.trim() || !activeKb) return;
    setLoading(true);
    try {
      const res = await api.post<QueryResult[]>(`/classes/${classId}/kbs/${activeKb}/query`, { query, topK: 5 });
      setQueryResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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

  return (
    <div>
      <Link to="/classes" style={{ color: '#007aff', marginBottom: 16, display: 'inline-block' }}>← 返回班级列表</Link>

      <div className="tabs">
        <div className={`tab ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}>教学资料</div>
        <div className={`tab ${tab === 'kbs' ? 'active' : ''}`} onClick={() => setTab('kbs')}>知识库</div>
        <div className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>成员管理</div>
      </div>

      {uploadMsg && <div className={uploadMsg.includes('成功') ? 'success' : 'error'}>{uploadMsg}</div>}

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
            <h4 style={{ marginBottom: 12 }}>知识库列表</h4>
            {kbs.map((kb) => (
              <div key={kb.kbId} className={`kb-item ${activeKb === kb.kbId ? 'active' : ''}`} onClick={() => setActiveKb(kb.kbId)}>
                {kb.isDefault && '⭐ '}{kb.name}
              </div>
            ))}
            {isTeacherOrAdmin && !showNewKb && (
              <button style={{ marginTop: 12, width: '100%' }} onClick={() => setShowNewKb(true)}>+ 新建知识库</button>
            )}
            {showNewKb && (
              <div style={{ marginTop: 12 }}>
                <input type="text" value={newKbName} onChange={(e) => setNewKbName(e.target.value)} placeholder="知识库名称" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreateKb} style={{ flex: 1 }}>确定</button>
                  <button onClick={() => { setShowNewKb(false); setNewKbName(''); }} style={{ flex: 1, background: '#8e8e93' }}>取消</button>
                </div>
              </div>
            )}
          </div>
          <div>
            {activeKb && (
              <>
                {isTeacherOrAdmin && (
                  <div className="upload-area">
                    <p style={{ marginBottom: 12, color: '#6e6e73' }}>上传文档（PDF/TXT/MD）</p>
                    <input type="file" accept=".pdf,.txt,.md" ref={docInputRef} onChange={handleDocUpload} style={{ display: 'none' }} />
                    <button onClick={() => docInputRef.current?.click()}>选择文件上传</button>
                  </div>
                )}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h4 style={{ marginBottom: 12 }}>知识库文档</h4>
                  {docs.length === 0 ? (
                    <div style={{ color: '#8e8e93' }}>暂无文档</div>
                  ) : (
                    docs.map((d) => (
                      <div key={d.documentId} className="list-item">
                        <div>📄 {d.originalName}</div>
                        <div style={{ fontSize: 12, color: '#8e8e93' }}>{d.chunkCount} chunks</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="card">
                  <h4 style={{ marginBottom: 12 }}>向量检索</h4>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入自然语言查询..." style={{ marginBottom: 0, flex: 1 }} />
                    <button onClick={handleQuery} disabled={loading || !query.trim()}>{loading ? '搜索中...' : '搜索'}</button>
                  </div>
                  {queryResults.map((r, i) => (
                    <div key={i} className="query-result">
                      <div className="chunk">{r.chunk}</div>
                      <div className="distance">distance: {r.distance.toFixed(4)}</div>
                    </div>
                  ))}
                  {queryResults.length === 0 && query && !loading && (
                    <div style={{ color: '#8e8e93', fontSize: 13 }}>无匹配结果</div>
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
    </div>
  );
}