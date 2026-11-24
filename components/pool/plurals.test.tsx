import { screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { renderIntl } from '@/tests/render';
import { ProgressToMoq } from './ProgressToMoq';

/** Renders one message the way a component does, so the ICU plural is resolved by next-intl. */
function Message({ ns, k, values }: { ns: string; k: string; values: Record<string, string | number> }) {
  const t = useTranslations(ns);
  return <p data-testid="msg">{t(k, values)}</p>;
}
const text = (ns: string, k: string, values: Record<string, string | number>, locale: 'en' | 'pcm' = 'en') => {
  const { unmount } = renderIntl(<Message ns={ns} k={k} values={values} />, locale);
  const out = screen.getByTestId('msg').textContent;
  unmount();
  return out;
};

// Each case: namespace, key, the plural argument, other values, and the expected text for 0, 1 and 2.
const cases: [string, string, string, Record<string, string | number>, { en: [string, string, string]; pcm: [string, string, string] }][] = [
  ['common', 'unitsCount', 'count', {}, { en: ['0 units', '1 unit', '2 units'], pcm: ['0 unit', '1 unit', '2 units'] }],
  ['common', 'members', 'count', {}, { en: ['0 members', '1 member', '2 members'], pcm: ['0 member', '1 member', '2 members'] }],
  ['explore', 'minimum', 'count', {}, { en: ['Minimum 0 units', 'Minimum 1 unit', 'Minimum 2 units'], pcm: ['Minimum 0 unit', 'Minimum 1 unit', 'Minimum 2 units'] }],
  ['pool', 'toGo', 'count', {}, { en: ['0 units to go', '1 unit to go', '2 units to go'], pcm: ['0 unit remain', '1 unit remain', '2 units remain'] }],
  ['pool', 'progress', 'moq', { count: 5 }, { en: ['5 of 0 units to start', '5 of 1 unit to start', '5 of 2 units to start'], pcm: ['5 of 0 unit to start', '5 of 1 unit to start', '5 of 2 units to start'] }],
  ['pool', 'youHave', 'count', {}, { en: ['You joined with 0 units', 'You joined with 1 unit', 'You joined with 2 units'], pcm: ['You join with 0 unit', 'You join with 1 unit', 'You join with 2 units'] }],
  ['pool', 'nextBreakShort', 'count', {}, { en: ['0 more units and the price drops', '1 more unit and the price drops', '2 more units and the price drops'], pcm: ['0 more unit and price go drop', '1 more unit and price go drop', '2 more units and price go drop'] }],
  ['pool', 'toNext', 'count', { price: '₦10' }, { en: ['0 more units for ₦10 per unit', '1 more unit for ₦10 per unit', '2 more units for ₦10 per unit'], pcm: ['0 more unit for ₦10 per unit', '1 more unit for ₦10 per unit', '2 more units for ₦10 per unit'] }],
  ['pool', 'refundRightNow', 'count', {}, { en: ['Right now (0 units)', 'Right now (1 unit)', 'Right now (2 units)'], pcm: ['Right now (0 unit)', 'Right now (1 unit)', 'Right now (2 units)'] }],
  ['pool', 'unitDays', 'count', {}, { en: ['0 days', '1 day', '2 days'], pcm: ['0 day', '1 day', '2 days'] }],
  ['pool', 'unitHours', 'count', {}, { en: ['0 hours', '1 hour', '2 hours'], pcm: ['0 hour', '1 hour', '2 hours'] }],
  ['disputes', 'sla', 'hours', {}, { en: ['Decision due in 0 hours', 'Decision due in 1 hour', 'Decision due in 2 hours'], pcm: ['Decision go reach for 0 hour', 'Decision go reach for 1 hour', 'Decision go reach for 2 hours'] }],
];

// Pidgin follows the CLDR rule for `pcm`, where 0 takes the "one" form, as `unitDays` already did.
describe('plural messages for units, members, hours and days (#49)', () => {
  for (const [ns, k, arg, rest, expected] of cases) {
    for (const locale of ['en', 'pcm'] as const) {
      it(`${locale}: ${ns}.${k} for 0, 1 and 2`, () => {
        expect([0, 1, 2].map((n) => text(ns, k, { ...rest, [arg]: n }, locale))).toEqual(expected[locale]);
      });
    }
  }
});

describe('ProgressToMoq plural copy (#49)', () => {
  it.each([
    [99, 100, '99 of 100 units to start · 1 unit to go'],
    [98, 100, '98 of 100 units to start · 2 units to go'],
    [100, 100, 'Minimum reached'],
  ])('renders %i of %i as "%s"', (total, moq, expected) => {
    renderIntl(<ProgressToMoq totalUnits={total} moq={moq} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress to the minimum' })).toBeInTheDocument();
  });
  it('renders in Pidgin', () => {
    renderIntl(<ProgressToMoq totalUnits={1} moq={2} />, 'pcm');
    expect(screen.getByText('1 of 2 units to start · 1 unit remain')).toBeInTheDocument();
  });
});
