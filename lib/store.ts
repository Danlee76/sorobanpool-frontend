'use client';
import { create } from 'zustand';
import { clearApiCache } from '@/components/ServiceWorker';
import { api, session } from './api';
import { cookieLocale, profileLocale, writeLocaleCookie } from './language';
import { initOfflineQueue } from './offline-queue';
import { clearWallet, loadWallet } from './wallet';

export interface Me {
  id: string;
  phone: string;
  displayName: string | null;
  language: string;
  walletAddress: string | null;
  roles: string[];
}

interface SessionState {
  status: 'loading' | 'anon' | 'authed';
  me: Me | null;
  devicePublicKey: string | null;
  bootstrap(): Promise<void>;
  /** Resolves true when the profile's language was applied to this device, so the caller should refresh. */
  signedIn(tokens: { accessToken: string; refreshToken: string }): Promise<boolean>;
  reload(): Promise<void>;
  signOut(): void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  me: null,
  devicePublicKey: null,
  async bootstrap() {
    const wallet = await loadWallet();
    set({ devicePublicKey: wallet?.publicKey ?? null });
    if (!session.hasRefresh && !session.access) return set({ status: 'anon', me: null });
    try {
      set({ status: 'authed', me: await api<Me>('/me') });
    } catch {
      session.clear();
      set({ status: 'anon', me: null });
      return;
    }
    // The session is restored, so changes queued while offline (e.g. the language) can now replay with auth.
    initOfflineQueue();
  },
  async signedIn(tokens) {
    session.set(tokens);
    await get().reload();
    initOfflineQueue();
    // A new phone has no language cookie: use the one saved on the profile. An explicit choice on this device wins.
    const saved = profileLocale(get().me?.language);
    if (cookieLocale() || !saved) return false;
    writeLocaleCookie(saved);
    return true;
  },
  async reload() {
    const wallet = await loadWallet();
    set({ status: 'authed', me: await api<Me>('/me'), devicePublicKey: wallet?.publicKey ?? null });
  },
  signOut() {
    session.clear();
    clearApiCache();
    set({ status: 'anon', me: null, devicePublicKey: null });
    // A passkey wallet is only an address here (the passkey is the key), so forget it: the next person on a shared
    // phone must not inherit it. A device-key wallet is kept, because clearing it would lose the only copy of the key.
    void loadWallet().then((w) => (w?.kind === 'passkey' ? clearWallet() : undefined));
  },
}));
