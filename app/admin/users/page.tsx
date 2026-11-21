'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { SortableTh, useAdminSort } from '@/components/admin/SortableTh';

interface UserRow { id: string; phone: string; displayName: string | null; walletAddress: string | null; roles: { role: string; level: number }[] }

export default function Users() {
  const t = useTranslations('admin.users');
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['admin', 'users', q], queryFn: () => api<UserRow[]>(`/admin/users?q=${encodeURIComponent(q)}`) });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<unknown>(null);
  const { currentSort, onSort } = useAdminSort();

  const sortedData = useMemo(() => {
    if (!list.data) return [];
    if (!currentSort.key || currentSort.direction === 'none') return list.data;
    const sorted = [...list.data];
    if (currentSort.key === 'user') {
      sorted.sort((a, b) => {
        const nameA = (a.displayName ?? a.phone).toLowerCase();
        const nameB = (b.displayName ?? b.phone).toLowerCase();
        return currentSort.direction === 'ascending' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      });
    } else if (currentSort.key === 'phone') {
      sorted.sort((a, b) => {
        return currentSort.direction === 'ascending' ? a.phone.localeCompare(b.phone) : b.phone.localeCompare(a.phone);
      });
    }
    return sorted;
  }, [list.data, currentSort]);

  async function run(path: string, body: object) {
    setError(null);
    setMsg('');
    try {
      await api(path, { body });
      setMsg(t('saved'));
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (e) {
      setError(e);
    }
  }

  const btn = 'min-h-12 rounded-lg border border-neutral-500 px-3 text-sm font-semibold hover:bg-neutral-50';

  return (
    <div className="space-y-3">
      <label htmlFor="user-q" className="block font-medium">{t('search')}</label>
      <input id="user-q" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 w-full rounded-lg border border-neutral-500 px-3 text-lg" />
      {list.error && <ErrorExplainer error={list.error} />}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Users list</caption>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <SortableTh sortKey="user" currentSort={currentSort} onSort={onSort}>
                User
              </SortableTh>
              <SortableTh sortKey="phone" currentSort={currentSort} onSort={onSort}>
                Phone
              </SortableTh>
              <th scope="col" className="py-3 px-3 font-semibold text-neutral-900">
                {t('roles')}
              </th>
              <th scope="col" className="py-3 px-3 font-semibold text-neutral-900">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {list.isLoading && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-neutral-700">Loading…</td>
              </tr>
            )}
            {!list.isLoading && sortedData.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-neutral-700">No users found.</td>
              </tr>
            )}
            {sortedData.map((u) => (
              <tr key={u.id} className="hover:bg-neutral-50/50" data-testid="user-row">
                <th scope="row" className="py-3 px-3 font-semibold text-neutral-900 align-top">
                  {u.displayName ?? u.phone}
                </th>
                <td className="py-3 px-3 text-neutral-700 align-top">{u.phone}</td>
                <td className="py-3 px-3 text-neutral-700 align-top">
                  <span className="sr-only">{t('roles')}: </span>
                  {u.roles.map((r) => `${r.role}${r.level ? ` L${r.level}` : ''}`).join(', ')}
                </td>
                <td className="py-3 px-3 align-top">
                  <div className="flex flex-wrap gap-2">
                    {(['ORGANIZER', 'ARBITER'] as const).map((role) => (
                      <button key={role} className={btn} onClick={() => void run(`/admin/users/${u.id}/roles`, { role })}>
                        {t('grant', { role })}
                      </button>
                    ))}
                    {u.walletAddress && (['Trader', 'Organizer'] as const).map((role) => (
                      <button key={role} className={btn} onClick={() => void run(`/admin/users/${u.id}/attest`, { role, level: 1 })}>
                        {t('attest', { role })}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {msg && <p role="status" className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900">{msg}</p>}
      {error !== null && <ErrorExplainer error={error} />}
    </div>
  );
}
