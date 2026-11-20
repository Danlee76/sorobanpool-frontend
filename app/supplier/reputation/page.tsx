'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useRequireAuth } from '@/lib/auth';
import { getSupplierReputation } from '@/lib/api';
import { SupplierReputation } from '@/lib/types';

function StarRating({ score }: { score: number }) {
  const filled = Math.round(score);
  return (
    <span className="flex gap-0.5" aria-label={`${score} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          viewBox="0 0 20 20"
          fill={n <= filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={1.5}
          className={`h-5 w-5 ${n <= filled ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function SupplierReputationPage() {
  const t = useTranslations('supplier.reputation');
  const auth = useRequireAuth();

  const { data, isLoading, error } = useQuery<SupplierReputation>({
    queryKey: ['supplier-reputation', auth?.address],
    queryFn: () => getSupplierReputation(auth!.address),
    enabled: !!auth,
  });

  if (!auth) return null;

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-gray-500 dark:text-gray-400">{t('loading')}</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-red-600 dark:text-red-400">{t('loadError')}</p>
      </main>
    );
  }

  const winRate =
    data.totalDisputes > 0
      ? Math.round((data.disputesWon / data.totalDisputes) * 100)
      : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
      </div>

      <section className="space-y-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 flex flex-col items-center gap-3">
          <p className="text-5xl font-bold text-gray-900 dark:text-gray-100">
            {data.averageRating.toFixed(1)}
          </p>
          <StarRating score={data.averageRating} />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('basedOn', { count: data.totalRatings })}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard
            label={t('completedPoolsStat')}
            value={data.completedPools}
          />
          <StatCard
            label={t('onTimeStat')}
            value={`${data.onTimeDeliveryPct}%`}
            sub={t('onTimeSub')}
          />
          {winRate !== null ? (
            <StatCard
              label={t('disputeWinRateStat')}
              value={`${winRate}%`}
              sub={t('disputeWinRateSub', { won: data.disputesWon, total: data.totalDisputes })}
            />
          ) : (
            <StatCard label={t('disputesStat')} value={t('noDisputes')} />
          )}
        </div>
      </section>

      {data.recentRatings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('recentRatingsSection')}
          </h2>
          <ul className="space-y-3">
            {data.recentRatings.map((r, i) => (
              <li
                key={i}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <StarRating score={r.score} />
                  <span className="text-xs text-gray-400">
                    {new Date(r.ratedAt).toLocaleDateString()}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{r.comment}"</p>
                )}
                {r.itemName && (
                  <p className="text-xs text-gray-400">{r.itemName}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.disputeHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('disputeHistorySection')}
          </h2>
          <ul className="space-y-3">
            {data.disputeHistory.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {d.itemName ?? t('unknownItem')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(d.resolvedAt ?? d.openedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      d.outcome === 'WON'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : d.outcome === 'LOST'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {t(`outcome${d.outcome}`)}
                  </span>
                </div>
                {d.resolution && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('resolutionLabel')}: {t(`resolution${d.resolution}`)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.recentRatings.length === 0 && data.disputeHistory.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('noHistory')}</p>
      )}
    </main>
  );
}
