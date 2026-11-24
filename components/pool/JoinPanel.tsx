'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { useConfirm } from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import type { ErrorAction } from '@/lib/errors/map';
import { formatNaira, formatUsdc, stroopsToNairaCeil } from '@/lib/format';
import { canPrefetch, useOnlineStatus } from '@/lib/network';
import { computeNextBreak, usePoolLiveProgress, type StreamFactory } from '@/lib/pool-stream';
import { payPreview } from '@/lib/pricing';
import { runAction, type Prepared } from '@/lib/tx';
import { usePaymentLeaveGuard } from '@/lib/usePaymentLeaveGuard';
import { NairaDeposit } from './NairaDeposit';
import { FailureExplainer } from './FailureExplainer';
import { UnitsStepper } from './UnitsStepper';
import { RefundEstimate } from '@/components/money/RefundEstimate';
import type { PoolView } from '@/lib/types';

/** Units -> "most you pay now" and "refund if more people join" -> approve on the device. */
export function JoinPanel({ pool, streamFactory }: { pool: PoolView; streamFactory?: StreamFactory }) {
  const t = useTranslations('pool');
  const locale = useLocale();
  const common = useTranslations('common');
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const mine = pool.myCommitment?.units ?? 0;
  const maxPer = pool.offer?.maxPerMember ?? 1;
  const initialRoom = Math.max(0, Math.min(maxPer - mine, (pool.maxUnits ?? Infinity) - pool.totalUnits));

  const live = usePoolLiveProgress(pool, {
    enabled: pool.state === 'Open' && initialRoom > 0,
    make: streamFactory,
  });

  const liveTotalUnits = live.totalUnits;
  const liveMembers = live.members;
  const room = Math.max(0, Math.min(maxPer - mine, (pool.maxUnits ?? Infinity) - liveTotalUnits));

  const [units, setUnits] = useState(Math.min(1, initialRoom) || 1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [method, setMethod] = useState<'USDC' | 'NGN'>('USDC');
  const [nairaPaid, setNairaPaid] = useState(false);
  const { dialog: leaveGuardDialog } = usePaymentLeaveGuard(busy);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const payBtnRef = useRef<HTMLButtonElement>(null);
  const prefetchedRef = useRef(false);
  const router = useRouter();
  const online = useOnlineStatus();
  const naira2 = useTranslations('naira');

  const handleTouchIntent = () => {
    if (prefetchedRef.current) return;
    if (canPrefetch()) {
      prefetchedRef.current = true;
      router.prefetch('/onboarding');
    }
  };

  const tiers = useMemo(
    () => pool.tiersUsdc.map((x) => ({ minUnits: x.minUnits, unitPrice: BigInt(x.unitPrice) })),
    [pool.tiersUsdc],
  );
  const nextBreakInfo = useMemo(
    () => computeNextBreak(tiers, liveTotalUnits, pool.maxUnits),
    [tiers, liveTotalUnits, pool.maxUnits],
  );

  // Never overwrite what the user entered on live updates; validate if live room shrinks below chosen units.
  const unitsInvalid = units > room || room === 0;
  const effectiveUnits = Math.max(1, units);
  const clamped = Math.max(1, Math.min(units, Math.max(room, 1)));
  const p = tiers.length ? payPreview(tiers, liveTotalUnits, effectiveUnits) : null;
  const naira = (s: bigint) => (pool.ngnPerUsd ? formatNaira(stroopsToNairaCeil(s, pool.ngnPerUsd), locale) : '—');

  const progressTarget = pool.maxUnits ?? pool.moq ?? (tiers[tiers.length - 1]?.minUnits || 1);
  const progressPct = Math.min(100, Math.max(0, Math.round((liveTotalUnits / Math.max(1, progressTarget)) * 100)));

  const liveAnnouncement =
    live.announcement === 'full'
      ? t('poolFillAnnounce')
      : live.announcement === 'tier'
        ? t('tierChangeAnnounce')
        : '';

  if (pool.state !== 'Open') return null;
  if (initialRoom === 0) return null;

  async function pay() {
    if (unitsInvalid || !online) return;
    setBusy(true);
    setError(null);
    try {
      await runAction(
        () => api<Prepared>(`/pools/${pool.id}/${mine > 0 ? 'increase' : 'commit'}/prepare`, { body: { units: effectiveUnits } }),
        ask,
        p?.maxNow,
      );
      setDone(true);
      await qc.invalidateQueries({ queryKey: ['pool', pool.id] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function handleErrorAction(action: ErrorAction) {
    if (action.type !== 'in-page') return;
    if (action.action === 'focus-units') {
      if (action.remainingAllowance !== undefined && action.remainingAllowance >= 1) {
        setUnits(Math.min(action.remainingAllowance, Math.max(room, 1)));
      }
      document.getElementById('units')?.focus();
    } else if (action.action === 'select-naira' && pool.ngnPerUsd) {
      setMethod('NGN');
    }
  }

  return (
    <section aria-labelledby="join-h" onTouchStart={handleTouchIntent} className="space-y-4 rounded-xl border border-neutral-300 bg-white p-4">
      <h2 id="join-h" className="text-lg font-bold">{mine > 0 ? t('addMore') : t('join')}</h2>

      {/* Live pool progress block with reserved min-height to prevent layout shift */}
      <div
        className="min-h-[5.5rem] space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm"
        data-testid="live-pool-progress"
        data-stream-status={live.streamStatus}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-neutral-900">
            <span data-testid="live-units">{t('liveUnitsCount', { count: liveTotalUnits })}</span>
            <span aria-hidden="true" className="text-neutral-400">·</span>
            <span data-testid="live-members">{t('liveMembersCount', { count: liveMembers })}</span>
          </div>
          {live.streamStatus === 'stale' && (
            <span data-testid="stream-stale" className="text-xs font-medium text-amber-800">
              {t('streamStale')}
            </span>
          )}
        </div>

        <div
          role="progressbar"
          aria-label={t('liveProgressLabel')}
          aria-valuemin={0}
          aria-valuemax={progressTarget}
          aria-valuenow={Math.min(liveTotalUnits, progressTarget)}
          className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
        >
          <div
            className="h-full rounded-full bg-emerald-700 transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <p data-testid="live-next-break" className="text-xs font-medium text-neutral-700">
          {nextBreakInfo.isFull
            ? t('poolFull')
            : nextBreakInfo.unitsToNextBreak !== null
              ? t('unitsToNextBreak', { count: nextBreakInfo.unitsToNextBreak })
              : t('topTierReached')}
        </p>

        {/* Polite live region restricted strictly to tier changes and pool filling */}
        <p role="status" aria-live="polite" className="sr-only" data-testid="pool-live-announcement">
          {liveAnnouncement}
        </p>
      </div>

      {mine > 0 && <p className="text-sm text-emerald-900">{t('youHave', { count: mine })}</p>}
      <div>
        <label htmlFor="units" className="block text-sm font-medium">{t('unitsLabel')}</label>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease units"
            onClick={() => setUnits(Math.max(1, units - 1))}
            className="size-12 rounded-lg border border-neutral-500 text-xl font-bold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            −
          </button>
          <input
            id="units"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-invalid={unitsInvalid || undefined}
            aria-describedby={unitsInvalid ? 'units-error' : undefined}
            value={units}
            onChange={(e) => {
              const parsed = Number(e.target.value.replace(/\D/g, '')) || 1;
              setUnits(Math.max(1, Math.min(parsed, Math.max(room, 1))));
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setUnits(Math.min(Math.max(room, 1), units + 1));
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setUnits(Math.max(1, units - 1));
              }
            }}
            className="h-12 w-20 rounded-lg border border-neutral-500 text-center text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          />
          <button
            type="button"
            aria-label="Increase units"
            onClick={() => setUnits(Math.min(Math.max(room, 1), units + 1))}
            className="size-12 rounded-lg border border-neutral-500 text-xl font-bold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            +
          </button>
        </div>
        {unitsInvalid && (
          <p id="units-error" role="alert" className="mt-1.5 text-xs font-medium text-red-700">
            {t('exceedsAvailableUnits', { available: room })}
          </p>
        )}
      </div>
      <UnitsStepper
        id="units"
        label={t('unitsLabel')}
        value={clamped}
        onChange={setUnits}
        min={1}
        max={Math.max(room, 1)}
        helpText={mine > 0 ? t('youHave', { count: mine }) : undefined}
      />
      {p && (
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt>{t('maxNow')}</dt><dd className="font-bold" data-testid="max-now">{naira(p.maxNow)}</dd></div>
          <div className="flex justify-between"><dt>{t('expectedFinal')}</dt><dd data-testid="expected-final">{naira(p.expectedUnitPrice)} / unit</dd></div>
          <div className="flex justify-between"><dt>{t('expectedRefund')}</dt><dd className="font-semibold text-emerald-900" data-testid="expected-refund">{naira(p.expectedRefund)}</dd></div>
        </dl>
      )}
      <p className="text-xs text-neutral-700">{t('indicative')}</p>
      {p && pool.ngnPerUsd && (
        <RefundEstimate
          totalUnits={pool.totalUnits}
          units={clamped}
          tiers={tiers}
          ngnPerUsd={pool.ngnPerUsd}
          toNaira={(s) => stroopsToNairaCeil(s, pool.ngnPerUsd!)}
        />
      )}
      {p && (
        <details className="text-xs text-neutral-700">
          <summary className="min-h-12 content-center font-medium">{common('learnMore')}</summary>
          <p>≈ {formatUsdc(p.maxNow)} USD (fixed price)</p>
        </details>
      )}
      {pool.ngnPerUsd && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">{naira2('method')}</legend>
          {(['USDC', 'NGN'] as const).map((m) => (
            <label key={m} className="flex min-h-12 items-center gap-3 rounded-lg border border-neutral-300 px-3">
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />{m === 'USDC' ? naira2('dollar') : naira2('naira')}
            </label>
          ))}
        </fieldset>
      )}
      {method === 'NGN' && p && pool.ngnPerUsd && <NairaDeposit maxNow={p.maxNow} ngnPerUsd={pool.ngnPerUsd} onReady={() => setNairaPaid(true)} />}
      <FailureExplainer />
      <button
        type="button"
        ref={payBtnRef}
        onTouchStart={handleTouchIntent}
        disabled={busy || done || unitsInvalid || (method === 'NGN' && !nairaPaid) || !online}
        aria-disabled={!online}
        aria-describedby={!online ? 'offline-pay-explainer' : undefined}
        onClick={() => { if (!online) return; void pay(); }}
        className="min-h-12 w-full rounded-xl bg-emerald-800 text-lg font-bold text-white disabled:opacity-60 hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
      >
        {busy ? t('paying') : t('payNow')}
      </button>
      {!online && (
        <p id="offline-pay-explainer" className="text-xs font-medium text-amber-800">
          You are offline. Joining is disabled until your connection is restored.
        </p>
      )}
      {done && (
        <p
          role="status"
          ref={doneRef}
          tabIndex={-1}
          className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900 focus-visible:outline-none"
        >
          {t('joined')}
        </p>
      )}
      {error !== null && <ErrorExplainer error={error} onRetry={() => void pay()} onAction={handleErrorAction} />}
      {dialog}
      {leaveGuardDialog}
    </section>
  );
}
