import { useState } from 'react';
import api from '../api';
import type { User } from '../types';

export default function AdminPage() {
  const [form, setForm] = useState({
    school: '',
    studentId: '',
    password: '',
    role: 'teacher' as 'teacher' | 'student',
    name: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await api.post<User>('/admin/users', form);
      setMessage({ type: 'success', text: `创建成功：${res.data.name} (${res.data.school}/${res.data.studentId})` });
      setRecentUsers((prev) => [res.data, ...prev].slice(0, 5));
      setForm({ school: '', studentId: '', password: '', role: 'teacher', name: '' });
    } catch (err: any) {
      const msg = err.response?.data?.message || '创建失败';
      setMessage({ type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>👤 用户管理</h2>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>创建账户</h3>
        {message && (
          <div
            className={message.type === 'success' ? 'success' : 'error'}
            style={{ marginBottom: 12 }}
          >
            {message.text}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>学校</label>
              <input
                type="text"
                value={form.school}
                onChange={(e) => handleChange('school', e.target.value)}
                placeholder="如 TestUni"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>学号</label>
              <input
                type="text"
                value={form.studentId}
                onChange={(e) => handleChange('studentId', e.target.value)}
                placeholder="如 t001"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>姓名</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="如 张老师"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>角色</label>
              <select
                value={form.role}
                onChange={(e) => handleChange('role', e.target.value)}
                style={{ width: '100%', padding: '8px 12px' }}
              >
                <option value="teacher">教师</option>
                <option value="student">学生</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>密码</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="至少 6 位"
                required
              />
            </div>
          </div>
          <button type="submit" disabled={loading} style={{ marginTop: 16, width: 200 }}>
            {loading ? '创建中...' : '创建账户'}
          </button>
        </form>
      </div>

      {recentUsers.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>最近创建</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e5ea', textAlign: 'left', fontSize: 13, color: '#6e6e73' }}>
                <th style={{ padding: '8px 0' }}>姓名</th>
                <th style={{ padding: '8px 0' }}>角色</th>
                <th style={{ padding: '8px 0' }}>学校/学号</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.userId} style={{ borderBottom: '1px solid #f2f2f7' }}>
                  <td style={{ padding: '8px 0' }}>{u.name}</td>
                  <td style={{ padding: '8px 0' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        background: u.role === 'teacher' ? '#e3f2fd' : '#e8f5e9',
                        color: u.role === 'teacher' ? '#1565c0' : '#2e7d32',
                      }}
                    >
                      {u.role === 'teacher' ? '教师' : '学生'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 0', color: '#6e6e73', fontSize: 13 }}>
                    {u.school} / {u.studentId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}