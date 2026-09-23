import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import type { MyClasses, ClassSummary } from '../types';

export default function MyClassesPage() {
  const [data, setData] = useState<MyClasses>({ asTeacher: [], asStudent: [] });
  const [tab, setTab] = useState<'teacher' | 'student'>('teacher');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const userStr = localStorage.getItem('user');
  const role = userStr ? JSON.parse(userStr).role : '';
  const canCreate = role === 'teacher' || role === 'admin';

  const loadClasses = () => {
    api.get<MyClasses>('/classes/me/classes')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg(null);
    try {
      const res = await api.post('/classes', { name: createName, description: createDesc });
      const newClass: ClassSummary = {
        classId: res.data.classId,
        school: res.data.school,
        name: res.data.name,
        description: res.data.description,
        createdAt: Date.now(),
      };
      setData((prev) => ({ ...prev, asTeacher: [newClass, ...prev.asTeacher] }));
      setCreateMsg({ type: 'success', text: `班级 "${createName}" 创建成功！` });
      setCreateName('');
      setCreateDesc('');
      setTimeout(() => {
        setShowCreate(false);
        setCreateMsg(null);
      }, 1500);
    } catch (err: any) {
      setCreateMsg({ type: 'error', text: err.response?.data?.message || '创建失败' });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div>加载中...</div>;
  if (error) return <div className="error">{error}</div>;

  const list = tab === 'teacher' ? data.asTeacher : data.asStudent;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>我的班级</h2>
        {canCreate && !showCreate && (
          <button onClick={() => setShowCreate(true)}>+ 创建班级</button>
        )}
        {canCreate && showCreate && (
          <button onClick={() => { setShowCreate(false); setCreateMsg(null); }} style={{ background: '#8e8e93' }}>
            取消
          </button>
        )}
      </div>

      {canCreate && showCreate && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>创建新班级</h3>
          {createMsg && (
            <div className={createMsg.type} style={{ marginBottom: 12 }}>{createMsg.text}</div>
          )}
          <form onSubmit={handleCreate}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>班级名称 *</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="如 高等数学"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>描述（可选）</label>
              <input
                type="text"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="如 2026 秋季学期"
              />
            </div>
            <button type="submit" disabled={creating} style={{ width: 200 }}>
              {creating ? '创建中...' : '创建班级'}
            </button>
          </form>
        </div>
      )}

      <div className="tabs">
        <div className={`tab ${tab === 'teacher' ? 'active' : ''}`} onClick={() => setTab('teacher')}>
          我管理的 ({data.asTeacher.length})
        </div>
        <div className={`tab ${tab === 'student' ? 'active' : ''}`} onClick={() => setTab('student')}>
          我加入的 ({data.asStudent.length})
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card">
          <p>暂无班级</p>
          {canCreate && !showCreate && (
            <button onClick={() => setShowCreate(true)}>+ 创建你的第一个班级</button>
          )}
        </div>
      ) : (
        list.map((cls) => (
          <Link key={cls.classId} to={`/classes/${cls.classId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card">
              <h3>{cls.name}</h3>
              <p>学校: {cls.school}</p>
              {cls.description && <p style={{ marginTop: 4 }}>{cls.description}</p>}
            </div>
          </Link>
        ))
      )}
    </div>
  );
}