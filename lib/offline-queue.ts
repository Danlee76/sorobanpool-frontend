import { isLocale, locales, type Locale } from '@/i18n/locales';
import { session } from './api';

export const WHITELISTED_ACTION_CONFIG = {
  'save-language': {
    // The profile's language (PATCH /me), so the choice follows the person to a new phone.
    endpoint: '/me',
    method: 'PATCH',
    dedupe: 'last-write-wins' as const,
    requiresAuth: true,
    validate: (payload: unknown): { language: Locale } => {
      if (!payload || typeof payload !== 'object') throw new Error('Invalid payload for save-language: expected object');
      const p = payload as Record<string, unknown>;
      if (!isLocale(p.language)) {
        throw new Error(`Invalid payload for save-language: language must be one of ${locales.join(', ')}`);
      }
      return { language: p.language };
    },
  },
  'update-profile': {
    endpoint: '/me',
    method: 'PATCH',
    dedupe: 'last-write-wins' as const,
    requiresAuth: true,
    validate: (payload: unknown): { displayName: string } => {
      if (!payload || typeof payload !== 'object') throw new Error('Invalid payload for update-profile: expected object');
      const p = payload as Record<string, unknown>;
      if (typeof p.displayName !== 'string' || p.displayName.trim().length === 0) {
        throw new Error('Invalid payload for update-profile: displayName must be non-empty string');
      }
      return { displayName: p.displayName.trim() };
    },
  },
  'accept-terms': {
    endpoint: '/me/terms',
    method: 'POST',
    dedupe: 'last-write-wins' as const,
    requiresAuth: true,
    validate: (payload: unknown): { version: string } => {
      if (!payload || typeof payload !== 'object') throw new Error('Invalid payload for accept-terms: expected object');
      const p = payload as Record<string, unknown>;
      if (typeof p.version !== 'string' || p.version.trim().length === 0) {
        throw new Error('Invalid payload for accept-terms: version must be non-empty string');
      }
      return { version: p.version.trim() };
    },
  },
  'mark-notifications-read': {
    endpoint: '/me/notifications/read',
    method: 'POST',
    dedupe: 'fifo' as const,
    requiresAuth: true,
    validate: (payload: unknown): { timestamp: number } => {
      if (!payload || typeof payload !== 'object') throw new Error('Invalid payload for mark-notifications-read: expected object');
      const p = payload as Record<string, unknown>;
      if (typeof p.timestamp !== 'number' || isNaN(p.timestamp)) {
        throw new Error('Invalid payload for mark-notifications-read: timestamp must be a valid number');
      }
      return { timestamp: p.timestamp };
    },
  },
} as const;

export type WhitelistedActionType = keyof typeof WHITELISTED_ACTION_CONFIG;

/**
 * Routes that move money, touch balances, create or settle escrows, submit on-chain transactions,
 * or upload proofs/evidence. Enforced as a second-layer deny-list guard against the whitelist.
 */
export const MONEY_MOVING_ROUTE_PATTERNS = [
  /\/tx(\/.*)?$/,
  /\/anchor(\/.*)?$/,
  /\/pools\/.*\/.*\/prepare/,
  /\/pools\/prepare/,
  /\/bonds(\/.*)?$/,
  /\/wallets(\/.*)?$/,
  /\/dev\/anchor(\/.*)?$/,
  /\/dev\/faucet(\/.*)?$/,
  /\/arbiter\/.*\/resolve/,
  /\/disputes\/.*\/prepare/,
  /\/disputes\/prepare/,
  /\/evidence(\/.*)?$/,
  /\/uploads(\/.*)?$/,
  /payments?/i,
  /withdrawals?/i,
  /transfers?/i,
  /contributions?/i,
  /escrow/i,
  /settle/i,
];

const FORBIDDEN_SECRET_KEYS = [
  'authorization',
  'token',
  'refreshtoken',
  'accesstoken',
  'secret',
  'signature',
  'txxdr',
  'signedxdr',
  'signedauthentries',
  'passphrase',
  'privatekey',
  'seed',
];

export function isDenyListedEndpoint(endpoint: string): boolean {
  return MONEY_MOVING_ROUTE_PATTERNS.some((pattern) => pattern.test(endpoint));
}

