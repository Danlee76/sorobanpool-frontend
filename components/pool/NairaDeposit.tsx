'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api, ApiError } from '@/lib/api';
import { formatNaira, stroopsToNairaCeil } from '@/lib/format';
import { usePaymentLeaveGuard } from '@/lib/usePaymentLeaveGuard';
import {
  buildEstimatedQuote,
  computeQuoteRemaining,
  evaluateQuote,
  EXPIRING_THRESHOLD_SECONDS,
  formatKobo,
  formatKoboPlain,
  NAIRA_BUFFER,
  type AnchorQuote,
  type QuoteStatus,
} from '@/lib/naira-quote';

export { EXPIRING_THRESHOLD_SECONDS, NAIRA_BUFFER };
export type { AnchorQuote, QuoteStatus };

interface Start {
  transferId: string;
  instructions: { bank: string; accountName: string; accountNumber: string; reference: string };
  amountNgn: string;
  estimatedUsdc: string;
}
interface Transfer {
  id: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
}

const TESTING = process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'mainnet';

export interface NairaDepositProps {
  maxNow: bigint;
  ngnPerUsd: number;
  onReady: () => void;
  /** Optional anchor quote response; missing fields are shown as unavailable rather than invented. */
  initialQuote?: AnchorQuote;
  /** Optional quote refresh fetcher; defaults to POST /anchor/quote. */
  fetchQuote?: (amountNgn: string) => Promise<AnchorQuote>;
  /** Injectable clock in epoch ms (defaults to Date.now) for deterministic countdowns. */
  clock?: () => number;
}

