'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Promise-based confirm used when the device has no fingerprint/face gate: `ask()` resolves true on Confirm. */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        previousFocus.current = (document.activeElement as HTMLElement) ?? null;
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const answer = useCallback((v: boolean) => {
    setOpen(false);
    resolver.current?.(v);
    resolver.current = null;
    // Return focus to the trigger that opened the dialog
    setTimeout(() => {
      previousFocus.current?.focus();
    }, 0);
  }, []);

  return { ask, dialog: open ? <ConfirmDialog onAnswer={answer} /> : null };
}

function ConfirmDialog({ onAnswer }: { onAnswer: (v: boolean) => void }) {
  const t = useTranslations();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Initial focus placed on Confirm button
    confirmBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onAnswer(false);
        return;
      }

      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onAnswer]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-h"
      ref={dialogRef}
      className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <h2 id="confirm-h" className="text-lg font-bold">{t('pool.confirmTitle')}</h2>
        <p className="mt-2 text-sm text-neutral-700">{t('pool.confirmBody')}</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            ref={cancelBtnRef}
            onClick={() => onAnswer(false)}
            className="min-h-12 flex-1 rounded-xl border border-neutral-400 font-semibold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            ref={confirmBtnRef}
            onClick={() => onAnswer(true)}
            className="min-h-12 flex-1 rounded-xl bg-emerald-800 font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
