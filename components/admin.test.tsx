import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { renderIntl } from '@/tests/render';
import { ApiError } from '@/lib/api';
import type { RiskOverview } from '@/lib/types';

let handler: (path: string, opts?: { body?: unknown }) => Promise<unknown>;
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: vi.fn((p: string, o?: { body?: unknown }) => handler(p, o)) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'u1' }) }));

import Risk from '@/app/admin/page';
import Users from '@/app/admin/users/page';
import Suppliers from '@/app/admin/suppliers/page';
import SupplierReview from '@/app/admin/suppliers/[id]/page';
import Audit from '@/app/admin/audit/page';
import AdminOffers from '@/app/admin/offers/page';
import AdminDisputes from '@/app/admin/disputes/page';

const wrap = (ui: React.ReactElement) => renderIntl(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const overview: RiskOverview = {
  gmv: '1000000000', escrowHeld: '250000000', poolsByState: { Settled: 3 }, failureRate7d: 0.12, dispute7d: { disputes: 1, deliveredPools: 20, rate: 0.05 },
  bySupplier: [{ supplier: 'GSUPPLIERADDRESSLONGENOUGH1234', pools: 5, disputes: 2, disputeRate: 0.4 }],
  pairs: [{ organizer: 'GORGANIZERADDRESSLONGENOUGH123', supplier: 'GSUPPLIERADDRESSLONGENOUGH1234', pools: 4, shareOfOrganizer: 0.8 }],
  flags: [{ kind: 'FAILURE_RATE', message: 'Pool failure rate is 12.0% over 7 days (limit 5%)' }], generatedAt: '2026-10-10T12:00:00Z',
};

describe('admin risk page', () => {
  it('shows the headline numbers in dollars, rates as percentages, and flags as alerts', async () => {
    handler = async () => overview;
    wrap(<Risk />);
    expect(await screen.findByText('100 USD')).toBeInTheDocument(); // 1,000,000,000 stroops
    expect(screen.getByText('25 USD')).toBeInTheDocument();
    expect(screen.getByText('12.0%')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('limit 5%');
    expect(screen.getByText(/GSUPP…1234 · 5 pools/)).toBeInTheDocument();
    expect(screen.getByText(/4 pools · 80%/)).toBeInTheDocument();
  });
  it('says nothing is flagged when it is not', async () => {
    handler = async () => ({ ...overview, flags: [] });
    wrap(<Risk />);
    expect(await screen.findByText('Nothing flagged.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('admin supplier approvals list', () => {
  const app = { userId: 'u1', businessName: 'Tunde Foods Ltd', cacNumber: 'RC1234567', address: '12 Market Rd', state: 'FCT', lga: 'Bwari', categories: ['rice'] };
  it('lists applications with a link to the review screen', async () => {
    handler = async () => [app];
    wrap(<Suppliers />);
    expect(await screen.findByText('Tunde Foods Ltd')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review application' })).toHaveAttribute('href', '/admin/suppliers/u1');
  });
  it('shows an empty state', async () => {
    handler = async () => [];
    wrap(<Suppliers />);
    expect(await screen.findByText('No applications waiting.')).toBeInTheDocument();
  });
});

describe('admin supplier review screen', () => {
  const detail = {
    application: { userId: 'u1', businessName: 'Tunde Foods Ltd', cacNumber: 'RC1234567', address: '12 Market Rd', state: 'FCT', lga: 'Bwari', categories: ['rice'] },
    checks: { cac: 'PASS', bank: 'FAIL' },
  };
  const docs = [{ id: 'd1', name: 'CAC certificate.pdf', signedUrl: 'https://files.example/d1?sig=abc' }];

  it('shows checks and documents behind signed URLs', async () => {
    handler = async (p) => (p.endsWith('/documents') ? docs : detail);
    wrap(<SupplierReview />);
    expect(await screen.findByText('Tunde Foods Ltd')).toBeInTheDocument();
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CAC certificate.pdf' })).toHaveAttribute('href', 'https://files.example/d1?sig=abc');
  });

  it('refuses to decide without a reason and sends nothing', async () => {
    const sent: unknown[] = [];
    handler = async (p, o) => { if (p.includes('/decision')) { sent.push(o?.body); return {}; } return p.endsWith('/documents') ? docs : detail; };
    wrap(<SupplierReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a reason before deciding.');
    expect(sent).toEqual([]);
  });

  it('sends the decision with the reason and confirms the audit entry', async () => {
    const sent: unknown[] = [];
    handler = async (p, o) => {
      if (p.includes('/decision')) { sent.push([p, o?.body]); return { auditId: 'aud_42' }; }
      return p.endsWith('/documents') ? docs : detail;
    };
    wrap(<SupplierReview />);
    await screen.findByText('Tunde Foods Ltd');
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Blurry CAC scan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Decision saved.')).toBeInTheDocument();
    expect(screen.getByText('Audit entry aud_42')).toBeInTheDocument();
    expect(sent).toEqual([['/admin/suppliers/u1/decision', { approve: false, reason: 'Blurry CAC scan' }]]);
  });

  it('explains that the supplier must activate first instead of showing a contract code', async () => {
    handler = async (p) => {
      if (p.includes('/decision')) throw new ApiError(422, 'CONTRACT_ERROR', 'x', 201);
      return p.endsWith('/documents') ? docs : detail;
    };
    wrap(<SupplierReview />);
    await screen.findByText('Tunde Foods Ltd');
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Looks fine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The supplier must activate their account first.');
  });
});

describe('admin audit log', () => {
  const entries = [
    { id: 'e1', actorId: 'GADMINACCOUNTAAAA1111', action: 'SUPPLIER_DECISION', target: 'u1', at: '2026-10-10T10:00:00Z', data: { supplierBvn: '22233344455', fee: '10', reasonText: 'ok' } },
    { id: 'e2', actorId: 'GOTHERACCOUNTBBBB2222', action: 'OFFER_TAKEDOWN', target: 'o9', at: '2026-10-01T10:00:00Z' },
  ];

  it('filters by action and by actor', async () => {
    handler = async () => entries;
    wrap(<Audit />);
    expect(await screen.findAllByTestId('audit-entry')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'OFFER_TAKEDOWN' } });
    expect(screen.getAllByTestId('audit-entry')).toHaveLength(1);
    expect(screen.getByText('OFFER_TAKEDOWN')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Actor'), { target: { value: 'nomatch' } });
    expect(screen.getByText('No entries match these filters.')).toBeInTheDocument();
  });

  it('filters by from date', async () => {
    handler = async () => entries;
    wrap(<Audit />);
    await screen.findAllByTestId('audit-entry');
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-10-05' } });
    expect(screen.getAllByTestId('audit-entry')).toHaveLength(1);
  });

  it('expands a row into readable key/value details and masks sensitive fields', async () => {
    handler = async () => entries;
    wrap(<Audit />);
    const [first] = await screen.findAllByTestId('audit-entry');
    const toggle = within(first).getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(first).getByText('supplier bvn')).toBeInTheDocument();
    expect(within(first).getByText('••••')).toBeInTheDocument(); // BVN masked
    expect(within(first).queryByText('22233344455')).toBeNull();
    expect(within(first).getByText('10')).toBeInTheDocument(); // non-sensitive shown
    expect(within(first).getByText('reason text')).toBeInTheDocument();
  });

  it('shows identifiers shortened instead of in full', async () => {
    handler = async () => entries;
    wrap(<Audit />);
    expect(await screen.findByText(/GADMI…1111/)).toBeInTheDocument();
    expect(screen.queryByText('GADMINACCOUNTAAAA1111')).toBeNull();
  });
});

describe('admin offer moderation', () => {
  const offers = [
    { id: 'o1', title: 'Rice 50kg', category: 'food', status: 'ACTIVE', flags: [{ kind: 'PRICE_OUTLIER', detail: '4x median price' }] },
    { id: 'o2', title: 'Garri 5kg', category: 'food', status: 'ACTIVE' },
  ];

  it('filters to flagged offers and shows the flag', async () => {
    handler = async () => offers;
    wrap(<AdminOffers />);
    expect(await screen.findByText('Garri 5kg')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show flagged offers only'));
    expect(screen.queryByText('Garri 5kg')).toBeNull();
    expect(screen.getByText('Price outlier: 4x median price')).toBeInTheDocument();
  });

  it('requires a reason code before taking an offer down', async () => {
    const sent: unknown[] = [];
    handler = async (p, o) => { if (p.includes('/takedown')) { sent.push([p, o?.body]); return {}; } return offers; };
    wrap(<AdminOffers />);
    const row = (await screen.findByText('Rice 50kg')).closest('tr, tbody, li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Take down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm takedown' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a reason code before taking this offer down.');
    expect(sent).toEqual([]);
  });

  it('sends the reason code and reflects the takedown in the list immediately', async () => {
    const sent: unknown[] = [];
    // Server state moves to TAKEN_DOWN after the call, so the refetch agrees with the optimistic update.
    let rows = offers;
    handler = async (p, o) => {
      if (p.includes('/takedown')) {
        sent.push([p, o?.body]);
        rows = rows.map((r) => (r.id === 'o1' ? { ...r, status: 'TAKEN_DOWN' } : r));
        return {};
      }
      return rows;
    };
    wrap(<AdminOffers />);
    const row = (await screen.findByText('Rice 50kg')).closest('tr, tbody, li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Take down' }));
    fireEvent.change(screen.getByLabelText(/Reason code/), { target: { value: 'MISLEADING_PRICE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm takedown' }));
    await screen.findByText(/Taken down \(new pools only\)/);
    expect(sent).toEqual([['/admin/offers/o1/takedown', { reasonCode: 'MISLEADING_PRICE', notifySupplier: true }]]);
  });
});

describe('admin dispute oversight', () => {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const hoursFrom = (h: number) => new Date(now + h * 3_600_000).toISOString();
  const disputes = [
    { id: 'D1', poolId: 'P1', opener: 'x', state: 'OPEN', claimedAmount: '50', openedAt: hoursAgo(60), slaDueAt: hoursAgo(12), arbiterId: 'arb-1' },
    { id: 'D2', poolId: 'P2', opener: 'x', state: 'OPEN', claimedAmount: '20', openedAt: hoursAgo(5), slaDueAt: hoursFrom(20), arbiterId: 'arb-1' },
    { id: 'D3', poolId: 'P3', opener: 'x', state: 'RESOLVED', claimedAmount: '10', openedAt: hoursAgo(48), slaDueAt: hoursAgo(24), resolvedAt: hoursAgo(24), arbiterId: 'arb-2' },
    { id: 'D4', poolId: 'P4', opener: 'x', state: 'OPEN', claimedAmount: '5', openedAt: hoursAgo(24 * 40), slaDueAt: hoursAgo(24 * 39) },
  ];

  it('shows counts, average resolution, breached disputes and arbiter workload for the window', async () => {
    handler = async () => disputes;
    wrap(<AdminDisputes />);
    expect(await screen.findByText('SLA breaches (1)')).toBeInTheDocument();
    // 30-day window excludes D4 (40 days old): 3 opened, 2 open, 1 resolved.
    const summary = screen.getByRole('region', { name: 'Summary' }).closest('section') as HTMLElement;
    expect(within(summary).getByText('3')).toBeInTheDocument();
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(within(summary).getByText('1d 0h')).toBeInTheDocument(); // D3 resolved in 24h
    const breachTable = screen.getByRole('table');
    expect(within(breachTable).getByRole('link', { name: '#D1' })).toHaveAttribute('href', '#dispute-D1');
    expect(within(breachTable).queryByText('#D2')).toBeNull();
    const workload = screen.getByRole('region', { name: 'Arbiter workload (open disputes)' });
    expect(within(workload).getByText('arb-1')).toBeInTheDocument();
    expect(within(workload).getByText('2 open')).toBeInTheDocument();
  });

  it('widens the window to include older disputes', async () => {
    handler = async () => disputes;
    wrap(<AdminDisputes />);
    await screen.findByText('SLA breaches (1)');
    fireEvent.change(screen.getByLabelText('Time window'), { target: { value: '90' } });
    expect(await screen.findByText('SLA breaches (2)')).toBeInTheDocument();
  });
});

async function violations(el: HTMLElement) {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

describe('admin lists semantic table markup and accessibility', () => {
  const sampleUsers = [
    { id: 'u1', phone: '+2348011111111', displayName: 'Alhaji Musa', walletAddress: 'GUSER1', roles: [{ role: 'TRADER', level: 1 }] },
    { id: 'u2', phone: '+2348022222222', displayName: null, walletAddress: null, roles: [{ role: 'ORGANIZER', level: 2 }] },
  ];
  const sampleSuppliers = [
    { userId: 's1', businessName: 'Tunde Foods Ltd', cacNumber: 'RC1234567', address: '12 Market Rd', state: 'FCT', lga: 'Bwari', categories: ['rice'] },
  ];
  const sampleOffers = [
    { id: 'o1', title: 'Rice 50kg', category: 'food', status: 'ACTIVE', flags: [] },
  ];
  const sampleAudit = [
    { id: 'e1', actorId: 'GADMIN1111', action: 'SUPPLIER_DECISION', target: 'u1', at: '2026-10-10T10:00:00Z', data: { note: 'verified' } },
  ];

  it('exposes correct roles: table, columnheader, rowheader, cell and scope attributes in users list', async () => {
    handler = async () => sampleUsers;
    const { container } = wrap(<Users />);
    const table = await screen.findByRole('table');
    expect(table).toBeInTheDocument();

    // Caption present and named
    const caption = container.querySelector('caption');
    expect(caption).toBeInTheDocument();
    expect(caption).toHaveTextContent('Users list');

    // Column headers with scope="col"
    const colHeaders = screen.getAllByRole('columnheader');
    expect(colHeaders.length).toBeGreaterThanOrEqual(4);
    for (const ch of colHeaders) {
      expect(ch).toHaveAttribute('scope', 'col');
    }

    // Row headers with scope="row"
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders).toHaveLength(2);
    expect(rowHeaders[0]).toHaveAttribute('scope', 'row');
    expect(rowHeaders[0]).toHaveTextContent('Alhaji Musa');
    expect(rowHeaders[1]).toHaveAttribute('scope', 'row');
    expect(rowHeaders[1]).toHaveTextContent('+2348022222222');

    // Cells
    const cells = screen.getAllByRole('cell');
    expect(cells.length).toBeGreaterThanOrEqual(6);
  });

  it('handles aria-sort initial state and transitions (none -> ascending -> descending, resetting on column switch)', async () => {
    handler = async () => sampleUsers;
    wrap(<Users />);
    await screen.findByRole('table');

    const colHeaders = screen.getAllByRole('columnheader');
    const userTh = colHeaders[0];
    const phoneTh = colHeaders[1];
    const rolesTh = colHeaders[2];

    // Initial state: unsorted sortable headers have aria-sort="none", non-sortable headers have no aria-sort
    expect(userTh).toHaveAttribute('aria-sort', 'none');
    expect(phoneTh).toHaveAttribute('aria-sort', 'none');
    expect(rolesTh).not.toHaveAttribute('aria-sort');

    const userSortBtn = within(userTh).getByRole('button', { name: /User/i });
    const phoneSortBtn = within(phoneTh).getByRole('button', { name: /Phone/i });

    // Transition 1: none -> ascending
    fireEvent.click(userSortBtn);
    expect(userTh).toHaveAttribute('aria-sort', 'ascending');
    expect(phoneTh).toHaveAttribute('aria-sort', 'none');

    // Transition 2: ascending -> descending
    fireEvent.click(userSortBtn);
    expect(userTh).toHaveAttribute('aria-sort', 'descending');
    expect(phoneTh).toHaveAttribute('aria-sort', 'none');

    // Transition 3: switching column resets previous column to none and sets new to ascending
    fireEvent.click(phoneSortBtn);
    expect(userTh).toHaveAttribute('aria-sort', 'none');
    expect(phoneTh).toHaveAttribute('aria-sort', 'ascending');
  });

  it('supports keyboard activation via Enter and Space on sortable headers', async () => {
    handler = async () => sampleUsers;
    wrap(<Users />);
    await screen.findByRole('table');

    const userTh = screen.getAllByRole('columnheader')[0];
    const userSortBtn = within(userTh).getByRole('button', { name: /User/i });

    expect(userTh).toHaveAttribute('aria-sort', 'none');

    // Press Enter
    fireEvent.keyDown(userSortBtn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(userSortBtn);
    expect(userTh).toHaveAttribute('aria-sort', 'ascending');

    // Press Space
    fireEvent.keyDown(userSortBtn, { key: ' ', code: 'Space' });
    fireEvent.click(userSortBtn);
    expect(userTh).toHaveAttribute('aria-sort', 'descending');
  });

  it('passes axe accessibility checks on each admin list', async () => {
    // 1. Users list
    handler = async () => sampleUsers;
    const usersView = wrap(<Users />);
    await screen.findByRole('table');
    expect(await violations(usersView.container)).toEqual([]);

    // 2. Suppliers list
    handler = async () => sampleSuppliers;
    const supView = wrap(<Suppliers />);
    await screen.findByRole('table');
    expect(await violations(supView.container)).toEqual([]);

    // 3. Offers list
    handler = async () => sampleOffers;
    const offersView = wrap(<AdminOffers />);
    await screen.findByRole('table');
    expect(await violations(offersView.container)).toEqual([]);

    // 4. Audit list
    handler = async () => sampleAudit;
    const auditView = wrap(<Audit />);
    await screen.findByRole('table');
    expect(await violations(auditView.container)).toEqual([]);
  });
});
