'use client';
import { useTranslations } from 'next-intl';
import { useInstallPrompt } from './useInstallPrompt';

export function InstallCard() {
  const t = useTranslations('install');
  const { canShow, isIos, install, dismiss } = useInstallPrompt();

  if (!canShow) return null;

  return (
    <aside
      aria-label={t('label')}
      aria-labelledby="install-card-title"
      className="mb-4 rounded-2xl border border-emerald-800/20 bg-emerald-50/80 p-4 shadow-sm backdrop-blur-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 id="install-card-title" className="text-base font-bold text-emerald-950 sm:text-lg">
            {t('title')}
          </h2>
          <p className="text-sm text-neutral-800">
            {isIos ? t('iosInstructions') : t('description')}
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1 sm:pt-0">
          {!isIos && (
            <button
              type="button"
              onClick={install}
              className="flex min-h-12 min-w-12 items-center justify-center rounded-xl bg-emerald-800 px-5 text-sm font-bold text-white shadow hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2"
            >
              {t('installButton')}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('dismissButton')}
            className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-neutral-400 bg-white px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2"
          >
            {t('dismissButton')}
          </button>
        </div>
      </div>
    </aside>
  );
}
