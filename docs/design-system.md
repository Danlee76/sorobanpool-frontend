# Design system

The conventions the app's screens follow: colour, type, spacing, tap targets,
components and copy. Every example below is copied from a real component, so
if you change one, check the component it came from. The tokens live in
[`app/globals.css`](../app/globals.css).

## Colour

Two sources, both in use. The CSS variables set the page itself; the Tailwind
palette does most of the work inside components.

| Token | Value | Used for |
|---|---|---|
| `--background` | `#f6f8f6` | Page background (light theme) |
| `--foreground` | `#14201a` | Body text |
| `--brand` | `#075e4b` | Brand colour |
| `--brand-dark` | `#064838` | Brand colour, pressed or dark states |
| `--accent` | `#e9a33b` | Highlights |
| focus outline | `#0b6b3a` | `:focus-visible` ring, 3px |

Components use these Tailwind classes:

| Role | Class |
|---|---|
| Primary action | `bg-emerald-800` with `text-white`; hover `bg-emerald-900` |
| Selected or positive state | `bg-emerald-50` with `border-emerald-800` |
| Secondary text | `text-neutral-700` |
| Borders | `border-neutral-300` (cards), `border-neutral-500` (controls, 3:1) |
| Error text | `text-red-800` |

Do not use colour alone to show state. Pair it with text or an icon, and keep
text contrast at WCAG 2.1 AA. The e2e accessibility tests check contrast in a
real browser.

## Type scale

Classes used on the screens today:

| Class | Use |
|---|---|
| `text-2xl font-bold` | Page heading (`h1`) |
| `text-lg font-bold` | Primary button label, emphasised figures |
| `text-base` | Body text (the default) |
| `text-sm` | Secondary text, helper text, list details |
| `text-xs` | Labels and fine print. Keep it to short strings |

The font is the system UI font stack from `globals.css`. No web font is loaded
(see [ADR 0002](decisions/0002-pwa-and-performance-budget.md)), so do not add
one without an ADR.

## Spacing and layout

- Stack related items with `space-y-2` (tight), `space-y-4` (within a card) or
  `space-y-6` (between sections).
- Page gutter: `px-4` on phones and `md:px-10` from the medium breakpoint up.
- Page width: `mx-auto w-full max-w-6xl`, centred.
- Pick spacing from the Tailwind scale. Do not use arbitrary pixel values
  unless a fixed size is required, as with the header height `h-[72px]`.

## Tap targets

Every control a finger can hit is at least 44px tall, and most are 48px:

- Header links and small inline controls: `min-h-11` (44px).
- Form controls, primary buttons and list rows: `min-h-12` (48px).
- Icon steppers: `size-12`.

## Components

### Button

From the join panel's primary action:

```tsx
<button
  type="button"
  disabled={busy}
  onClick={() => void pay()}
  className="min-h-12 w-full rounded-xl bg-emerald-800 text-lg font-bold text-white disabled:opacity-60"
>
  {busy ? t('paying') : t('payNow')}
</button>
```

Use `type="button"` unless the button submits a form. Disable with
`disabled:opacity-60` and keep the label meaningful while busy.

### Input

From the quantity field in the same panel:

```tsx
<input
  id="units"
  inputMode="numeric"
  pattern="[0-9]*"
  value={clamped}
  onChange={(e) => setUnits(Number(e.target.value.replace(/\D/g, '')) || 1)}
  className="h-12 w-20 rounded-lg border border-neutral-500 text-center text-lg"
/>
```

Every input needs a visible `<label>` linked by `htmlFor`/`id`. The tests find
fields with `getByLabel`, so a label is also what keeps them testable.
Use `inputMode` and `pattern` for numeric entry.

### Card

Used across several screens:

```tsx
<section className="space-y-4 rounded-xl border border-neutral-300 bg-white p-4">
  <h2 className="font-semibold">{t('language')}</h2>
  {/* content */}
</section>
```

Pool cards use the `.pool-card` utility from `globals.css`. It adds a shadow
and a hover lift. The lift is disabled under `prefers-reduced-motion`.

### Bottom sheet and dialogs

Sheets are full width on phones and become centred on larger screens:
`w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl`. Use
`components/ConfirmDialog.tsx` for confirmations rather than building a new one.

### Naming and placement

- Component files are PascalCase and match the export: `JoinPanel.tsx`
  exports `JoinPanel`.
- Group components by area under `components/` (`pool/`, `home/`,
  `supplier/`, `brand/`, `ui/`). Put a component used on one route next to
  that route's area.
- Put a test next to the component, named `<Name>.test.tsx` or
  `<name>.test.tsx`, following the files already in `components/`.

## Copy and translations

- No user-facing text in components. Use `t('key')` from next-intl, and add the
  key to both `messages/en.json` and `messages/pcm.json`.
- Counts use ICU plurals: `{count, plural, one {# member} other {# members}}`.
- Keep placeholders identical in both languages. The test in
  `lib/messages.test.ts` fails when a key is missing or a placeholder differs.
- Plain language only. The test in `lib/messages.test.ts` rejects banned
  crypto terms in both languages. For the reasons behind the wording, see
  [`ux-writing.md`](ux-writing.md).

## Accessibility

- Keep the visible focus ring from `globals.css`. Do not remove the outline
  without a replacement.
- Respect `prefers-reduced-motion`. The global rule in `globals.css` removes
  animations and transitions; write anything that moves with the `motion-safe:`
  variant. Details in [accessibility.md](accessibility.md#reduced-motion).
- Check every new colour pair against [accessibility.md](accessibility.md#colour-contrast)
  and add it to `lib/contrast.test.ts`.
- Label every control and use semantic elements (`button`, `a`, `h1`–`h3`)
  before adding ARIA.
