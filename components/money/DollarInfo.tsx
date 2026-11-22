'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { InfoIcon } from '@/components/brand/icons';
import { formatNaira } from '@/lib/format';

interface DollarInfoProps {
  /** The current naira-per-dollar rate quoted for this pool. */
  ngnPerUsd: number;
  /** When this quote was generated (ISO timestamp). */
  quotedAt?: string;
}

/**
 * Info button opening a bottom sheet explaining that prices are fixed in USD,
 * naira is an estimate, and the exchange rate at payment is final.
 * Accessible with proper focus management and escape-key dismissal.
 */
export function DollarInfo({ ngnPerUsd, quotedAt }: DollarInfoProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('money');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('dollarInfoLabel')}
        className="inline-flex items-center gap-1 text-sm text-neutral-700 hover:text-neutral-900"
      >
        <InfoIcon className="size-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dollar-info-h"
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          onKeyDown={handleKeyDown}
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h2 id="dollar-info-h" className="text-lg font-bold">
              {t('dollarInfoTitle')}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700">
              <p>{t('dollarInfoExplain')}</p>
              <p>{t('dollarInfoRate')}</p>
              {ngnPerUsd && (
                <p className="rounded-lg bg-neutral-100 p-3">
                  <span className="font-semibold text-neutral-900">
                    ₦{formatNaira(BigInt(Math.round(ngnPerUsd * 100)))} per $1
                  </span>
                  {quotedAt && (
                    <span className="mt-1 block text-xs text-neutral-600">
                      {t('dollarInfoQuotedAt', {
                        time: new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(quotedAt)),
                      })}
                    </span>
                  )}
                </p>
              )}
              <p>{t('dollarInfoFinal')}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 min-h-12 w-full rounded-xl bg-emerald-800 font-semibold text-white"
            >
              {t('dollarInfoClose')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
