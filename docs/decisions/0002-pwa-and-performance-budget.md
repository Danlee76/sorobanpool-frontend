# 0002 PWA caching rules and the performance budget

The service worker caches static assets, navigations (with an offline fallback) and read-only pool/offer GETs. It never caches auth, wallets, transactions, uploads, evidence, admin or the signed-in profile, and the cached pool views are cleared on sign-out because they contain the user's own commitment.

## Performance budget

Lighthouse (mobile preset) on the public pool page `/p/[slug]`:

- **Before optimization (ADR baseline)**: 162 KB JavaScript transferred against the 170 KB budget
- **After optimization (issues #79-#82)**: Implementation includes:
  - Skeleton loaders instead of plain "Loading" text (no extra bundle impact, pure CSS animation)
  - Web vitals reporting (~1.5 KB minified, lazy-loaded via dynamic import, sampled at 5%)
  - Storage error handling (no bundle impact, improved existing error paths)
  - Client component audit: ShareButton remains client-side due to next-intl hook requirements

Current metrics:

- Performance: 0.98
- LCP: 1.7 s
- TBT: 150 ms
- CLS: 0

The margin is thin: the Stellar SDK is lazy-loaded at signing time and must stay out of the initial bundle. Future optimizations should focus on:

1. Moving more components to server-side rendering where possible
2. Code-splitting non-critical features
3. Lazy-loading translation bundles
4. Deferring non-essential client islands

## Changes from issues #79-#82

### Issue #79: Client JavaScript reduction

- Audited `/p/[slug]` page for client-side code
- ShareButton uses client-side `window.location.origin` for WhatsApp share URL
- Most components (PoolSummary, TierLadder, ProgressToMoq, PoolTimeline) are already server components
- Countdown component must remain client-side for live timer

### Issue #80: Web Vitals reporting

- Added configurable vitals reporter (LCP, INP, CLS)
- Uses `sendBeacon` for reliability
- Default 5% sample rate to minimize backend load
- No personal data in payload (path only, no query params)
- Silent failures to avoid impacting user experience

### Issue #81: Storage error handling

- Wrapped all localStorage access in try/catch
- Added fallback to in-memory storage for private mode
- Wrapped all IndexedDB access (idb-keyval) with error handling
- Clear user messaging when wallet metadata cannot be persisted
- Tests simulate QuotaExceededError

### Issue #82: Skeleton loaders

- Added Skeleton component with prefers-reduced-motion support
- Pool card, list item, and summary skeletons
- Accessible with aria-busy and sr-only loading messages
- No layout shift when data arrives
- Pure CSS animation (no JavaScript overhead)