function assertNoSecrets(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_SECRET_KEYS.includes(lowerKey)) {
      throw new Error(`SECURITY ERROR: Forbidden key "${key}" detected in offline queue payload`);
    }
    if (typeof value === 'object' && value !== null) {
      assertNoSecrets(value);
    }
  }
}

export interface QueuedActionItem<T = unknown> {
  id: string;
  actionType: WhitelistedActionType;
  payload: T;
  createdAt: number;
  attempts: number;
  nextRetryAt: number;
  lastErrorStatus?: number;
}

export interface QueuedResult {
  queued: true;
  id: string;
  actionType: WhitelistedActionType;
}

const DB_NAME = 'sorobanpool-offline';
const STORE_NAME = 'action-queue';
const DB_VERSION = 1;
export const MAX_QUEUE_SIZE = 50;
export const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const MAX_ATTEMPTS = 5;
export const BASE_BACKOFF_MS = 1000;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('actionType', 'actionType', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

// Reset helper for testing
export function _resetDbForTesting(): void {
  dbPromise = null;
}

async function getAllItems(): Promise<QueuedActionItem[]> {
  const db = await getDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as QueuedActionItem[]) || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function putItem(item: QueuedActionItem): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function deleteItem(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export function calculateBackoff(attempts: number, jitter = Math.random()): number {
  const delay = Math.min(60_000, BASE_BACKOFF_MS * Math.pow(2, attempts));
  const addedJitter = Math.floor(jitter * 200);
  return delay + addedJitter;
}

/**
 * Enqueue an idempotent, non-money action for later replay.
 * Validates action type and payload shape, enforces whitelist and deny list,
 * rejects secret tokens, handles last-write-wins deduplication, drops aged items,
 * and falls back safely if IndexedDB is unavailable.
 */
export async function enqueueAction<T = unknown>(
  type: string,
  payload: T,
): Promise<QueuedResult> {
  // 1. Structural Whitelist Check
  if (!Object.prototype.hasOwnProperty.call(WHITELISTED_ACTION_CONFIG, type)) {
    throw new Error(`SECURITY ERROR: Action "${type}" is not on the offline queue whitelist.`);
  }

  const actionType = type as WhitelistedActionType;
  const config = WHITELISTED_ACTION_CONFIG[actionType];

  // 2. Deny-list Guard Check
  if (isDenyListedEndpoint(config.endpoint)) {
    throw new Error(`SECURITY ERROR: Action "${actionType}" resolves to a deny-listed route: "${config.endpoint}"`);
  }

  // 3. Payload Validation and Secret Stripping Check
  const validatedPayload = config.validate(payload);
  assertNoSecrets(validatedPayload);

  // 4. Retrieve existing items to prune stale items and enforce queue bounds
  const existingItems = await getAllItems();
  const now = Date.now();

  // Clean expired items
  for (const item of existingItems) {
    if (now - item.createdAt > MAX_ITEM_AGE_MS) {
      await deleteItem(item.id);
    }
  }

  // Deduplication: if "last-write-wins", replace older item of same type
  if (config.dedupe === 'last-write-wins') {
    const existingSameType = existingItems.find((it) => it.actionType === actionType);
    if (existingSameType) {
      const updated: QueuedActionItem = {
        ...existingSameType,
        payload: validatedPayload,
        createdAt: now,
        attempts: 0,
        nextRetryAt: 0,
        lastErrorStatus: undefined,
      };
      await putItem(updated);
      return { queued: true, id: updated.id, actionType };
    }
  }

  // Enforce queue bound (FIFO drop oldest if queue full)
  const remaining = (await getAllItems()).sort((a, b) => a.createdAt - b.createdAt);
  while (remaining.length >= MAX_QUEUE_SIZE) {
    const oldest = remaining.shift();
    if (oldest) await deleteItem(oldest.id);
  }

  const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const newItem: QueuedActionItem = {
    id,
    actionType,
    payload: validatedPayload,
    createdAt: now,
    attempts: 0,
    nextRetryAt: 0,
  };

  await putItem(newItem);
  return { queued: true, id, actionType };
}

let isReplaying = false;

async function runWithLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
    return navigator.locks.request('sp-offline-queue-lock', { ifAvailable: true }, async (lock) => {
      if (!lock) return null;
      return fn();
    });
  }
  if (isReplaying) return null;
  isReplaying = true;
  try {
    return await fn();
  } finally {
    isReplaying = false;
  }
}

