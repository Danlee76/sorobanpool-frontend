import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { Client } from './helpers';

/** Real-browser axe scan (this one checks colour contrast, which jsdom cannot) on the main screens, in both languages. */
async function scan(page: import('@playwright/test').Page, label: string) {
  // color-contrast is named explicitly so nobody can switch it off by narrowing the tags (docs/accessibility.md).
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).options({ rules: { 'color-contrast': { enabled: true } } }).analyze();
  expect(r.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(',')}`), label).toEqual([]);
}

/** A pool close to its deadline, so the countdown shows its red "critical" colours as well as the tier ladder and join panel. */
const POOL_ID = '9001';
const pool = () => ({
  id: POOL_ID, state: 'Open', shareSlug: 'a11y', offerId: 'o1', organizer: 'GORG', supplier: 'GSUP',
  hub: { address: 'Wuse Market Gate B', contact: '08031234567' }, pickupWindow: { from: 'Mon 9am', to: 'Mon 5pm' },
  fillDeadline: new Date(Date.now() + 30 * 60_000).toISOString(), totalUnits: 150, receivedUnits: null, moq: 100, maxUnits: 400, members: 12, ngnPerUsd: 1500, filledAt: null, progressPct: 100,
  currentUnitPriceUsdc: '10000000', currentUnitPriceNaira: '15,000', nextBreak: { unitsToGo: 50, unitPriceUsdc: '9000000' },
  tiersUsdc: [{ minUnits: 100, unitPrice: '10000000' }, { minUnits: 200, unitPrice: '9000000' }, { minUnits: 400, unitPrice: '8000000' }], finalUnitPriceUsdc: null,
  offer: { id: 'o1', title: 'Mama Gold Rice 50kg', brand: 'Mama Gold', description: 'Rice', unitLabel: '50kg bag', category: 'rice', images: [], moq: 100, maxUnits: 400, maxPerMember: 60, leadTimeHours: 72, tiersUsdc: [], tiersNgn: [], validUntil: '2099-01-01T00:00:00Z' },
  trustMessage: 'Your money stays in escrow until the goods arrive.', myCommitment: null,
});

/** Admin screens need an ADMIN session; a bootstrap admin phone per run avoids the OTP rate limit. */
test('admin screens have no WCAG 2.1 AA violations', async ({ page }) => {
  // Dev server admin phones are +2348000000006..09 (and 01,03,04,05 used elsewhere); rotate so reruns do not hit the OTP limiter.
  const c = new Client(`+234800000000${6 + (Math.floor(Date.now() / 900_000) % 4)}`);
  const r = await c.call('/auth/otp/request', { phone: c.phone });
  const v = await c.call('/auth/otp/verify', { phone: c.phone, code: r.devCode });
  // Only seed the token once: this script re-runs on every navigation, and re-writing an already-rotated token would
  // look like token theft to the server (it revokes the session) and silently bounce us to onboarding.
  await page.addInitScript((t) => { if (!localStorage.getItem('sp.refresh')) localStorage.setItem('sp.refresh', t); }, v.refreshToken as string);
  for (const path of ['/admin', '/admin/suppliers', '/admin/users', '/admin/offers', '/admin/disputes', '/admin/audit']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Admin console' })).toBeVisible();
    expect(new URL(page.url()).pathname, 'stayed signed in on the requested page').toBe(path);
    await page.waitForLoadState('networkidle');
    await scan(page, `admin ${path}`);
  }
});

for (const locale of ['en', 'pcm'] as const) {
  test(`anonymous screens have no WCAG 2.1 AA violations (${locale})`, async ({ page, context }) => {
    await context.addCookies([{ name: 'locale', value: locale, url: 'http://localhost:3101' }]);
    for (const path of ['/', '/onboarding', '/offline']) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await scan(page, `${locale} ${path}`);
    }
  });

  test(`signed-in screens have no WCAG 2.1 AA violations (${locale})`, async ({ page, context }) => {
    await context.addCookies([{ name: 'locale', value: locale, url: 'http://localhost:3101' }]);
    const c = new Client(`+23480370${String(Date.now()).slice(-5)}`);
    const r = await c.call('/auth/otp/request', { phone: c.phone });
    const v = await c.call('/auth/otp/verify', { phone: c.phone, code: r.devCode });
    // Only seed the token once: this script re-runs on every navigation, and re-writing an already-rotated token would
  // look like token theft to the server (it revokes the session) and silently bounce us to onboarding.
  await page.addInitScript((t) => { if (!localStorage.getItem('sp.refresh')) localStorage.setItem('sp.refresh', t); }, v.refreshToken as string);
    for (const path of ['/', '/explore', '/organize', '/settings', '/supplier', '/supplier/offers/new', '/supplier/statement', '/arbiter']) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(new URL(page.url()).pathname, `${locale}: stayed signed in on ${path}`).toBe(path);
      await scan(page, `${locale} ${path}`);
    }
    // The pool screen needs a pool; stubbing the two calls it makes keeps this independent of what is on the dev server.
    await page.route(`**/v1/pools/${POOL_ID}`, (route) => route.fulfill({ json: pool() }));
    await page.route(`**/v1/pools/${POOL_ID}/stream`, (route) => route.abort());
    await page.goto(`/pools/${POOL_ID}`);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByTestId('tier').first()).toBeVisible();
    await scan(page, `${locale} /pools/${POOL_ID}`);
  });
}
