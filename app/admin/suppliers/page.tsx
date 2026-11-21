'use client';
import { UserText } from '@/components/ui/UserText';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { SortableTh, useAdminSort } from '@/components/admin/SortableTh';

interface Application { userId: string; businessName: string; cacNumber: string; address: string; state: string; lga: string; categories: string[] }

export default function Suppliers() {
  const t = useTranslations('admin.kyb');
  const q = useQuery({ queryKey: ['admin', 'kyb'], queryFn: () => api<Application[]>('/admin/suppliers?status=PENDING') });
  const { currentSort, onSort } = useAdminSort();

  const sortedData = useMemo(() => {
    if (!q.data) return [];
    if (!currentSort.key || currentSort.direction === 'none') return q.data;
    const sorted = [...q.data];
    if (currentSort.key === 'businessName') {
      sorted.sort((a, b) => {
        return currentSort.direction === 'ascending'
          ? a.businessName.localeCompare(b.businessName)
          : b.businessName.localeCompare(a.businessName);
      });
    } else if (currentSort.key === 'cacNumber') {
      sorted.sort((a, b) => {
        return currentSort.direction === 'ascending'
          ? a.cacNumber.localeCompare(b.cacNumber)
          : b.cacNumber.localeCompare(a.cacNumber);
      });
    }
    return sorted;
  }, [q.data, currentSort]);

  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold">{t('pending')}</h2>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('pending')}</caption>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <SortableTh sortKey="businessName" currentSort={currentSort} onSort={onSort}>
                Business name
              </SortableTh>
              <SortableTh sortKey="cacNumber" currentSort={currentSort} onSort={onSort}>
                CAC / Location
              </SortableTh>
              <th scope="col" className="py-3 px-3 font-semibold text-neutral-900">
                Categories
              </th>
              <th scope="col" className="py-3 px-3 font-semibold text-neutral-900">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {q.isLoading && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-neutral-700">Loading…</td>
              </tr>
            )}
            {!q.isLoading && sortedData.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-neutral-700">{t('none')}</td>
              </tr>
            )}
            {sortedData.map((a) => (
              <tr key={a.userId} className="hover:bg-neutral-50/50" data-testid="application">
                <th scope="row" className="py-3 px-3 font-semibold text-neutral-900 align-top">
                  {a.businessName}
                </th>
                <td className="py-3 px-3 text-neutral-700 align-top">
                  CAC {a.cacNumber} · <UserText value={a.address} />, <UserText value={a.lga} />, <UserText value={a.state} />
                </td>
                <td className="py-3 px-3 text-neutral-700 align-top">
                  {a.categories.join(', ')}
                </td>
                <td className="py-3 px-3 align-top">
                  <Link
                    href={`/admin/suppliers/${encodeURIComponent(a.userId)}`}
                    className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-4 font-bold text-white hover:bg-emerald-700"
                  >
                    Review application
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
