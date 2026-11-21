'use client';
import { useCallback, useState } from 'react';

export type SortDirection = 'ascending' | 'descending' | 'none';

export interface SortState {
  key: string | null;
  direction: SortDirection;
}

export function useAdminSort(initialKey: string | null = null, initialDir: SortDirection = 'none') {
  const [currentSort, setCurrentSort] = useState<SortState>({
    key: initialKey,
    direction: initialDir,
  });

  const onSort = useCallback((key: string) => {
    setCurrentSort((prev) => {
      if (prev.key !== key) {
        return { key, direction: 'ascending' };
      }
      if (prev.direction === 'none') {
        return { key, direction: 'ascending' };
      }
      if (prev.direction === 'ascending') {
        return { key, direction: 'descending' };
      }
      return { key, direction: 'ascending' };
    });
  }, []);

  return { currentSort, onSort };
}

export interface SortableThProps {
  sortKey: string;
  currentSort: SortState;
  onSort: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function SortableTh({
  sortKey,
  currentSort,
  onSort,
  children,
  className = '',
}: SortableThProps) {
  const isSorted = currentSort.key === sortKey;
  const ariaSort = isSorted ? currentSort.direction : 'none';

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`py-3 px-3 font-semibold text-neutral-900 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="group inline-flex items-center gap-1.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
      >
        <span>{children}</span>
        <span aria-hidden="true" className="text-xs text-neutral-500 group-hover:text-neutral-900">
          {ariaSort === 'ascending' ? ' ▲' : ariaSort === 'descending' ? ' ▼' : ' ↕'}
        </span>
        <span className="sr-only">
          {ariaSort === 'ascending'
            ? 'sorted ascending'
            : ariaSort === 'descending'
            ? 'sorted descending'
            : 'not sorted'}
        </span>
      </button>
    </th>
  );
}
