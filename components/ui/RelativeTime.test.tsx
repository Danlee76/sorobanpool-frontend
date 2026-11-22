import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelativeTime } from './RelativeTime';

function wrap(ui: React.ReactNode, locale: 'en' | 'pcm' = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={{}}>{ui}</NextIntlClientProvider>);
}

describe('RelativeTime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('formats a seconds offset', () => {
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    wrap(<RelativeTime value="2026-10-05T10:00:45Z" />);
    expect(screen.getByText('in 45 seconds')).toBeInTheDocument();
  });

  it('formats a minute offset', () => {
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    wrap(<RelativeTime value="2026-10-05T10:02:00Z" />);
    expect(screen.getByText('in 2 minutes')).toBeInTheDocument();
  });

  it('formats an hour offset', () => {
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    wrap(<RelativeTime value="2026-10-05T12:00:00Z" />);
    expect(screen.getByText('in 2 hours')).toBeInTheDocument();
  });

  it('formats a day offset in the past as "yesterday"', () => {
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    wrap(<RelativeTime value="2026-10-04T10:00:00Z" />);
    expect(screen.getByText('yesterday')).toBeInTheDocument();
  });

  it('exposes the absolute time to screen readers and as a hover title', () => {
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    wrap(<RelativeTime value="2026-10-05T12:00:00Z" />);
    const el = screen.getByText('in 2 hours');
    expect(el).toHaveAttribute('title');
    expect(el).toHaveAttribute('aria-label', el.getAttribute('title'));
    expect(el.tagName).toBe('TIME');
  });

  it('updates after a minute passes without an interim empty state', () => {
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    wrap(<RelativeTime value="2026-10-05T10:02:00Z" />);
    expect(screen.getByText('in 2 minutes')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText('in 1 minute')).toBeInTheDocument();
  });

  it('is locale-aware in Pidgin', () => {
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    wrap(<RelativeTime value="2026-10-04T10:00:00Z" />, 'pcm');
    expect(document.querySelector('time')?.textContent).toBe(new Intl.RelativeTimeFormat('pcm', { numeric: 'auto' }).format(-1, 'day'));
  });
});
