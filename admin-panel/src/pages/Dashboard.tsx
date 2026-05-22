import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/client';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ ...styles.card, borderTop: `3px solid ${accent ?? '#38bdf8'}` }}>
      <div style={styles.cardValue}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  );
}

function StorageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#22c55e';
  return (
    <div style={styles.storageContainer}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>Opslag</span>
        <span style={{ color: '#f1f5f9', fontSize: 13 }}>{formatBytes(used)} / {formatBytes(total)}</span>
      </div>
      <div style={styles.barBg}>
        <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b', marginTop: 4 }}>{pct}% gebruikt</div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats().then(r => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div style={styles.loading}>Laden...</div>;
  if (error) return <div style={styles.err}>Kan statistieken niet laden.</div>;

  const { users, media, storage } = data;

  return (
    <div>
      <h1 style={styles.heading}>Dashboard</h1>

      {users.pending > 0 && (
        <div style={styles.alert}>
          <strong>{users.pending}</strong> account(s) wachten op goedkeuring.
          <a href="/users?status=pending" style={styles.alertLink}> Bekijken →</a>
        </div>
      )}

      <h2 style={styles.subHeading}>Gebruikers</h2>
      <div style={styles.grid}>
        <StatCard label="Totaal" value={users.total} />
        <StatCard label="Actief" value={users.active} accent="#22c55e" />
        <StatCard label="In afwachting" value={users.pending} accent="#f59e0b" />
        <StatCard label="Geblokkeerd" value={users.suspended} accent="#ef4444" />
      </div>

      <h2 style={styles.subHeading}>Media</h2>
      <div style={styles.grid}>
        <StatCard label="Foto's" value={media.total_photos.toLocaleString()} accent="#a78bfa" />
        <StatCard label="Video's" value={media.total_videos.toLocaleString()} accent="#fb7185" />
        <StatCard label="Evenementen" value={media.total_events.toLocaleString()} accent="#34d399" />
        <StatCard label="Categorieën" value={media.total_categories.toLocaleString()} accent="#38bdf8" />
      </div>

      <h2 style={styles.subHeading}>Schijfruimte</h2>
      <StorageBar used={storage.used_bytes} total={storage.total_bytes} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 16, color: '#f1f5f9' },
  subHeading: { fontSize: 16, fontWeight: 600, color: '#94a3b8', margin: '24px 0 12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 },
  card: {
    background: '#1e293b', borderRadius: 8, padding: 20,
    border: '1px solid #334155',
  },
  cardValue: { fontSize: 32, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  cardLabel: { fontSize: 13, color: '#64748b' },
  alert: {
    background: '#422006', border: '1px solid #78350f', color: '#fbbf24',
    padding: '10px 16px', borderRadius: 6, marginBottom: 20, fontSize: 14,
  },
  alertLink: { color: '#fbbf24', fontWeight: 600 },
  storageContainer: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 20,
  },
  barBg: { background: '#0f172a', borderRadius: 4, height: 12, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.5s' },
  loading: { color: '#64748b', padding: 32, textAlign: 'center' },
  err: { color: '#f87171', padding: 32, textAlign: 'center' },
};
