import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import MyClassesPage from './pages/MyClassesPage';
import ClassDetailPage from './pages/ClassDetailPage';
import AdminPage from './pages/AdminPage';
import Layout from './components/Layout';

function App() {
  const token = localStorage.getItem('token');

  if (!token && window.location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/classes" replace />} />
        <Route path="/classes" element={<MyClassesPage />} />
        <Route path="/classes/:classId" element={<ClassDetailPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}

export default App;