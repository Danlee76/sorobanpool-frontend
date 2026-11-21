import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.1 AA contrast for every text/icon/UI colour pair the components use (light theme, which is the only
 * theme the page background supports). The table in docs/accessibility.md is generated from this list: keep the
 * two in step. jsdom cannot compute contrast, so this complements the real-browser axe run in tests/e2e/a11y.spec.ts.
 */

// Tailwind's own palette, read from the installed version so the numbers are never hand-copied.
const theme = readFileSync(resolvePath(process.cwd(), 'node_modules/tailwindcss/theme.css'), 'utf8');

type RGB = [number, number, number];
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklch(l: number, c: number, h: number): RGB {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
  return lin.map((v) => Math.round(toSrgb(clamp(v)) * 255)) as RGB;
}

function token(name: string): RGB {
  if (name.startsWith('#')) {
    const h = name.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  }
  if (name === 'white') return [255, 255, 255];
  const m = new RegExp(`--color-${name}: oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+|none)\\)`).exec(theme);
  if (!m) throw new Error(`unknown colour ${name}`);
  return oklch(Number(m[1]) / 100, Number(m[2]), m[3] === 'none' ? 0 : Number(m[3]));
}

/** "emerald-50/85" is 85% opacity over `over`. */
function resolve(spec: string, over: RGB): RGB {
  const [name, alpha] = spec.split('/');
  const rgb = token(name!);
  if (!alpha) return rgb;
  const a = Number(alpha) / 100;
  return rgb.map((v, i) => Math.round(v * a + over[i]! * (1 - a))) as RGB;
}

const luminance = ([r, g, b]: RGB) => {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export function ratio(fg: string, bg: string): number {
  const back = token(bg);
  const [a, b] = [luminance(resolve(fg, back)), luminance(back)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const PAGE = '#f6f8f6'; // --background in globals.css
const INK = '#14201a'; // --foreground

/** [foreground, background, minimum ratio, where it is used]. 4.5 for text, 3 for icons and control borders. */
export const PAIRS: [fg: string, bg: string, min: number, use: string][] = [
  [INK, PAGE, 4.5, 'Body text'],
  [INK, 'white', 4.5, 'Body text on cards'],
  ['neutral-900', 'white', 4.5, 'Hero price card text'],
  ['neutral-700', 'white', 4.5, 'Secondary text (most common)'],
  ['neutral-700', PAGE, 4.5, 'Secondary text on the page'],
  ['neutral-700', 'neutral-50', 4.5, 'Tier ladder, upcoming tier'],
  ['neutral-700', 'neutral-100', 4.5, 'Skeleton and code blocks'],
  ['neutral-600', PAGE, 4.5, 'Hints and back links (was neutral-500)'],
  ['gray-600', PAGE, 4.5, 'Supplier hints and labels (was gray-400/500)'],
  ['gray-600', 'white', 4.5, 'Supplier hints on cards (was gray-400/500)'],
  ['gray-600', 'gray-50', 4.5, 'Supplier table headers'],
  ['gray-700', 'white', 4.5, 'Supplier form labels'],
  ['gray-700', 'gray-100', 4.5, 'Supplier neutral badge'],
  ['gray-900', 'white', 4.5, 'Supplier headings'],
  ['red-700', 'white', 4.5, 'Error text, critical countdown (was red-500/600)'],
  ['red-700', PAGE, 4.5, 'Error text on the page'],
  ['red-700', 'red-100', 4.5, 'Badge: breached'],
  ['red-800', 'white', 4.5, 'Admin and settings error text'],
  ['red-900', 'red-50', 4.5, 'Error explainer'],
  ['red-900', 'red-100', 4.5, 'Arbiter breach badge'],
  ['amber-800', 'white', 4.5, 'Warning countdown, reserved bond (was amber-600/700)'],
  ['amber-800', PAGE, 4.5, 'Warning countdown on the page'],
  ['amber-800', 'amber-100', 4.5, 'Badge: pending (was amber-700)'],
  ['amber-900', 'amber-50', 4.5, 'Bond explainer, passkey notice'],
  ['amber-900', 'amber-100', 4.5, 'Closing-soon badge, flag chips'],
  ['amber-950', 'amber-100', 4.5, 'Offline banner'],
  ['green-800', 'green-100', 4.5, 'Badge: resolved (was green-700)'],
  ['yellow-800', 'yellow-100', 4.5, 'Badge: awaiting'],
  ['emerald-700', 'white', 4.5, 'Decorative separator text'],
  ['emerald-800', 'emerald-50', 4.5, 'Open badge'],
  ['emerald-900', 'emerald-50', 4.5, 'Selected state, reached tier'],
  ['emerald-900', 'white', 4.5, 'Secondary button label'],
  ['white', 'emerald-800', 4.5, 'Primary button, current tier chip'],
  ['white', 'emerald-900', 4.5, 'Header sign-up button'],
  ['white', 'red-700', 4.5, 'Destructive button'],
  ['white', 'indigo-600', 4.5, 'Supplier primary button'],
  ['white', 'indigo-700', 4.5, 'Supplier primary button, hover (was indigo-500)'],
  ['indigo-100', 'indigo-600', 4.5, 'Offer preview subtitle (was indigo-200)'],
  ['indigo-600', 'white', 4.5, 'Supplier tabs and links'],
  ['indigo-700', 'indigo-50', 4.5, 'Offer preview note'],
  ['indigo-800', 'indigo-100', 4.5, 'Area chips'],
  ['white', 'emerald-950', 4.5, 'Hero text'],
  ['emerald-50/85', 'emerald-950', 4.5, 'Hero and onboarding body text'],
  ['emerald-100', 'emerald-950', 4.5, 'Hero eyebrow'],
  ['emerald-300', 'emerald-950', 4.5, 'Hero accent and onboarding icons'],
  ['emerald-950', 'amber-300', 4.5, 'Hero call to action'],
  ['#5b6660', 'white', 4.5, 'Input placeholder'],
  ['#5b6660', PAGE, 4.5, 'Input placeholder on the page'],
  // Icons and control boundaries: 3:1 (WCAG 1.4.11).
  ['neutral-500', 'white', 3, 'Control borders (was neutral-400, 2.6:1)'],
  ['neutral-500', PAGE, 3, 'Control borders on the page'],
  ['gray-500', 'white', 3, 'Supplier control borders and empty rating stars (was gray-300)'],
  ['amber-600', 'white', 3, 'Filled rating stars (was amber-400)'],
  ['neutral-500', 'neutral-50', 3, 'Upcoming tier dashed border'],
  ['emerald-800', 'emerald-50', 3, 'Reached tier border'],
  ['#0b6b3a', 'white', 3, 'Focus ring'],
  ['#0b6b3a', PAGE, 3, 'Focus ring on the page'],
  ['#fde68a', 'emerald-950', 3, 'Focus ring on the dark hero (green ring was 2.3:1)'],
];

describe('WCAG AA colour contrast of the palette in use', () => {
  it('checks the maths against known values', () => {
    expect(ratio('white', '#000000')).toBeCloseTo(21, 1);
    expect(ratio('#767676', 'white')).toBeCloseTo(4.54, 1); // the classic AA grey
  });

  it.each(PAIRS)('%s on %s needs %d:1 (%s)', (fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('catches the colours this audit replaced', () => {
    expect(ratio('gray-400', 'white')).toBeLessThan(4.5);
    expect(ratio('red-600', PAGE)).toBeLessThan(4.5);
    expect(ratio('neutral-400', 'white')).toBeLessThan(3);
    expect(ratio('#0b6b3a', 'emerald-950')).toBeLessThan(3);
  });
});
