import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, apiClient } from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiClient.post('/auth/register', {
        username,
        email,
        password,
        display_name: displayName || undefined,
      });
      setSuccess(res.data.message ?? 'Account aangemaakt!');
      if (res.data.role === 'admin') {
        // First user — log in directly
        const loginRes = await adminApi.login(email, password);
        localStorage.setItem('access_token', loginRes.data.access_token);
        navigate('/');
      } else {
        setMode('login');
        setSuccess('Account aangevraagd. Wacht op goedkeuring door de admin.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Registratie mislukt.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.form}>
        <h1 style={styles.title}>Memories-Hub Admin</h1>
        <div style={styles.tabs}>
          <button
            onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
          >Inloggen</button>
          <button
            onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
          >Account aanmaken</button>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.successMsg}>{success}</div>}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} style={styles.fields}>
            <label style={styles.label}>E-mailadres</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required style={styles.input} placeholder="admin@voorbeeld.nl"
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
        ) : (
          <form onSubmit={handleRegister} style={styles.fields}>
            <label style={styles.label}>Gebruikersnaam</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              required style={styles.input} placeholder="jouwusername"
              pattern="[a-zA-Z0-9_]+" title="Alleen letters, cijfers en _"
            />
            <label style={styles.label}>E-mailadres</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required style={styles.input} placeholder="jou@email.nl"
            />
            <label style={styles.label}>Wachtwoord (min. 8 tekens)</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} style={styles.input}
            />
            <label style={styles.label}>Weergavenaam (optioneel)</label>
            <input
              type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              style={styles.input} placeholder="Jan de Vries"
            />
            <p style={styles.hint}>
              Het eerste geregistreerde account wordt automatisch admin.
            </p>
            <button type="submit" disabled={loading} style={styles.btn}>
              {loading ? 'Bezig...' : 'Account aanmaken'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#0f172a',
  },
  form: {
    background: '#1e293b', padding: 32, borderRadius: 8, width: 380,
    display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid #334155',
  },
  title: { color: '#38bdf8', fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 4 },
  tabs: { display: 'flex', borderBottom: '1px solid #334155', marginBottom: 4 },
  tab: {
    flex: 1, padding: '8px 0', background: 'none', border: 'none',
    color: '#64748b', cursor: 'pointer', fontSize: 14, fontWeight: 500,
  },
  tabActive: { color: '#38bdf8', borderBottom: '2px solid #38bdf8' },
  fields: { display: 'flex', flexDirection: 'column', gap: 10 },
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
  successMsg: { background: '#052e16', color: '#86efac', padding: '8px 12px', borderRadius: 4, fontSize: 13 },
  hint: { color: '#64748b', fontSize: 12, margin: 0 },
};
