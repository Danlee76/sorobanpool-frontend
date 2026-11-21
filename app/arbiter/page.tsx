'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { DISPUTE_REASONS, slaBreached, sortAndFilterQueue, type QueueSort } from '@/lib/disputes';
import type { DisputeView } from '@/lib/types';

/** Sort and reason live in the URL, so a filtered queue can be shared and reloaded. */
function ArbiterQueueList() {
  const t = useTranslations('arbiter');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sort: QueueSort = params.get('sort') === 'value' ? 'value' : 'sla';
  const reason = DISPUTE_REASONS.find((r) => r === params.get('reason')) ?? '';
  const q = useQuery({ queryKey: ['arbiter', 'queue'], queryFn: () => api<DisputeView[]>('/arbiter/queue'), refetchInterval: 15_000 });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const rows = q.data ? sortAndFilterQueue(q.data, { sort, reason }) : [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {q.error && <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />}
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col text-sm font-medium">
          {t('sortBy')}
          <select value={sort} onChange={(e) => setParam('sort', e.target.value)} className="min-h-12 rounded-lg border border-neutral-500 px-3">
            <option value="sla">{t('sortSla')}</option>
            <option value="value">{t('sortValue')}</option>
          </select>
        </label>
        <label className="flex flex-col text-sm font-medium">
          {t('reason')}
          <select value={reason} onChange={(e) => setParam('reason', e.target.value)} className="min-h-12 rounded-lg border border-neutral-500 px-3">
            <option value="">{t('reasonAll')}</option>
            {DISPUTE_REASONS.map((r) => <option key={r} value={r}>{t(`reasons.${r}`)}</option>)}
          </select>
        </label>
      </div>
      {q.data?.length === 0 && <p className="text-neutral-700">{t('empty')}</p>}
      {!!q.data?.length && rows.length === 0 && <p className="text-neutral-700">{t('noMatch')}</p>}
      <ul className="space-y-3">
        {rows.map((d) => {
          const breached = slaBreached(d);
          return (
            <li key={d.id}>
              <Link href={`/arbiter/${d.id}`} className="block min-h-12 rounded-xl border border-neutral-200 bg-white p-4">
                <p className="font-semibold">#{d.id} · {d.claimedAmount} USD</p>
                {breached && <span className="my-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-sm font-semibold text-red-900">{t('breachedBadge')}</span>}
                <p className="text-sm text-neutral-700">{breached ? t('slaPassed') : t('sla', { hours: Math.ceil((d.msToSla ?? 0) / 3_600_000) })}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The arbiter layout checks the role before this renders. */
export default function ArbiterQueue() {
  return <Suspense fallback={null}><ArbiterQueueList /></Suspense>;
}
