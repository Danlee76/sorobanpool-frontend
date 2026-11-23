import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateBackoff,
  enqueueAction,
  isDenyListedEndpoint,
  MAX_ATTEMPTS,
  MONEY_MOVING_ROUTE_PATTERNS,
  replayOfflineQueue,
  WHITELISTED_ACTION_CONFIG,
  _resetDbForTesting,
} from './offline-queue';
import { api, session } from './api';

// In-memory fake IndexedDB for testing
class MockIDBDatabase {
  items: Map<string, any> = new Map();
  objectStoreNames = {
    contains: (name: string) => name === 'action-queue',
  };

  transaction(_store: string, _mode: string) {
    const self = this;
    return {
      objectStore(_name: string) {
        return {
          getAll() {
            const req: any = { result: Array.from(self.items.values()), onsuccess: null, onerror: null };
            setTimeout(() => req.onsuccess?.(), 0);
            return req;
          },
          put(val: any) {
            self.items.set(val.id, val);
            const req: any = { onsuccess: null, onerror: null };
            setTimeout(() => req.onsuccess?.(), 0);
            return req;
          },
          delete(id: string) {
            self.items.delete(id);
            const req: any = { onsuccess: null, onerror: null };
            setTimeout(() => req.onsuccess?.(), 0);
            return req;
          },
        };
      },
    };
  }
}

let mockDb: MockIDBDatabase;

