import { expect, test, type Page } from '@playwright/test';

/**
 * Nothing may animate or move under `prefers-reduced-motion: reduce` (docs/accessibility.md).
 * These screens are public, so no backend session is needed.
 */
const SCREENS = ['/', '/explore', '/onboarding'];

/** Every element (and its ::before/::after) that still has an animation or a non-zero transition. */
async function motion(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const seconds = (v: string) => v.split(',').map((x) => parseFloat(x));
    for (const el of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        const name = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0]}` : ''}${pseudo ?? ''}`;
        if (cs.animationName !== 'none') out.push(`${name} animation ${cs.animationName}`);
        if (seconds(cs.transitionDuration).some((d) => d > 0)) out.push(`${name} transition ${cs.transitionDuration}`);
      }
    }
    return { offenders: out, running: document.getAnimations().length };
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const path of SCREENS) {
    test(`${path} has no animation or transition @smoke`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      const m = await motion(page);
      expect(m.offenders).toEqual([]);
      expect(m.running, 'running animations').toBe(0);
    });
  }

  test('entrance content is shown as it is, with no entrance animation to wait for', async ({ page }) => {
    await page.goto('/');
    const entrance = page.locator('.page-enter').first();
    await expect(entrance).toBeVisible();
    // An animation that is merely shortened (the old `.01ms` rule) still reports its name, and its delays still apply.
    const s = await entrance.evaluate((el) => { const cs = getComputedStyle(el); return { name: cs.animationName, opacity: cs.opacity, transform: cs.transform }; });
    expect(s).toEqual({ name: 'none', opacity: '1', transform: 'none' });
  });

  test.describe('with a pointer that can hover', () => {
    // The phone profile is touch-only, where Tailwind's hover: variants are not applied at all.
    test.use({ hasTouch: false, isMobile: false });

    test('hover does not move cards', async ({ page }) => {
      await page.goto('/');
      const card = page.locator('[class*="hover:-translate-y-1"]').first();
      await card.scrollIntoViewIfNeeded();
      await card.hover();
      const moved = await card.evaluate((el) => { const cs = getComputedStyle(el); return { translate: cs.translate, transform: cs.transform }; });
      expect(moved.translate === 'none' || moved.translate === '0px').toBe(true);
      expect(moved.transform).toBe('none');
    });
  });
});

// Control: the same checks must see motion when the preference is off, otherwise the tests above prove nothing.
test.describe('motion allowed', () => {
  test.use({ reducedMotion: 'no-preference', hasTouch: false, isMobile: false });

  test('the home page does animate when the user has not asked for less', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
    const names = await page.evaluate(() => [...document.querySelectorAll('.page-enter')].map((el) => getComputedStyle(el).animationName));
    expect(names).toContain('rise-in');
  });

  test('cards do lift on hover when motion is allowed', async ({ page }) => {
    test.info().annotations.push({ type: 'control', description: 'proves the hover check above can fail' });
    await page.goto('/');
    const card = page.locator('[class*="hover:-translate-y-1"]').first();
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).translate)).toContain('-4px');
  });
});
