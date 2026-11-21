import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import { isPaymentLeaveGuardActive, requestLeaveConfirmation, usePaymentLeaveGuard } from '@/lib/usePaymentLeaveGuard';
import type { EventSourceLike } from '@/lib/pool-stream';
import type { AnchorQuote } from '@/lib/naira-quote';
import type { PoolView } from '@/lib/types';

let runActionImpl: (...args: unknown[]) => Promise<unknown> = async () => ({ hash: '0x1', fn: 'commit' });
let apiImpl: (path: string) => Promise<unknown> = async () => ({});

vi.mock('@/lib/tx', async (orig) => ({
  ...(await orig<typeof import('@/lib/tx')>()),
  runAction: vi.fn((...args: unknown[]) => runActionImpl(...args)),
}));

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: vi.fn((path: string) => apiImpl(path)),
}));

import { JoinPanel } from './pool/JoinPanel';
import { NairaDeposit } from './pool/NairaDeposit';

const samplePool: PoolView = {
  id: '88',
  state: 'Open',
  shareSlug: 'guard-test',
  offerId: 'o1',
  organizer: 'GORG',
  supplier: 'GSUP',
  hub: { address: 'Wuse Market', contact: '0803' },
  pickupWindow: { from: 'Mon 9am', to: 'Mon 5pm' },
  fillDeadline: '2099-01-01T00:00:00Z',
  totalUnits: 60,
  receivedUnits: null,
  moq: 100,
  maxUnits: 200,
  members: 3,
  ngnPerUsd: 1500,
  filledAt: null,
  progressPct: 30,
  currentUnitPriceUsdc: '10000000',
  currentUnitPriceNaira: '15,000',
  nextBreak: { unitsToGo: 40, unitPriceUsdc: '9000000' },
  tiersUsdc: [{ minUnits: 100, unitPrice: '10000000' }],
  finalUnitPriceUsdc: null,
  offer: {
    id: 'o1',
    title: 'Rice 50kg',
    brand: 'Mama Gold',
    description: 'Rice',
    unitLabel: 'bag',
    category: 'rice',
    images: [],
    moq: 100,
    maxUnits: 200,
    maxPerMember: 60,
    leadTimeHours: 72,
    tiersUsdc: [],
    tiersNgn: [],
    validUntil: '2099-01-01T00:00:00Z',
  },
  trustMessage: 'Safe',
  myCommitment: null,
};

function GuardHarness({ initialActive = false, onLinkNav }: { initialActive?: boolean; onLinkNav?: () => void }) {
  const [active, setActive] = useState(initialActive);
  const { dialog } = usePaymentLeaveGuard(active);
  return (
    <div>
      <button type="button" onClick={() => setActive(true)}>
        Start payment
      </button>
      <button type="button" onClick={() => setActive(false)}>
        End payment
      </button>
      <a
        href="/explore"
        onClick={(e) => {
          e.preventDefault();
          onLinkNav?.();
        }}
      >
        Explore pools
      </a>
      <a href="/explore" target="_blank" rel="noreferrer">
        New tab link
      </a>
      <a href="#details">Hash link</a>
      <a href="https://example.org/help">External link</a>
      {dialog}
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  runActionImpl = async () => ({ hash: '0x1', fn: 'commit' });
  apiImpl = async () => ({});
});

