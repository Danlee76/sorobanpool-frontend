'use client';
import { useLocale } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { formatDateTime, formatRelativeTime } from '@/lib/format';

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};
// Minute-aligned so every instance on screen ticks over together.
const snapshot = () => Math.floor(Date.now() / 60_000) * 60_000;

/**
 * "in 2 hours", "yesterday" — locale-aware via Intl.RelativeTimeFormat, with the exact time
 * in a hover tooltip and read out to screen readers instead of the (ambiguous) relative text.
 */
export function RelativeTime({ value }: { value: string | number | Date }) {
  const locale = useLocale();
  // null on the server: rendering a relative string there would mismatch the client's first paint.
  const now = useSyncExternalStore(subscribe, snapshot, () => null);
  const date = new Date(value);
  const iso = date.toISOString();
  const absolute = formatDateTime(date, locale);
  if (now === null) return <time dateTime={iso} aria-hidden className="inline-block h-4 w-20 rounded bg-neutral-100 align-middle" />;
  const relative = formatRelativeTime((date.getTime() - now) / 1000, locale);
  return (
    <time dateTime={iso} title={absolute} aria-label={absolute}>
      {relative}
    </time>
  );
}
