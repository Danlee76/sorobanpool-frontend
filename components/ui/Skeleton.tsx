import { type HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Width of the skeleton element. Can be a CSS value like '100%', '200px', etc.
   */
  width?: string;
  /**
   * Height of the skeleton element. Can be a CSS value like '20px', '2rem', etc.
   */
  height?: string;
  /**
   * Border radius. Defaults to '0.5rem'.
   */
  radius?: string;
}

/**
 * Skeleton loader component that respects prefers-reduced-motion.
 * Shows a placeholder that matches the layout of content being loaded.
 */
export function Skeleton({ width, height, radius = '0.5rem', className = '', style, ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-neutral-200 ${className}`}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      aria-busy="true"
      {...props}
    />
  );
}

/**
 * Skeleton for a pool card in the grid view (explore page).
 */
export function PoolCardSkeleton() {
  return (
    <div className="pool-card block min-h-12 rounded-[1.5rem] border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <Skeleton width="4rem" height="1.5rem" radius="9999px" />
        <Skeleton width="1.5rem" height="1.5rem" />
      </div>
      <div className="mt-5 space-y-2">
        <Skeleton height="1.5rem" width="80%" />
        <Skeleton height="1rem" width="60%" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-2">
        <div className="space-y-1">
          <Skeleton height="0.75rem" width="5rem" />
          <Skeleton height="2rem" width="6rem" />
        </div>
        <Skeleton height="1rem" width="3rem" />
      </div>
      <Skeleton height="0.5rem" width="100%" radius="9999px" className="mt-3" />
      <Skeleton height="0.75rem" width="12rem" className="mt-3" />
      <span className="sr-only">Loading pool information</span>
    </div>
  );
}

/**
 * Skeleton for a list item (history page).
 */
export function PoolListItemSkeleton() {
  return (
    <div className="pool-card block min-h-12 rounded-2xl border border-neutral-200 bg-white p-5">
      <Skeleton height="1.25rem" width="70%" />
      <Skeleton height="1rem" width="50%" className="mt-2" />
      <span className="sr-only">Loading pool information</span>
    </div>
  );
}

/**
 * Skeleton for the pool summary section.
 */
export function PoolSummarySkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <Skeleton height="2rem" width="80%" />
        <Skeleton height="1.5rem" width="60%" className="mt-2" />
        <div className="mt-4 space-y-2">
          <Skeleton height="1rem" width="40%" />
          <Skeleton height="2.5rem" width="8rem" />
        </div>
        <Skeleton height="0.5rem" width="100%" radius="9999px" className="mt-4" />
        <Skeleton height="1rem" width="60%" className="mt-3" />
      </div>
      <span className="sr-only">Loading pool details</span>
    </div>
  );
}
