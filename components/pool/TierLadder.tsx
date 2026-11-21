import { useTranslations } from 'next-intl';
import { formatNaira, stroopsToNairaCeil } from '@/lib/format';
import { tierIndex } from '@/lib/pricing';
import type { Tier } from '@/lib/types';

/** Every price break, where the pool is now, and how far to the next one. Motivates sharing. */
export function TierLadder({ tiers, totalUnits, ngnPerUsd }: { tiers: Tier[]; totalUnits: number; ngnPerUsd: number | null }) {
  const t = useTranslations('pool');
  const current = tierIndex(tiers.map((x) => ({ minUnits: x.minUnits, unitPrice: BigInt(x.unitPrice) })), totalUnits);
  const price = (s: string) => (ngnPerUsd ? formatNaira(stroopsToNairaCeil(BigInt(s), ngnPerUsd)) : '—');
  return (
    <section aria-labelledby="tiers-h" className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 id="tiers-h" className="mb-3 text-base font-semibold">{t('tiers')}</h2>
      <ol className="space-y-2">
        {tiers.map((x, i) => {
          const reached = current !== null && i <= current;
          const here = current === i || (current === null && i === 0);
          // Status is always spelled out in text (plus a shape), never colour alone. DOM order is
          // tier, price, status, which is also the order a screen reader reads them in.
          const status = here ? 'current' : reached ? 'reached' : 'upcoming';
          const label = status === 'current' ? t('tierCurrent') : status === 'reached' ? t('tierReached') : t('tierUpcoming');
          const row = status === 'current' ? 'bg-emerald-50 ring-2 ring-emerald-700 border border-transparent'
            : status === 'reached' ? 'bg-emerald-50 border border-emerald-800'
              : 'bg-neutral-50 border border-dashed border-neutral-500';
          return (
            <li key={x.minUnits} data-testid="tier" data-reached={reached} data-status={status} aria-current={here ? "true" : undefined} className={`flex min-h-12 items-center justify-between gap-2 rounded-lg px-3 py-2 ${row}`}>
              <span className="text-sm">{x.minUnits}+ units</span>
              <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                <span className="font-semibold">{price(x.unitPrice)}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${status === 'current' ? 'bg-emerald-800 text-white' : status === 'reached' ? 'text-emerald-900' : 'text-neutral-700'}`}>
                  <span aria-hidden="true">{status === 'reached' ? '✓ ' : status === 'upcoming' ? '○ ' : '● '}</span>{label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
