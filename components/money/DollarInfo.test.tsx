import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { DollarInfo } from './DollarInfo';
import en from '@/messages/en.json';
import pcm from '@/messages/pcm.json';

function wrap(ui: React.ReactNode, locale: 'en' | 'pcm' = 'en') {
  const messages = locale === 'en' ? en : pcm;
  return render(<NextIntlClientProvider locale={locale} messages={messages}>{ui}</NextIntlClientProvider>);
}

describe('DollarInfo', () => {
  it('renders a button that opens a bottom sheet explaining dollar pricing', () => {
    wrap(<DollarInfo ngnPerUsd={1650} />);
    const button = screen.getByRole('button', { name: /about dollar pricing/i });
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: /prices are fixed in dollars/i });
    expect(dialog).toBeInTheDocument();
  });

  it('shows the current exchange rate in the sheet', () => {
    wrap(<DollarInfo ngnPerUsd={1650} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/₦1,650\.00 per \$1/i)).toBeInTheDocument();
  });

  it('shows when the rate was quoted if given', () => {
    wrap(<DollarInfo ngnPerUsd={1650} quotedAt="2026-11-20T10:00:00Z" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/rate quoted at/i)).toBeInTheDocument();
  });

  it('closes when the close button is clicked', () => {
    wrap(<DollarInfo ngnPerUsd={1650} />);
    fireEvent.click(screen.getByRole('button', { name: /about dollar pricing/i }));
    const dialog = screen.getByRole('dialog');
    const closeButton = within(dialog).getByRole('button', { name: /got it/i });
    fireEvent.click(closeButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when clicking the backdrop', () => {
    wrap(<DollarInfo ngnPerUsd={1650} />);
    fireEvent.click(screen.getByRole('button', { name: /about dollar pricing/i }));
    const dialog = screen.getByRole('dialog');
    // Click the parent container (the backdrop)
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when pressing Escape', () => {
    wrap(<DollarInfo ngnPerUsd={1650} />);
    fireEvent.click(screen.getByRole('button', { name: /about dollar pricing/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog.parentElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is locale-aware in Pidgin', () => {
    wrap(<DollarInfo ngnPerUsd={1650} />, 'pcm');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/price dey fixed for dollar/i)).toBeInTheDocument();
  });
});
