'use client';
import Image from 'next/image';
import { useState } from 'react';

export const FALLBACK_PLACEHOLDER = '/images/product-placeholder.svg';
export const DEFAULT_SIZES = '(min-width: 1152px) 1072px, (min-width: 768px) calc(100vw - 80px), calc(100vw - 32px)';

interface ProductImageProps {
  src?: string | null;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

export function ProductImage({
  src,
  alt,
  priority = false,
  sizes = DEFAULT_SIZES,
  className = '',
}: ProductImageProps) {
  const initialSrc = typeof src === 'string' && src.trim().length > 0 ? src : FALLBACK_PLACEHOLDER;
  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const [hasError, setHasError] = useState(initialSrc === FALLBACK_PLACEHOLDER);

  const handleError = () => {
    if (!hasError) {
      setHasError(true);
      setCurrentSrc(FALLBACK_PLACEHOLDER);
    }
  };

  const finalAlt = hasError && alt ? `${alt} (placeholder)` : alt || 'Product image';

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-100 ${className}`}
      data-testid="product-image-container"
    >
      <Image
        src={currentSrc}
        alt={finalAlt}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : 'lazy'}
        onError={handleError}
        className="object-cover transition-opacity duration-300"
      />
    </div>
  );
}
