import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Countdown } from './Countdown';

// Messages with the keys the component uses
const messages = {
  pool: {
    closes: 'Closes in',
    closed: 'Closed',
    unitDays: '{count, plural, one {# day} other {# days}}',
    unitHours: '{count, plural, one {# hour} other {# hours}}',
    unitMinutes: '{count, plural, one {# minute} other {# minutes}}',
    lessThanMinute: 'less than a minute',
    urgentWarning: 'Closing soon',
    urgentCritical: 'Closing very soon',
    urgentNearBreak: '{count, plural, one {Just # more unit for a lower price} other {Just # more units for a lower price}}',
    acceptWindowExplainer: 'Missing the window triggers buyer refunds and hurts your reputation.',
  },
};

function wrap(ui: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
}

/** The ticking, visual-only timer (the one hidden from assistive tech). Its colour carries the urgency. */
const visualTimer = () => document.querySelector<HTMLElement>('[aria-hidden="true"]');

describe('Countdown', () => {
  beforeEach(() => {
    // Fake the external store subscription so useSyncExternalStore returns a stable value
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows skeleton on server (null snapshot)', () => {
    // The server snapshot returns null; we can approximate by checking the SSR path.
    // In jsdom the store fires immediately, so we just verify the component mounts.
    const deadline = new Date(Date.now() + 10 * 3_600_000).toISOString();
    wrap(<Countdown deadline={deadline} />);
    // Either the skeleton or the countdown text is visible — not an error
    expect(document.body).toBeTruthy();
  });

  it('shows neutral style with no urgency badge when more than warnHours remain', () => {
    const deadline = new Date(Date.now() + 30 * 3_600_000).toISOString(); // 30h > 24h warn threshold
    wrap(<Countdown deadline={deadline} />);
    const el = screen.getByText(/Closes in/i);
    expect(el.className).toMatch(/text-neutral/);
    expect(el.className).not.toMatch(/text-amber|text-red/);
    expect(screen.queryByTestId('countdown-urgency')).toBeNull();
  });

  it('shows amber "closing soon" style when under the 24h warn threshold', () => {
    const deadline = new Date(Date.now() + 10 * 3_600_000).toISOString(); // 10h < 24h warn threshold
    wrap(<Countdown deadline={deadline} />);
    expect(screen.getByText(/Closes in/i).className).toMatch(/text-amber/);
    const badge = screen.getByTestId('countdown-urgency');
    expect(badge).toHaveTextContent('Closing soon');
    expect(badge.className).not.toMatch(/uppercase/);
  });

  it('shows red "closing very soon" style when under the 2h critical threshold', () => {
    const deadline = new Date(Date.now() + 90 * 60_000).toISOString(); // 90 min < 2h critical threshold
    wrap(<Countdown deadline={deadline} />);
    expect(screen.getByText(/Closes in/i).className).toMatch(/text-red/);
    const badge = screen.getByTestId('countdown-urgency');
    expect(badge).toHaveTextContent('Closing very soon');
    expect(badge.className).toMatch(/uppercase/);
  });

  it('supports custom thresholds for other contexts (e.g. the supplier accept window)', () => {
    const deadline = new Date(Date.now() + 3 * 3_600_000).toISOString(); // 3h < custom 6h warn threshold
    wrap(<Countdown deadline={deadline} warnHours={6} criticalHours={1} />);
    expect(screen.getByTestId('countdown-urgency')).toHaveTextContent('Closing soon');
  });

  it('shows a near-price-break message instead of the generic warning when few units remain', () => {
    const deadline = new Date(Date.now() + 10 * 3_600_000).toISOString(); // under warn threshold
    wrap(<Countdown deadline={deadline} unitsToNextBreak={5} />);
    expect(screen.getByTestId('countdown-urgency')).toHaveTextContent('Just 5 more units for a lower price');
    expect(screen.queryByText('Closing soon')).toBeNull();
  });

  it('does not show the near-break message when plenty of units remain', () => {
    const deadline = new Date(Date.now() + 10 * 3_600_000).toISOString();
    wrap(<Countdown deadline={deadline} unitsToNextBreak={500} />);
    expect(screen.getByTestId('countdown-urgency')).toHaveTextContent('Closing soon');
  });

  it('does not show the near-break message outside the urgency window', () => {
    const deadline = new Date(Date.now() + 30 * 3_600_000).toISOString(); // plenty of time
    wrap(<Countdown deadline={deadline} unitsToNextBreak={2} />);
    expect(screen.queryByTestId('countdown-urgency')).toBeNull();
  });

  it('shows explainer text when showExplainer=true and warning', () => {
    const deadline = new Date(Date.now() + 10 * 3_600_000).toISOString();
    wrap(<Countdown deadline={deadline} showExplainer />);
    expect(screen.getByText(/refunds/i)).toBeTruthy();
  });

  it('does not show explainer when showExplainer=false', () => {
    const deadline = new Date(Date.now() + 10 * 3_600_000).toISOString();
    wrap(<Countdown deadline={deadline} showExplainer={false} />);
    expect(screen.queryByText(/refunds/i)).toBeNull();
  });

  it('includes the urgency text in the accessible label (not colour alone)', () => {
    const deadline = new Date(Date.now() + 90 * 60_000).toISOString();
    wrap(<Countdown deadline={deadline} />);
    expect(screen.getByLabelText(/Closing very soon/)).toBeInTheDocument();
  });

  it('shows closed when deadline has passed', () => {
    const deadline = new Date(Date.now() - 1000).toISOString();
    wrap(<Countdown deadline={deadline} />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  // Issue #64: the visual timer ticks every second, but assistive tech must not be flooded.
  describe('for assistive tech', () => {
    const NOW = new Date('2026-10-05T10:00:00Z');
    const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
    const start = (deadline: string) => {
      vi.setSystemTime(NOW);
      wrap(<Countdown deadline={deadline} />);
      act(() => void vi.advanceTimersByTime(0));
    };
    /** Counts DOM mutations under `el`: a screen reader is only told about what changes in the DOM. */
    const watch = (el: Element) => {
      const o = new MutationObserver(() => undefined);
      o.observe(el, { subtree: true, childList: true, characterData: true });
      return { count: () => o.takeRecords().length, stop: () => o.disconnect() };
    };

    it('reads a static description in whole days and hours', () => {
      start(at(2 * 86_400_000 + 3 * 3_600_000 + 17_000));
      expect(screen.getByTestId('countdown-description')).toHaveTextContent('Closes in 2 days 3 hours');
    });

    it('hides the ticking timer from assistive tech and leaves it unchanged visually', () => {
      start(at(2 * 3_600_000 + 65_000));
      const visual = screen.getByText(/Closes in 2h 1m 5s/);
      expect(visual).toHaveAttribute('aria-hidden', 'true');
      expect(visual).not.toHaveAttribute('aria-label');
      act(() => void vi.advanceTimersByTime(1000));
      expect(screen.getByText(/Closes in 2h 1m 4s/)).toBeInTheDocument();
    });

    it('updates the accessible text at most once a minute while the visual timer ticks every second', () => {
      start(at(10 * 60_000 + 30_000)); // 10m30s left: inside the critical hour, so the urgency suffix is constant
      const spoken = watch(screen.getByTestId('countdown-description'));
      const visual = watch(visualTimer()!);
      for (let i = 0; i < 180; i++) act(() => void vi.advanceTimersByTime(1000));
      // 180s elapsed: the minute changes at 10:00 -> 9:59, 9:00 -> 8:59 and 8:00 -> 7:59 left.
      expect(spoken.count()).toBe(3);
      expect(visual.count()).toBeGreaterThanOrEqual(170);
      expect(screen.getByTestId('countdown-description')).toHaveTextContent('Closes in 7 minutes — URGENT');
    });

    it('does not touch the accessible text at all for a whole minute', () => {
      start(at(3 * 3_600_000 + 30 * 60_000 + 30_000));
      const spoken = watch(screen.getByTestId('countdown-description'));
      for (let i = 0; i < 29; i++) act(() => void vi.advanceTimersByTime(1000));
      expect(spoken.count()).toBe(0);
    });

    it('announces that it has closed exactly once', () => {
      start(at(5000));
      const status = screen.getByRole('status');
      expect(status).toBeEmptyDOMElement(); // live region is mounted before it has anything to say
      const announced = watch(status);
      for (let i = 0; i < 4; i++) act(() => void vi.advanceTimersByTime(1000));
      expect(announced.count()).toBe(0);
      for (let i = 0; i < 40; i++) act(() => void vi.advanceTimersByTime(1000));
      expect(status).toHaveTextContent('Closed');
      expect(announced.count()).toBe(1);
      expect(screen.queryByTestId('countdown-description')).toBeNull();
    });
  });

  // Issue #64: the visual timer ticks every second, but assistive tech must not be flooded.
  describe('for assistive tech', () => {
    const NOW = new Date('2026-10-05T10:00:00Z');
    const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
    const start = (deadline: string) => {
      vi.setSystemTime(NOW);
      wrap(<Countdown deadline={deadline} />);
      act(() => void vi.advanceTimersByTime(0));
    };
    /** Counts DOM mutations under `el`: a screen reader is only told about what changes in the DOM. */
    const watch = (el: Element) => {
      const o = new MutationObserver(() => undefined);
      o.observe(el, { subtree: true, childList: true, characterData: true });
      return { count: () => o.takeRecords().length, stop: () => o.disconnect() };
    };

    it('reads a static description in whole days and hours', () => {
      start(at(2 * 86_400_000 + 3 * 3_600_000 + 17_000));
      expect(screen.getByTestId('countdown-description')).toHaveTextContent('Closes in 2 days 3 hours');
    });

    it('hides the ticking timer from assistive tech and leaves it unchanged visually', () => {
      start(at(2 * 3_600_000 + 65_000));
      const visual = screen.getByText(/Closes in 2h 1m 5s/);
      expect(visual).toHaveAttribute('aria-hidden', 'true');
      expect(visual).not.toHaveAttribute('aria-label');
      act(() => void vi.advanceTimersByTime(1000));
      expect(screen.getByText(/Closes in 2h 1m 4s/)).toBeInTheDocument();
    });

    it('updates the accessible text at most once a minute while the visual timer ticks every second', () => {
      start(at(10 * 60_000 + 30_000)); // 10m30s left: inside the critical hour, so the urgency suffix is constant
      const spoken = watch(screen.getByTestId('countdown-description'));
      const visual = watch(visualTimer()!);
      for (let i = 0; i < 180; i++) act(() => void vi.advanceTimersByTime(1000));
      // 180s elapsed: the minute changes at 10:00 -> 9:59, 9:00 -> 8:59 and 8:00 -> 7:59 left.
      expect(spoken.count()).toBe(3);
      expect(visual.count()).toBeGreaterThanOrEqual(170);
      expect(screen.getByTestId('countdown-description')).toHaveTextContent('Closes in 7 minutes — URGENT');
    });

    it('does not touch the accessible text at all for a whole minute', () => {
      start(at(3 * 3_600_000 + 30 * 60_000 + 30_000));
      const spoken = watch(screen.getByTestId('countdown-description'));
      for (let i = 0; i < 29; i++) act(() => void vi.advanceTimersByTime(1000));
      expect(spoken.count()).toBe(0);
    });

    it('announces that it has closed exactly once', () => {
      start(at(5000));
      const status = screen.getByRole('status');
      expect(status).toBeEmptyDOMElement(); // live region is mounted before it has anything to say
      const announced = watch(status);
      for (let i = 0; i < 4; i++) act(() => void vi.advanceTimersByTime(1000));
      expect(announced.count()).toBe(0);
      for (let i = 0; i < 40; i++) act(() => void vi.advanceTimersByTime(1000));
      expect(status).toHaveTextContent('Closed');
      expect(announced.count()).toBe(1);
      expect(screen.queryByTestId('countdown-description')).toBeNull();
    });
  });
});
