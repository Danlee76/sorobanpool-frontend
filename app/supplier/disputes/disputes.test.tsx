import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetSupplierDisputes = vi.fn();
const mockSubmitDisputeResponse = vi.fn();
const mockUploadEvidence = vi.fn();

vi.mock('@/lib/api', () => ({
  getSupplierDisputes: (...args: unknown[]) => mockGetSupplierDisputes(...args),
  submitDisputeResponse: (...args: unknown[]) => mockSubmitDisputeResponse(...args),
}));
vi.mock('@/lib/auth', () => ({ useRequireAuth: vi.fn(() => ({ address: 'SUPPLIER123' })) }));
vi.mock('@/lib/upload', () => ({ uploadEvidence: (...args: unknown[]) => mockUploadEvidence(...args) }));

const messages = {
  supplier: {
    disputes: {
      title: 'My Disputes',
      loading: 'Loading…',
      loadError: 'Failed to load',
      empty: 'No disputes',
      openSection: 'Open',
      closedSection: 'Closed',
      respondButton: 'Respond',
      cancelButton: 'Cancel',
      submitButton: 'Submit Response',
      submitting: 'Submitting…',
      responseTitle: 'Your Response',
      resolutionLabel: 'Resolution',
      resolutionRefund: 'Offer Refund',
      resolutionReplace: 'Replace Item',
      resolutionReject: 'Reject Claim',
      messageLabel: 'Message',
      messagePlaceholder: 'Explain your position…',
      evidenceLabel: 'Evidence (optional)',
      evidenceHint: 'Upload photo or PDF',
      openedBy: 'Opened by {opener}',
      claimedAmount: 'Claimed: ₦{amount}',
      unknownItem: 'Unknown item',
      slaBreached: 'SLA breached',
      slaHours: '{hrs}h left',
      stateOPEN: 'Open',
      stateRESOLVED: 'Resolved',
      stateTIMED_OUT: 'Timed out',
    },
  },
};

function makeDispute(overrides = {}) {
  return {
    id: 'd-1',
    poolId: 'pool-1',
    opener: 'BUYER123456789',
    state: 'OPEN',
    claimedAmount: 50000,
    openedAt: new Date().toISOString(),
    slaDueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    msToSla: 24 * 3600 * 1000,
    itemName: 'Rice 50kg',
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
  const { default: Page } = await import('./disputes-page');
  return Page;
}

describe('SupplierDisputesPage', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetSupplierDisputes.mockReset();
    mockSubmitDisputeResponse.mockReset();
    mockUploadEvidence.mockReset();
  });

  it('shows loading state', async () => {
    mockGetSupplierDisputes.mockReturnValue(new Promise(() => {}));
    const Page = await importPage();
    render(<Page />, { wrapper });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty message when no disputes', async () => {
    mockGetSupplierDisputes.mockResolvedValue([]);
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('No disputes');
  });

  it('renders open dispute card with respond button', async () => {
    mockGetSupplierDisputes.mockResolvedValue([makeDispute()]);
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('Rice 50kg');
    expect(screen.getByRole('button', { name: 'Respond' })).toBeInTheDocument();
  });

  it('shows response form when Respond clicked', async () => {
    mockGetSupplierDisputes.mockResolvedValue([makeDispute()]);
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByRole('button', { name: 'Respond' });
    fireEvent.click(screen.getByRole('button', { name: 'Respond' }));
    expect(screen.getByText('Your Response')).toBeInTheDocument();
    expect(screen.getByLabelText('Resolution')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
  });

  it('submits response without evidence', async () => {
    mockGetSupplierDisputes.mockResolvedValue([makeDispute()]);
    mockSubmitDisputeResponse.mockResolvedValue({ ok: true });
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByRole('button', { name: 'Respond' });
    fireEvent.click(screen.getByRole('button', { name: 'Respond' }));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Delivered as agreed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Response' }));
    await waitFor(() => expect(mockSubmitDisputeResponse).toHaveBeenCalledWith('d-1', {
      resolution: 'REFUND',
      message: 'Delivered as agreed',
      evidenceId: undefined,
    }));
  });

  it('shows SLA breach badge for breached disputes', async () => {
    mockGetSupplierDisputes.mockResolvedValue([makeDispute({ msToSla: -1000 })]);
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('SLA breached');
  });

  it('renders resolved dispute in closed section without respond button', async () => {
    mockGetSupplierDisputes.mockResolvedValue([makeDispute({ state: 'RESOLVED' })]);
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByText('Closed (1)');
    expect(screen.queryByRole('button', { name: 'Respond' })).not.toBeInTheDocument();
  });

  it('cancels response form', async () => {
    mockGetSupplierDisputes.mockResolvedValue([makeDispute()]);
    const Page = await importPage();
    render(<Page />, { wrapper });
    await screen.findByRole('button', { name: 'Respond' });
    fireEvent.click(screen.getByRole('button', { name: 'Respond' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Your Response')).not.toBeInTheDocument();
  });
});
