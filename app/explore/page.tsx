'use client';
import { UserText } from '@/components/ui/UserText';
import { PoolCardSkeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useCallback, useMemo } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { PoolCard } from '@/lib/types';

export default function Explore() {
  const t = useTranslations('explore');
  const common = useTranslations('common');
  const { ready } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || '');

  const q = useQuery({
    queryKey: ['pools', 'open'],
    queryFn: () => api<PoolCard[]>('/pools?state=Open'),
    enabled: ready,
    refetchInterval: 15_000,
  });

  const updateFilters = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/explore?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    updateFilters('category', value);
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    updateFilters('location', value);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    updateFilters('sort', value);
  };

  const filteredPools = useMemo(() => {
    if (!q.data) return [];

    let filtered = [...q.data];

    if (category) {
      filtered = filtered.filter((p) => p.title?.toLowerCase().includes(category.toLowerCase()));
    }

    if (location) {
      filtered = filtered.filter((p) => p.hub?.toLowerCase().includes(location.toLowerCase()));
    }

    if (sortBy === 'ending-soon') {
      filtered.sort((a, b) => a.fillDeadline.localeCompare(b.fillDeadline));
    } else if (sortBy === 'price-low') {
      filtered.sort((a, b) => {
        const priceA = parseFloat(a.currentUnitPriceNaira || '0');
        const priceB = parseFloat(b.currentUnitPriceNaira || '0');
        return priceA - priceB;
      });
    } else if (sortBy === 'price-high') {
      filtered.sort((a, b) => {
        const priceA = parseFloat(a.currentUnitPriceNaira || '0');
        const priceB = parseFloat(b.currentUnitPriceNaira || '0');
        return priceB - priceA;
      });
    } else if (sortBy === 'progress') {
      filtered.sort((a, b) => b.progressPct - a.progressPct);
    }

    return filtered;
  }, [q.data, category, location, sortBy]);

  const clearFilters = () => {
    setCategory('');
    setLocation('');
    setSortBy('');
    router.push('/explore', { scroll: false });
  };

  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;

  if (!ready || q.isLoading) {
    return (
      <div className="page-enter space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-800">{t('eyebrow')}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] md:text-4xl">{t('title')}</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-700">{t('lead')}</p>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading pools">
          {[...Array(6)].map((_, i) => (
            <li key={i}>
              <PoolCardSkeleton />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const hasActiveFilters = category || location || sortBy;

  return (
    <div className="page-enter space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-800">{t('eyebrow')}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] md:text-4xl">{t('title')}</h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-700">{t('lead')}</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900">
          {t('openCount', { count: filteredPools.length })}
        </span>
      </div>

      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{t('filters')}</h2>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm font-medium text-emerald-800 hover:text-emerald-900"
            >
              {t('clearFilters')}
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="category-filter" className="mb-1 block text-sm font-medium text-neutral-700">
              {t('category')}
            </label>
            <input
              id="category-filter"
              type="text"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
            />
          </div>

          <div>
            <label htmlFor="location-filter" className="mb-1 block text-sm font-medium text-neutral-700">
              {t('location')}
            </label>
            <input
              id="location-filter"
              type="text"
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder={t('locationPlaceholder')}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
            />
          </div>

          <div>
            <label htmlFor="sort-filter" className="mb-1 block text-sm font-medium text-neutral-700">
              {t('sortBy')}
            </label>
            <select
              id="sort-filter"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
            >
              <option value="">{t('sortDefault')}</option>
              <option value="ending-soon">{t('sortEndingSoon')}</option>
              <option value="price-low">{t('sortPriceLow')}</option>
              <option value="price-high">{t('sortPriceHigh')}</option>
              <option value="progress">{t('sortProgress')}</option>
            </select>
          </div>
        </div>
      </div>

      {filteredPools.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-neutral-700">{hasActiveFilters ? t('noResults') : t('empty')}</p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-in">
        {filteredPools.map((p) => (
          <li key={p.id}>
            <Link href={`/pools/${p.id}`} className="pool-card group block min-h-12 rounded-[1.5rem] border border-neutral-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-800">
                  {t('openBadge')}
                </span>
                <span
                  aria-hidden="true"
                  className="text-neutral-600 motion-safe:transition-transform motion-safe:group-hover:translate-x-1 group-hover:text-emerald-800"
                >
                  ↗
                </span>
              </div>
              <UserText as="p" className="mt-5 text-lg font-semibold leading-snug tracking-tight" value={p.title} />
              <UserText as="p" className="mt-1 text-sm text-neutral-700" value={p.unitLabel} />
              <div className="mt-5 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-700">{t('pricePerUnit')}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-950">
                    {p.currentUnitPriceNaira ? `₦${p.currentUnitPriceNaira}` : '—'}
                  </p>
                </div>
                <span className="text-xs font-medium text-neutral-700">{t('filled', { pct: p.progressPct })}</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={p.progressPct}
                aria-label={t('minimum', { count: p.moq ?? 0 })}
                className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-950/10"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-teal-400 motion-safe:transition-[width] motion-safe:duration-700"
                  style={{ width: `${p.progressPct}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-neutral-700">
                {t('minimum', { count: p.moq ?? 0 })}
                <span aria-hidden="true" className="px-1.5 text-emerald-700">
                  ·
                </span>
                {p.hub}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
