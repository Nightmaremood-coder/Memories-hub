import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@memories-hub.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.login(email, password);
      if (res.data.user.role !== 'admin') {
        setError('Alleen admins hebben toegang tot dit paneel.');
        return;
      }
      localStorage.setItem('access_token', res.data.access_token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Inloggen mislukt.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h1 style={styles.title}>Memories-Hub Admin</h1>
        {error && <div style={styles.error}>{error}</div>}
        <label style={styles.label}>E-mailadres</label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          required style={styles.input}
        />
        <label style={styles.label}>Wachtwoord</label>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          required style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.btn}>
          {loading ? 'Bezig...' : 'Inloggen'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#0f172a',
  },
  form: {
    background: '#1e293b', padding: 32, borderRadius: 8, width: 360,
    display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid #334155',
  },
  title: { color: '#38bdf8', fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 13 },
  input: {
    background: '#0f172a', border: '1px solid #475569', borderRadius: 4,
    color: '#f1f5f9', padding: '8px 12px', fontSize: 14,
  },
  btn: {
    marginTop: 8, background: '#0ea5e9', color: '#fff', border: 'none',
    borderRadius: 4, padding: '10px 0', fontSize: 15, cursor: 'pointer', fontWeight: 600,
  },
  error: { background: '#450a0a', color: '#fca5a5', padding: '8px 12px', borderRadius: 4, fontSize: 13 },
};
