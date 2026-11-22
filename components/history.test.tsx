import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import type { PoolCard, WalletActivity } from '@/lib/types';
import History, { groupActivitiesByDate, getActivityDetails } from '@/app/history/page';

let pools: PoolCard[] = [];
let mockReady = true;

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: vi.fn(async () => pools),
}));

vi.mock('@/lib/auth', () => ({
  useRequireAuth: () => ({ ready: mockReady }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const card = (
  id: string,
  state: PoolCard['state'],
  title: string,
  fillDeadline: string,
): PoolCard => ({
  id,
  state,
  title,
  fillDeadline,
  organizer: 'G',
  supplier: 'G',
  shareSlug: id,
  unitLabel: 'bag',
  currentUnitPriceNaira: null,
  moq: 10,
  totalUnits: 10,
  progressPct: 100,
  hub: 'Wuse',
});

const wrap = (ui = <History />) =>
  renderIntl(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );

describe('history page (existing tests)', () => {
  it('lists only finished group buys, newest first, with the outcome in plain words', async () => {
    pools = [
      card('1', 'Settled', 'Rice', '2026-10-01T10:00:00Z'),
      card('2', 'Open', 'Beans', '2026-11-20T10:00:00Z'),
      card('3', 'Expired', 'Garri', '2026-10-20T10:00:00Z'),
      card('4', 'Failed', 'Oil', '2026-09-01T10:00:00Z'),
    ];
    wrap();
    const links = await screen.findAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/pools/3', '/pools/1', '/pools/4']);
    expect(screen.getByText(/Did not fill: money returned/)).toBeInTheDocument();
    expect(screen.getByText(/Supplier did not deliver: money returned/)).toBeInTheDocument();
    expect(screen.queryByText('Beans')).toBeNull();
  });

  it('says so when nothing has finished', async () => {
    pools = [card('2', 'Open', 'Beans', '2026-11-20T10:00:00Z')];
    wrap();
    expect(await screen.findByText('No finished group buys yet.')).toBeInTheDocument();
  });
});

describe('wallet activity history (#111)', () => {
  const mockActivities: WalletActivity[] = [
    {
      id: 'act-1',
      kind: 'pool_payment',
      timestamp: '2026-11-20T23:55:00Z',
      amountUsdc: '150000000', // 15 USDC
      poolId: 'pool-rice',
      poolTitle: 'Rice Group Buy',
    },
    {
      id: 'act-2',
      kind: 'refund',
      timestamp: '2026-11-21T00:05:00Z', // 10 minutes later, crossing midnight
      amountUsdc: '150000000',
      poolId: 'pool-beans',
      poolTitle: 'Beans Group Buy',
    },
    {
      id: 'act-3',
      kind: 'deposit',
      timestamp: '2026-11-15T12:00:00Z',
      amountUsdc: '500000000', // 50 USDC
    },
  ];

  it('groups activities by calendar date across midnight boundary (newest first)', () => {
    const groups = groupActivitiesByDate(mockActivities);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    // Newest date first
    expect(groups[0]!.items[0]!.id).toBe('act-2');
  });

  it('formats amounts and titles for each activity kind with clear signs and wording', () => {
    const pay = getActivityDetails(mockActivities[0]!);
    expect(pay.title).toBe('Paid into pool');
    expect(pay.sign).toBe('-');
    expect(pay.formattedAmount).toBe('-15 USDC');
    expect(pay.isPositive).toBe(false);

    const ref = getActivityDetails(mockActivities[1]!);
    expect(ref.title).toBe('Refund received');
    expect(ref.sign).toBe('+');
    expect(ref.formattedAmount).toBe('+15 USDC');
    expect(ref.isPositive).toBe(true);

    const dep = getActivityDetails(mockActivities[2]!);
    expect(dep.title).toBe('Deposit completed');
    expect(dep.sign).toBe('+');
    expect(dep.formattedAmount).toBe('+50 USDC');
    expect(dep.isPositive).toBe(true);
  });

  it('handles unknown activity kind with safe fallback display', () => {
    const unknownAct = {
      id: 'act-unk',
      kind: 'unknown' as const,
      timestamp: '2026-11-10T10:00:00Z',
      amountUsdc: '50000000',
    };
    const details = getActivityDetails(unknownAct);
    expect(details.title).toBe('Wallet activity');
    expect(details.formattedAmount).toBe('5 USDC');
  });

  it('renders wallet activity panel with pool links and rows without pools without links', () => {
    wrap(<History initialTab="activity" initialActivities={mockActivities} />);

    expect(screen.getByText('Paid into pool')).toBeInTheDocument();
    expect(screen.getByText('Refund received')).toBeInTheDocument();
    expect(screen.getByText('Deposit completed')).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/pools/pool-rice');
    expect(hrefs).toContain('/pools/pool-beans');

    // Deposit has no poolId, so it is rendered without a link
    expect(hrefs).not.toContain('/pools/undefined');
  });

  it('shows empty activity state when no transactions exist', () => {
    wrap(<History initialTab="activity" initialActivities={[]} />);
    expect(screen.getByText('No wallet activity yet.')).toBeInTheDocument();
  });

  it('shows loading state when auth or query is not ready', () => {
    mockReady = false;
    wrap(<History initialTab="activity" />);
    expect(screen.getByLabelText('Loading history')).toBeInTheDocument();
    mockReady = true;
  });

  it('switches between group buys and wallet activity tabs', () => {
    pools = [card('1', 'Settled', 'Rice', '2026-10-01T10:00:00Z')];
    wrap(<History initialTab="pools" initialActivities={mockActivities} />);

    // Starts on group buys
    expect(screen.getByText('Rice')).toBeInTheDocument();

    // Click wallet activity tab
    const activityTab = screen.getByRole('tab', { name: /wallet activity/i });
    fireEvent.click(activityTab);

    // Shows activity
    expect(screen.getByText('Deposit completed')).toBeInTheDocument();
  });
});
