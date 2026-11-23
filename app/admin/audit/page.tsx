'use client';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { MASK, readableDetails } from '@/lib/adminView';
import { formatDateTime, shortAddress } from '@/lib/format';
import { SortableTh, useAdminSort } from '@/components/admin/SortableTh';

interface Entry {
  id: string;
  actorId: string;
  action: string;
  target: string;
  at: string;
  data?: Record<string, unknown>;
}

const PAGE_SIZE = 20;

export default function Audit() {
  const locale = useLocale();
  const t = useTranslations('admin');
  const q = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api<Entry[]>('/admin/audit?limit=100') });

  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { currentSort, onSort } = useAdminSort();

  const actions = useMemo(() => [...new Set((q.data ?? []).map((e) => e.action))].sort(), [q.data]);

  const filtered = useMemo(() => {
    const needle = actor.trim().toLowerCase();
    const fromMs = from ? Date.parse(from) : null;
    const list = (q.data ?? []).filter((e) => {
      if (needle && !e.actorId.toLowerCase().includes(needle)) return false;
      if (action && e.action !== action) return false;
      if (fromMs !== null && Date.parse(e.at) < fromMs) return false;
      return true;
    });

    if (!currentSort.key || currentSort.direction === 'none') return list;
    const sorted = [...list];
    if (currentSort.key === 'action') {
      sorted.sort((a, b) =>
        currentSort.direction === 'ascending' ? a.action.localeCompare(b.action) : b.action.localeCompare(a.action),
      );
    } else if (currentSort.key === 'target') {
      sorted.sort((a, b) =>
        currentSort.direction === 'ascending' ? a.target.localeCompare(b.target) : b.target.localeCompare(a.target),
      );
    } else if (currentSort.key === 'actor') {
      sorted.sort((a, b) =>
        currentSort.direction === 'ascending' ? a.actorId.localeCompare(b.actorId) : b.actorId.localeCompare(a.actorId),
      );
    } else if (currentSort.key === 'date') {
      sorted.sort((a, b) => {
        const diff = Date.parse(a.at) - Date.parse(b.at);
        return currentSort.direction === 'ascending' ? diff : -diff;
      });
    }
    return sorted;
  }, [q.data, actor, action, from, currentSort]);

  if (q.error) return <ErrorExplainer error={q.error} />;

  const shown = filtered.slice(0, visible);

  return (
    <div className="space-y-4">
      <form className="grid gap-2 rounded-xl bg-white p-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()} aria-label="Audit filters">
        <label className="text-sm">
          <span className="block font-medium">Actor</span>
          <input
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Actor ID"
            className="mt-1 min-h-10 w-full rounded-lg border border-neutral-300 px-2"
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium">Action</span>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="mt-1 min-h-10 w-full rounded-lg border border-neutral-300 px-2"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium">From date</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="mt-1 min-h-10 w-full rounded-lg border border-neutral-300 px-2"
          />
        </label>
      </form>

      {q.data?.length === 0 && <p className="text-neutral-700">{t('empty')}</p>}
      {q.data && q.data.length > 0 && filtered.length === 0 && <p className="text-neutral-700">No entries match these filters.</p>}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Audit log</caption>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <SortableTh sortKey="action" currentSort={currentSort} onSort={onSort}>
                Action
              </SortableTh>
              <SortableTh sortKey="target" currentSort={currentSort} onSort={onSort}>
                Target
              </SortableTh>
              <SortableTh sortKey="actor" currentSort={currentSort} onSort={onSort}>
                Actor
              </SortableTh>
              <SortableTh sortKey="date" currentSort={currentSort} onSort={onSort}>
                Date
              </SortableTh>
              <th scope="col" className="py-3 px-3 font-semibold text-neutral-900">
                Details
              </th>
            </tr>
          </thead>
          {q.isLoading && (
            <tbody>
              <tr>
                <td colSpan={5} className="py-4 text-center text-neutral-700">Loading…</td>
              </tr>
            </tbody>
          )}
          {!q.isLoading && shown.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={5} className="py-4 text-center text-neutral-700">No entries match these filters.</td>
              </tr>
            </tbody>
          )}
          {shown.map((e) => {
            const isOpen = expanded === e.id;
            const rows = readableDetails(e.data);
            return (
              <tbody key={e.id} className="divide-y divide-neutral-200 border-b border-neutral-200 last:border-b-0" data-testid="audit-entry">
                <tr className="hover:bg-neutral-50/50">
                  <th scope="row" className="py-3 px-3 font-semibold text-neutral-900 align-top">
                    {e.action}
                  </th>
                  <td className="py-3 px-3 text-neutral-700 align-top">{e.target}</td>
                  <td className="py-3 px-3 text-neutral-700 align-top">{shortAddress(e.actorId)}</td>
                  <td className="py-3 px-3 text-neutral-700 align-top">{formatDateTime(e.at, locale)}</td>
                  <td className="py-3 px-3 align-top">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`audit-details-${e.id}`}
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                      className="inline-flex min-h-8 items-center gap-1 rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100"
                    >
                      <span>{isOpen ? 'Hide details' : 'View details'}</span>
                      <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={5} id={`audit-details-${e.id}`} className="bg-neutral-50 p-4">
                      <p className="text-xs text-neutral-700">Actor {shortAddress(e.actorId)}</p>
                      {rows.length === 0 ? (
                        <p className="mt-1 text-xs text-neutral-700">No additional details.</p>
                      ) : (
                        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                          {rows.map((r) => (
                            <div key={r.key} className="contents">
                              <dt className="text-neutral-700 capitalize">{r.label}</dt>
                              <dd className={r.value === MASK ? 'font-mono' : 'break-all'}>{r.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>

      {filtered.length > visible && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="min-h-12 w-full rounded-xl border border-neutral-500 font-semibold"
        >
          Show more ({filtered.length - visible} left)
        </button>
      )}
    </div>
  );
}
