'use client';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { formatTime, formatUsdc, percent, shortAddress } from '@/lib/format';
import type { RiskOverview } from '@/lib/types';

const WINDOWS = [7, 30, 90] as const;

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alert ? 'border-red-400 bg-red-50' : 'border-neutral-200 bg-white'}`}>
      <p className="text-xs text-neutral-700">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default function Risk() {
  const locale = useLocale();
  const t = useTranslations('admin');
  const r = useTranslations('admin.risk');
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(7);
  const q = useQuery({
    queryKey: ['admin', 'risk', days],
    queryFn: () => api<RiskOverview>(`/admin/risk/overview?window=${days}`),
    refetchInterval: 30_000,
  });
  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  if (!o) return null;
  const has = (k: string) => o.flags.some((f) => f.kind === k);
  return (
    <div className="space-y-5">
      <div role="group" aria-label={r('window')} className="flex flex-wrap gap-2">
        {WINDOWS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`min-h-12 rounded-lg border px-3 font-medium ${days === d ? 'border-emerald-800 bg-emerald-50 text-emerald-900' : 'border-neutral-300'}`}
          >
            {r('days', { days: d })}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label={r('gmv')} value={`${formatUsdc(o.gmv)} USD`} />
        <Stat label={r('escrow')} value={`${formatUsdc(o.escrowHeld)} USD`} />
        <Stat label={r('failure')} value={percent(o.failureRate7d)} alert={has('FAILURE_RATE')} />
        <Stat label={r('disputeRate')} value={percent(o.dispute7d.rate)} alert={has('DISPUTE_RATE')} />
      </div>
      <section aria-labelledby="flags-h"><h2 id="flags-h" className="mb-2 font-semibold">{r('flags')}</h2>
        {o.flags.length === 0 ? <p className="text-neutral-700">{r('noFlags')}</p> : <ul className="space-y-2">{o.flags.map((f, i) => <li key={i} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm">{f.message}</li>)}</ul>}
      </section>
      <section aria-labelledby="sup-h"><h2 id="sup-h" className="mb-2 font-semibold">{r('suppliers')}</h2>
        <ul className="space-y-1">{o.bySupplier.slice(0, 10).map((s) => <li key={s.supplier} className="flex justify-between rounded-lg bg-white p-3 text-sm"><span>{shortAddress(s.supplier)} · {r('pools', { count: s.pools })}</span><strong>{percent(s.disputeRate)}</strong></li>)}</ul>
      </section>
      <section aria-labelledby="pair-h"><h2 id="pair-h" className="mb-2 font-semibold">{r('pairs')}</h2>
        <ul className="space-y-1">{o.pairs.slice(0, 10).map((p) => <li key={`${p.organizer}${p.supplier}`} className="flex justify-between rounded-lg bg-white p-3 text-sm"><span>{shortAddress(p.organizer)} → {shortAddress(p.supplier)}</span><span>{r('pools', { count: p.pools })} · {percent(p.shareOfOrganizer, 0)}</span></li>)}</ul>
      </section>
      <p className="text-xs text-neutral-700">{t('title')} · {formatTime(o.generatedAt, locale)}</p>
    </div>
  );
}