/**
 * Replay pending items FIFO.
 * When a head item of an action type fails, subsequent items of the same action type wait
 * to preserve ordering, while items of other action types continue replaying without starvation.
 */
export async function replayOfflineQueue(): Promise<{ replayed: number; dropped: number; failed: number }> {
  const result = await runWithLock(async () => {
    let replayed = 0;
    let dropped = 0;
    let failed = 0;

    const all = await getAllItems();
    if (all.length === 0) return { replayed, dropped, failed };

    // Sort FIFO
    const items = all.sort((a, b) => a.createdAt - b.createdAt);
    const now = Date.now();
    const blockedTypes = new Set<WhitelistedActionType>();

    for (const item of items) {
      // 1. Age check
      if (now - item.createdAt > MAX_ITEM_AGE_MS) {
        await deleteItem(item.id);
        dropped++;
        continue;
      }

      // 2. Action type head blocking: if head item of this type is blocked/waiting, skip later items of same type
      if (blockedTypes.has(item.actionType)) {
        continue;
      }

      // 3. Retry timing check
      if (item.nextRetryAt > now) {
        blockedTypes.add(item.actionType);
        continue;
      }

      const config = WHITELISTED_ACTION_CONFIG[item.actionType];
      if (!config || isDenyListedEndpoint(config.endpoint)) {
        // Unknown or illegal action in storage: drop immediately
        await deleteItem(item.id);
        dropped++;
        continue;
      }

      // 4. Live session check (never stored in DB)
      // If action requires auth and user is logged out (no token), drop the item as logged-out users' actions cannot be replayed.
      if (config.requiresAuth && !session.access && !session.hasRefresh) {
        console.warn(`[offline-queue] Dropping ${item.actionType} (${item.id}): user session is absent`);
        await deleteItem(item.id);
        dropped++;
        continue;
      }

      // 5. Send request
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const headers = new Headers({ 'content-type': 'application/json' });
      if (config.requiresAuth && session.access) {
        headers.set('authorization', `Bearer ${session.access}`);
      }

      try {
        const res = await fetch(`${BASE}/v1${config.endpoint}`, {
          method: config.method,
          headers,
          body: JSON.stringify(item.payload),
        });

        if (res.ok || res.status === 204) {
          await deleteItem(item.id);
          replayed++;
          continue;
        }

        // 4xx errors (client errors) drop item, except 429 (rate limiting)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          console.warn(`[offline-queue] Dropping ${item.actionType} (${item.id}) on HTTP ${res.status}`);
          await deleteItem(item.id);
          dropped++;
          continue;
        }

        // 5xx server errors or 429 rate limit: backoff and retry
        item.attempts++;
        item.lastErrorStatus = res.status;
        if (item.attempts >= MAX_ATTEMPTS) {
          console.warn(`[offline-queue] Dropping ${item.actionType} (${item.id}): max attempts reached`);
          await deleteItem(item.id);
          dropped++;
        } else {
          item.nextRetryAt = Date.now() + calculateBackoff(item.attempts);
          await putItem(item);
          blockedTypes.add(item.actionType);
          failed++;
        }
      } catch {
        // Network error: backoff and retry
        item.attempts++;
        if (item.attempts >= MAX_ATTEMPTS) {
          console.warn(`[offline-queue] Dropping ${item.actionType} (${item.id}): max network attempts reached`);
          await deleteItem(item.id);
          dropped++;
        } else {
          item.nextRetryAt = Date.now() + calculateBackoff(item.attempts);
          await putItem(item);
          blockedTypes.add(item.actionType);
          failed++;
        }
      }
    }

    return { replayed, dropped, failed };
  });

  return result || { replayed: 0, dropped: 0, failed: 0 };
}

let initialized = false;

/** Initialize page-level listeners for offline queue replay */
export function initOfflineQueue(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('online', () => {
    void replayOfflineQueue();
  });

  // Replay pending items on startup if online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void replayOfflineQueue();
  }
}
