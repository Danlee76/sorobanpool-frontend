import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

describe('EmptyState', () => {
  it('renders the sentence as an accessible heading, with the icon hidden from assistive tech', () => {
    render(<EmptyState icon={<svg data-testid="icon" />}>No open group buys right now.</EmptyState>);
    expect(screen.getByRole('heading', { level: 2, name: 'No open group buys right now.' })).toBeInTheDocument();
    expect(screen.getByTestId('icon').closest('[aria-hidden]')).toBeTruthy();
  });

  it('renders a link action with real anchor semantics', () => {
    render(
      <EmptyState icon={<svg />} action={{ label: 'See open group buys', href: '/explore' }}>
        No finished group buys yet.
      </EmptyState>,
    );
    const link = screen.getByRole('link', { name: 'See open group buys' });
    expect(link).toHaveAttribute('href', '/explore');
  });

  it('renders a button action that calls onClick', () => {
    const onClick = vi.fn();
    render(
      <EmptyState icon={<svg />} action={{ label: 'Create group buy', onClick }}>
        You have not organized a group buy yet.
      </EmptyState>,
    );
    const button = screen.getByRole('button', { name: 'Create group buy' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders with no action when none is given', () => {
    render(<EmptyState icon={<svg />}>No finished group buys yet.</EmptyState>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses a lower heading level when nested under an existing section heading', () => {
    render(
      <section>
        <h2>My group buys</h2>
        <EmptyState icon={<svg />} headingLevel="h3">You have not joined a group buy yet.</EmptyState>
      </section>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'You have not joined a group buy yet.' })).toBeInTheDocument();
  });
});
