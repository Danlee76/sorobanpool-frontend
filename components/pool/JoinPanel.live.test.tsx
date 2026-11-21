import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import type { EventSourceLike } from '@/lib/pool-stream';
import type { PoolView } from '@/lib/types';

vi.mock('@/lib/tx', async (orig) => ({ ...(await orig<typeof import('@/lib/tx')>()), runAction: vi.fn() }));

import { JoinPanel } from './JoinPanel';

class ControlledEventSource implements EventSourceLike {
  handlers = new Map<string, ((e: { data: string }) => void)[]>();
  closed = false;
  constructor(readonly url: string) {}
  addEventListener(type: string, cb: (e: { data: string }) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(cb);
    this.handlers.set(type, list);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, payload?: unknown) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    for (const cb of this.handlers.get(type) ?? []) cb({ data });
  }
}

const basePool: PoolView = {
  id: '77',
  state: 'Open',
  shareSlug: 'live-test',
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
  tiersUsdc: [
    { minUnits: 100, unitPrice: '10000000' },
    { minUnits: 150, unitPrice: '9000000' },
  ],
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
  trustMessage: 'Safe in escrow',
  myCommitment: null,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('JoinPanel live pool progress stream', () => {
  it('shows initial counts, updates from SSE stream, and announces strictly on tier changes and pool fill', async () => {
    vi.useFakeTimers();
    let src!: ControlledEventSource;
    const make = (u: string) => (src = new ControlledEventSource(u));

    const { unmount } = renderIntl(
      <QueryClientProvider client={new QueryClient()}>
        <JoinPanel pool={basePool} streamFactory={make} />
      </QueryClientProvider>,
    );

    // Initial values: 60 units, 3 members, 40 units to next break, NO announcement
    expect(screen.getByTestId('live-units')).toHaveTextContent('60 units');
    expect(screen.getByTestId('live-members')).toHaveTextContent('3 members');
    expect(screen.getByTestId('live-next-break')).toHaveTextContent('40 units to next price break');
    const liveRegion = screen.getByTestId('pool-live-announcement');
    expect(liveRegion).toHaveAttribute('role', 'status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveTextContent('');

    // First SSE snapshot after connect must NOT announce even if at a tier threshold
    act(() => {
      src.emit('pool', { totalUnits: 65, members: 4, seq: 1 });
    });
    expect(screen.getByTestId('live-units')).toHaveTextContent('65 units');
    expect(screen.getByTestId('live-members')).toHaveTextContent('4 members');
    expect(screen.getByTestId('live-next-break')).toHaveTextContent('35 units to next price break');
    expect(liveRegion).toHaveTextContent('');

    // Ordinary count update (still below tier 100) must NOT announce
    vi.advanceTimersByTime(200);
    act(() => {
      src.emit('pool', { totalUnits: 80, members: 5, seq: 2 });
    });
    expect(screen.getByTestId('live-units')).toHaveTextContent('80 units');
    expect(screen.getByTestId('live-members')).toHaveTextContent('5 members');
    expect(screen.getByTestId('live-next-break')).toHaveTextContent('20 units to next price break');
    expect(liveRegion).toHaveTextContent('');

    // Tier change (crosses 100 units) announces once
    vi.advanceTimersByTime(200);
    act(() => {
      src.emit('pool', { totalUnits: 100, members: 6, seq: 3 });
    });
    expect(screen.getByTestId('live-units')).toHaveTextContent('100 units');
    expect(screen.getByTestId('live-next-break')).toHaveTextContent('50 units to next price break');
    expect(liveRegion).toHaveTextContent('Price drop: a lower price tier has been unlocked.');

    // Top tier reached (150 units, max 200) says no further price break
    vi.advanceTimersByTime(200);
    act(() => {
      src.emit('pool', { totalUnits: 150, members: 9, seq: 4 });
    });
    expect(screen.getByTestId('live-next-break')).toHaveTextContent('Best price unlocked — no further price break');

    // Pool fill (200 units) announces fill
    vi.advanceTimersByTime(200);
    act(() => {
      src.emit('pool', { totalUnits: 200, members: 12, seq: 5 });
    });
    expect(screen.getByTestId('live-next-break')).toHaveTextContent('Pool is full — no further price break');
    expect(liveRegion).toHaveTextContent('This pool is now full.');

    // Replay of same state after reconnect does not throw or corrupt state
    vi.advanceTimersByTime(200);
    act(() => {
      src.emit('pool', { totalUnits: 200, members: 12, seq: 5 });
    });
    expect(liveRegion).toHaveTextContent('This pool is now full.');

    // Unmount closes the EventSource cleanly
    unmount();
    expect(src.closed).toBe(true);
  });

  it('ignores invalid payloads and out-of-order events, and shows stale state on error until reconnect', () => {
    vi.useFakeTimers();
    let src!: ControlledEventSource;
    const make = (u: string) => (src = new ControlledEventSource(u));

    renderIntl(
      <QueryClientProvider client={new QueryClient()}>
        <JoinPanel pool={basePool} streamFactory={make} />
      </QueryClientProvider>,
    );

    act(() => {
      src.emit('pool', { totalUnits: 70, members: 4, seq: 10 });
    });
    expect(screen.getByTestId('live-units')).toHaveTextContent('70 units');

    // Invalid payloads are ignored
    vi.advanceTimersByTime(200);
    act(() => {
      src.emit('pool', 'broken-json');
      src.emit('pool', { totalUnits: -5, members: 2, seq: 11 });
      src.emit('pool', { totalUnits: 75.5, members: 4, seq: 12 });
      src.emit('pool', { totalUnits: 75, members: 0, seq: 13 });
    });
    expect(screen.getByTestId('live-units')).toHaveTextContent('70 units');
    expect(screen.getByTestId('live-members')).toHaveTextContent('4 members');

    // Out-of-order event (seq 9 < 10) is ignored
    vi.advanceTimersByTime(200);
    act(() => {
      src.emit('pool', { totalUnits: 62, members: 3, seq: 9 });
    });
    expect(screen.getByTestId('live-units')).toHaveTextContent('70 units');

    // Stream error shows subtle stale/reconnecting indicator while retaining last known values
    act(() => {
      src.emit('error');
    });
    expect(screen.getByTestId('stream-stale')).toHaveTextContent('Reconnecting — showing last known counts');
    expect(screen.getByTestId('live-units')).toHaveTextContent('70 units');

    // Reconnect clears stale indicator
    act(() => {
      src.emit('open');
    });
    expect(screen.queryByTestId('stream-stale')).toBeNull();
  });

  it('does not reset user input or steal focus on live updates, and validates if pool becomes nearly full', () => {
    vi.useFakeTimers();
    let src!: ControlledEventSource;
    const make = (u: string) => (src = new ControlledEventSource(u));

    renderIntl(
      <QueryClientProvider client={new QueryClient()}>
        <JoinPanel pool={basePool} streamFactory={make} />
      </QueryClientProvider>,
    );

    const input = screen.getByLabelText('How many units?');
    input.focus();
    fireEvent.change(input, { target: { value: '10' } });
    expect(input).toHaveValue('10');
    expect(document.activeElement).toBe(input);

    // Live update leaves chosen units and focus untouched
    act(() => {
      src.emit('pool', { totalUnits: 80, members: 5, seq: 1 });
    });
    expect(input).toHaveValue('10');
    expect(document.activeElement).toBe(input);

    // Pool becomes nearly full (195 of 200 -> only 5 units left): user's 10 stays in input, validation error appears, Pay disabled
    vi.advanceTimersByTime(200);
    act(() => {
      src.emit('pool', { totalUnits: 195, members: 11, seq: 2 });
    });
    expect(input).toHaveValue('10');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('alert')).toHaveTextContent('Only 5 units are left in this pool.');
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeDisabled();
  });

  it('renders live progress copy in Nigerian Pidgin (pcm)', () => {
    let src!: ControlledEventSource;
    renderIntl(
      <QueryClientProvider client={new QueryClient()}>
        <JoinPanel pool={basePool} streamFactory={(u) => (src = new ControlledEventSource(u))} />
      </QueryClientProvider>,
      'pcm',
    );
    expect(screen.getByTestId('live-next-break')).toHaveTextContent('40 units remain for next price drop');
    act(() => {
      src.emit('error');
    });
    expect(screen.getByTestId('stream-stale')).toHaveTextContent('E dey reconnect');
  });
});
