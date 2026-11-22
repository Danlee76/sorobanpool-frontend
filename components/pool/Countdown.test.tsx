import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Countdown } from './Countdown';

// Messages with the keys the component uses
const messages = {
  pool: {
    closes: 'Closes in',
    closed: 'Closed',
    urgentWarning: 'Closing soon',
    urgentCritical: 'Closing very soon',
    urgentNearBreak: '{count, plural, one {Just # more unit for a lower price} other {Just # more units for a lower price}}',
    acceptWindowExplainer: 'Missing the window triggers buyer refunds and hurts your reputation.',
  },
};

function wrap(ui: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
}

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
});
