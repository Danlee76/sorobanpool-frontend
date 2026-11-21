'use client';
import { useSyncExternalStore } from 'react';

export interface NetworkConnection {
  saveData?: boolean;
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' | string;
}

/**
 * Pure helper to determine whether prefetching should be allowed based on a NetworkConnection.
 * Returns false when:
 * - saveData is true
 * - effectiveType is 'slow-2g' or '2g'
 * Returns true otherwise, including when connection or fields are missing/unavailable,
 * or when running in SSR (no window).
 */
export function canPrefetchConnection(connection?: NetworkConnection | null): boolean {
  if (!connection) return true;
  if (connection.saveData === true) return false;
  if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return false;
  return true;
}

/**
 * Checks whether prefetching is allowed in the current environment by reading
 * navigator.connection.
 * IMPORTANT: Call this inside event handlers (e.g. onTouchStart), never during render,
 * to prevent hydration mismatches.
 */
export function canPrefetch(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & {
    connection?: NetworkConnection;
    mozConnection?: NetworkConnection;
    webkitConnection?: NetworkConnection;
  };
  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  return canPrefetchConnection(conn);
}

// ---------------------------------------------------------------------------
// Online / Offline state tracking (reused by Issue #72)
// ---------------------------------------------------------------------------

let isManuallyOffline = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Report a failed network fetch to mark the connection offline even if navigator.onLine is true.
 */
export function reportFetchFailure(): void {
  if (!isManuallyOffline) {
    isManuallyOffline = true;
    notify();
  }
}

/**
 * Report a successful network fetch to clear manual offline status.
 */
export function reportFetchSuccess(): void {
  if (isManuallyOffline) {
    isManuallyOffline = false;
    notify();
  }
}

/**
 * Returns true if the client is currently online (events, navigator.onLine, and fetch status).
 */
export function getOnlineStatus(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return true;
  if (isManuallyOffline) return false;
  return navigator.onLine ?? true;
}

function subscribeOnline(callback: () => void) {
  listeners.add(callback);

  const handleOnline = () => {
    isManuallyOffline = false;
    callback();
  };

  const handleOffline = () => {
    isManuallyOffline = true;
    callback();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  };
}

/**
 * React hook to observe online/offline status with SSR support.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    getOnlineStatus,
    () => true,
  );
}
