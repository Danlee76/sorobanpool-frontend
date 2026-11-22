'use client';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { countdown, DEADLINE_CRITICAL_HOURS, DEADLINE_WARN_HOURS } from '@/lib/format';

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};
// Floored to the second so the snapshot is stable between reads within a tick.
const snapshot = () => Math.floor(Date.now() / 1000) * 1000;

/** Units-to-go below which calling out the near price break is more useful than the generic urgency text. */
const CLOSE_TO_BREAK_UNITS = 10;

interface CountdownProps {
  deadline: string;
  /** Hours remaining below which to show amber "closing soon" state. Defaults to the shared deadline-urgency threshold. */
  warnHours?: number;
  /** Hours remaining below which to show red "closing very soon" state. Defaults to the shared deadline-urgency threshold. */
  criticalHours?: number;
  /** Show urgency explanation text (refund/reputation risk). Default false. */
  showExplainer?: boolean;
  /** Units still needed to reach the next price tier. Close to one changes the urgency message shown. */
  unitsToNextBreak?: number;
}

export function Countdown({
  deadline,
  warnHours = DEADLINE_WARN_HOURS,
  criticalHours = DEADLINE_CRITICAL_HOURS,
  showExplainer = false,
  unitsToNextBreak,
}: CountdownProps) {
  const t = useTranslations('pool');
  // null on the server: rendering a time there would mismatch the client's first paint.
  const now = useSyncExternalStore(subscribe, snapshot, () => null);
  if (now === null) return <span aria-hidden className="inline-block h-5 w-32 rounded bg-neutral-100" />;
  const c = countdown(deadline, now);
  if (c.done) return <span className="font-semibold text-neutral-700">{t('closed')}</span>;

  const msRemaining = new Date(deadline).getTime() - now;
  const hoursRemaining = msRemaining / 3_600_000;
  const isCritical = hoursRemaining < criticalHours;
  const isWarning = !isCritical && hoursRemaining < warnHours;
  const isCloseToBreak = (isWarning || isCritical) && unitsToNextBreak !== undefined && unitsToNextBreak > 0 && unitsToNextBreak <= CLOSE_TO_BREAK_UNITS;

  const colorClass = isCritical
    ? 'font-bold text-red-600'
    : isWarning
      ? 'font-semibold text-amber-600'
      : 'font-semibold text-neutral-700';

  const parts = [c.days ? `${c.days}d` : '', `${c.hours}h`, `${c.minutes}m`, c.days ? '' : `${c.seconds}s`].filter(Boolean).join(' ');

  // Same urgency level, different reason to act: a near price break is a stronger nudge than a plain time warning.
  const urgencyText = isCloseToBreak
    ? t('urgentNearBreak', { count: unitsToNextBreak })
    : isCritical
      ? t('urgentCritical')
      : isWarning
        ? t('urgentWarning')
        : null;

  return (
    <span>
      <span className={`tabular-nums ${colorClass}`} aria-label={`${t('closes')} ${parts}${urgencyText ? ` ${urgencyText}` : ''}`}>
        {t('closes')} {parts}
      </span>
      {urgencyText && (
        <span aria-hidden="true" data-testid="countdown-urgency" className={`ml-1 text-xs ${isCritical ? 'font-bold uppercase tracking-wide text-red-600' : 'text-amber-600'}`}>
          {urgencyText}
        </span>
      )}
      {showExplainer && (isWarning || isCritical) && (
        <span className="ml-2 text-xs text-neutral-600">
          {t('acceptWindowExplainer')}
        </span>
      )}
    </span>
  );
}
