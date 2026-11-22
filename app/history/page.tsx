'use client';
import { UserText } from '@/components/ui/UserText';
import { PoolListItemSkeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { FINAL_STATES } from '@/lib/timeline';
import type { PoolCard } from '@/lib/types';

/** Trader history (brief 8.4): finished group buys, newest deadline first; each opens the pool page for refunds or reports. */
export default function History() {
  const t = useTranslations('history');
  const states = useTranslations('states');
  const common = useTranslations('common');
  const { ready } = useRequireAuth();
  const q = useQuery({ queryKey: ['pools', 'mine'], queryFn: () => api<PoolCard[]>('/pools?mine=true'), enabled: ready });
  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;
  
  if (!ready || q.isLoading) {
    return (
      <div className="page-enter space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-neutral-700">{t('lead')}</p>
        </div>
        <ul className="space-y-3" aria-label="Loading history">
          {[...Array(4)].map((_, i) => (
            <li key={i}>
              <PoolListItemSkeleton />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const done = (q.data ?? []).filter((p) => FINAL_STATES.includes(p.state)).sort((a, b) => b.fillDeadline.localeCompare(a.fillDeadline));
  return (
    <div className="page-enter space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-neutral-700">{t('lead')}</p>
      </div>
      {done.length === 0 && <p className="text-neutral-700">{t('empty')}</p>}
      <ul className="space-y-3">
        {done.map((p) => (
          <li key={p.id}>
            <div className="space-y-2">
              <Link href={`/pools/${p.id}`} className="pool-card block min-h-12 rounded-2xl border border-neutral-200 bg-white p-5">
                <UserText as="p" className="font-semibold" value={p.title} />
                <p className="text-sm text-neutral-700">{states(p.state)} · {new Date(p.fillDeadline).toLocaleDateString()}</p>
              </Link>
              {p.state === 'Settled' && (
                <Link
                  href={`/history/${p.id}/receipt`}
                  className="block rounded-xl border border-emerald-700 bg-white px-4 py-2 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  {t('viewReceipt')}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
