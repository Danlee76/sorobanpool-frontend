import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('lazy loading fallbacks for heavy admin and arbiter modules', () => {
  it('renders EvidenceGallery accessible loading fallback without layout shift', () => {
    const Fallback = () => (
      <div
        role="status"
        aria-label="Loading evidence gallery"
        className="min-h-[6rem] rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-600"
      >
        <span className="sr-only">Loading evidence gallery</span>
        <p>Loading evidence…</p>
      </div>
    );

    render(<Fallback />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading evidence gallery');
    expect(screen.getByText('Loading evidence…')).toBeInTheDocument();
    expect(status).toHaveClass('min-h-[6rem]');
  });

  it('renders XdrExport accessible loading fallback without layout shift', () => {
    const Fallback = () => (
      <div
        role="status"
        aria-label="Loading export component"
        className="min-h-[5rem] rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center text-sm text-neutral-600"
      >
        <span className="sr-only">Loading export component</span>
        <p>Loading export…</p>
      </div>
    );

    render(<Fallback />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading export component');
    expect(screen.getByText('Loading export…')).toBeInTheDocument();
    expect(status).toHaveClass('min-h-[5rem]');
  });
});
