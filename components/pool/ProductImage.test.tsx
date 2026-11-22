import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZES, FALLBACK_PLACEHOLDER, ProductImage } from './ProductImage';

describe('ProductImage component (#76)', () => {
  it('renders provided valid image src with meaningful alt text', () => {
    render(
      <ProductImage
        src="http://localhost:3000/v1/images/rice.jpg"
        alt="Mama Gold Rice 50kg"
        priority
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'Mama Gold Rice 50kg');
    // next/image encodes or formats src attribute
    expect(img.getAttribute('src')).toContain('rice.jpg');
  });

  it('swaps immediately to fallback placeholder when src is missing (undefined/null)', () => {
    render(<ProductImage src={null} alt="Mama Gold Rice 50kg" />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain(FALLBACK_PLACEHOLDER);
    expect(img).toHaveAttribute('alt', 'Mama Gold Rice 50kg (placeholder)');
  });

  it('swaps immediately to fallback placeholder when src is empty string', () => {
    render(<ProductImage src="   " alt="Mama Gold Rice 50kg" />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain(FALLBACK_PLACEHOLDER);
    expect(img).toHaveAttribute('alt', 'Mama Gold Rice 50kg (placeholder)');
  });

  it('swaps to fallback placeholder when an image load error occurs (onError)', () => {
    render(
      <ProductImage
        src="http://localhost:3000/v1/images/broken.jpg"
        alt="Broken Image"
      />,
    );

    const img = screen.getByRole('img');
    fireEvent.error(img);

    expect(img.getAttribute('src')).toContain(FALLBACK_PLACEHOLDER);
    expect(img).toHaveAttribute('alt', 'Broken Image (placeholder)');
  });

  it('enforces fixed aspect-ratio container to prevent Cumulative Layout Shift (CLS)', () => {
    render(
      <ProductImage
        src="http://localhost:3000/v1/images/rice.jpg"
        alt="Mama Gold Rice 50kg"
      />,
    );

    const container = screen.getByTestId('product-image-container');
    expect(container).toHaveClass('aspect-video');
    expect(container).toHaveClass('relative');
    expect(container).toHaveClass('w-full');
  });

  it('applies the correct responsive sizes attribute for real layout breakpoints', () => {
    render(
      <ProductImage
        src="http://localhost:3000/v1/images/rice.jpg"
        alt="Mama Gold Rice 50kg"
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('sizes', DEFAULT_SIZES);
  });

  it('sets priority on main above-the-fold image and lazy loading on others', () => {
    const { unmount } = render(
      <ProductImage
        src="http://localhost:3000/v1/images/rice.jpg"
        alt="Main Image"
        priority={true}
      />,
    );

    const mainImg = screen.getByRole('img');
    // In next/image, priority images omit loading="lazy" or use fetchpriority="high"
    expect(mainImg.getAttribute('loading')).not.toBe('lazy');
    unmount();

    render(
      <ProductImage
        src="http://localhost:3000/v1/images/rice-side.jpg"
        alt="Side Image"
        priority={false}
      />,
    );

    const sideImg = screen.getByRole('img');
    expect(sideImg).toHaveAttribute('loading', 'lazy');
  });
});
