import { Outlet, useNavigate } from 'react-router-dom';
import type { User } from '../types';

export default function Layout() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user: User | null = userStr ? JSON.parse(userStr) : null;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="app">
      <nav className="nav">
        <div>
          <strong style={{ marginRight: 16 }}>🏫 CampusClaw</strong>
          <a href="/classes">我的班级</a>
          {user.role === 'admin' && (
            <a href="/admin" style={{ marginLeft: 12 }}>用户管理</a>
          )}
        </div>
        <div>
          <span style={{ marginRight: 16, color: '#6e6e73' }}>
            {user.name} ({user.school}/{user.studentId}) - {user.role}
          </span>
          <button onClick={handleLogout}>退出</button>
        </div>
      </nav>
      <div className="container">
        <Outlet />
      </div>
    </div>
  );
}