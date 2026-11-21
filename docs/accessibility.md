# Accessibility

What the app does for people who use assistive technology, low vision, colour-blind
modes or reduced motion, and how the tests keep it that way. The target is WCAG 2.1 AA.
The general rules for new screens are in [design-system.md](design-system.md#accessibility).

## Reduced motion

`prefers-reduced-motion: reduce` turns all motion off. The rule is at the bottom of
[`app/globals.css`](../app/globals.css):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  a:active, button:active, .pool-card:hover { transform: none; }
}
```

Animations are removed, not shortened. The previous rule set `animation-duration: .01ms`, which
left the `stagger-in` delays (up to 240ms) in place, so list items stayed invisible for a moment
and the hover lift on `.pool-card` still moved the card.

Every source of motion in the app, and what happens under `reduce`:

| Source | Where | Under `reduce` |
|---|---|---|
| `rise-in` entrance (`.page-enter`, `.stagger-in`) | `globals.css`; home, explore, history, onboarding | No animation. Content is visible at once. |
| Colour, shadow and `transform` transitions on links, buttons and fields | `globals.css` | No transition. State changes (hover, focus, pressed) are instant but still visible. |
| Press feedback `a:active, button:active { transform: scale(.985) }` | `globals.css` | No transform. |
| Pool card hover lift and shadow | `.pool-card` | No lift. The shadow still changes, so the hover state is still visible. |
| Home "how it works" card lift, hero arrow nudge, explore arrow nudge | `app/page.tsx`, `app/explore/page.tsx` | Written with `motion-safe:`, so they do not exist under `reduce`. |
| Progress bar width transition | `app/explore/page.tsx` | The bar jumps to its value. The `progressbar` role and the text label are unchanged. |
| Smooth scrolling | `globals.css` | `scroll-behavior: auto`. |

Checked and not present: JavaScript animation (`requestAnimationFrame`, Web Animations,
`scrollIntoView({ behavior: 'smooth' })`), confetti, pulsing skeletons (the countdown skeleton is a
static block), route or view transitions.

Rules for new code:

- Prefer Tailwind's `motion-safe:` variant for anything that moves (`motion-safe:hover:-translate-y-1`).
- Never rely on animation to show a state. Show the state in text or shape first; motion is decoration.
- Do not read `matchMedia` in JavaScript for this. The CSS rule covers every element, and a script would
  have to be kept in step with it.

Test: [`tests/e2e/reduced-motion.spec.ts`](../tests/e2e/reduced-motion.spec.ts) runs with
`reducedMotion: 'reduce'` and checks the computed `animation-name` and `transition-duration` of every
element (and `::before`/`::after`) on the main screens, that no animation is running, and that content is
fully opaque immediately. A control test without the preference proves the check can fail.

## Screen readers

### Countdown

`components/pool/Countdown.tsx` has three parts:

1. The visual timer ("Closes in 2h 1m 5s") ticks every second and is `aria-hidden`.
2. A visually hidden description ("Closes in 2 hours 1 minute") in whole days, hours and minutes. It
   changes at most once a minute (once an hour or less while days remain), and it is not a live region,
   so a screen reader reads it when the user gets there instead of interrupting them. The urgency words
   ("act soon", "URGENT") are part of it, since the colour that shows them is invisible to a screen reader.
3. A `role="status"` region that is always mounted and empty until the deadline passes, then says
   "Closed for joining" once.

The test uses fake timers and a `MutationObserver` to count how often each part changes.

### Tier ladder

Each tier says what it is in words as well as colour: **Reached**, **Current price** or **Not reached yet**,
with a shape (check, filled dot, hollow dot) and a border style (solid, ring, dashed) that survive grayscale.
The DOM order is tier, price, status, which is the order a screen reader reads. The current tier has
`aria-current="true"`.

## Colour contrast

Targets: 4.5:1 for text, 3:1 for icons and the borders of form controls (WCAG 1.4.3 and 1.4.11).
Every pair below is asserted in [`lib/contrast.test.ts`](../lib/contrast.test.ts), which reads the real
Tailwind palette from `node_modules`. Add a row there when you use a new combination; the table is copied
from that list. The real-browser axe run in [`tests/e2e/a11y.spec.ts`](../tests/e2e/a11y.spec.ts) checks
`color-contrast` against what is actually rendered.

| Use | Pair | Ratio | Needed |
|---|---|---|---|
| Body text | `#14201a` on `#f6f8f6` | 15.73:1 | 4.5:1 |
| Body text on cards | `#14201a` on `white` | 16.78:1 | 4.5:1 |
| Hero price card text | `neutral-900` on `white` | 17.93:1 | 4.5:1 |
| Secondary text (most common) | `neutral-700` on `white` | 10.37:1 | 4.5:1 |
| Secondary text on the page | `neutral-700` on `#f6f8f6` | 9.71:1 | 4.5:1 |
| Tier ladder, upcoming tier | `neutral-700` on `neutral-50` | 9.93:1 | 4.5:1 |
| Skeleton and code blocks | `neutral-700` on `neutral-100` | 9.51:1 | 4.5:1 |
| Hints and back links (was neutral-500) | `neutral-600` on `#f6f8f6` | 7.32:1 | 4.5:1 |
| Supplier hints and labels (was gray-400/500) | `gray-600` on `#f6f8f6` | 7.08:1 | 4.5:1 |
| Supplier hints on cards (was gray-400/500) | `gray-600` on `white` | 7.56:1 | 4.5:1 |
| Supplier table headers | `gray-600` on `gray-50` | 7.23:1 | 4.5:1 |
| Supplier form labels | `gray-700` on `white` | 10.30:1 | 4.5:1 |
| Supplier neutral badge | `gray-700` on `gray-100` | 9.36:1 | 4.5:1 |
| Supplier headings | `gray-900` on `white` | 17.75:1 | 4.5:1 |
| Error text, critical countdown (was red-500/600) | `red-700` on `white` | 6.42:1 | 4.5:1 |
| Error text on the page | `red-700` on `#f6f8f6` | 6.02:1 | 4.5:1 |
| Badge: breached (was on red-100 already) | `red-700` on `red-100` | 5.27:1 | 4.5:1 |
| Admin and settings error text | `red-800` on `white` | 8.36:1 | 4.5:1 |
| Error explainer | `red-900` on `red-50` | 9.16:1 | 4.5:1 |
| Arbiter breach badge | `red-900` on `red-100` | 8.22:1 | 4.5:1 |
| Warning countdown, reserved bond (was amber-600/700) | `amber-800` on `white` | 7.09:1 | 4.5:1 |
| Warning countdown on the page | `amber-800` on `#f6f8f6` | 6.64:1 | 4.5:1 |
| Badge: pending (was amber-700) | `amber-800` on `amber-100` | 6.36:1 | 4.5:1 |
| Bond explainer, passkey notice | `amber-900` on `amber-50` | 8.73:1 | 4.5:1 |
| Closing-soon badge, flag chips | `amber-900` on `amber-100` | 8.13:1 | 4.5:1 |
| Offline banner | `amber-950` on `amber-100` | 13.47:1 | 4.5:1 |
| Badge: resolved (was green-700) | `green-800` on `green-100` | 6.49:1 | 4.5:1 |
| Badge: awaiting | `yellow-800` on `yellow-100` | 6.37:1 | 4.5:1 |
| Decorative separator text | `emerald-700` on `white` | 5.36:1 | 4.5:1 |
| Open badge | `emerald-800` on `emerald-50` | 7.23:1 | 4.5:1 |
| Selected state, reached tier | `emerald-900` on `emerald-50` | 9.14:1 | 4.5:1 |
| Secondary button label | `emerald-900` on `white` | 9.63:1 | 4.5:1 |
| Primary button, current tier chip | `white` on `emerald-800` | 7.61:1 | 4.5:1 |
| Header sign-up button | `white` on `emerald-900` | 9.63:1 | 4.5:1 |
| Destructive button | `white` on `red-700` | 6.42:1 | 4.5:1 |
| Supplier primary button | `white` on `indigo-600` | 6.46:1 | 4.5:1 |
| Supplier primary button, hover (was indigo-500) | `white` on `indigo-700` | 8.09:1 | 4.5:1 |
| Offer preview subtitle (was indigo-200) | `indigo-100` on `indigo-600` | 5.25:1 | 4.5:1 |
| Supplier tabs and links | `indigo-600` on `white` | 6.46:1 | 4.5:1 |
| Offer preview note | `indigo-700` on `indigo-50` | 7.24:1 | 4.5:1 |
| Area chips | `indigo-800` on `indigo-100` | 8.16:1 | 4.5:1 |
| Hero text | `white` on `emerald-950` | 15.18:1 | 4.5:1 |
| Hero and onboarding body text | `emerald-50/85` on `emerald-950` | 10.77:1 | 4.5:1 |
| Hero eyebrow | `emerald-100` on `emerald-950` | 13.36:1 | 4.5:1 |
| Hero accent and onboarding icons | `emerald-300` on `emerald-950` | 9.97:1 | 4.5:1 |
| Hero call to action | `emerald-950` on `amber-300` | 10.49:1 | 4.5:1 |
| Input placeholder | `#5b6660` on `white` | 5.98:1 | 4.5:1 |
| Input placeholder on the page | `#5b6660` on `#f6f8f6` | 5.60:1 | 4.5:1 |
| Control borders (was neutral-400, 2.5:1) | `neutral-500` on `white` | 4.74:1 | 3:1 |
| Control borders on the page | `neutral-500` on `#f6f8f6` | 4.44:1 | 3:1 |
| Supplier control borders and empty rating stars (was gray-300) | `gray-500` on `white` | 4.84:1 | 3:1 |
| Filled rating stars (was amber-400) | `amber-600` on `white` | 3.20:1 | 3:1 |
| Upcoming tier dashed border | `neutral-500` on `neutral-50` | 4.54:1 | 3:1 |
| Reached tier border | `emerald-800` on `emerald-50` | 7.23:1 | 3:1 |
| Focus ring | `#0b6b3a` on `white` | 6.61:1 | 3:1 |
| Focus ring on the page | `#0b6b3a` on `#f6f8f6` | 6.19:1 | 3:1 |
| Focus ring on the dark hero (green ring was 2.4:1) | `#fde68a` on `emerald-950` | 12.19:1 | 3:1 |

