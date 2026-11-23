/** USDC on Stellar has 7 decimals; the API and the chain use integer stroops. */
export const STROOPS_PER_USDC = 10_000_000n;

export function toStroops(usdc: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(usdc);
  if (!m) throw new Error(`invalid USDC amount: ${usdc}`);
  return BigInt(m[1]!) * STROOPS_PER_USDC + BigInt((m[2] ?? '').padEnd(7, '0'));
}

/** "12.5" (no trailing zeros). Used in info sheets only: traders see naira, not dollars. */
export function formatUsdc(stroops: bigint | string, locale = 'en'): string {
  const v = BigInt(stroops);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / STROOPS_PER_USDC;
  const frac = (abs % STROOPS_PER_USDC).toString().padStart(7, '0').replace(/0+$/, '');
  const resolved = displayLocale(locale);
  const integer = new Intl.NumberFormat(resolved, { useGrouping: false, maximumFractionDigits: 0 }).format(whole);
  const decimal = new Intl.NumberFormat(resolved).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
  return `${neg ? '-' : ''}${integer}${frac ? `${decimal}${frac}` : ''}`;
}

/** USD money display from exact seven-decimal stroops. */
export function formatUsdStroops(stroops: bigint | string, locale = 'en'): string {
  const value = BigInt(stroops);
  return `${value < 0n ? '-' : ''}${formatUsdc(value < 0n ? -value : value, locale)}`;
}

/** The app has English and Nigerian Pidgin translations; money and dates use Nigerian conventions. */
export const WAT_TIME_ZONE = 'Africa/Lagos';

export function displayLocale(locale = 'en'): string {
  if (locale === 'en') return 'en-NG';
  if (locale === 'pcm') return 'pcm-NG';
  return locale;
}

/** Preserve integer precision all the way into Intl (never pass a BigInt through Number). */
function exactInteger(value: bigint | number | string): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError('amount must be a safe integer or an exact bigint/string');
  }
  return BigInt(value);
}

/** Locale-aware digit grouping, including integer values beyond Number.MAX_SAFE_INTEGER. */
export function groupDigits(n: bigint | number | string, locale = 'en'): string {
  return new Intl.NumberFormat(displayLocale(locale), {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(exactInteger(n));
}

/** Whole-naira amounts, formatted using Intl without floating-point conversion. */
export function formatNaira(n: bigint | number | string, locale = 'en'): string {
  return new Intl.NumberFormat(displayLocale(locale), {
    style: 'currency',
    currency: 'NGN',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(exactInteger(n));
}

/** An exchange-rate quote, unlike transferred funds, can include decimal naira. */
export function formatNairaRate(rate: number, locale = 'en'): string {
  if (!Number.isFinite(rate)) throw new RangeError('invalid exchange rate');
  return new Intl.NumberFormat(displayLocale(locale), {
    style: 'currency',
    currency: 'NGN',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
}

/** Decimal USD amounts supplied by reporting APIs (not integer stroops). */
export function formatUsdNumber(value: number, locale = 'en'): string {
  if (!Number.isFinite(value)) throw new RangeError('invalid dollar amount');
  return new Intl.NumberFormat(displayLocale(locale), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Decimal counts and other non-integer reporting values (not money balances). */
export function formatNumber(value: number, locale = 'en'): string {
  if (!Number.isFinite(value)) throw new RangeError('invalid number');
  return new Intl.NumberFormat(displayLocale(locale), { maximumFractionDigits: 2 }).format(value);
}

/** Format an absolute date in WAT regardless of the user's device time zone. */
export function formatDate(
  value: Date | string | number,
  locale = 'en',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(displayLocale(locale), {
    ...options,
    timeZone: WAT_TIME_ZONE,
  }).format(new Date(value));
}

export const formatDateTime = (value: Date | string | number, locale = 'en'): string =>
  formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' });

export const formatTime = (value: Date | string | number, locale = 'en'): string =>
  formatDate(value, locale, { hour: '2-digit', minute: '2-digit' });

/** Stable date-only grouping key calculated in WAT, not the browser's local zone. */
export function watDateKey(value: Date | string | number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WAT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Text for date and time controls that represent a WAT wall-clock value. */
export function toWatDateTimeInput(value: Date | string | number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WAT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** Nigeria observes UTC+01:00 year-round (no daylight saving). */
export function fromWatDateTimeInput(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('invalid WAT date and time');
  }
  const date = new Date(`${value}:00+01:00`);
  if (Number.isNaN(date.getTime()) || toWatDateTimeInput(date) !== value) {
    throw new Error('invalid WAT date and time');
  }
  return date;
}

/** Naira estimate for a stroop amount at `ngnPerUsd`, rounded up (never understate what someone pays). */
export function stroopsToNairaCeil(stroops: bigint, ngnPerUsd: number): bigint {
  const scaled = BigInt(Math.round(ngnPerUsd * 1_000_000));
  const num = stroops * scaled;
  const den = STROOPS_PER_USDC * 1_000_000n;
  return (num + den - 1n) / den;
}

export interface Countdown {
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function countdown(deadline: Date | string | number, now: number = Date.now()): Countdown {
  const ms = Math.max(0, new Date(deadline).getTime() - now);
  const s = Math.floor(ms / 1000);
  return { done: ms === 0, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

/** 0.0321 -> "3.2%". */
export const percent = (ratio: number, digits = 1): string => `${(ratio * 100).toFixed(digits)}%`;

/** Buckets a signed second offset into the unit Intl.RelativeTimeFormat should use: seconds under a minute, then minutes, hours, days. */
export function relativeTimeParts(diffSeconds: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return { value: Math.round(diffSeconds), unit: 'second' };
  if (abs < 3600) return { value: Math.round(diffSeconds / 60), unit: 'minute' };
  if (abs < 86400) return { value: Math.round(diffSeconds / 3600), unit: 'hour' };
  return { value: Math.round(diffSeconds / 86400), unit: 'day' };
}

/** Hours remaining below which the fill deadline should read as "closing soon" or "closing now". Shared with notification timing so a reminder fires at the same point the UI turns urgent. */
export const DEADLINE_WARN_HOURS = 24;
export const DEADLINE_CRITICAL_HOURS = 2;

/** Long addresses are unreadable on a phone: GABCD…WXYZ. */
export const shortAddress = (a: string): string => (a.length > 14 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a);

/** Fully localized relative time, keeping the bucketing logic in one place. */
export function formatRelativeTime(diffSeconds: number, locale = 'en'): string {
  const { value, unit } = relativeTimeParts(diffSeconds);
  return new Intl.RelativeTimeFormat(displayLocale(locale), { numeric: 'auto' }).format(value, unit);
}
