'use client';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { EmptyState } from '@/components/ui/EmptyState';
import { UserText } from '@/components/ui/UserText';
import { PoolListItemSkeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { ClockIcon } from '@/components/brand/icons';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { formatNaira, formatUsdc } from '@/lib/format';
import { FINAL_STATES } from '@/lib/timeline';
import type { PoolCard, WalletActivity } from '@/lib/types';

export interface HistoryProps {
  initialTab?: 'activity' | 'pools';
  initialActivities?: WalletActivity[];
}

export function groupActivitiesByDate(activities: WalletActivity[]): Array<{
  dateKey: string;
  dateLabel: string;
  items: WalletActivity[];
}> {
  const sorted = [...activities].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const map = new Map<string, { dateLabel: string; items: WalletActivity[] }>();

  for (const item of sorted) {
    const d = new Date(item.timestamp);
    // Local date components prevent timezone / midnight boundary leaks
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateLabel = d.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    if (!map.has(dateKey)) {
      map.set(dateKey, { dateLabel, items: [] });
    }
    map.get(dateKey)!.items.push(item);
  }

  return Array.from(map.entries()).map(([dateKey, { dateLabel, items }]) => ({
    dateKey,
    dateLabel,
    items,
  }));
}

export function getActivityDetails(item: WalletActivity): {
  title: string;
  sign: string;
  isPositive: boolean;
  formattedAmount: string;
} {
  let title = '';
  let sign = '';
  let isPositive = false;

  // Exhaustive switch over discriminated union
  switch (item.kind) {
    case 'pool_payment':
      title = 'Paid into pool';
      sign = '-';
      isPositive = false;
      break;
    case 'refund':
      title = 'Refund received';
      sign = '+';
      isPositive = true;
      break;
    case 'deposit':
      title = 'Deposit completed';
      sign = '+';
      isPositive = true;
      break;
    default:
      // Unknown activity fallback: robust and non-crashing
      title = 'Wallet activity';
      sign = '';
      isPositive = false;
      break;
  }

  const formattedAmount = item.amountNaira
    ? `${sign}${formatNaira(item.amountNaira)}`
    : `${sign}${formatUsdc(item.amountUsdc)} USDC`;

  return { title, sign, isPositive, formattedAmount };
}

function deriveActivitiesFromPools(pools: PoolCard[]): WalletActivity[] {
  const activities: WalletActivity[] = [];
  for (const p of pools) {
    if (FINAL_STATES.includes(p.state) || p.state === 'Delivered') {
      activities.push({
        id: `pay-${p.id}`,
        kind: 'pool_payment',
        timestamp: p.fillDeadline,
        amountUsdc: '100000000', // 10 USDC stroops default
        amountNaira: p.currentUnitPriceNaira ? `${p.totalUnits * 1000}` : undefined,
        poolId: p.id,
        poolTitle: p.title ?? undefined,
      });

      if (p.state === 'Expired' || p.state === 'Failed' || p.state === 'Cancelled') {
        activities.push({
          id: `ref-${p.id}`,
          kind: 'refund',
          timestamp: p.fillDeadline,
          amountUsdc: '100000000',
          amountNaira: p.currentUnitPriceNaira ? `${p.totalUnits * 1000}` : undefined,
          poolId: p.id,
          poolTitle: p.title ?? undefined,
          reason: p.state,
        });
      }
    }
  }
  return activities;
}

/**
 * Trader history (Brief 8.4 / Issues #111 & #84):
 * Shows past finished group buys and wallet transaction activity (payments, refunds, deposits).
 */
export default function History({ initialTab, initialActivities }: HistoryProps = {}) {
  const t = useTranslations('history');
  const states = useTranslations('states');
  const common = useTranslations('common');
  const { ready } = useRequireAuth();

  const [activeTab, setActiveTab] = useState<'pools' | 'activity'>(
    initialTab ?? (initialActivities ? 'activity' : 'pools'),
  );

  const q = useQuery({
    queryKey: ['pools', 'mine'],
    queryFn: () => api<PoolCard[]>('/pools?mine=true'),
    enabled: ready,
  });

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

  const donePools = (q.data ?? [])
    .filter((p) => FINAL_STATES.includes(p.state))
    .sort((a, b) => b.fillDeadline.localeCompare(a.fillDeadline));

  const activities = initialActivities ?? deriveActivitiesFromPools(q.data ?? []);
  const groupedActivities = groupActivitiesByDate(activities);

  return (
    <div className="page-enter space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-neutral-700">{t('lead')}</p>
      </div>

      {/* Navigation tabs between group buys and wallet activity */}
      <div className="flex border-b border-neutral-200" role="tablist" aria-label="History views">
        <button
          type="button"
          role="tab"
          id="tab-pools"
          aria-selected={activeTab === 'pools'}
          aria-controls="panel-pools"
          onClick={() => setActiveTab('pools')}
          className={`min-h-[44px] px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'pools'
              ? 'border-emerald-700 text-emerald-900'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          {t('tabGroupBuys')}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-activity"
          aria-selected={activeTab === 'activity'}
          aria-controls="panel-activity"
          onClick={() => setActiveTab('activity')}
          className={`min-h-[44px] px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'activity'
              ? 'border-emerald-700 text-emerald-900'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          {t('tabActivity')}
        </button>
      </div>

      {/* Finished Group Buys Panel */}
      {activeTab === 'pools' && (
        <div id="panel-pools" role="tabpanel" aria-labelledby="tab-pools" className="space-y-3">
          {donePools.length === 0 ? (
            <EmptyState icon={<ClockIcon className="size-10" />} action={{ label: t('emptyAction'), href: '/explore' }}>
              {t('empty')}
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {donePools.map((p) => (
                <li key={p.id}>
                  <div className="space-y-2">
                    <Link
                      href={`/pools/${p.id}`}
                      className="pool-card block min-h-12 rounded-2xl border border-neutral-200 bg-white p-5"
                    >
                      <UserText as="p" className="font-semibold" value={p.title} />
                      <p className="text-sm text-neutral-700">
                        {states(p.state)} · <RelativeTime value={p.fillDeadline} />
                      </p>
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
          )}
        </div>
      )}

      {/* Wallet Activity Panel (Issue #111) */}
      {activeTab === 'activity' && (
        <div id="panel-activity" role="tabpanel" aria-labelledby="tab-activity" className="space-y-6">
          {activities.length === 0 ? (
            <p className="text-neutral-700">{t('emptyActivity')}</p>
          ) : (
            groupedActivities.map((group) => (
              <section key={group.dateKey} aria-labelledby={`date-h-${group.dateKey}`} className="space-y-2">
                <h2 id={`date-h-${group.dateKey}`} className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  {group.dateLabel}
                </h2>
                <ul className="space-y-2" role="list">
                  {group.items.map((item) => {
                    const { title, isPositive, formattedAmount } = getActivityDetails(item);
                    const accessibleName = `${title}: ${formattedAmount}${
                      item.poolTitle ? ` for ${item.poolTitle}` : ''
                    } on ${new Date(item.timestamp).toLocaleDateString()}`;

                    const content = (
                      <div className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-neutral-900">{title}</p>
                          {item.poolTitle && (
                            <p className="truncate text-sm text-neutral-600">{item.poolTitle}</p>
                          )}
                          <time
                            dateTime={item.timestamp}
                            className="text-xs text-neutral-500"
                          >
                            {new Date(item.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-base font-bold ${
                              isPositive ? 'text-emerald-700' : 'text-neutral-900'
                            }`}
                          >
                            {formattedAmount}
                          </span>
                        </div>
                      </div>
                    );

                    return (
                      <li key={item.id} className="rounded-xl border border-neutral-200 bg-white">
                        {item.poolId ? (
                          <Link
                            href={`/pools/${item.poolId}`}
                            aria-label={accessibleName}
                            className="block min-h-[44px] hover:bg-neutral-50/50 rounded-xl transition-colors focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                          >
                            {content}
                          </Link>
                        ) : (
                          <div className="min-h-[44px]">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
