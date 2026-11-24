'use client';
import { useLocale, useTranslations } from 'next-intl';
import { formatUsdNumber } from '@/lib/format';

interface RefundBreakdownProps {
  tierDifferenceRefund?: string;
  shortfallRefund?: string;
  disputeRefund?: string;
}

export function RefundBreakdown({ tierDifferenceRefund, shortfallRefund, disputeRefund }: RefundBreakdownProps) {
  const t = useTranslations('refundBreakdown');
  const locale = useLocale();

  const tierAmount = tierDifferenceRefund ? parseFloat(tierDifferenceRefund) : 0;
  const shortfallAmount = shortfallRefund ? parseFloat(shortfallRefund) : 0;
  const disputeAmount = disputeRefund ? parseFloat(disputeRefund) : 0;

  const total = tierAmount + shortfallAmount + disputeAmount;

  // If no refund amounts, don't render anything
  if (total === 0) return null;

  return (
    <section
      aria-labelledby="refund-breakdown-h"
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <h2 id="refund-breakdown-h" className="font-semibold">
        {t('title')}
      </h2>
      <div className="space-y-2 text-sm">
        {tierAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-700">{t('tierDifference')}</span>
            <span className="font-medium">{formatUsdNumber(tierAmount, locale)}</span>
          </div>
        )}
        {shortfallAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-700">{t('shortfall')}</span>
            <span className="font-medium">{formatUsdNumber(shortfallAmount, locale)}</span>
          </div>
        )}
        {disputeAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-700">{t('dispute')}</span>
            <span className="font-medium">{formatUsdNumber(disputeAmount, locale)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold">
          <span>{t('total')}</span>
          <span className="text-emerald-800">{formatUsdNumber(total, locale)}</span>
        </div>
      </div>
    </section>
  );
}
