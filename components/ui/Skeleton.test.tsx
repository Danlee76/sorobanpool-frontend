import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton, PoolCardSkeleton, PoolListItemSkeleton, PoolSummarySkeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders with aria-busy', () => {
    render(<Skeleton data-testid="skeleton" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveAttribute('aria-busy', 'true');
  });

  it('applies custom dimensions', () => {
    render(<Skeleton width="200px" height="40px" data-testid="skeleton" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveStyle({ width: '200px', height: '40px' });
  });

  it('applies custom border radius', () => {
    render(<Skeleton radius="8px" data-testid="skeleton" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveStyle({ borderRadius: '8px' });
  });
});

describe('PoolCardSkeleton', () => {
  it('renders with accessible loading message', () => {
    render(<PoolCardSkeleton />);
    expect(screen.getByText('Loading pool information')).toBeInTheDocument();
  });

  it('has multiple skeleton elements matching pool card structure', () => {
    const { container } = render(<PoolCardSkeleton />);
    const skeletons = container.querySelectorAll('[aria-busy="true"]');
    expect(skeletons.length).toBeGreaterThan(5);
  });
});

describe('PoolListItemSkeleton', () => {
  it('renders with accessible loading message', () => {
    render(<PoolListItemSkeleton />);
    expect(screen.getByText('Loading pool information')).toBeInTheDocument();
  });
});

describe('PoolSummarySkeleton', () => {
  it('renders with accessible loading message', () => {
    render(<PoolSummarySkeleton />);
    expect(screen.getByText('Loading pool details')).toBeInTheDocument();
  });
});
