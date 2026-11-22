import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RefundBreakdown } from './RefundBreakdown';
import { NextIntlClientProvider } from 'next-intl';

const messages = {
  refundBreakdown: {
    title: 'Refund Breakdown',
    tierDifference: 'Price tier difference',
    shortfall: 'Shortfall refund',
    dispute: 'Dispute resolution',
    total: 'Total refund',
  },
};

describe('RefundBreakdown', () => {
  it('renders nothing when no refunds', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RefundBreakdown />
      </NextIntlClientProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders tier difference refund only', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RefundBreakdown tierDifferenceRefund="5.00" />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Refund Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Price tier difference')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });

  it('renders all refund types', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RefundBreakdown
          tierDifferenceRefund="5.00"
          shortfallRefund="3.00"
          disputeRefund="2.00"
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Price tier difference')).toBeInTheDocument();
    expect(screen.getByText('Shortfall refund')).toBeInTheDocument();
    expect(screen.getByText('Dispute resolution')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument(); // total
  });

  it('hides zero amounts', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RefundBreakdown tierDifferenceRefund="5.00" shortfallRefund="0" />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Price tier difference')).toBeInTheDocument();
    expect(screen.queryByText('Shortfall refund')).not.toBeInTheDocument();
  });
});
