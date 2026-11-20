import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetSupplierReputation = vi.fn();

vi.mock('@/lib/api', () => ({
  getSupplierReputation: (...args: unknown[]) => mockGetSupplierReputation(...args),
}));
vi.mock('@/lib/auth', () => ({ useRequireAuth: vi.fn(() => ({ address: 'SUPPLIER123' })) }));

const messages = {
  supplier: {
    reputation: {
      title: 'My Reputation',
      subtitle: 'Your track record as a supplier',
      loading: 'Loading…',
      loadError: 'Failed to load',
      basedOn: 'Based on {count} ratings',
      completedPoolsStat: 'Completed Pools',
      onTimeStat: 'On-time Delivery',
      onTimeSub: 'of orders',
      disputeWinRateStat: 'Dispute Win Rate',
      disputeWinRateSub: '{won} of {total}',
      disputesStat: 'Disputes',
      noDisputes: 'None',
      recentRatingsSection: 'Recent Ratings',
      disputeHistorySection: 'Dispute History',
      noHistory: 'No history yet',
      unknownItem: 'Unknown item',
      resolutionLabel: 'Resolution',
      resolutionREFUND: 'Refund',
      resolutionREPLACE: 'Replace',
      resolutionREJECT: 'Rejected',
      outcomeWON: 'Won',
      outcomeLOST: 'Lost',
      outcomeSETTLED: 'Settled',
    },
  },
};

function makeReputation(overrides = {}) {
  return {
    averageRating: 4.3,
    totalRatings: 17,
    completedPools: 24,
    onTimeDeliveryPct: 92,
    totalDisputes: 3,
    disputesWon: 2,
    recentRatings: [
      { score: 5, comment: 'Great supplier!', ratedAt: new Date().toISOString(), itemName: 'Rice 50kg' },
      { score: 4, comment: null, ratedAt: new Date().toISOString(), itemName: 'Flour 25kg' },
    ],
    disputeHistory: [
      {
        id: 'd-1',
        itemName: 'Cooking Oil',
        outcome: 'WON',
        resolution: 'REFUND',
        openedAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

async function importPage() {
  const { default: Page } = await import('./reputation-page');
  return Page;
}

describe('SupplierReputationPage', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetSupplierReputation.mockReset();
  });

  it('shows loading state', async () => {
    mockGetSupplierReputation.mockReturnValue(new Promise(() => {}));
    const Page = await importPage();
    render(<Page />, { wrapper });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders average rating and star display', async () => {
    mockGetSupplierReputation.mockResolvedValue(makeReputation());
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('4.3');
    expect(screen.getByLabelText('4 out of 5 stars')).toBeInTheDocument();
  });

  it('renders stat cards', async () => {
    mockGetSupplierReputation.mockResolvedValue(makeReputation());
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('24');
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument(); // 2/3 = 67%
  });

  it('renders recent ratings with comments', async () => {
    mockGetSupplierReputation.mockResolvedValue(makeReputation());
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('"Great supplier!"');
    expect(screen.getByText('Rice 50kg')).toBeInTheDocument();
  });

  it('renders dispute history', async () => {
    mockGetSupplierReputation.mockResolvedValue(makeReputation());
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('Cooking Oil');
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('Refund')).toBeInTheDocument();
  });

  it('shows "None" when there are no disputes', async () => {
    mockGetSupplierReputation.mockResolvedValue(makeReputation({ totalDisputes: 0, disputesWon: 0 }));
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('None');
  });

  it('shows no-history message when both lists are empty', async () => {
    mockGetSupplierReputation.mockResolvedValue(
      makeReputation({ recentRatings: [], disputeHistory: [] }),
    );
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('No history yet');
  });

  it('shows error state', async () => {
    mockGetSupplierReputation.mockRejectedValue(new Error('500'));
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('Failed to load');
  });
});