### What changed

Ratios are measured with the same code as the test. "Fix" rows failed AA; "margin" rows passed by
less than 0.1 and were moved to the next shade so a small palette change cannot tip them over.

| Was | Now | Measured before | |
|---|---|---|---|
| `text-neutral-500` on the page background | `text-neutral-600` | 4.44:1 | Fix |
| `text-gray-400` (supplier screens) | `text-gray-600` | 2.60:1 on white | Fix |
| `text-gray-500` on the page background or `gray-100` | `text-gray-600` | 4.53:1 and 4.39:1 | Fix |
| `text-red-500` | `text-red-700` | 3.81:1 on white | Fix |
| `text-red-600` on the page background | `text-red-700` | 4.47:1 | Fix |
| `text-amber-600` (warning countdown) | `text-amber-800` | 3.00:1 on the page background | Fix |
| `text-amber-700`, `text-green-700` on their `-100` badges and the bond total | `-800` | 4.52:1 and 4.50:1 | Margin |
| `text-indigo-200` on `indigo-600` | `text-indigo-100` | 4.33:1 | Fix |
| `hover:bg-indigo-500` under white text | `hover:bg-indigo-700` | 4.58:1 | Margin |
| `border-neutral-400` and `border-gray-300` on form controls | `border-neutral-500` and `border-gray-500` | 2.58:1 and 1.47:1, against 3:1 for a control boundary | Fix |
| Filled and empty rating stars `amber-400` and `gray-300` | `amber-600` and `gray-500` | 1.72:1 and 1.47:1 | Fix |
| Placeholder (browser default, `currentColor` at 50%) | `#5b6660` | about 3.25:1 | Fix |
| Green focus ring on the dark hero | light ring via `.surface-dark` | 2.30:1 | Fix |

Put `surface-dark` on any section with a dark background that contains links or buttons.

### Dark mode

The page is light only (`color-scheme: light`, light `--background`). The supplier screens carry
`dark:` variants that pair dark text and dark panels with each other, and they are only checked here
for the light theme. Do not add `dark:` text colours without a matching `dark:` background.

## Tests

| Test | What it covers | Run |
|---|---|---|
| `components/components.test.tsx`, `components/pool/Countdown.test.tsx` | Tier ladder text, countdown announcements | `pnpm test` |
| `components/a11y.test.tsx` | axe on components (no contrast) | `pnpm test` |
| `lib/contrast.test.ts` | Contrast of every pair in the table | `pnpm test` |
| `tests/e2e/a11y.spec.ts` | axe incl. `color-contrast` on home, explore, pool, supplier and admin, in English and Pidgin | `pnpm test:e2e` |
| `tests/e2e/reduced-motion.spec.ts` | No motion under `reduce` | `pnpm test:e2e` |
