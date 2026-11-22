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

test('keyboard-only completion of the join and pay flow (@smoke)', async ({ page }) => {
  // Mock API routes so no real network, wallet or RPC is contacted
  const mockPool = {
    id: '99',
    state: 'Open',
    shareSlug: 'test-keyboard-pool',
    offerId: 'o1',
    organizer: 'GORGANIZER1234567890123456789012345678901234567890123456',
    supplier: 'GSUPPLIER1234567890123456789012345678901234567890123456',
    hub: { address: 'Wuse Market Gate B', contact: '08031234567' },
    pickupWindow: { from: 'Mon 9am', to: 'Mon 5pm' },
    fillDeadline: '2099-01-01T00:00:00Z',
    totalUnits: 60,
    receivedUnits: null,
    moq: 100,
    maxUnits: 200,
    members: 3,
    ngnPerUsd: 1500,
    filledAt: null,
    progressPct: 60,
    currentUnitPriceUsdc: '10000000',
    currentUnitPriceNaira: '15,000',
    nextBreak: { unitsToGo: 40, unitPriceUsdc: '9000000' },
    tiersUsdc: [
      { minUnits: 100, unitPrice: '10000000' },
      { minUnits: 200, unitPrice: '9000000' },
    ],
    finalUnitPriceUsdc: null,
    offer: {
      id: 'o1',
      title: 'Mama Gold Rice 50kg',
      brand: 'Mama Gold',
      description: '50kg bag',
      unitLabel: 'bag',
      category: 'rice',
      images: [],
      moq: 100,
      maxUnits: 200,
      maxPerMember: 60,
      leadTimeHours: 72,
      tiersUsdc: [],
      tiersNgn: [],
      validUntil: '2099-01-01T00:00:00Z',
    },
    trustMessage: 'Your money is held safely in escrow.',
    myCommitment: null,
  };

  await page.route('**/v1/pools/99', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockPool),
    });
  });

  await page.route('**/v1/pools/99/commit/prepare', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        txXdr: 'AAAAFakeXdrForTestingOnly1234567890',
        authEntries: [],
        validUntilLedger: 999999,
        contract: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        fn: 'commit',
      }),
    });
  });

  await page.route('**/v1/tx/submit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hash: 'tx-test-hash-keyboard', fn: 'commit' }),
    });
  });

  await page.route('**/v1/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'u-kb-test',
        phone: '+2348030000000',
        displayName: 'Amina',
        roles: ['TRADER'],
        walletAddress: 'GB3D4CFAKEWALLETADDRESSFORTESTING12345678901234567890',
      }),
    });
  });

  // Seed authenticated trader session and mock device wallet without biometric gate
  // so confirmWithDevice() returns 'unavailable' and calls explicitConfirm() -> ConfirmDialog
  await page.addInitScript(() => {
    localStorage.setItem('sp.refresh', 'mock-test-refresh-token');
    const req = indexedDB.open('keyval-store');
    req.onupgradeneeded = () => req.result.createObjectStore('keyval');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('keyval', 'readwrite');
      tx.objectStore('keyval').put(
        {
          kind: 'device',
          secret: 'SDZ7FAKEKEYPAIRSECRETFORTESTINGONLY1234567890123456789012345',
          publicKey: 'GB3D4CFAKEWALLETADDRESSFORTESTING12345678901234567890',
        },
        'sp.wallet.v1',
      );
    };
  });

  // Helper to assert visible focus indicator on focused element
  const assertFocusedWithIndicator = async (expectedRole?: string, expectedName?: RegExp | string) => {
    const focused = page.locator(':focus');
    if (expectedRole) {
      await expect(focused).toHaveRole(expectedRole);
    }
    if (expectedName) {
      await expect(focused).toHaveAccessibleName(expectedName);
    }
    const hasFocusStyle = await focused.evaluate((el) => {
      const s = window.getComputedStyle(el);
      const outlineW = parseFloat(s.outlineWidth) || 0;
      const hasOutline = outlineW > 0 && s.outlineStyle !== 'none';
      const hasShadow = s.boxShadow !== 'none' && s.boxShadow.length > 0;
      return hasOutline || hasShadow;
    });
    expect(hasFocusStyle, `Element ${expectedRole ?? ''} has visible focus indicator`).toBe(true);
  };

  // 1. Open pool page
  await page.goto('/pools/99');
  await expect(page.getByRole('heading', { name: 'Join this group buy' })).toBeVisible();

  // 2. Start navigation from known point at top of document using ONLY Tab
  await page.locator('body').focus();

  // Tab through until we reach the JoinPanel controls
  // Notice: if update banner from #71 is present, it is encountered in Tab order first,
  // but Tab proceeds smoothly through it into main page without trapping.
  let activeLabel = '';
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    activeLabel = (await page.locator(':focus').getAttribute('aria-label')) ?? '';
    if (activeLabel === 'Decrease units') break;
  }
  expect(activeLabel).toBe('Decrease units');

  // 3. Focused element is "Decrease units" button
  await assertFocusedWithIndicator('button', 'Decrease units');

  // 4. Tab to "How many units?" input
  await page.keyboard.press('Tab');
  await assertFocusedWithIndicator('textbox', 'How many units?');
  const unitsInput = page.getByLabel('How many units?');
  await expect(unitsInput).toHaveValue('1');

  // Arrow key interaction for unit selection (keyboard operable)
  await page.keyboard.press('ArrowUp');
  await expect(unitsInput).toHaveValue('2');
  await page.keyboard.press('ArrowDown');
  await expect(unitsInput).toHaveValue('1');

  // 5. Tab to "Increase units" button
  await page.keyboard.press('Tab');
  await assertFocusedWithIndicator('button', 'Increase units');

  // Space / Enter increments units
  await page.keyboard.press('Space');
  await expect(unitsInput).toHaveValue('2');

  // 6. Tab to "How does this work?" details summary
  await page.keyboard.press('Tab');
  await assertFocusedWithIndicator();
  await expect(page.locator(':focus')).toHaveText(/How does this work\?/i);

  // 7. Tab to "Pay now" button
  await page.keyboard.press('Tab');
  await assertFocusedWithIndicator('button', 'Pay now');

  // 8. Press Enter on "Pay now" to trigger the review / confirm modal
  await page.keyboard.press('Enter');

  // 9. Modal opens: role="dialog", aria-modal="true"
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // Initial focus inside modal is on Confirm button (or Cancel)
  const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
  const confirmBtn = dialog.getByRole('button', { name: 'Confirm' });

  // 10. Focus Trap test: Tab loops exclusively between controls inside modal
  await assertFocusedWithIndicator('button', 'Confirm');
  await page.keyboard.press('Tab');
  await assertFocusedWithIndicator('button', 'Cancel');
  await page.keyboard.press('Tab');
  await assertFocusedWithIndicator('button', 'Confirm');

  // Shift+Tab loops in reverse
  await page.keyboard.press('Shift+Tab');
  await assertFocusedWithIndicator('button', 'Cancel');
  await page.keyboard.press('Shift+Tab');
  await assertFocusedWithIndicator('button', 'Confirm');

  // 11. Escape closes the review/confirm layer and returns focus to the control that opened it
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Focus returned to "Pay now" button
  await assertFocusedWithIndicator('button', 'Pay now');

  // 12. Non-modal tab loop test: Tab outside modal is NOT trapped, can leave and return
  await page.keyboard.press('Shift+Tab'); // moves back to summary
  await expect(page.locator(':focus')).toHaveText(/How does this work\?/i);
  await page.keyboard.press('Tab'); // moves forward to "Pay now"
  await assertFocusedWithIndicator('button', 'Pay now');

  // 13. Re-open modal and confirm payment
  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Enter'); // Confirm is focused or press Enter on Confirm

  // 14. Dialog closes, action completes, success status is reachable and announced
  await expect(dialog).toBeHidden();
  const statusMsg = page.getByRole('status').filter({ hasText: 'You are in!' });
  await expect(statusMsg).toBeVisible();

  // 15. After completion, the payment leave guard is removed and navigation is not blocked
  const exploreNav = page.getByRole('link', { name: /Explore/i }).first();
  if (await exploreNav.isVisible()) {
    await exploreNav.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
  }
});

