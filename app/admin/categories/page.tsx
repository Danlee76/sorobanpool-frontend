'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import type { CategoryRow } from '@/lib/types';

const XdrExport = dynamic(
  () => import('@/components/admin/XdrExport').then((m) => m.XdrExport),
  {
    loading: () => (
      <div
        role="status"
        aria-label="Loading export component"
        className="min-h-[5rem] rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center text-sm text-neutral-600"
      >
        <span className="sr-only">Loading export component</span>
        <p>Loading export…</p>
      </div>
    ),
  },
);

interface Prepared {
  txXdr: string;
}

export default function AdminCategories() {
  const t = useTranslations('admin.categories');
  const [pending, setPending] = useState<CategoryRow | null>(null);
  const [prepared, setPrepared] = useState<{ name: string; txXdr: string } | null>(null);
  const q = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<CategoryRow[]>('/admin/categories') });
  const prepare = useMutation({
    mutationFn: (row: CategoryRow) =>
      api<Prepared>(`/admin/categories/${encodeURIComponent(row.id)}/toggle/prepare`, { body: { enabled: !row.enabled } }),
    onSuccess: (r, row) => setPrepared({ name: row.name, txXdr: r.txXdr }),
  });

  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-700">{t('help')}</p>
      {q.data?.length === 0 && <p className="text-neutral-700">{t('empty')}</p>}
      <ul className="space-y-2">
        {q.data?.map((row) => {
          const mismatch = row.onChain !== null && row.onChain !== row.enabled;
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-3">
              <div>
                <p className="font-semibold">{row.name}</p>
                <p className="text-sm text-neutral-700">
                  {row.perishable ? t('perishable') : null}
                  {row.perishable ? ' · ' : null}
                  {row.enabled ? t('enabled') : t('disabled')}
                </p>
                {mismatch && <p role="alert" className="text-sm text-red-800">{t('mismatch')}</p>}
              </div>
              <button
                type="button"
                disabled={prepare.isPending}
                onClick={() => setPending(row)}
                className="min-h-12 rounded-xl border border-neutral-500 px-4 font-semibold disabled:opacity-60"
              >
                {row.enabled ? t('disable') : t('enable')}
              </button>
            </li>
          );
        })}
      </ul>

      {pending && (
        <div role="dialog" aria-modal="true" aria-labelledby="cat-confirm-h" className="fixed inset-0 z-20 grid place-items-end bg-black/50 sm:place-items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h2 id="cat-confirm-h" className="text-lg font-bold">{t('confirmTitle', { name: pending.name })}</h2>
            <p className="mt-2 text-sm text-neutral-700">{t('confirmBody')}</p>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setPending(null)} className="min-h-12 flex-1 rounded-xl border border-neutral-500 font-semibold">{t('cancel')}</button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const row = pending;
                  setPending(null);
                  prepare.mutate(row);
                }}
                className="min-h-12 flex-1 rounded-xl bg-emerald-800 font-semibold text-white"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {prepare.error && <ErrorExplainer error={prepare.error} onRetry={() => pending && prepare.mutate(pending)} />}
      {prepared && (
        <div className="space-y-2">
          <h2 className="font-semibold">{t('xdrFor', { name: prepared.name })}</h2>
          <XdrExport xdr={prepared.txXdr} filename={`sorobanpool-category-${prepared.name}.xdr`} />
        </div>
      )}
    </div>
  );
}