describe('Offline Queue (#73)', () => {
  beforeEach(() => {
    mockDb = new MockIDBDatabase();
    _resetDbForTesting();

    (globalThis as any).indexedDB = {
      open: vi.fn(() => {
        const req: any = {
          result: mockDb,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        setTimeout(() => {
          req.onupgradeneeded?.();
          req.onsuccess?.();
        }, 0);
        return req;
      }),
    };

    session.clear();
    session.set({ accessToken: 'valid-test-token', refreshToken: 'valid-refresh' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    session.clear();
  });

  describe('Whitelist enforcement and Deny-list guard', () => {
    it('accepts valid whitelisted actions', async () => {
      const res = await enqueueAction('save-language', { language: 'pcm' });
      expect(res.queued).toBe(true);
      expect(res.actionType).toBe('save-language');
      expect(mockDb.items.size).toBe(1);
    });

    it('rejects unknown action types with a thrown error and no write to storage', async () => {
      await expect(enqueueAction('arbitrary-action', { foo: 'bar' })).rejects.toThrow(
        /not on the offline queue whitelist/i,
      );
      expect(mockDb.items.size).toBe(0);
    });

    it('rejects money-moving actions even if mistakenly queried', async () => {
      await expect(enqueueAction('submit-payment' as any, { amount: 100 })).rejects.toThrow();
      expect(mockDb.items.size).toBe(0);
    });

    it('deny-list guard test: ensures no whitelisted action resolves to a money-moving route', () => {
      for (const [actionName, config] of Object.entries(WHITELISTED_ACTION_CONFIG)) {
        const isForbidden = isDenyListedEndpoint(config.endpoint);
        expect(
          isForbidden,
          `Action "${actionName}" resolves to deny-listed endpoint "${config.endpoint}"!`,
        ).toBe(false);
      }
    });

    it('identifies known money-moving routes as deny-listed', () => {
      const moneyRoutes = [
        '/tx/submit',
        '/pools/99/commit/prepare',
        '/pools/prepare',
        '/anchor/deposit/start',
        '/bonds/deposit/prepare',
        '/wallets',
        '/dev/anchor/confirm',
        '/disputes/1/resolve',
      ];
      for (const route of moneyRoutes) {
        expect(isDenyListedEndpoint(route)).toBe(true);
      }
    });

    it('never queues authorization tokens or secrets', async () => {
      await expect(
        enqueueAction('update-profile', { displayName: 'Feyi', authorization: 'Bearer secret' } as any),
      ).rejects.toThrow(/SECURITY ERROR: Forbidden key/i);
      expect(mockDb.items.size).toBe(0);

      // Verify stored item never has auth headers
      await enqueueAction('save-language', { language: 'en' });
      const stored = Array.from(mockDb.items.values())[0];
      expect(stored.payload).toEqual({ language: 'en' });
      expect(JSON.stringify(stored)).not.toContain('Bearer');
    });
  });

  describe('Deduplication and Bounds', () => {
    it('deduplicates last-write-wins actions by updating the existing item', async () => {
      await enqueueAction('save-language', { language: 'en' });
      expect(mockDb.items.size).toBe(1);
      const firstId = Array.from(mockDb.items.values())[0].id;

      await enqueueAction('save-language', { language: 'pcm' });
      expect(mockDb.items.size).toBe(1);
      const updated = Array.from(mockDb.items.values())[0];
      expect(updated.id).toBe(firstId);
      expect(updated.payload).toEqual({ language: 'pcm' });
    });
  });

  describe('Replay mechanism and Backoff', () => {
    it('replays items in FIFO order', async () => {
      const fetchCalls: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        fetchCalls.push(url);
        return new Response('{}', { status: 200 });
      }));

      // Add 2 actions
      await enqueueAction('accept-terms', { version: '1.0.0' });
      // Small pause to guarantee createdAt ordering
      await new Promise((r) => setTimeout(r, 5));
      await enqueueAction('mark-notifications-read', { timestamp: 1234567 });

      const res = await replayOfflineQueue();
      expect(res.replayed).toBe(2);
      expect(fetchCalls[0]).toContain('/v1/me/terms');
      expect(fetchCalls[1]).toContain('/v1/me/notifications/read');
      expect(mockDb.items.size).toBe(0);
    });

    it('drops item on 4xx error without retrying (except 429)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"BadRequest"}', { status: 400 })));
      await enqueueAction('save-language', { language: 'en' });

      const res = await replayOfflineQueue();
      expect(res.dropped).toBe(1);
      expect(res.replayed).toBe(0);
      expect(mockDb.items.size).toBe(0);
    });

    it('retries on 5xx and 429 with exponential backoff and blocks subsequent items of same type', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Server Error"}', { status: 500 })));

      await enqueueAction('mark-notifications-read', { timestamp: 1 });
      await new Promise((r) => setTimeout(r, 5));
      await enqueueAction('mark-notifications-read', { timestamp: 2 });

      const res1 = await replayOfflineQueue();
      expect(res1.failed).toBe(1); // First item failed, second was blocked from executing
      const item = Array.from(mockDb.items.values())[0];
      expect(item.attempts).toBe(1);
      expect(item.nextRetryAt).toBeGreaterThan(Date.now());
    });

    it('calculates backoff delay with exponential scaling', () => {
      const delay0 = calculateBackoff(0, 0);
      const delay1 = calculateBackoff(1, 0);
      const delay2 = calculateBackoff(2, 0);
      expect(delay0).toBe(1000);
      expect(delay1).toBe(2000);
      expect(delay2).toBe(4000);
    });

    it('drops item once maximum attempts (MAX_ATTEMPTS) are exhausted', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Gateway Timeout"}', { status: 504 })));
      await enqueueAction('save-language', { language: 'en' });

      const item = Array.from(mockDb.items.values())[0];
      item.attempts = MAX_ATTEMPTS - 1;
      mockDb.items.set(item.id, item);

      const res = await replayOfflineQueue();
      expect(res.dropped).toBe(1);
      expect(mockDb.items.size).toBe(0);
    });

    it('drops item when user session is logged out', async () => {
      session.clear();
      await enqueueAction('save-language', { language: 'en' });
      const res = await replayOfflineQueue();
      expect(res.dropped).toBe(1);
      expect(mockDb.items.size).toBe(0);
    });
  });

  describe('Fallback and Concurrency', () => {
    it('handles IndexedDB unavailable safely without throwing into the UI', async () => {
      delete (globalThis as any).indexedDB;
      _resetDbForTesting();

      const res = await enqueueAction('save-language', { language: 'en' });
      expect(res.queued).toBe(true);
    });

    it('prevents two replayers from double-sending using Web Locks API', async () => {
      let lockHeld = true;
      (globalThis as any).navigator = {
        locks: {
          request: vi.fn(async (_name: string, opts: any, callback: any) => {
            if (opts.ifAvailable && !lockHeld) return null;
            return callback({ name: _name });
          }),
        },
      };

      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
      await enqueueAction('save-language', { language: 'en' });

      // First run succeeds
      const r1 = await replayOfflineQueue();
      expect(r1.replayed).toBe(1);

      // When lock is unavailable (another tab is replaying)
      lockHeld = false;
      await enqueueAction('accept-terms', { version: '1.0' });
      const r2 = await replayOfflineQueue();
      expect(r2.replayed).toBe(0);
    });
  });

  describe('Integration with api()', () => {
    it('enqueues and returns { queued: true } when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      const result: any = await api('/me', {
        method: 'PATCH',
        body: { language: 'pcm' },
        actionType: 'save-language',
      });
      expect(result.queued).toBe(true);
      expect(result.actionType).toBe('save-language');
    });

    it('enqueues and returns { queued: true } when network fails', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }));

      const result: any = await api('/me', {
        method: 'PATCH',
        body: { language: 'en' },
        actionType: 'save-language',
      });
      expect(result.queued).toBe(true);
      expect(result.actionType).toBe('save-language');
    });
  });
});
