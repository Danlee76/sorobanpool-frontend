import { enqueueAction, type WhitelistedActionType } from './offline-queue';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
export const apiUrl = (path: string): string => `${BASE}/v1${path}`;
const REFRESH_KEY = 'sp.refresh';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly contractCode?: number,
    public readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

/**
 * Safe localStorage access that handles private mode, quota errors, and blocked storage.
 * Returns null if storage is unavailable, allowing the app to continue with in-memory fallback.
 */
const storage = (): Storage | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Test if we can actually write (some browsers allow access but throw on write in private mode)
    localStorage.setItem('sp.test', '1');
    localStorage.removeItem('sp.test');
    return localStorage;
  } catch {
    return null; // private mode or blocked storage: stay signed in for this tab only
  }
};

export const session = {
  set(tokens: { accessToken: string; refreshToken: string }): void {
    accessToken = tokens.accessToken;
    try {
      storage()?.setItem(REFRESH_KEY, tokens.refreshToken);
    } catch (e) {
      // QuotaExceededError or other storage failure: keep access token in memory for this session
      console.warn('Failed to store refresh token:', e);
    }
  },
  clear(): void {
    accessToken = null;
    try {
      storage()?.removeItem(REFRESH_KEY);
    } catch {
      // Storage unavailable, but we've cleared the in-memory token
    }
  },
  get hasRefresh(): boolean {
    try {
      return !!storage()?.getItem(REFRESH_KEY);
    } catch {
      return false;
    }
  },
  get access(): string | null {
    return accessToken;
  },
};

async function raw(path: string, init: RequestInit & { auth?: boolean }): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (init.auth !== false && accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(`${BASE}/v1${path}`, { ...init, headers });
}

/** Exchanges the stored refresh token (rotating). One refresh at a time; concurrent callers share it. */
async function refresh(): Promise<boolean> {
  let token: string | null = null;
  try {
    token = storage()?.getItem(REFRESH_KEY) ?? null;
  } catch {
    return false; // Storage error, cannot retrieve refresh token
  }
  if (!token) return false;
  refreshing ??= (async () => {
    try {
      const res = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: token }), auth: false });
      if (!res.ok) {
        session.clear();
        return false;
      }
      session.set(await res.json());
      return true;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; actionType?: WhitelistedActionType } = {},
): Promise<T> {
  // If whitelisted action and device is offline, enqueue immediately without throwing
  if (opts.actionType && typeof navigator !== 'undefined' && !navigator.onLine) {
    const queued = await enqueueAction(opts.actionType, opts.body);
    return queued as unknown as T;
  }

  const init = { method: opts.method ?? (opts.body ? 'POST' : 'GET'), body: opts.body === undefined ? undefined : JSON.stringify(opts.body), auth: opts.auth };

  let res: Response;
  try {
    res = await raw(path, init);
  } catch (err) {
    // If a whitelisted action fails due to a network error, queue it safely
    if (opts.actionType) {
      const queued = await enqueueAction(opts.actionType, opts.body);
      return queued as unknown as T;
    }
    throw err;
  }

  if (res.status === 401 && opts.auth !== false && (await refresh())) {
    try {
      res = await raw(path, init);
    } catch (err) {
      if (opts.actionType) {
        const queued = await enqueueAction(opts.actionType, opts.body);
        return queued as unknown as T;
      }
      throw err;
    }
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  // An empty 200 is how the API says "nothing" (e.g. no supplier profile yet): that is null, not an empty object.
  if (res.ok && !text) return null as T;
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new ApiError(res.status, String(json.error ?? 'HTTP'), String(json.message ?? res.statusText), typeof json.contractCode === 'number' ? json.contractCode : undefined, json.issues as ApiError['issues']);
  }
  return json as T;
}

// Named exports for statement and bond (issues #125, #126)
export { type Statement, type BondInfo } from './types';
export const getStatement = () => api<import('./types').Statement>('/suppliers/statement');
export const getBond = () => api<import('./types').BondInfo>('/bonds/me');
