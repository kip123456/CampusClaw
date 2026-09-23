import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import type { LoginResponse } from '../types';

export default function LoginPage() {
  const navigate = useNavigate();
  const [school, setSchool] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', {
        school,
        studentId,
        password,
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/classes');
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 24, textAlign: 'center' }}>🏫 CampusClaw 登录</h1>
      <form className="card" onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>学校</label>
          <input
            type="text"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="如 TestUni"
            required
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>学号</label>
          <input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="如 t001"
            required
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}