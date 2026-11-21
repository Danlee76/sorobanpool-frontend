import { stroopsToNairaCeil } from './format';

/** Share added to the naira amount: the rate that counts is the one when the bank transfer arrives, and it can move. */
export const NAIRA_BUFFER = 1.02;
/** Fee basis points corresponding to the 2% naira buffer (200 bps = 2%). */
export const NAIRA_BUFFER_BPS = 200n;
/** Threshold in seconds at or below which a valid quote enters the `expiring` state. */
export const EXPIRING_THRESHOLD_SECONDS = 30;
/** Default quote validity window (2 minutes) when deriving an estimated quote locally. */
export const DEFAULT_QUOTE_TTL_MS = 120_000;

export interface AnchorQuote {
  id?: string;
  amountNgn?: string | number | null;
  feeNgn?: string | number | null;
  rate?: string | number | null;
  totalNgn?: string | number | null;
  expiresAt?: string | number | null;
  serverTime?: string | number | null;
}

export type QuoteStatus = 'fresh' | 'expiring' | 'expired' | 'refreshing' | 'failed';

export interface EvaluatedQuote {
  amountKobo: bigint | null;
  feeKobo: bigint | null;
  rateKobo: bigint | null;
  totalKobo: bigint | null;
  expiresAtMs: number | null;
  serverTimeMs: number | null;
  hasMissingFields: boolean;
  totalMismatch: boolean;
}

/**
 * Parses a non-negative decimal NGN amount into exact integer kobo (1 NGN = 100 kobo).
 * Uses half-up rounding when more than 2 fractional digits are supplied; never uses JS floats for arithmetic.
 */
export function parseNgnToKobo(value: string | number | undefined | null): bigint | null {
  if (value === undefined || value === null) return null;
  const raw =
    typeof value === 'number'
      ? Number.isFinite(value) && value >= 0
        ? value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
        : ''
      : value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const whole = BigInt(match[1]!);
  const fracRaw = match[2] ?? '';
  if (fracRaw.length <= 2) {
    return whole * 100n + BigInt(fracRaw.padEnd(2, '0'));
  }
  const kept = BigInt(fracRaw.slice(0, 2));
  const nextDigit = Number(fracRaw[2]);
  const rounded = nextDigit >= 5 ? kept + 1n : kept;
  return whole * 100n + rounded;
}

/** Formats exact integer kobo as Naira with 2 decimals and thousands grouping (e.g. 153000n -> "₦1,530.00"). */
export function formatKobo(kobo: bigint): string {
  const neg = kobo < 0n;
  const abs = neg ? -kobo : kobo;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}₦${grouped}.${frac}`;
}

/** Formats exact integer kobo as a plain decimal API payload string (omits ".00" for whole naira). */
export function formatKoboPlain(kobo: bigint): string {
  const whole = kobo / 100n;
  const frac = kobo % 100n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(2, '0')}`;
}

/** Parses an ISO timestamp or epoch milliseconds into epoch ms. */
export function parseTimestampMs(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Evaluates an AnchorQuote with exact integer kobo arithmetic:
 * - Never invents missing fee, rate, amount, or expiry fields.
 * - Ensures total = amount + fee; if the anchor provides its own totalNgn, verifies exact equality and flags mismatches.
 */
export function evaluateQuote(quote: AnchorQuote): EvaluatedQuote {
  const amountKobo = parseNgnToKobo(quote.amountNgn);
  const feeKobo = parseNgnToKobo(quote.feeNgn);
  const parsedRate = parseNgnToKobo(quote.rate);
  const rateKobo = parsedRate !== null && parsedRate > 0n ? parsedRate : null;
  const expiresAtMs = parseTimestampMs(quote.expiresAt);
  const serverTimeMs = parseTimestampMs(quote.serverTime);

  let totalKobo: bigint | null = null;
  let totalMismatch = false;

  if (amountKobo !== null && feeKobo !== null) {
    const computedTotal = amountKobo + feeKobo;
    if (quote.totalNgn !== undefined && quote.totalNgn !== null && String(quote.totalNgn).trim() !== '') {
      const anchorTotal = parseNgnToKobo(quote.totalNgn);
      if (anchorTotal === null || anchorTotal !== computedTotal) {
        totalMismatch = true;
      }
      totalKobo = anchorTotal ?? computedTotal;
    } else {
      totalKobo = computedTotal;
    }
  }

  const hasMissingFields =
    amountKobo === null ||
    feeKobo === null ||
    rateKobo === null ||
    expiresAtMs === null ||
    totalKobo === null;

  return {
    amountKobo,
    feeKobo,
    rateKobo,
    totalKobo,
    expiresAtMs,
    serverTimeMs,
    hasMissingFields,
    totalMismatch,
  };
}

/**
 * Builds an estimated local quote from `maxNow` (stroops) and `ngnPerUsd` using exact BigInt arithmetic.
 * Base amount rounds UP to whole naira (matching `stroopsToNairaCeil`), and the 2% buffer/fee rounds UP to whole naira
 * so the payer is never under-quoted and total = amount + fee exactly.
 */
export function buildEstimatedQuote(maxNow: bigint, ngnPerUsd: number, nowMs: number): AnchorQuote {
  const baseNgn = stroopsToNairaCeil(maxNow, ngnPerUsd);
  const baseKobo = baseNgn * 100n;
  // 2% fee rounded UP to whole naira (100 kobo) to stay parity-consistent with Math.ceil(baseNgn * 1.02)
  const feeNgn = (baseNgn * NAIRA_BUFFER_BPS + 9_999n) / 10_000n;
  const feeKobo = feeNgn * 100n;
  const totalKobo = baseKobo + feeKobo;
  return {
    amountNgn: formatKoboPlain(baseKobo),
    feeNgn: formatKoboPlain(feeKobo),
    rate: ngnPerUsd,
    totalNgn: formatKoboPlain(totalKobo),
    expiresAt: nowMs + DEFAULT_QUOTE_TTL_MS,
  };
}

/** Computes remaining milliseconds and seconds from expiry, clock, and optional server clock offset. */
export function computeQuoteRemaining(
  expiresAtMs: number | null,
  nowMs: number,
  clockOffsetMs: number,
): { remainingMs: number; remainingSeconds: number; timeState: 'fresh' | 'expiring' | 'expired' } {
  if (expiresAtMs === null) {
    return { remainingMs: 0, remainingSeconds: 0, timeState: 'expired' };
  }
  const adjustedNow = nowMs + clockOffsetMs;
  const remainingMs = Math.max(0, expiresAtMs - adjustedNow);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  if (remainingMs <= 0) {
    return { remainingMs: 0, remainingSeconds: 0, timeState: 'expired' };
  }
  if (remainingSeconds <= EXPIRING_THRESHOLD_SECONDS) {
    return { remainingMs, remainingSeconds, timeState: 'expiring' };
  }
  return { remainingMs, remainingSeconds, timeState: 'fresh' };
}
