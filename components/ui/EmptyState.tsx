import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

/**
 * A list with nothing in it: an icon, one sentence explaining why, and a primary action.
 * The sentence doubles as the heading so screen-reader users scanning headings land on it;
 * pass `headingLevel="h3"` when the empty state sits under a section that already has an h2.
 */
export function EmptyState({
  icon,
  children,
  action,
  headingLevel: Heading = 'h2',
  className,
}: {
  icon: ReactNode;
  children: ReactNode;
  action?: EmptyStateAction;
  headingLevel?: ElementType;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-6 py-10 text-center ${className ?? ''}`}>
      <span aria-hidden="true" className="text-neutral-400">{icon}</span>
      <Heading className="max-w-sm text-base font-semibold text-neutral-900">{children}</Heading>
      {action &&
        (action.href ? (
          <Link href={action.href} className="mt-1 flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-5 font-semibold text-white">
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="mt-1 flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-5 font-semibold text-white">
            {action.label}
          </button>
        ))}
    </div>
  );
}
