import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import { ApiError } from '@/lib/api';
import {
  buildEstimatedQuote,
  evaluateQuote,
  formatKobo,
  parseNgnToKobo,
  type AnchorQuote,
} from '@/lib/naira-quote';

const calls: { path: string; body?: unknown }[] = [];
let handler: (path: string, opts?: { body?: unknown }) => Promise<unknown>;
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: vi.fn(async (path: string, opts?: { body?: unknown }) => {
    calls.push({ path, body: opts?.body });
    return handler(path, opts);
  }),
}));

import { NairaDeposit, NAIRA_BUFFER } from './pool/NairaDeposit';

const start = {
  transferId: 'mock_abc',
  amountNgn: '1530',
  estimatedUsdc: '1.02',
  instructions: { bank: 'Mock Bank', accountName: 'SorobanPool Test', accountNumber: '0000000000', reference: 'mock_abc' },
};

afterEach(() => {
  calls.length = 0;
  vi.useRealTimers();
});

describe('naira quote exact arithmetic and rounding', () => {
  it('parses decimal naira amounts into exact integer kobo with half-up rounding beyond 2 decimals', () => {
    expect(parseNgnToKobo('1500')).toBe(150_000n);
    expect(parseNgnToKobo('1500.5')).toBe(150_050n);
    expect(parseNgnToKobo('1500.25')).toBe(150_025n);
    expect(parseNgnToKobo('10.005')).toBe(1_001n);
    expect(parseNgnToKobo('10.004')).toBe(1_000n);
    expect(parseNgnToKobo('0')).toBe(0n);
    expect(parseNgnToKobo('-5')).toBeNull();
    expect(parseNgnToKobo('abc')).toBeNull();
  });

  it('formats kobo with 2 decimals and thousands grouping', () => {
    expect(formatKobo(150_000n)).toBe('₦1,500.00');
    expect(formatKobo(153_025n)).toBe('₦1,530.25');
    expect(formatKobo(0n)).toBe('₦0.00');
  });

  it('ensures total = amount + fee exactly and flags anchor total mismatches', () => {
    const valid = evaluateQuote({
      amountNgn: '1500.50',
      feeNgn: '30.25',
      rate: '1500.00',
      totalNgn: '1530.75',
      expiresAt: 2_000_000,
    });
    expect(valid.hasMissingFields).toBe(false);
    expect(valid.totalMismatch).toBe(false);
    expect(valid.totalKobo).toBe(153_075n);

    const mismatched = evaluateQuote({
      amountNgn: '1500.50',
      feeNgn: '30.25',
      rate: '1500.00',
      totalNgn: '1531.00',
      expiresAt: 2_000_000,
    });
    expect(mismatched.totalMismatch).toBe(true);
  });

  it('builds estimated local quotes with exact BigInt math and consistent total = amount + fee', () => {
    const q = buildEstimatedQuote(10_000_000n, 1500, 1_000_000);
    const ev = evaluateQuote(q);
    expect(ev.amountKobo).toBe(150_000n);
    expect(ev.feeKobo).toBe(3_000n);
    expect(ev.totalKobo).toBe(153_000n);
    expect(ev.totalMismatch).toBe(false);
  });
});