/** Deposit naira by bank transfer, showing fee, rate, total, and quote expiry before confirming. */
export function NairaDeposit({
  maxNow,
  ngnPerUsd,
  onReady,
  initialQuote,
  fetchQuote,
  clock = Date.now,
}: NairaDepositProps) {
  const t = useTranslations('naira');
  const locale = useLocale();
  const [start, setStart] = useState<Start | null>(null);
  const [status, setStatus] = useState<Transfer['status'] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // Active ONLY while confirming deposit start or waiting for an issued bank transfer to arrive.
  // Quote countdown ticks and refreshes never activate or toggle the guard.
  const paymentInProgress = busy || (start !== null && status === 'PENDING');
  const { dialog: leaveGuardDialog } = usePaymentLeaveGuard(paymentInProgress);

  const [quoteEpochMs] = useState<number>(() => clock());
  const [refreshedQuote, setRefreshedQuote] = useState<{
    maxNow: bigint;
    ngnPerUsd: number;
    quote: AnchorQuote;
    offsetMs: number;
  } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => clock());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>(null);

  const ready = useRef(onReady);
  const clockRef = useRef(clock);
  const refreshingRef = useRef(false);
  const quoteVersionRef = useRef(1);

  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  const initialOffsetMs = useMemo(() => {
    if (!initialQuote) return 0;
    const ev = evaluateQuote(initialQuote);
    return ev.serverTimeMs !== null ? ev.serverTimeMs - quoteEpochMs : 0;
  }, [initialQuote, quoteEpochMs]);

  const activeRefresh =
    refreshedQuote && refreshedQuote.maxNow === maxNow && refreshedQuote.ngnPerUsd === ngnPerUsd
      ? refreshedQuote
      : null;

  const quote = useMemo<AnchorQuote>(() => {
    if (activeRefresh) return activeRefresh.quote;
    if (initialQuote !== undefined) return initialQuote;
    return buildEstimatedQuote(maxNow, ngnPerUsd, quoteEpochMs);
  }, [activeRefresh, initialQuote, maxNow, ngnPerUsd, quoteEpochMs]);

  const clockOffsetMs = activeRefresh ? activeRefresh.offsetMs : initialQuote !== undefined ? initialOffsetMs : 0;

  const evaluated = useMemo(() => evaluateQuote(quote), [quote]);
  const { remainingSeconds, timeState } = computeQuoteRemaining(evaluated.expiresAtMs, nowMs, clockOffsetMs);

  const quoteStatus: QuoteStatus = refreshing
    ? 'refreshing'
    : refreshError !== null
      ? 'failed'
      : timeState;

  const isExpired = !refreshing && evaluated.expiresAtMs !== null && timeState === 'expired';
  const isExpiring = !refreshing && evaluated.expiresAtMs !== null && timeState === 'expiring';

  // Fixed-text polite announcement changes strictly once on transition to expiring, and once on transition to expired.
  const announcement =
    start || refreshing || evaluated.expiresAtMs === null
      ? ''
      : isExpired
        ? t('quoteExpiredAnnounce')
        : isExpiring
          ? t('quoteExpiringAnnounce', { seconds: EXPIRING_THRESHOLD_SECONDS })
          : '';

  // Tick from injectable clock (never counting ticks) and recompute on visibilitychange.
  useEffect(() => {
    if (start) return;
    const syncClock = () => setNowMs(clockRef.current());
    const id = setInterval(syncClock, 1000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncClock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [start]);

  // Poll transfer status after bank details are issued.
  useEffect(() => {
    if (!start || status === 'COMPLETED') return;
    const id = setInterval(async () => {
      try {
        const tr = await api<Transfer>(`/anchor/transfers/${start.transferId}`);
        setStatus(tr.status);
        if (tr.status === 'COMPLETED') ready.current();
      } catch {
        /* keep polling; a blip must not lose the transfer */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [start, status]);

  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshError(null);
    setError(null);
    // Invalidate current quote version immediately so an in-flight confirm cannot apply an old quote.
    quoteVersionRef.current += 1;
    const baseAmountStr =
      evaluated.amountKobo !== null
        ? formatKoboPlain(evaluated.amountKobo)
        : stroopsToNairaCeil(maxNow, ngnPerUsd).toString();
    try {
      const nextQuote = fetchQuote
        ? await fetchQuote(baseAmountStr)
        : await api<AnchorQuote>('/anchor/quote', { body: { amountNgn: baseAmountStr } });
      const receivedAt = clockRef.current();
      const nextEval = evaluateQuote(nextQuote);
      const nextOffset = nextEval.serverTimeMs !== null ? nextEval.serverTimeMs - receivedAt : 0;
      quoteVersionRef.current += 1;
      setRefreshedQuote({ maxNow, ngnPerUsd, quote: nextQuote, offsetMs: nextOffset });
      setNowMs(receivedAt);
    } catch (e) {
      setRefreshError(e);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [evaluated.amountKobo, maxNow, ngnPerUsd, fetchQuote]);

  const canConfirm =
    !busy &&
    !refreshing &&
    !evaluated.hasMissingFields &&
    !evaluated.totalMismatch &&
    !isExpired &&
    evaluated.totalKobo !== null;

  const disabledReason = refreshing
    ? t('confirmDisabledRefreshing')
    : evaluated.totalMismatch
      ? t('quoteTotalMismatch')
      : evaluated.hasMissingFields
        ? t('quoteIncompleteReason')
        : isExpired
          ? t('confirmDisabledExpired')
          : null;

  async function begin() {
    if (!canConfirm || refreshingRef.current || evaluated.totalKobo === null) return;
    const versionAtConfirm = quoteVersionRef.current;
    const confirmedTotalStr = formatKoboPlain(evaluated.totalKobo);
    const confirmedQuoteId = quote.id;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = { amountNgn: confirmedTotalStr };
      if (confirmedQuoteId) body.quoteId = confirmedQuoteId;
      const s = await api<Start>('/anchor/deposit/start', { body });
      // Guard against race where a refresh started while confirm was in flight.
      if (quoteVersionRef.current !== versionAtConfirm) return;
      setStart(s);
      setStatus('PENDING');
    } catch (e) {
      if (quoteVersionRef.current !== versionAtConfirm) return;
      if (e instanceof ApiError && e.status === 501) setUnavailable(true);
      else setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    if (!start) return;
    try {
      await api('/dev/anchor/confirm', { body: { transferId: start.transferId } });
      setStatus('COMPLETED');
      ready.current();
    } catch (e) {
      setError(e);
    }
  }

  if (unavailable) {
    return (
      <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">
        {t('unavailable')}
      </p>
    );
  }

  if (!start) {
    const outOfDateClass = isExpired ? 'line-through text-neutral-500' : '';
    const showRefreshButton =
      isExpiring ||
      isExpired ||
      quoteStatus === 'failed' ||
      evaluated.hasMissingFields ||
      evaluated.totalMismatch ||
      refreshing;

    return (
      <div
        id="naira-deposit"
        className="space-y-3 rounded-xl border border-neutral-300 bg-neutral-50 p-3"
        data-quote-state={quoteStatus}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">{t('quoteHeading')}</h3>
          {evaluated.expiresAtMs !== null && !refreshing && (
            <span
              aria-hidden="true"
              data-testid="quote-countdown"
              className={`tabular-nums text-xs font-semibold ${
                isExpired ? 'text-red-700' : isExpiring ? 'text-amber-800' : 'text-neutral-700'
              }`}
            >
              {isExpired ? t('quoteExpired') : t('quoteExpiresIn', { seconds: remainingSeconds })}
              {isExpiring && ` · ${t('quoteExpiring')}`}
            </span>
          )}
          {refreshing && (
            <span className="text-xs font-semibold text-neutral-700" data-testid="quote-refreshing">
              {t('quoteRefreshing')}
            </span>
          )}
          {evaluated.expiresAtMs === null && !refreshing && (
            <span className="text-xs font-semibold text-amber-800" data-testid="quote-expiry-unavailable">
              {t('quoteExpiryUnavailable')}
            </span>
          )}
        </div>

        {/* Always-mounted polite live region: announces strictly once on expiring and once on expired. */}
        <p role="status" aria-live="polite" className="sr-only" data-testid="quote-announcement">
          {announcement}
        </p>

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-700">{t('quoteAmount')}</dt>
            <dd data-testid="quote-amount" className={`font-medium ${outOfDateClass}`}>
              {evaluated.amountKobo !== null ? formatKobo(evaluated.amountKobo, locale) : t('quoteTotalUnavailable')}
              {isExpired && <span className="ml-1.5 text-xs font-normal text-red-700 no-underline">{t('quoteOutOfDate')}</span>}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-700">{t('quoteFee')}</dt>
            <dd data-testid="quote-fee" className={`font-medium ${outOfDateClass}`}>
              {evaluated.feeKobo !== null ? (
                <>
                  {formatKobo(evaluated.feeKobo, locale)}
                  {isExpired && <span className="ml-1.5 text-xs font-normal text-red-700 no-underline">{t('quoteOutOfDate')}</span>}
                </>
              ) : (
                <span className="text-amber-900">{t('quoteFeeUnavailable')}</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-700">{t('quoteRate')}</dt>
            <dd data-testid="quote-rate" className={`font-medium ${outOfDateClass}`}>
              {evaluated.rateKobo !== null ? (
                <>
                  {t('quoteRateValue', { rate: formatKobo(evaluated.rateKobo, locale) })}
                  {isExpired && <span className="ml-1.5 text-xs font-normal text-red-700 no-underline">{t('quoteOutOfDate')}</span>}
                </>
              ) : (
                <span className="text-amber-900">{t('quoteRateUnavailable')}</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-neutral-200 pt-1.5">
            <dt className="font-semibold text-neutral-900">{t('quoteTotal')}</dt>
            <dd data-testid="quote-total" className={`font-bold text-neutral-900 ${outOfDateClass}`}>
              {evaluated.totalKobo !== null ? (
                <>
                  {formatKobo(evaluated.totalKobo, locale)}
                  {isExpired && <span className="ml-1.5 text-xs font-normal text-red-700 no-underline">{t('quoteOutOfDate')}</span>}
                </>
              ) : (
                <span className="text-amber-900">{t('quoteTotalUnavailable')}</span>
              )}
            </dd>
          </div>
        </dl>

        {disabledReason && (
          <p id="naira-confirm-reason" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
            {disabledReason}
          </p>
        )}

        {showRefreshButton && (
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
            className="min-h-12 w-full rounded-xl border border-neutral-500 bg-white font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            {refreshing ? t('quoteRefreshing') : t('quoteRefresh')}
          </button>
        )}

        <button
          type="button"
          disabled={!canConfirm}
          aria-describedby={disabledReason ? 'naira-confirm-reason' : undefined}
          onClick={() => void begin()}
          className="min-h-12 w-full rounded-xl border-2 border-emerald-800 font-bold text-emerald-900 disabled:opacity-60 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
        >
          {t('start')}
        </button>

        {refreshError !== null && <ErrorExplainer error={refreshError} onRetry={() => void handleRefresh()} />}
        {error !== null && <ErrorExplainer error={error} onRetry={() => void begin()} />}
        {leaveGuardDialog}
      </div>
    );
  }

  return (
    <section id="naira-deposit" className="space-y-2 rounded-xl border border-neutral-300 p-3" aria-live="polite">
      <p className="font-semibold">{t('send', { amount: formatNaira(start.amountNgn, locale) })}</p>
      <dl className="text-sm">
        <div className="flex justify-between"><dt>{t('bank')}</dt><dd>{start.instructions.bank}</dd></div>
        <div className="flex justify-between"><dt>{t('account')}</dt><dd>{start.instructions.accountName} · {start.instructions.accountNumber}</dd></div>
        <div className="flex justify-between"><dt>{t('reference')}</dt><dd className="break-all font-mono">{start.instructions.reference}</dd></div>
      </dl>
      <p className="text-xs text-neutral-700">{t('estimate', { usd: start.estimatedUsdc })}</p>
      {status === 'COMPLETED' ? <p role="status" className="font-semibold text-emerald-900">{t('received')}</p> : <p className="text-sm">{t('waiting')}</p>}
      {TESTING && status !== 'COMPLETED' && (
        <button
          type="button"
          onClick={() => void simulate()}
          className="min-h-12 w-full rounded-lg border border-dashed border-neutral-500 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
        >
          {t('simulate')}
        </button>
      )}
      {error !== null && <ErrorExplainer error={error} />}
      {leaveGuardDialog}
    </section>
  );
}
