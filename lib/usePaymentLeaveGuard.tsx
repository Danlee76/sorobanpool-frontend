'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';

/**
 * Payment leave-guard state machine:
 * - `idle`: user is browsing or adjusting units/method before starting payment -> guard INACTIVE.
 * - `in-progress`: user started payment (USDC `pay()` in flight, or Naira bank transfer `PENDING`) -> guard ACTIVE.
 * - `submitted / awaiting confirmation`: awaiting device/dialog approval or bank arrival -> guard ACTIVE.
 * - `done`: payment succeeded, failed, or was cancelled -> guard REMOVED immediately; back button never blocked.
 *
 * Live SSE stream updates (#107) and Naira quote countdown ticks/refreshes (#109) never activate or reset this guard.
 */

const GUARD_STATE_KEY = '__spPaymentGuard';

interface GuardEntry {
  id: symbol;
  openPrompt: (onProceed: () => void, trigger: HTMLElement | null) => void;
}

const activeEntries = new Map<symbol, GuardEntry>();
let sentinelPushed = false;
let unwindingSentinel = false;
let globalListenersAttached = false;

function getTopEntry(): GuardEntry | undefined {
  let last: GuardEntry | undefined;
  for (const entry of activeEntries.values()) last = entry;
  return last;
}

function stripGuardKeyFromState(): void {
  if (typeof window === 'undefined') return;
  const st = window.history.state;
  if (st && typeof st === 'object' && GUARD_STATE_KEY in st) {
    const next = { ...(st as Record<string, unknown>) };
    delete next[GUARD_STATE_KEY];
    window.history.replaceState(next, '', window.location.href);
  }
}

function pushSentinelIfNeeded(): void {
  if (typeof window === 'undefined' || sentinelPushed) return;
  const st = window.history.state && typeof window.history.state === 'object' ? (window.history.state as Record<string, unknown>) : {};
  window.history.pushState({ ...st, [GUARD_STATE_KEY]: true }, '', window.location.href);
  sentinelPushed = true;
}

function unwindSentinelOnDeactivate(): void {
  if (typeof window === 'undefined' || !sentinelPushed) return;
  sentinelPushed = false;
  const st = window.history.state;
  if (st && typeof st === 'object' && (st as Record<string, unknown>)[GUARD_STATE_KEY] === true) {
    unwindingSentinel = true;
    window.history.back();
    setTimeout(() => {
      unwindingSentinel = false;
    }, 0);
  }
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (activeEntries.size === 0) return;
  e.preventDefault();
  e.returnValue = '';
}

function onDocumentClick(e: MouseEvent): void {
  if (activeEntries.size === 0) return;
  if (e.defaultPrevented || e.button !== 0) return;
  // Never intercept modified clicks (new tab / new window / download shortcuts).
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const target = e.target instanceof Element ? e.target : null;
  const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;
  if (anchor.hasAttribute('download')) return;
  if (anchor.target && anchor.target !== '_self') return;

  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }

  // Only intercept same-origin in-app navigations; external links rely on beforeunload.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== window.location.origin) return;

  // Ignore hash-only jumps and links to the exact current URL.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;

  const entry = getTopEntry();
  if (!entry) return;

  e.preventDefault();
  e.stopPropagation();

  const trigger = (document.activeElement instanceof HTMLElement ? document.activeElement : null) ?? anchor;
  const targetHref = anchor.href;

  entry.openPrompt(() => {
    detachAllGuardsForNavigation();
    if (anchor.isConnected) {
      anchor.click();
    } else {
      window.location.assign(targetHref);
    }
  }, trigger);
}

function onPopState(): void {
  if (unwindingSentinel) {
    unwindingSentinel = false;
    return;
  }
  if (activeEntries.size === 0) return;
  // The user's Back press consumed our sentinel entry.
  sentinelPushed = false;

  const entry = getTopEntry();
  if (!entry) return;

  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  entry.openPrompt(() => {
    detachAllGuardsForNavigation();
    window.history.back();
  }, trigger);
}

function attachGlobalListeners(): void {
  if (typeof window === 'undefined' || globalListenersAttached) return;
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('click', onDocumentClick, true);
  window.addEventListener('popstate', onPopState);
  globalListenersAttached = true;
}

function detachGlobalListeners(): void {
  if (typeof window === 'undefined' || !globalListenersAttached) return;
  window.removeEventListener('beforeunload', onBeforeUnload);
  document.removeEventListener('click', onDocumentClick, true);
  window.removeEventListener('popstate', onPopState);
  globalListenersAttached = false;
}