describe('NairaDeposit', () => {
  it('asks for the naira amount plus a 2% rate buffer, shows the bank details, and reports when the dollars arrive', async () => {
    let status = 'PENDING';
    handler = async (p) => (p === '/anchor/deposit/start' ? start : { id: 'mock_abc', status });
    const ready = vi.fn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={ready} />); // 1 USD = ₦1,500
    expect(screen.getByTestId('quote-amount')).toHaveTextContent('₦1,500.00');
    expect(screen.getByTestId('quote-fee')).toHaveTextContent('₦30.00');
    expect(screen.getByTestId('quote-rate')).toHaveTextContent('₦1,500.00 / USD');
    expect(screen.getByTestId('quote-total')).toHaveTextContent('₦1,530.00');

    fireEvent.click(screen.getByRole('button', { name: 'Get bank details' }));
    await screen.findByText(/Send ₦1,530 to this account/);
    expect(NAIRA_BUFFER).toBe(1.02);
    expect(calls[0]!.path).toBe('/anchor/deposit/start');
    expect(screen.getByText('mock_abc')).toBeInTheDocument();
    expect(screen.getByText('Waiting for your transfer…')).toBeInTheDocument();
    status = 'COMPLETED';
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('Transfer received');
  });

  it('lets a tester simulate the bank transfer', async () => {
    handler = async (p) => (p === '/anchor/deposit/start' ? start : {});
    const ready = vi.fn();
    renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={ready} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get bank details' }));
    fireEvent.click(await screen.findByRole('button', { name: /pretend the bank transfer arrived/ }));
    await waitFor(() => expect(ready).toHaveBeenCalled());
    expect(calls.map((c) => c.path)).toContain('/dev/anchor/confirm');
  });

  it('says so plainly when naira payments are not available (501)', async () => {
    handler = async () => { throw new ApiError(501, 'NOT_AVAILABLE', 'no anchor'); };
    renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get bank details' }));
    expect(await screen.findByText('Naira payments are not available yet.')).toBeInTheDocument();
  });

  it('transitions through fresh -> expiring -> expired with injectable clock, announcements, and confirm gating', async () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    const clock = () => now;
    const quote: AnchorQuote = {
      id: 'q1',
      amountNgn: '1500.00',
      feeNgn: '45.50',
      rate: '1500.00',
      totalNgn: '1545.50',
      expiresAt: now + 45_000,
    };

    renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={vi.fn()} initialQuote={quote} clock={clock} />);

    // Fresh state (>30s): confirm enabled, no refresh button, timer aria-hidden, live region empty
    const countdown = screen.getByTestId('quote-countdown');
    expect(countdown).toHaveAttribute('aria-hidden', 'true');
    expect(countdown).toHaveTextContent('Quote expires in 45s');
    expect(screen.getByTestId('quote-announcement')).toHaveTextContent('');
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Refresh quote' })).toBeNull();

    // Advance 20s -> 25s left (expiring <= 30s): polite announcement fires once, refresh button appears
    now += 20_000;
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByTestId('quote-countdown')).toHaveTextContent('Quote expires in 25s');
    expect(screen.getByTestId('quote-announcement')).toHaveTextContent('Quote expiring soon, 30 seconds remaining.');
    expect(screen.getByRole('button', { name: 'Refresh quote' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeEnabled();

    // Another tick inside expiring keeps the announcement text identical (no per-second re-announcement)
    now += 5_000;
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByTestId('quote-announcement')).toHaveTextContent('Quote expiring soon, 30 seconds remaining.');

    // Advance past expiry -> expired: confirm disabled with reason, values marked out of date, expired announcement
    now += 25_000;
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByTestId('quote-announcement')).toHaveTextContent('Quote expired. Refresh for a new quote.');
    expect(screen.getByTestId('quote-amount')).toHaveTextContent('Out of date');
    expect(screen.getByTestId('quote-fee')).toHaveTextContent('Out of date');
    expect(screen.getByTestId('quote-rate')).toHaveTextContent('Out of date');
    expect(screen.getByTestId('quote-total')).toHaveTextContent('Out of date');
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeDisabled();
    expect(screen.getByText(/This quote has expired/)).toBeInTheDocument();
  });

  it('recomputes countdown immediately on visibilitychange and corrects client clock skew using serverTime', async () => {
    vi.useFakeTimers();
    let clientNow = 1_000_000;
    // Server clock is 10 seconds ahead of client clock
    const quote: AnchorQuote = {
      id: 'q-skew',
      amountNgn: '1500.00',
      feeNgn: '30.00',
      rate: '1500.00',
      totalNgn: '1530.00',
      serverTime: clientNow + 10_000,
      expiresAt: clientNow + 50_000, // 40s remaining in server time, not 50s
    };

    renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={vi.fn()} initialQuote={quote} clock={() => clientNow} />);
    expect(screen.getByTestId('quote-countdown')).toHaveTextContent('Quote expires in 40s');

    // Simulate background tab throttling: clock jumps 45s without timers firing, then tab becomes visible
    clientNow += 45_000;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeDisabled();
    expect(screen.getByTestId('quote-announcement')).toHaveTextContent('Quote expired');
  });

  it('blocks confirm and shows unavailable text when anchor response omits fee, rate, or expiry', () => {
    const missingFee: AnchorQuote = { amountNgn: '1500.00', rate: '1500.00', expiresAt: Date.now() + 60_000 };
    const r1 = renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={vi.fn()} initialQuote={missingFee} />);
    expect(screen.getByTestId('quote-fee')).toHaveTextContent('Fee unavailable from anchor');
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeDisabled();
    r1.unmount();

    const missingRate: AnchorQuote = { amountNgn: '1500.00', feeNgn: '30.00', expiresAt: Date.now() + 60_000 };
    const r2 = renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={vi.fn()} initialQuote={missingRate} />);
    expect(screen.getByTestId('quote-rate')).toHaveTextContent('Rate unavailable from anchor');
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeDisabled();
    r2.unmount();

    const missingExpiry: AnchorQuote = { amountNgn: '1500.00', feeNgn: '30.00', rate: '1500.00' };
    renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={vi.fn()} initialQuote={missingExpiry} />);
    expect(screen.getByTestId('quote-expiry-unavailable')).toHaveTextContent('Quote expiry unavailable');
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeDisabled();
  });

  it('refreshes an expired quote, prevents double triggers, blocks confirm while refreshing, and confirms the new quote', async () => {
    const now = 1_000_000;
    const expiredQuote: AnchorQuote = {
      id: 'q-old',
      amountNgn: '1500.00',
      feeNgn: '30.00',
      rate: '1500.00',
      totalNgn: '1530.00',
      expiresAt: now - 1_000,
    };

    let resolveRefresh!: (q: AnchorQuote) => void;
    const fetchQuote = vi.fn(
      () =>
        new Promise<AnchorQuote>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    handler = async () => start;

    renderIntl(
      <NairaDeposit
        maxNow={10_000_000n}
        ngnPerUsd={1500}
        onReady={vi.fn()}
        initialQuote={expiredQuote}
        fetchQuote={fetchQuote}
        clock={() => now}
      />,
    );

    const refreshBtn = screen.getByRole('button', { name: 'Refresh quote' });
    fireEvent.click(refreshBtn);
    // Second click while refreshing must not double trigger
    fireEvent.click(screen.getByRole('button', { name: 'Refreshing quote…' }));
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(fetchQuote).toHaveBeenCalledWith('1500');
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeDisabled();

    await act(async () => {
      resolveRefresh({
        id: 'q-new',
        amountNgn: '1500.00',
        feeNgn: '40.00',
        rate: '1510.00',
        totalNgn: '1540.00',
        expiresAt: now + 90_000,
      });
    });

    await waitFor(() => expect(screen.getByTestId('quote-total')).toHaveTextContent('₦1,540.00'));
    const confirmBtn = screen.getByRole('button', { name: 'Get bank details' });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(calls[0]).toEqual({ path: '/anchor/deposit/start', body: { amountNgn: '1540', quoteId: 'q-new' } }));
  });

  it('discards an in-flight confirm from an old quote if a refresh starts before it resolves', async () => {
    const now = 1_000_000;
    const expiringQuote: AnchorQuote = {
      id: 'q-expiring',
      amountNgn: '1500.00',
      feeNgn: '30.00',
      rate: '1500.00',
      totalNgn: '1530.00',
      expiresAt: now + 20_000,
    };

    let resolveOldStart!: (v: unknown) => void;
    handler = () =>
      new Promise((resolve) => {
        resolveOldStart = resolve;
      });
    const fetchQuote = vi.fn().mockResolvedValue({
      id: 'q-fresh',
      amountNgn: '1500.00',
      feeNgn: '35.00',
      rate: '1505.00',
      totalNgn: '1535.00',
      expiresAt: now + 120_000,
    });

    renderIntl(
      <NairaDeposit
        maxNow={10_000_000n}
        ngnPerUsd={1500}
        onReady={vi.fn()}
        initialQuote={expiringQuote}
        fetchQuote={fetchQuote}
        clock={() => now}
      />,
    );

    // Start confirming the old quote, then trigger a refresh before start resolves
    fireEvent.click(screen.getByRole('button', { name: 'Get bank details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh quote' }));

    await act(async () => {
      resolveOldStart(start);
    });

    // Stale confirm response must be discarded; component stays on the refreshed quote view
    await waitFor(() => expect(screen.getByTestId('quote-total')).toHaveTextContent('₦1,535.00'));
    expect(screen.queryByText(/Send ₦1,530 to this account/)).toBeNull();
  });

  it('shows ErrorExplainer when quote refresh fails and allows retrying', async () => {
    const now = 1_000_000;
    const expiredQuote: AnchorQuote = {
      id: 'q-old',
      amountNgn: '1500.00',
      feeNgn: '30.00',
      rate: '1500.00',
      totalNgn: '1530.00',
      expiresAt: now - 1_000,
    };
    const fetchQuote = vi.fn().mockRejectedValueOnce(new TypeError('network down'));

    renderIntl(
      <NairaDeposit
        maxNow={10_000_000n}
        ngnPerUsd={1500}
        onReady={vi.fn()}
        initialQuote={expiredQuote}
        fetchQuote={fetchQuote}
        clock={() => now}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh quote' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not reach the server.');
    expect(screen.getByRole('button', { name: 'Get bank details' })).toBeDisabled();
  });

  it('renders quote labels in Nigerian Pidgin (pcm)', () => {
    const now = 1_000_000;
    const quote: AnchorQuote = {
      id: 'q-pcm',
      amountNgn: '1500.00',
      feeNgn: '30.00',
      rate: '1500.00',
      totalNgn: '1530.00',
      expiresAt: now - 1_000,
    };
    renderIntl(<NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={vi.fn()} initialQuote={quote} clock={() => now} />, 'pcm');
    expect(screen.getByText('Total wey you go send')).toBeInTheDocument();
    expect(screen.getByText('Quote don expire')).toBeInTheDocument();
  });
});
