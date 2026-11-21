'use client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { disputeOverview, formatDuration, type DisputeLike } from '@/lib/adminView';

const WINDOWS = [7, 30, 90] as const;

export default function AdminDisputes() {
  const t = useTranslations('admin');
  const q = useQuery({
    queryKey: ['admin', 'disputes'],
    queryFn: () => api<(DisputeLike & { claimedAmount: string; msToSla?: number })[]>('/admin/disputes'),
  });
  const [windowDays, setWindowDays] = useState<(typeof WINDOWS)[number]>(30);

  const overview = useMemo(
    () => (q.data ? disputeOverview(q.data, windowDays) : null),
    [q.data, windowDays],
  );

  if (q.error) return <ErrorExplainer error={q.error} />;
  if (q.data?.length === 0) return <p className="text-neutral-700">{t('empty')}</p>;
  if (!overview) return null;

  const maxOpen = Math.max(1, ...overview.workload.map((w) => w.open));

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm font-medium">
        Time window
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value) as (typeof WINDOWS)[number])}
          className="min-h-10 rounded-lg border border-neutral-300 px-2"
        >
          {WINDOWS.map((d) => (
            <option key={d} value={d}>Last {d} days</option>
          ))}
        </select>
      </label>

      <section aria-labelledby="dispute-summary" className="space-y-2">
        <h2 id="dispute-summary" className="font-semibold">Summary</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Opened" value={String(overview.total)} />
          <Stat label="Open" value={String(overview.counts.OPEN)} />
          <Stat label="Resolved" value={String(overview.counts.RESOLVED)} />
          <Stat label="Timed out" value={String(overview.counts.TIMED_OUT)} />
          <Stat label="Avg resolution" value={formatDuration(overview.avgResolutionMs)} />
        </dl>
      </section>

      <section aria-labelledby="sla-breaches" className="space-y-2">
        <h2 id="sla-breaches" className="font-semibold">SLA breaches ({overview.breached.length})</h2>
        {overview.breached.length === 0 ? (
          <p className="text-sm text-neutral-700">No open disputes are past their SLA.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">SLA breaches</caption>
              <thead>
                <tr className="border-b border-neutral-300">
                  <th scope="col" className="py-2 pr-3">Dispute</th>
                  <th scope="col" className="py-2 pr-3">Pool</th>
                  <th scope="col" className="py-2 pr-3">SLA due</th>
                  <th scope="col" className="py-2">Arbiter</th>
                </tr>
              </thead>
              <tbody>
                {overview.breached.map((d) => (
                  <tr key={d.id} className="border-b border-neutral-200">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <a href={`#dispute-${d.id}`} className="font-semibold underline">#{d.id}</a>
                    </th>
                    <td className="py-2 pr-3">{d.poolId}</td>
                    <td className="py-2 pr-3">{new Date(d.slaDueAt).toLocaleString()}</td>
                    <td className="py-2">{d.arbiterId ?? 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="arbiter-workload" className="space-y-2">
        <h2 id="arbiter-workload" className="font-semibold">Arbiter workload (open disputes)</h2>
        {overview.workload.length === 0 ? (
          <p className="text-sm text-neutral-700">No open disputes.</p>
        ) : (
          <ul className="space-y-2">
            {overview.workload.map((w) => (
              <li key={w.arbiterId} className="text-sm">
                <div className="flex justify-between">
                  <span>{w.arbiterId}</span>
                  <span className="font-semibold">{w.open} open</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-neutral-200" aria-hidden="true">
                  <div className="h-2 rounded-full bg-emerald-700" style={{ width: `${(w.open / maxOpen) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dispute-list" className="space-y-2">
        <h2 id="dispute-list" className="font-semibold">All disputes</h2>
        <ul className="space-y-3">
          {q.data?.map((d) => (
            <li key={d.id} id={`dispute-${d.id}`} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="font-semibold">#{d.id} · pool {d.poolId} · {d.state}</p>
              <p className="text-sm text-neutral-700">{d.claimedAmount} USD · SLA {new Date(d.slaDueAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <dt className="text-xs text-neutral-700">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
