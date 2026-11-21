'use client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { MASK, readableDetails } from '@/lib/adminView';
import { shortAddress } from '@/lib/format';

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
  const t = useTranslations('admin');
  const q = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api<Entry[]>('/admin/audit?limit=100') });

  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);

  const actions = useMemo(() => [...new Set((q.data ?? []).map((e) => e.action))].sort(), [q.data]);

  const filtered = useMemo(() => {
    const needle = actor.trim().toLowerCase();
    const fromMs = from ? Date.parse(from) : null;
    return (q.data ?? []).filter((e) => {
      if (needle && !e.actorId.toLowerCase().includes(needle)) return false;
      if (action && e.action !== action) return false;
      if (fromMs !== null && Date.parse(e.at) < fromMs) return false;
      return true;
    });
  }, [q.data, actor, action, from]);

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

      <ul className="space-y-2">
        {shown.map((e) => {
          const isOpen = expanded === e.id;
          const rows = readableDetails(e.data);
          return (
            <li key={e.id} className="rounded-lg bg-white p-3 text-sm" data-testid="audit-entry">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`audit-details-${e.id}`}
                onClick={() => setExpanded(isOpen ? null : e.id)}
                className="flex w-full min-h-10 items-start justify-between gap-2 text-left"
              >
                <span>
                  <strong>{e.action}</strong> · {e.target}
                  <span className="block text-xs text-neutral-700">
                    {shortAddress(e.actorId)} · {new Date(e.at).toLocaleString()}
                  </span>
                </span>
                <span aria-hidden="true" className="text-neutral-700">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div id={`audit-details-${e.id}`} className="mt-2 border-t border-neutral-200 pt-2">
                  <p className="text-xs text-neutral-700">Actor {shortAddress(e.actorId)}</p>
                  {rows.length === 0 ? (
                    <p className="text-xs text-neutral-700">No additional details.</p>
                  ) : (
                    <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                      {rows.map((r) => (
                        <div key={r.key} className="contents">
                          <dt className="text-neutral-700 capitalize">{r.label}</dt>
                          <dd className={r.value === MASK ? 'font-mono' : 'break-all'}>{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

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