describe('usePaymentLeaveGuard hook', () => {
  it('does not register listeners when idle, registers when active, and removes cleanly on deactivation and unmount without leaks', () => {
    const addWin = vi.spyOn(window, 'addEventListener');
    const removeWin = vi.spyOn(window, 'removeEventListener');
    const addDoc = vi.spyOn(document, 'addEventListener');
    const removeDoc = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderIntl(<GuardHarness initialActive={false} />);
    expect(isPaymentLeaveGuardActive()).toBe(false);
    expect(addWin.mock.calls.filter((c) => c[0] === 'beforeunload')).toHaveLength(0);

    // Cycle active -> idle 3 times and verify symmetric listener registration/removal
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Start payment' }));
      expect(isPaymentLeaveGuardActive()).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'End payment' }));
      expect(isPaymentLeaveGuardActive()).toBe(false);
    }

    const beforeUnloadAdds = addWin.mock.calls.filter((c) => c[0] === 'beforeunload').length;
    const beforeUnloadRemoves = removeWin.mock.calls.filter((c) => c[0] === 'beforeunload').length;
    const popAdds = addWin.mock.calls.filter((c) => c[0] === 'popstate').length;
    const popRemoves = removeWin.mock.calls.filter((c) => c[0] === 'popstate').length;
    const clickAdds = addDoc.mock.calls.filter((c) => c[0] === 'click').length;
    const clickRemoves = removeDoc.mock.calls.filter((c) => c[0] === 'click').length;

    expect(beforeUnloadAdds).toBe(3);
    expect(beforeUnloadRemoves).toBe(3);
    expect(popAdds).toBe(3);
    expect(popRemoves).toBe(3);
    expect(clickAdds).toBe(3);
    expect(clickRemoves).toBe(3);

    // Unmount while active cleans up too
    fireEvent.click(screen.getByRole('button', { name: 'Start payment' }));
    expect(isPaymentLeaveGuardActive()).toBe(true);
    unmount();
    expect(isPaymentLeaveGuardActive()).toBe(false);
  });

  it('prevents default on beforeunload only when active', () => {
    const { unmount } = renderIntl(<GuardHarness initialActive={false} />);

    const idleEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(idleEvent);
    expect(idleEvent.defaultPrevented).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Start payment' }));
    const activeEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(activeEvent);
    expect(activeEvent.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'End payment' }));
    const doneEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(doneEvent);
    expect(doneEvent.defaultPrevented).toBe(false);

    unmount();
  });

  it('intercepts plain in-app links when active, supports stay and leave, and ignores modified/new-tab/hash/external links', () => {
    const onLinkNav = vi.fn();
    const { unmount } = renderIntl(<GuardHarness initialActive={false} onLinkNav={onLinkNav} />);

    // Idle: link click is not intercepted
    fireEvent.click(screen.getByRole('link', { name: 'Explore pools' }));
    expect(onLinkNav).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();

    // Active: plain click opens dialog
    fireEvent.click(screen.getByRole('button', { name: 'Start payment' }));
    fireEvent.click(screen.getByRole('link', { name: 'Explore pools' }));
    expect(onLinkNav).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toHaveTextContent('Leave this payment?');

    // Stay closes dialog without navigating
    fireEvent.click(screen.getByRole('button', { name: 'Stay on payment' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onLinkNav).toHaveBeenCalledTimes(1);

    // Modified clicks (ctrl/meta/shift/alt), new-tab, hash, external links are NOT intercepted
    fireEvent.click(screen.getByRole('link', { name: 'Explore pools' }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'Explore pools' }), { metaKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'New tab link' }));
    fireEvent.click(screen.getByRole('link', { name: 'Hash link' }));
    fireEvent.click(screen.getByRole('link', { name: 'External link' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Plain click -> Leave anyway proceeds with navigation
    fireEvent.click(screen.getByRole('link', { name: 'Explore pools' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave anyway' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onLinkNav).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('traps focus in the leave dialog, closes on Escape, and returns focus to the triggering link', async () => {
    const user = userEvent.setup();
    const { unmount } = renderIntl(<GuardHarness initialActive={true} />);

    const link = screen.getByRole('link', { name: 'Explore pools' });
    link.focus();
    fireEvent.click(link);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const stayBtn = screen.getByRole('button', { name: 'Stay on payment' });
    const leaveBtn = screen.getByRole('button', { name: 'Leave anyway' });

    // Initial focus on default-safe "Stay" action
    expect(stayBtn).toHaveFocus();

    // Tab cycles inside dialog
    await user.tab();
    expect(leaveBtn).toHaveFocus();
    await user.tab();
    expect(stayBtn).toHaveFocus();

    // Escape closes dialog and returns focus to triggering link
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(link).toHaveFocus());

    unmount();
  });

  it('handles popstate (back button) while active and does not block after deactivation', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { unmount } = renderIntl(<GuardHarness initialActive={true} />);

    // Back pressed while active -> shows dialog
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Choosing Stay dismisses dialog without calling history.back()
    fireEvent.click(screen.getByRole('button', { name: 'Stay on payment' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(backSpy).not.toHaveBeenCalled();

    // Deactivating (e.g. payment succeeded) unwinds sentinel and stops intercepting popstate
    fireEvent.click(screen.getByRole('button', { name: 'End payment' }));
    expect(backSpy).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    unmount();
  });

  it('intercepts service worker update reload requests while active and runs proceed only on Leave', () => {
    const proceed = vi.fn();
    const { unmount } = renderIntl(<GuardHarness initialActive={true} />);

    let intercepted = false;
    act(() => {
      intercepted = requestLeaveConfirmation(proceed);
    });
    expect(intercepted).toBe(true);
    expect(proceed).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stay on payment' }));
    expect(proceed).not.toHaveBeenCalled();

    act(() => {
      requestLeaveConfirmation(proceed);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Leave anyway' }));
    expect(proceed).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('renders dialog copy in Nigerian Pidgin (pcm)', () => {
    const { unmount } = renderIntl(<GuardHarness initialActive={true} />, 'pcm');
    fireEvent.click(screen.getByRole('link', { name: 'Explore pools' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('You wan leave this payment?');
    expect(screen.getByRole('button', { name: 'Stay for payment' })).toBeInTheDocument();
    unmount();
  });
});

describe('JoinPanel & NairaDeposit leave guard integration', () => {
  it('activates guard during JoinPanel pay(), removes on success/error, and ignores live stream updates', async () => {
    let resolveTx!: () => void;
    runActionImpl = () =>
      new Promise((resolve) => {
        resolveTx = () => resolve({ hash: '0xabc', fn: 'commit' });
      });

    let srcHandler: ((e: { data: string }) => void) | undefined;
    const makeStream = (): EventSourceLike => ({
      addEventListener(type, cb) {
        if (type === 'pool') srcHandler = cb;
      },
      close() {},
    });

    const { unmount } = renderIntl(
      <QueryClientProvider client={new QueryClient()}>
        <JoinPanel pool={samplePool} streamFactory={makeStream} />
      </QueryClientProvider>,
    );

    // Idle before pay; live stream updates never activate guard
    expect(isPaymentLeaveGuardActive()).toBe(false);
    act(() => {
      srcHandler?.({ data: JSON.stringify({ totalUnits: 70, members: 4, seq: 1 }) });
      srcHandler?.({ data: JSON.stringify({ totalUnits: 100, members: 6, seq: 2 }) });
    });
    expect(isPaymentLeaveGuardActive()).toBe(false);

    // Clicking Pay now activates guard while in progress
    fireEvent.click(screen.getByRole('button', { name: 'Pay now' }));
    await waitFor(() => expect(isPaymentLeaveGuardActive()).toBe(true));

    // Completing payment immediately removes guard
    await act(async () => {
      resolveTx();
    });
    await waitFor(() => expect(isPaymentLeaveGuardActive()).toBe(false));
    expect(screen.getByText(/You are in!/)).toHaveAttribute('role', 'status');

    unmount();
  });

  it('does not activate on NairaDeposit quote ticks or refresh, activates during transfer, and removes on completion', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let now = 1_000_000;
    const quote: AnchorQuote = {
      id: 'q1',
      amountNgn: '1500.00',
      feeNgn: '30.00',
      rate: '1500.00',
      totalNgn: '1530.00',
      expiresAt: now + 20_000,
    };
    const fetchQuote = vi.fn().mockResolvedValue({
      id: 'q2',
      amountNgn: '1500.00',
      feeNgn: '35.00',
      rate: '1505.00',
      totalNgn: '1535.00',
      expiresAt: now + 120_000,
    });
    apiImpl = async (path) =>
      path === '/anchor/deposit/start'
        ? {
            transferId: 'mock_1',
            amountNgn: '1535',
            estimatedUsdc: '1.02',
            instructions: { bank: 'B', accountName: 'N', accountNumber: '1', reference: 'mock_1' },
          }
        : {};

    const { unmount } = renderIntl(
      <NairaDeposit maxNow={10_000_000n} ngnPerUsd={1500} onReady={vi.fn()} initialQuote={quote} fetchQuote={fetchQuote} clock={() => now} />,
    );

    // Quote countdown ticks and refresh NEVER activate guard
    now += 5_000;
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(isPaymentLeaveGuardActive()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh quote' }));
    await waitFor(() => expect(screen.getByTestId('quote-total')).toHaveTextContent('₦1,535.00'));
    expect(isPaymentLeaveGuardActive()).toBe(false);

    // Starting bank deposit activates guard while awaiting transfer
    fireEvent.click(screen.getByRole('button', { name: 'Get bank details' }));
    await screen.findByText(/Send ₦1,535 to this account/);
    expect(isPaymentLeaveGuardActive()).toBe(true);

    // Completing transfer immediately removes guard
    fireEvent.click(screen.getByRole('button', { name: /pretend the bank transfer arrived/ }));
    await waitFor(() => expect(isPaymentLeaveGuardActive()).toBe(false));

    unmount();
  });
});
