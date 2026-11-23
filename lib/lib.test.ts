import { describe, expect, it } from 'vitest';
import { countdown, formatDate, formatDateTime, formatNaira, formatRelativeTime, formatTime, formatUsdc, fromWatDateTimeInput, groupDigits, relativeTimeParts, stroopsToNairaCeil, toStroops, toWatDateTimeInput, watDateKey } from './format';
import { payPreview, type Tier } from './pricing';
import { errorKeys, knownErrorCodes } from './errors/map';
import en from '../messages/errors.en.json';
import pcm from '../messages/errors.pcm.json';

const tiers: Tier[] = [{ minUnits: 100, unitPrice: toStroops('1') }, { minUnits: 200, unitPrice: toStroops('0.9') }, { minUnits: 400, unitPrice: toStroops('0.8') }];

describe('money formatting', () => {
  it('round trips USDC and groups naira', () => {
    expect(formatUsdc(toStroops('12.3456789'))).toBe('12.3456789');
    expect(formatUsdc(10_000_000n)).toBe('1');
    expect(() => toStroops('1.12345678')).toThrow();
    expect(groupDigits(1500000)).toBe('1,500,000');
    expect(formatNaira(75000)).toBe('₦75,000');
  });
  it('rounds naira estimates up so a payer is never under-quoted', () => {
    expect(stroopsToNairaCeil(toStroops('1'), 1500)).toBe(1500n);
    expect(stroopsToNairaCeil(1n, 1500)).toBe(1n);
  });
  it('counts down and stops at zero', () => {
    const now = Date.UTC(2026, 9, 5, 10, 0, 0);
    expect(countdown(now + 90_061_000, now)).toEqual({ done: false, days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(countdown(now - 5, now).done).toBe(true);
  });
});

describe('relativeTimeParts: picks the coarsest unit Intl.RelativeTimeFormat should use', () => {
  it('stays in seconds under a minute', () => {
    expect(relativeTimeParts(45)).toEqual({ value: 45, unit: 'second' });
    expect(relativeTimeParts(-45)).toEqual({ value: -45, unit: 'second' });
  });
  it('switches to minutes under an hour', () => {
    expect(relativeTimeParts(90)).toEqual({ value: 2, unit: 'minute' });
    expect(relativeTimeParts(-180)).toEqual({ value: -3, unit: 'minute' });
  });
  it('switches to hours under a day', () => {
    expect(relativeTimeParts(7_200)).toEqual({ value: 2, unit: 'hour' });
    expect(relativeTimeParts(-7_200)).toEqual({ value: -2, unit: 'hour' });
  });
  it('switches to days from a day up', () => {
    expect(relativeTimeParts(172_800)).toEqual({ value: 2, unit: 'day' });
    expect(relativeTimeParts(-86_400)).toEqual({ value: -1, unit: 'day' });
  });
});

describe('payPreview', () => {
  it('shows the max you pay now, the refund you can expect, and the next break', () => {
    const p = payPreview(tiers, 120, 100); // pool at 120 (tier 1); adding 100 -> 220 (tier 2)
    expect(formatUsdc(p.maxNow)).toBe('100');
    expect(formatUsdc(p.expectedUnitPrice)).toBe('0.9');
    expect(formatUsdc(p.expectedRefund)).toBe('10');
    expect(p.nextBreak).toEqual({ unitsToGo: 180, unitPrice: toStroops('0.8') });
    expect(payPreview(tiers, 450, 10).nextBreak).toBeNull();
  });
});

describe('contract error messages', () => {
  it('has English and Pidgin text for every contract error code', () => {
    for (const code of knownErrorCodes) {
      for (const [lang, msgs] of [['en', en], ['pcm', pcm]] as const) {
        const m = (msgs as Record<string, { what: string; todo: string }>)[String(code)];
        expect(m?.what, `${lang} text for error ${code}`).toBeTruthy();
        expect(m?.todo, `${lang} action for error ${code}`).toBeTruthy();
      }
    }
  });
  it('falls back to a generic message for unknown codes instead of leaking internals', () => {
    expect(errorKeys(309).what).toBe('errors.309.what');
    expect(errorKeys(99999).what).toBe('errors.generic.what');
    expect(errorKeys(undefined).todo).toBe('errors.generic.todo');
  });
});

import { percent, shortAddress } from './format';
describe('admin display helpers', () => {
  it('formats rates and shortens addresses', () => {
    expect(percent(0.0321)).toBe('3.2%');
    expect(percent(0)).toBe('0.0%');
    expect(shortAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe('GABCD…WXYZ');
    expect(shortAddress('short')).toBe('short');
  });
});

describe('Intl money and WAT date formatting (issue #48)', () => {
  it.each(['en', 'pcm'])('groups exact BigInt naira values for %s', (locale) => {
    const huge = 123456789012345678901234567890123456789n;
    expect(groupDigits(huge, locale)).toBe('123,456,789,012,345,678,901,234,567,890,123,456,789');
    expect(formatNaira(huge, locale)).toBe('₦123,456,789,012,345,678,901,234,567,890,123,456,789');
    expect(formatNaira(-1500n, locale)).toBe('-₦1,500');
    expect(formatNaira(0n, locale)).toBe('₦0');
  });

  it('rejects unsafe numeric inputs rather than silently losing money', () => {
    expect(() => formatNaira(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(formatNaira('9007199254740993')).toBe('₦9,007,199,254,740,993');
  });

  it.each(['en', 'pcm'])('uses Lagos time across midnight for %s', (locale) => {
    const justBefore = '2026-10-01T22:59:00.000Z';
    const afterMidnight = '2026-10-01T23:30:00.000Z';
    expect(watDateKey(justBefore)).toBe('2026-10-01');
    expect(watDateKey(afterMidnight)).toBe('2026-10-02');
    expect(formatDate(afterMidnight, locale, { day: 'numeric', month: 'numeric', year: 'numeric' }))
      .toBe(new Intl.DateTimeFormat(locale === 'pcm' ? 'pcm-NG' : 'en-NG', {
        timeZone: 'Africa/Lagos', day: 'numeric', month: 'numeric', year: 'numeric',
      }).format(new Date(afterMidnight)));
    expect(formatTime(afterMidnight, locale)).toContain('00:30');
    expect(formatDateTime(afterMidnight, locale)).toBeTruthy();
  });

  it('round trips WAT date-time input independently of browser timezone', () => {
    const utc = '2026-12-31T23:30:00.000Z';
    expect(toWatDateTimeInput(utc)).toBe('2027-01-01T00:30');
    expect(fromWatDateTimeInput('2027-01-01T00:30').toISOString()).toBe(utc);
    expect(() => fromWatDateTimeInput('2027-02-30T12:00')).toThrow();
  });

  it('localizes relative dates in one helper', () => {
    expect(formatRelativeTime(7_200, 'en')).toContain('2');
    expect(formatRelativeTime(-60, 'pcm')).toBeTruthy();
  });
});

describe('exact localized USDC formatting', () => {
  it.each(['en', 'pcm'])('keeps all seven stroop decimal places for %s', (locale) => {
    expect(formatUsdc('900719925474099312345678901', locale)).toBe('90071992547409931234.5678901');
    expect(formatUsdc(-1n, locale)).toBe('-0.0000001');
  });
});