test('leave guard intercepts in-app link during active naira deposit and Escape returns focus (@smoke)', async ({ page }) => {
  await page.route('**/v1/pools/99', (route) =>
    route.fulfill({
      json: {
        ...pool(),
        id: '99',
        state: 'Open',
      },
    }),
  );
  await page.route('**/v1/pools/99/stream', (route) => route.abort());
  await page.route('**/v1/anchor/deposit/start', (route) =>
    route.fulfill({
      json: {
        transferId: 'mock_guard_1',
        amountNgn: '15300',
        estimatedUsdc: '10.2',
        instructions: { bank: 'Mock Bank', accountName: 'SorobanPool', accountNumber: '0000000000', reference: 'mock_guard_1' },
      },
    }),
  );
  await page.route('**/v1/anchor/transfers/mock_guard_1', (route) =>
    route.fulfill({ json: { id: 'mock_guard_1', status: 'PENDING' } }),
  );
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      json: {
        id: 'u-guard',
        phone: '+2348030000001',
        displayName: 'Amina',
        roles: ['TRADER'],
        walletAddress: 'GB3D4CFAKEWALLETADDRESSFORTESTING12345678901234567890',
      },
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem('sp.refresh', 'mock-test-refresh-token');
  });

  await page.goto('/pools/99');
  await page.getByRole('radio', { name: 'Naira bank transfer' }).check();
  await page.getByRole('button', { name: 'Get bank details' }).click();
  await expect(page.getByText('mock_guard_1')).toBeVisible();

  const navLink = page.getByRole('link', { name: /Explore/i }).first();
  await navLink.focus();
  await page.keyboard.press('Enter');

  const guardDialog = page.getByRole('dialog');
  await expect(guardDialog).toBeVisible();
  await expect(guardDialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator(':focus')).toHaveAccessibleName('Stay on payment');

  // Escape dismisses the leave guard dialog and returns focus to the triggering link
  await page.keyboard.press('Escape');
  await expect(guardDialog).toBeHidden();
  await expect(navLink).toBeFocused();
});

