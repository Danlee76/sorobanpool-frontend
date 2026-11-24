'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNaira } from '@/lib/format';
import { payPreview, type Tier } from '@/lib/pricing';

export interface RefundEstimateProps {
  /** Current pool total units */
  totalUnits: number;
  /** Number of units the user is considering */
  units: number;
  /** Tier ladder from the pool */
  tiers: readonly Tier[];
  /** Naira per USD conversion rate */
  ngnPerUsd: number;
  /** Optional: Convert stroops to naira */
  toNaira: (stroops: bigint) => bigint;
}

/**
 * Shows 'what you pay vs what you may get back' explainer with a worked example
 * for the current tier ladder. Uses pricing.ts only, no new maths.
 */
export function RefundEstimate({ totalUnits, units, tiers, ngnPerUsd, toNaira }: RefundEstimateProps) {
  const t = useTranslations('pool');
  const [isOpen, setIsOpen] = useState(false);
  const locale = useLocale();

  if (tiers.length === 0) return null;

  const preview = payPreview(tiers, totalUnits, units);
  
  // Calculate what happens at each tier break
  const breakpoints = tiers
    .slice(1) // Skip first tier
    .map((tier, idx) => {
      const currentTotal = totalUnits + units;
      if (tier.minUnits <= currentTotal) {
        // Already at or past this break
        return null;
      }
      
      const unitsToBreak = tier.minUnits - currentTotal;
      const priceAtBreak = tier.unitPrice;
      const refundAtBreak = preview.maxNow - priceAtBreak * BigInt(units);
      
      return {
        tierName: `${tier.minUnits}+ units`,
        unitsToGo: unitsToBreak,
        unitPrice: priceAtBreak,
        refund: refundAtBreak,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const maxNowNaira = toNaira(preview.maxNow);
  const expectedRefundNaira = toNaira(preview.expectedRefund);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-emerald-800 px-4 font-semibold text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
      >
        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        How refunds work
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-labelledby="refund-dialog-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between">
              <h2 id="refund-dialog-title" className="text-xl font-bold">
                What you pay vs what you may get back
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="flex min-h-12 min-w-12 items-center justify-center rounded-lg p-2 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
              >
                <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 p-4">
                <h3 className="mb-2 font-semibold">{t('refundRightNow', { count: units })}</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-neutral-700">Maximum you pay:</dt>
                    <dd className="font-bold">{formatNaira(maxNowNaira, locale)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-700">Expected refund if pool closes now:</dt>
                    <dd className="font-semibold text-emerald-900">{formatNaira(expectedRefundNaira, locale)}</dd>
                  </div>
                </dl>
              </div>

              {breakpoints.length > 0 && (
                <div>
                  <h3 className="mb-3 font-semibold">As more people join</h3>
                  <p className="mb-3 text-sm text-neutral-700">
                    The price per unit drops at each tier break. Here's what you could get back:
                  </p>
                  <div className="space-y-2">
                    {breakpoints.map((bp, idx) => {
                      const refundNaira = toNaira(bp.refund);
                      return (
                        <div key={idx} className="rounded-lg border border-neutral-200 bg-white p-3">
                          <p className="mb-1 text-sm font-medium">{bp.tierName}</p>
                          <p className="mb-2 text-xs text-neutral-600">
                            {t('refundUnitsNeeded', { count: bp.unitsToGo })}
                          </p>
                          <dl className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <dt className="text-neutral-700">Refund:</dt>
                              <dd className="font-semibold text-emerald-900">{formatNaira(refundNaira, locale)}</dd>
                            </div>
                          </dl>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-blue-50 p-4 text-sm">
                <h4 className="mb-2 font-semibold">How it works</h4>
                <ul className="list-inside list-disc space-y-1 text-neutral-700">
                  <li>You pay the highest possible price upfront</li>
                  <li>When more people join, the unit price drops</li>
                  <li>After the pool closes, you get a refund for the difference</li>
                  <li>The organizer processes refunds along with delivery</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="min-h-12 w-full rounded-xl bg-emerald-800 font-bold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
