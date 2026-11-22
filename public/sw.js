/* SorobanPool service worker: offline shell and last-known pool states.
 * Never caches anything that carries credentials or moves money: auth, wallets, tx, /me, uploads, evidence. */
const BUILD_ID = '843aacc';
const PREFIX = 'sorobanpool';
const STATIC = `${PREFIX}-static-${BUILD_ID}`;
const PAGES = `${PREFIX}-pages-${BUILD_ID}`;
const API = `${PREFIX}-api-${BUILD_ID}`;
const POOL_PAGES = `${PREFIX}-pool-pages-${BUILD_ID}`;
const CURRENT_CACHES = [STATIC, PAGES, API, POOL_PAGES];

// Bounded pool page document cache: stores at most the last 10 visited pools
const MAX_POOLS = 10;
const POOL_PAGE_PATTERN = /^\/(pools|p)\/[^/?#]+$/;
const EXCLUDED_PAGE_PREFIXES = ['/admin', '/arbiter', '/settings', '/onboarding', '/history', '/organize', '/disputes'];

// Read-only data that is safe to show stale. Pool views include the signed-in user's own commitment, so this cache
// is wiped on sign-out along with POOL_PAGES (see CLEAR_API below).
const CACHEABLE_API = /^\/v1\/(pools|p|offers)(\/|$|\?)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.add('/offline')));
  // Do not skip waiting unconditionally; wait for user confirmation.
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    for (const k of keys) {
      if (k.startsWith(`${PREFIX}-`) && !CURRENT_CACHES.includes(k)) {
        await caches.delete(k);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
  if (e.data === 'CLEAR_API') {
    e.waitUntil(Promise.all([
      caches.delete(API),
      caches.delete(POOL_PAGES),
    ]));
  }
});

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      await cache.delete(keys[0]);
      await trimCache(cacheName, maxItems);
    }
  } catch {
    // Silently ignore cache trim errors
  }
}

async function safeCachePut(cacheName, req, res) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(req, res);
  } catch {
    // Gracefully handle QuotaExceededError or restricted storage environments
  }
}

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) {
      await safeCachePut(cacheName, req, res.clone());
    }
    return res;
  } catch {
    return (await cache.match(req)) ?? (fallbackUrl ? await (await caches.open(PAGES)).match(fallbackUrl) : undefined) ?? Response.error();
  }
}

async function poolPageNetworkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) {
      await safeCachePut(POOL_PAGES, req, res.clone());
      await trimCache(POOL_PAGES, MAX_POOLS);
    }
    return res;
  } catch {
    const poolCache = await caches.open(POOL_PAGES);
    const cached = await poolCache.match(req);
    if (cached) return cached;
    const pagesCache = await caches.open(PAGES);
    return (await pagesCache.match('/offline')) ?? Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Static assets
  if (url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))) {
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { if (r.ok && r.status === 200) safeCachePut(STATIC, req, r.clone()); return r; })));
    return;
  }

  // Navigation requests
  if (req.mode === 'navigate') {
    // Never cache admin, arbiter, or personal authenticated pages
    if (EXCLUDED_PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      return;
    }

    // Visited pool page documents (bounded cache of last N pools)
    if (url.origin === self.location.origin && POOL_PAGE_PATTERN.test(url.pathname)) {
      e.respondWith(poolPageNetworkFirst(req));
      return;
    }

    // General navigation fallback to /offline
    e.respondWith(networkFirst(req, PAGES, '/offline'));
    return;
  }

  // Read-only cacheable API requests
  if (CACHEABLE_API.test(url.pathname) && !url.pathname.includes('/sharecard')) {
    e.respondWith(networkFirst(req, API));
  }
});