test('all visible interactive elements meet 48px tap target rules at 360px viewport (#67)', async ({ page, context }) => {
  // Deterministic setup at 360px width
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Mock API routes so all pages render deterministically
  await page.route('**/v1/pools?state=Open', (route) => route.fulfill({ json: [pool()] }));
  await page.route(`**/v1/pools/${POOL_ID}`, (route) => route.fulfill({ json: pool() }));
  await page.route(`**/v1/pools/${POOL_ID}/stream`, (route) => route.abort());
  await page.route('**/v1/me', (route) =>
    route.fulfill({
      json: {
        id: 'u-a11y',
        phone: '+2348030000001',
        displayName: 'Amina',
        roles: ['TRADER'],
        walletAddress: 'GB3D4CFAKEWALLETADDRESSFORTESTING12345678901234567890',
      },
    }),
  );

  // Set session and visit count in localStorage so InstallCard from #70 is displayed and measured
  await page.addInitScript(() => {
    localStorage.setItem('sp.refresh', 'mock-refresh-token');
    localStorage.setItem('sp.install_visit_count', '2');
    sessionStorage.setItem('sp.install_session_counted', '1');
  });

  const pagesToTest = ['/', '/explore', `/pools/${POOL_ID}`, '/settings'];
  const allViolations: Array<{ page: string; selector: string; text: string; size: string }> = [];

  for (const path of pagesToTest) {
    await page.goto(path);
    await page.waitForLoadState('domcontentloaded');

    // Disable CSS animations/transitions for accurate bounding boxes
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });

    const pageViolations = await page.evaluate((currentPath) => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          'a, button, input, select, textarea, [role="button"], [role="link"], summary',
        ),
      );

      // Collect only visible targets
      const visibleTargets = candidates.filter((el) => {
        if (el.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      const rects = visibleTargets.map((el) => ({ el, rect: el.getBoundingClientRect() }));

      /**
       * Allowed WCAG 2.5.8 and design exceptions:
       * 1. Inline links inside paragraphs where target size is constrained by running text.
       * 2. Spacing exception: target is at least 24px and has sufficient empty spacing around it.
       */
      function isAllowedException(el: HTMLElement, rect: DOMRect): boolean {
        // 1. Inline text link inside sentence/paragraph
        if (el.tagName === 'A') {
          const parent = el.parentElement;
          if (parent && (parent.tagName === 'P' || parent.tagName === 'SPAN')) {
            const parentText = parent.textContent?.trim() || '';
            const linkText = el.textContent?.trim() || '';
            const isInline = window.getComputedStyle(el).display.includes('inline');
            if (isInline && parentText.length > linkText.length) {
              return true;
            }
          }
        }

        // 2. WCAG 2.5.8 spacing exception for elements >= 24px with clear margin
        const minDim = Math.min(rect.width, rect.height);
        if (minDim >= 24) {
          const clearance = (48 - minDim) / 2;
          let obstructed = false;
          for (const other of rects) {
            if (other.el === el) continue;
            const o = other.rect;
            const overlaps = !(
              o.right < rect.left - clearance ||
              o.left > rect.right + clearance ||
              o.bottom < rect.top - clearance ||
              o.top > rect.bottom + clearance
            );
            if (overlaps) {
              obstructed = true;
              break;
            }
          }
          if (!obstructed) return true;
        }

        return false;
      }

      const failures: Array<{ page: string; selector: string; text: string; size: string }> = [];

      for (const { el, rect } of rects) {
        // Must meet 48x48 px (allowing 0.5px subpixel tolerance) or satisfy exception
        if ((rect.width < 47.5 || rect.height < 47.5) && !isAllowedException(el, rect)) {
          const selector = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : '');
          failures.push({
            page: currentPath,
            selector,
            text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30),
            size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          });
        }
      }

      return failures;
    }, path);

    allViolations.push(...pageViolations);
  }

  expect(
    allViolations,
    `Found interactive targets smaller than 48x48 CSS px:\n${allViolations.map((v) => `[${v.page}] ${v.selector} ("${v.text}"): ${v.size}`).join('\n')}`,
  ).toEqual([]);
});

