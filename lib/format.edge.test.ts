import { describe, expect, it } from 'vitest';
import { formatNaira, formatUsdc, groupDigits, stroopsToNairaCeil, toStroops } from './format';

/** Table tests for money formatting. Rounding rules are spelled out in each test name. */

describe('toStroops: USDC decimal -> integer stroops (floor is impossible: input is exact or rejected)', () => {
  const ok: [string, bigint][] = [
    ['0', 0n],
    ['0.0000001', 1n], // one stroop
    ['0.1', 1_000_000n],
    ['1', 10_000_000n],
    ['1.5', 15_000_000n],
    ['12.3456789', 123_456_789n], // maximum precision: 7 decimals
    ['1000000', 10_000_000_000_000n], // one million USDC
    ['123456789012345678901234567890', 123456789012345678901234567890n * 10_000_000n], // beyond Number.MAX_SAFE_INTEGER
  ];
  for (const [input, expected] of ok) {
    it(`accepts ${input} exactly as ${expected} stroops`, () => {
      expect(toStroops(input)).toBe(expected);
    });
  }

  const bad: string[] = [
    '', // empty
    '-1', // negative sign not allowed
    '+1', // leading plus not allowed
    '1.', // trailing dot
    '.5', // leading dot
    '1.12345678', // more than 7 decimals: refused, never silently rounded
    '1e3', // scientific notation
    '1,000', // thousands separator
    ' 1', // whitespace
    'abc',
    '1.2.3',
  ];
  for (const input of bad) {
    it(`rejects invalid input ${JSON.stringify(input)} with an error`, () => {
      expect(() => toStroops(input)).toThrow('invalid USDC amount');
    });
  }
});

describe('formatUsdc: integer stroops -> decimal (trailing zeros trimmed, no rounding)', () => {
  const cases: [bigint | string, string][] = [
    [0n, '0'],
    [1n, '0.0000001'], // one stroop
    [10n, '0.000001'],
    [10_000_000n, '1'], // exactly one USDC, no trailing ".0"
    [10_500_000n, '1.05'],
    [15_000_000n, '1.5'],
    [123_456_789n, '12.3456789'],
    [-1n, '-0.0000001'], // negative one stroop
    [-15_000_000n, '-1.5'],
    [-10_000_000n, '-1'],
    ['12345678900000000', '1234567890'], // string input, exact whole number
    [1_000_000_000_000_000_000_000n, '100000000000000'], // very large value
  ];
  for (const [input, expected] of cases) {
    it(`formats ${String(input)} as ${expected}`, () => {
      expect(formatUsdc(input)).toBe(expected);
    });
  }

  it('round trips every value in a sample range', () => {
    for (const s of [1n, 9n, 10n, 999_999n, 10_000_000n, 10_000_001n, 99_999_999_999n]) {
      expect(toStroops(formatUsdc(s)) === s, `stroops ${s}`).toBe(true);
    }
  });

  it('rejects non-integer input', () => {
    expect(() => formatUsdc('1.5')).toThrow();
    expect(() => formatUsdc('abc')).toThrow();
  });
});

describe('groupDigits and formatNaira', () => {
  const cases: [bigint | number | string, string][] = [
    [0, '0'],
    [7, '7'],
    [999, '999'], // no separator below 1,000
    [1000, '1,000'],
    [75000, '75,000'],
    [1500000, '1,500,000'],
    [-1234567, '-1,234,567'], // the minus sign is not grouped
    ['123456789012345678901234567890', '123,456,789,012,345,678,901,234,567,890'], // beyond float precision
    [9007199254740993n, '9,007,199,254,740,993'], // beyond Number.MAX_SAFE_INTEGER
  ];
  for (const [input, expected] of cases) {
    it(`groups ${String(input)} as ${expected}`, () => {
      expect(groupDigits(input)).toBe(expected);
    });
  }

  it('prefixes naira with the ₦ sign', () => {
    expect(formatNaira(0)).toBe('₦0');
    expect(formatNaira(1500000)).toBe('₦1,500,000');
    expect(formatNaira('2500')).toBe('₦2,500');
  });

  it('refuses a non-numeric string instead of printing garbage', () => {
    expect(() => groupDigits('12a')).toThrow();
    expect(() => formatNaira('')).toThrow();
  });
});

describe('stroopsToNairaCeil: naira estimate rounded UP so a payer is never under-quoted', () => {
  it('returns exact naira when the amount divides evenly', () => {
    expect(stroopsToNairaCeil(10_000_000n, 1500)).toBe(1500n); // 1 USDC at 1500
  });

  it('rounds up a fractional naira amount to the next whole naira', () => {
    expect(stroopsToNairaCeil(1n, 1500)).toBe(1n); // 0.00015 naira rounds up to 1
    expect(stroopsToNairaCeil(6_666_667n, 1500)).toBe(1001n); // 0.6666667 USDC at 1500 is 1000.00005 -> 1001
  });

  it('returns 0 for zero stroops', () => {
    expect(stroopsToNairaCeil(0n, 1500)).toBe(0n);
  });

  it('handles very large values without losing precision', () => {
    expect(stroopsToNairaCeil(1_000_000_000_000_000n, 1500)).toBe(150_000_000_000n); // 100,000,000 USDC at 1500
  });

  it('keeps a fractional exchange rate exact to six decimal places', () => {
    expect(stroopsToNairaCeil(10_000_000n, 1234.567891)).toBe(1235n); // 1234.567891 rounds up to 1235
  });

  it('a zero rate quotes zero naira', () => {
    expect(stroopsToNairaCeil(10_000_000n, 0)).toBe(0n);
  });
});

describe('Intl integer precision and locale behavior (issue #48)', () => {
  it('keeps rounding of naira quotes in BigInt, including huge values', () => {
    const veryLarge = 9007199254740993123456789n;
    expect(stroopsToNairaCeil(veryLarge, 1500))
      .toBe((veryLarge * 1500n + 10_000_000n - 1n) / 10_000_000n);
    expect(stroopsToNairaCeil(1n, 1500)).toBe(1n);
  });

  it.each(['en', 'pcm'])('prints the exact full amount in %s', (locale) => {
    expect(formatNaira(10n ** 30n, locale)).toBe('₦1,000,000,000,000,000,000,000,000,000,000');
    expect(groupDigits(-(10n ** 30n), locale)).toBe('-1,000,000,000,000,000,000,000,000,000,000');
  });
});
