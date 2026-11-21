import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import type { PoolView } from '@/lib/types';
import { JoinPanel } from './JoinPanel';

const mockPrefetch = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    prefetch: mockPrefetch,
  }),
}));

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: vi.fn(async () => ({})),
}));

const samplePool = {
  id: 'pool-123',
  state: 'Open',
  totalUnits: 10,
  maxUnits: 100,
  ngnPerUsd: 1500,
  myCommitment: null,
  tiersUsdc: [{ minUnits: 1, unitPrice: '10000000' }],
  offer: { maxPerMember: 10 },
} as unknown as PoolView;

function renderPanel() {
  return renderIntl(
    <QueryClientProvider client={new QueryClient()}>
      <JoinPanel pool={samplePool} />
    </QueryClientProvider>,
  );
}

describe('JoinPanel intent-based prefetching on slow networks', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    mockPrefetch.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('prefetches /onboarding once on touchstart when connection allows it', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        connection: { saveData: false, effectiveType: '4g' },
      },
      writable: true,
      configurable: true,
    });

    renderPanel();
    const payBtn = screen.getByRole('button', { name: /Pay now/i });

    // First touch
    fireEvent.touchStart(payBtn);
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    expect(mockPrefetch).toHaveBeenCalledWith('/onboarding');

    // Repeated touch: should not prefetch again
    fireEvent.touchStart(payBtn);
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT prefetch when saveData is true', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        connection: { saveData: true, effectiveType: '4g' },
      },
      writable: true,
      configurable: true,
    });

    renderPanel();
    const payBtn = screen.getByRole('button', { name: /Pay now/i });

    fireEvent.touchStart(payBtn);
    expect(mockPrefetch).not.toHaveBeenCalled();
  });

  it('does NOT prefetch when effectiveType is 2g', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        connection: { saveData: false, effectiveType: '2g' },
      },
      writable: true,
      configurable: true,
    });

    renderPanel();
    const payBtn = screen.getByRole('button', { name: /Pay now/i });

    fireEvent.touchStart(payBtn);
    expect(mockPrefetch).not.toHaveBeenCalled();
  });
});
