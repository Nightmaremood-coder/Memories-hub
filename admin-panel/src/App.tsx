import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Login from './pages/Login';

function Nav() {
  const navigate = useNavigate();
  const logout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };
  return (
    <nav style={styles.nav}>
      <span style={styles.logo}>Memories-Hub Admin</span>
      <div style={styles.navLinks}>
        <Link to="/" style={styles.link}>Dashboard</Link>
        <Link to="/users" style={styles.link}>Gebruikers</Link>
        <button onClick={logout} style={styles.logoutBtn}>Uitloggen</button>
      </div>
    </nav>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <PrivateRoute>
          <div>
            <Nav />
            <main style={styles.main}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/users" element={<Users />} />
              </Routes>
            </main>
          </div>
        </PrivateRoute>
      } />
    </Routes>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 24px', height: 56, background: '#1e293b', borderBottom: '1px solid #334155',
  },
  logo: { fontWeight: 700, fontSize: 18, color: '#38bdf8' },
  navLinks: { display: 'flex', gap: 16, alignItems: 'center' },
  link: { color: '#cbd5e1', textDecoration: 'none', fontSize: 14 },
  logoutBtn: {
    background: 'none', border: '1px solid #475569', color: '#cbd5e1',
    borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 14,
  },
  main: { padding: 24, maxWidth: 1200, margin: '0 auto' },
};