function detachAllGuardsForNavigation(): void {
  activeEntries.clear();
  detachGlobalListeners();
  if (sentinelPushed) {
    sentinelPushed = false;
    stripGuardKeyFromState();
  }
}

/**
 * Coordinates external reload triggers (such as the service worker update banner from #71)
 * with any active payment leave guard. Returns true if intercepted by the guard dialog.
 */
export function requestLeaveConfirmation(onProceed: () => void): boolean {
  const entry = getTopEntry();
  if (!entry) return false;
  const trigger = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  entry.openPrompt(() => {
    detachAllGuardsForNavigation();
    onProceed();
  }, trigger);
  return true;
}

/** Returns whether any payment leave guard is currently active. */
export function isPaymentLeaveGuardActive(): boolean {
  return activeEntries.size > 0;
}

/**
 * Protects an in-progress payment flow against accidental tab close (`beforeunload`),
 * in-app link clicks, browser/hardware Back navigation (`popstate`), and service worker update reloads.
 */
export function usePaymentLeaveGuard(active: boolean): { dialog: ReactElement | null } {
  const [promptOpen, setPromptOpen] = useState(false);
  const pendingProceedRef = useRef<(() => void) | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const idRef = useRef<symbol | null>(null);

  const openPrompt = useCallback((onProceed: () => void, trigger: HTMLElement | null) => {
    pendingProceedRef.current = onProceed;
    previousFocusRef.current = trigger;
    setPromptOpen(true);
  }, []);

  const handleStay = useCallback(() => {
    setPromptOpen(false);
    pendingProceedRef.current = null;
    // Restore sentinel if popstate had popped it while the guard is still active.
    if (activeEntries.size > 0 && !sentinelPushed) {
      pushSentinelIfNeeded();
    }
    const trigger = previousFocusRef.current;
    previousFocusRef.current = null;
    setTimeout(() => {
      trigger?.focus();
    }, 0);
  }, []);

  const handleLeave = useCallback(() => {
    setPromptOpen(false);
    const proceed = pendingProceedRef.current;
    pendingProceedRef.current = null;
    previousFocusRef.current = null;
    proceed?.();
  }, []);

  // Activate/deactivate guard in sync with `active` (handles success, failure, and cancel cleanly).
  useEffect(() => {
    if (active) {
      if (!idRef.current) {
        const id = Symbol('payment-leave-guard');
        idRef.current = id;
        activeEntries.set(id, { id, openPrompt });
        attachGlobalListeners();
        pushSentinelIfNeeded();
      } else {
        activeEntries.set(idRef.current, { id: idRef.current, openPrompt });
      }
      return;
    }

    if (idRef.current) {
      activeEntries.delete(idRef.current);
      idRef.current = null;
      if (activeEntries.size === 0) {
        detachGlobalListeners();
        unwindSentinelOnDeactivate();
      }
    }
  }, [active, openPrompt]);

  // Unmount-only cleanup: detach listeners and strip marker without triggering unexpected back navigation.
  useEffect(() => {
    return () => {
      if (idRef.current) {
        activeEntries.delete(idRef.current);
        idRef.current = null;
        if (activeEntries.size === 0) {
          detachGlobalListeners();
          if (sentinelPushed) {
            sentinelPushed = false;
            stripGuardKeyFromState();
          }
        }
      }
    };
  }, []);

  const dialog = promptOpen ? <LeaveGuardDialog onStay={handleStay} onLeave={handleLeave} /> : null;
  return { dialog };
}

function LeaveGuardDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const t = useTranslations('pool');
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Initial focus goes to the default-safe action ("Stay on payment").
    stayBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onStay();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;

        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onStay]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      ref={dialogRef}
      className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <h2 id={titleId} className="text-lg font-bold text-neutral-900">
          {t('leaveGuardTitle')}
        </h2>
        <p id={bodyId} className="mt-2 text-sm text-neutral-700">
          {t('leaveGuardBody')}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            ref={stayBtnRef}
            onClick={onStay}
            className="min-h-12 flex-1 rounded-xl bg-emerald-800 font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            {t('leaveGuardStay')}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="min-h-12 flex-1 rounded-xl border border-neutral-500 font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            {t('leaveGuardLeave')}
          </button>
        </div>
      </div>
    </div>
  );
}
