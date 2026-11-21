'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Report error if there's an error hook
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-neutral-900">{t('pageError.title')}</h1>
          <p className="text-neutral-600">{t('pageError.message')}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => reset()}
            className="min-h-12 rounded-xl bg-emerald-800 px-6 font-semibold text-white hover:bg-emerald-900"
          >
            {t('pageError.retry')}
          </button>
          <Link
            href="/"
            className="flex min-h-12 items-center justify-center rounded-xl border-2 border-emerald-800 px-6 font-semibold text-emerald-900 hover:bg-emerald-50"
          >
            {t('pageError.home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
