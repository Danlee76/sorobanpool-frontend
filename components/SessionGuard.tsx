'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { STAFF_IDLE_MINUTES } from '@/lib/config';
import { useIdleTimeout } from '@/lib/idle';
import { useSession } from '@/lib/store';

/**
 * Ends an idle admin or arbiter session. Mount it only inside a staff area. It warns for the last
 * minute, and on timeout it signs out (clearing tokens, caches and a passkey wallet) and sends the
 * person to sign in again.
 */
export function SessionGuard() {
  const t = useTranslations('session');
  const router = useRouter();
  const path = usePathname();
  const signOut = useCallback(() => {
    useSession.getState().signOut();
    router.replace(`/onboarding?next=${encodeURIComponent(path)}`);
  }, [router, path]);
  const { secondsLeft, extend } = useIdleTimeout({ minutes: STAFF_IDLE_MINUTES, onTimeout: signOut });
  if (secondsLeft === null) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="idle-h" className="fixed inset-0 z-20 grid place-items-end bg-black/50 sm:place-items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <h2 id="idle-h" className="text-lg font-bold">{t('idleTitle')}</h2>
        <p className="mt-2 text-sm text-neutral-700">{t('idleBody', { seconds: secondsLeft })}</p>
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={signOut} className="min-h-12 flex-1 rounded-xl border border-neutral-500 font-semibold">{t('signOut')}</button>
          <button type="button" autoFocus onClick={extend} className="min-h-12 flex-1 rounded-xl bg-emerald-800 font-semibold text-white">{t('stay')}</button>
        </div>
      </div>
    </div>
  );
}
