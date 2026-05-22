import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/client';

type UserStatus = 'pending' | 'active' | 'suspended';

const STATUS_LABELS: Record<UserStatus, string> = {
  pending: 'In afwachting',
  active: 'Actief',
  suspended: 'Geblokkeerd',
};

const STATUS_COLORS: Record<UserStatus, string> = {
  pending: '#f59e0b',
  active: '#22c55e',
  suspended: '#ef4444',
};

export default function Users() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', statusFilter, page],
    queryFn: () => adminApi.getUsers({ status: statusFilter || undefined, page, limit: 25 }).then(r => r.data),
  });

  const mutateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => adminApi.setUserStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const mutateDelete = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.heading}>Gebruikers</h1>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={styles.select}
        >
          <option value="">Alle statussen</option>
          <option value="pending">In afwachting</option>
          <option value="active">Actief</option>
          <option value="suspended">Geblokkeerd</option>
        </select>
      </div>

      {isLoading && <div style={styles.loading}>Laden...</div>}

      {!isLoading && data && (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Gebruikersnaam', 'E-mail', 'Rol', 'Status', 'Geregistreerd', 'Acties'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((user: any) => (
                  <tr key={user.id} style={styles.tr}>
                    <td style={styles.td}>{user.username}</td>
                    <td style={styles.td}>{user.email}</td>
                    <td style={styles.td}>{user.role}</td>
                    <td style={styles.td}>
                      <span style={{ color: STATUS_COLORS[user.status as UserStatus] ?? '#94a3b8', fontSize: 13 }}>
                        ● {STATUS_LABELS[user.status as UserStatus] ?? user.status}
                      </span>
                    </td>
                    <td style={styles.td}>{new Date(user.created_at).toLocaleDateString('nl-NL')}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {user.status !== 'active' && (
                          <button
                            onClick={() => mutateStatus.mutate({ id: user.id, status: 'active' })}
                            style={{ ...styles.actionBtn, background: '#166534', color: '#bbf7d0' }}
                          >Goedkeuren</button>
                        )}
                        {user.status !== 'suspended' && (
                          <button
                            onClick={() => mutateStatus.mutate({ id: user.id, status: 'suspended' })}
                            style={{ ...styles.actionBtn, background: '#7c2d12', color: '#fed7aa' }}
                          >Blokkeren</button>
                        )}
                        <button
                          onClick={() => setConfirmDelete(user.id)}
                          style={{ ...styles.actionBtn, background: '#450a0a', color: '#fca5a5' }}
                        >Verwijderen</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.pagination}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              style={styles.pageBtn}
            >← Vorige</button>
            <span style={{ color: '#64748b', fontSize: 13 }}>
              Pagina {page} — {data.total} totaal
            </span>
            <button
              disabled={page * 25 >= data.total}
              onClick={() => setPage(p => p + 1)}
              style={styles.pageBtn}
            >Volgende →</button>
          </div>
        </>
      )}

      {confirmDelete && (
        <div style={styles.modal}>
          <div style={styles.modalBox}>
            <p style={{ color: '#f1f5f9', marginBottom: 16 }}>
              Weet je zeker dat je dit account wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={styles.pageBtn}>Annuleren</button>
              <button
                onClick={() => mutateDelete.mutate(confirmDelete)}
                style={{ ...styles.actionBtn, background: '#7f1d1d', color: '#fca5a5', padding: '8px 16px' }}
              >Definitief verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heading: { fontSize: 24, fontWeight: 700, color: '#f1f5f9' },
  select: {
    background: '#1e293b', border: '1px solid #475569', color: '#f1f5f9',
    borderRadius: 4, padding: '6px 10px', fontSize: 14,
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '10px 16px', fontSize: 12,
    color: '#64748b', borderBottom: '1px solid #334155', fontWeight: 600, textTransform: 'uppercase',
  },
  tr: { borderBottom: '1px solid #1e293b' },
  td: { padding: '12px 16px', fontSize: 14, color: '#cbd5e1' },
  actionBtn: {
    border: 'none', borderRadius: 4, padding: '4px 10px',
    fontSize: 12, cursor: 'pointer', fontWeight: 600,
  },
  pagination: { display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'center', marginTop: 20 },
  pageBtn: {
    background: '#1e293b', border: '1px solid #475569', color: '#cbd5e1',
    borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
  },
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  modalBox: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 24, width: 400 },
  loading: { color: '#64748b', padding: 32, textAlign: 'center' },
};
