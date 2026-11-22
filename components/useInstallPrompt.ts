'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const SESSION_KEY = 'sp.install_session_counted';
const VISIT_COUNT_KEY = 'sp.install_visit_count';
const DISMISSED_KEY = 'sp.install_dismissed_at';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function safeGetItem(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Safely ignore storage quotas / private mode throws
  }
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent;

  // Detect iOS (iPhone, iPad, iPod) or iPadOS (reports MacIntel + touch points)
  const isIosDevice =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!isIosDevice) return false;

  // Exclude in-app browsers (Facebook, Instagram, Twitter, etc.)
  const isInApp = /FBAN|FBAV|Instagram|Twitter|Snapchat|Line|MicroMessenger|WhatsApp|musical_ly|ByteLocale|TikTok/i.test(
    ua,
  );
  if (isInApp) return false;

  // Check for Safari WebKit without Chrome/Firefox/Edge wrappers on iOS
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
  return isSafari;
}

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (navigator as unknown as { standalone?: boolean })?.standalone === true;
    return isStandaloneDisplay || isIosStandalone;
  } catch {
    return false;
  }
}

export function useInstallPrompt() {
  const [canShow, setCanShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const checkEligibility = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    if (isAppInstalled()) return false;

    // Check dismissal (must not have been dismissed within 30 days)
    const dismissedAtStr = safeGetItem(window.localStorage, DISMISSED_KEY);
    if (dismissedAtStr) {
      const dismissedAt = parseInt(dismissedAtStr, 10);
      if (!isNaN(dismissedAt) && Date.now() - dismissedAt < THIRTY_DAYS_MS) {
        return false;
      }
    }

    // Check visit count: must be 2nd visit or more
    // Visits are counted once per browser session via sessionStorage
    const sessionCounted = safeGetItem(window.sessionStorage, SESSION_KEY);
    let visits = parseInt(safeGetItem(window.localStorage, VISIT_COUNT_KEY) || '0', 10);
    if (isNaN(visits)) visits = 0;

    if (!sessionCounted) {
      safeSetItem(window.sessionStorage, SESSION_KEY, '1');
      visits += 1;
      safeSetItem(window.localStorage, VISIT_COUNT_KEY, String(visits));
    }

    return visits >= 2;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const eligible = checkEligibility();
    const iosDevice = isIosSafari();
    setIsIos(iosDevice);

    if (eligible && iosDevice) {
      setCanShow(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      if (checkEligibility()) {
        setCanShow(true);
      }
    };

    const handleAppInstalled = () => {
      setCanShow(false);
      deferredPromptRef.current = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [checkEligibility]);

  const install = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) return;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setCanShow(false);
      }
    } catch {
      // Ignored if prompt failed
    } finally {
      deferredPromptRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    setCanShow(false);
    safeSetItem(window.localStorage, DISMISSED_KEY, String(Date.now()));
  }, []);

  return {
    canShow,
    isIos,
    install,
    dismiss,
  };
}
