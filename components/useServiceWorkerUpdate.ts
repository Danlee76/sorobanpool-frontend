'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestLeaveConfirmation } from '@/lib/usePaymentLeaveGuard';

export interface ServiceWorkerUpdateState {
  updateReady: boolean;
  applyUpdate: () => void;
  dismissUpdate: () => void;
}

export function useServiceWorkerUpdate(
  registration: ServiceWorkerRegistration | null,
): ServiceWorkerUpdateState {
  const [updateReady, setUpdateReady] = useState(false);
  const userAccepted = useRef(false);
  const isReloading = useRef(false);

  // Detect waiting worker
  useEffect(() => {
    if (!registration) return;

    // If an active controller exists and a worker is waiting, an update is already downloaded
    if (registration.waiting && navigator.serviceWorker?.controller) {
      setUpdateReady(true);
    }

    const onUpdateFound = () => {
      const installing = registration.installing;
      if (!installing) return;

      const onStateChange = () => {
        // If state moved to 'installed' and we have an existing controller, this is an update ready
        if (installing.state === 'installed' && navigator.serviceWorker?.controller) {
          setUpdateReady(true);
        }
      };

      installing.addEventListener('statechange', onStateChange);
    };

    registration.addEventListener('updatefound', onUpdateFound);

    return () => {
      registration.removeEventListener('updatefound', onUpdateFound);
    };
  }, [registration]);

  // Handle controllerchange and reload exactly once
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onControllerChange = () => {
      // Reload only if user explicitly accepted the update in this tab, and only reload once
      if (userAccepted.current && !isReloading.current) {
        isReloading.current = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  // Check for updates on visibility regain and on an interval
  useEffect(() => {
    if (!registration) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void registration.update().catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = setInterval(() => {
      void registration.update().catch(() => undefined);
    }, 60 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, [registration]);

  const applyUpdate = useCallback(() => {
    if (!registration?.waiting) return;
    const waiting = registration.waiting;
    const proceed = () => {
      userAccepted.current = true;
      waiting.postMessage('SKIP_WAITING');
    };
    if (requestLeaveConfirmation(proceed)) return;
    proceed();
  }, [registration]);

  const dismissUpdate = useCallback(() => {
    setUpdateReady(false);
  }, []);

  return { updateReady, applyUpdate, dismissUpdate };
}
