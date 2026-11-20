import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', () => ({ createOffer: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useRequireAuth: vi.fn(() => ({ address: 'SUPPLIER' })) }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ push: vi.fn() })) }));

const messages = {
  supplier: {
    offer: {
      newTitle: 'New Offer',
      formTab: 'Form',
      previewTab: 'Preview',
      productSection: 'Product',
      titleLabel: 'Title',
      brandLabel: 'Brand',
      unitLabel: 'Unit',
      categoryLabel: 'Category',
      descriptionLabel: 'Description',
      tiersSection: 'Pricing Tiers',
      minUnitsLabel: 'Min Units',
      priceNairaLabel: 'Price (₦)',
      addTierButton: 'Add tier',
      removeTierButton: 'Remove',
      deliverySection: 'Delivery Areas',
      poolSettingsSection: 'Pool Settings',
      maxUnitsLabel: 'Pool Cap',
      maxPerMemberLabel: 'Max per Member',
      leadTimeLabel: 'Lead Time (hrs)',
      validDaysLabel: 'Valid Days',
      previewButton: 'Preview',
      publishButton: 'Publish',
      publishing: 'Publishing…',
      submitError: 'Failed to publish',
      preview: {
        untitled: 'Untitled offer',
        priceFrom: 'from',
        unit: 'unit',
        units: 'units',
        tierBreaks: 'Price breaks',
        minUnits: 'Min units',
        pricePerUnit: 'Price / unit',
        savingsRange: 'Up to {pct}% savings',
        poolCap: 'Pool cap',
        maxPerMember: 'Max per member',
        leadTime: 'Lead time',
        validFor: 'Valid for',
        deliveryAreas: 'Delivery areas',
        noAreas: 'Nationwide',
        trustNote: 'Protected by SorobanPool escrow — payment released only on confirmed delivery.',
      },
      areaPicker: {
        stateLabel: 'State',
        statePlaceholder: 'Select state',
        lgaLabel: 'LGA',
        lgaAllOption: 'All LGAs',
        addButton: 'Add',
        selectedAreasLabel: 'Selected areas',
        removeLabel: 'Remove {area}',
        emptyHint: 'No areas selected',
      },
    },
  },
};

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
  const { default: Page } = await import('./new-offer-page');
  return Page;
}

describe('NewOfferPage tabs', () => {
  beforeEach(() => { vi.resetModules(); });

  it('shows form tab by default', async () => {
    const Page = await importPage();
    render(<Page />, { wrapper });
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('switches to preview tab when Preview button clicked', async () => {
    const Page = await importPage();
    render(<Page />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Untitled offer')).toBeInTheDocument();
  });

  it('preview shows tier break table when tiers are filled', async () => {
    const Page = await importPage();
    render(<Page />, { wrapper });

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Rice 50kg' } });

    const minInputs = screen.getAllByLabelText('Min Units');
    const priceInputs = screen.getAllByLabelText('Price (₦)');
    fireEvent.change(minInputs[0], { target: { value: '10' } });
    fireEvent.change(priceInputs[0], { target: { value: '45000' } });

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }).closest('button') ?? screen.getAllByText('Preview')[0]);
    expect(screen.getByText('10+')).toBeInTheDocument();
    expect(screen.getByText('₦45,000')).toBeInTheDocument();
  });

  it('preview shows "Nationwide" when no delivery areas selected', async () => {
    const Page = await importPage();
    render(<Page />, { wrapper });
    fireEvent.click(screen.getAllByText('Preview')[0]);
    expect(screen.getByText('Nationwide')).toBeInTheDocument();
  });

  it('preview shows trust note', async () => {
    const Page = await importPage();
    render(<Page />, { wrapper });
    fireEvent.click(screen.getAllByText('Preview')[0]);
    expect(screen.getByText(/SorobanPool escrow/)).toBeInTheDocument();
  });
});
