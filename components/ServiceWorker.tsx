'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

/** Registers the service worker (production only) and shows prompts for update notifications. */
export function ServiceWorker() {
  const t = useTranslations('common');
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => setRegistration(reg))
        .catch(() => undefined);
    }
  }, []);

  const { updateReady, applyUpdate, dismissUpdate } = useServiceWorkerUpdate(registration);

  return (
    <>
      {updateReady && (
        <aside
          role="status"
          aria-label={t('updateBannerLabel')}
          className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-emerald-950 bg-emerald-900 px-4 py-3 text-sm font-medium text-white shadow-md motion-reduce:transition-none"
        >
          <p className="flex-1">{t('updateAvailable')}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyUpdate}
              className="min-h-10 rounded-lg bg-white px-3 py-1.5 font-bold text-emerald-950 shadow hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
            >
              {t('refreshToUpdate')}
            </button>
            <button
              type="button"
              onClick={dismissUpdate}
              aria-label={t('dismiss')}
              className="min-h-10 rounded-lg border border-emerald-700 px-3 py-1.5 font-semibold text-emerald-100 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
            >
              {t('dismiss')}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

/** Called on sign-out: the cached pool views contain the user's own commitments. */
export function clearApiCache(): void {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage('CLEAR_API');
  }
}
