'use client';
import { UserText } from '@/components/ui/UserText';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { SortableTh, useAdminSort } from '@/components/admin/SortableTh';

interface OfferFlag { kind: 'PRICE_OUTLIER' | 'KEYWORD'; detail: string }
interface OfferRow { id: string; title: string; category: string; status: string; flags?: OfferFlag[] }

const REASON_CODES = [
  { code: 'MISLEADING_PRICE', label: 'Misleading price' },
  { code: 'PROHIBITED_ITEM', label: 'Prohibited item' },
  { code: 'DUPLICATE_LISTING', label: 'Duplicate listing' },
  { code: 'OTHER', label: 'Other' },
] as const;

export default function AdminOffers() {
  const t = useTranslations('admin');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'offers'], queryFn: () => api<OfferRow[]>('/admin/offers') });

  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [notifySupplier, setNotifySupplier] = useState(true);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { currentSort, onSort } = useAdminSort();

  const offers = useMemo(() => {
    const all = q.data ?? [];
    const filtered = flaggedOnly ? all.filter((o) => (o.flags?.length ?? 0) > 0) : all;
    if (!currentSort.key || currentSort.direction === 'none') return filtered;
    const sorted = [...filtered];
    if (currentSort.key === 'title') {
      sorted.sort((a, b) =>
        currentSort.direction === 'ascending' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title),
      );
    } else if (currentSort.key === 'category') {
      sorted.sort((a, b) =>
        currentSort.direction === 'ascending' ? a.category.localeCompare(b.category) : b.category.localeCompare(a.category),
      );
    } else if (currentSort.key === 'status') {
      sorted.sort((a, b) =>
        currentSort.direction === 'ascending' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status),
      );
    }
    return sorted;
  }, [q.data, flaggedOnly, currentSort]);

  function openTakedown(id: string) {
    setOpenId(openId === id ? null : id);
    setReasonCode('');
    setNotifySupplier(true);
    setReasonError(null);
    setSubmitError(null);
  }

  async function takeDown(offer: OfferRow) {
    if (!reasonCode) {
      setReasonError('Choose a reason code before taking this offer down.');
      return;
    }
    setBusy(true);
    setReasonError(null);
    setSubmitError(null);
    try {
      await api(`/admin/offers/${offer.id}/takedown`, { body: { reasonCode, notifySupplier } });
      qc.setQueryData<OfferRow[]>(['admin', 'offers'], (rows) =>
        rows?.map((r) => (r.id === offer.id ? { ...r, status: 'TAKEN_DOWN' } : r)),
      );
      setOpenId(null);
      await qc.invalidateQueries({ queryKey: ['admin', 'offers'] });
    } catch (e) {
      setSubmitError(e);
    } finally {
      setBusy(false);
    }
  }

  if (q.error) return <ErrorExplainer error={q.error} />;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
        Show flagged offers only
      </label>

      {q.data?.length === 0 && <p className="text-neutral-700">{t('empty')}</p>}
      {q.data && q.data.length > 0 && offers.length === 0 && <p className="text-neutral-700">No flagged offers.</p>}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Offers moderation</caption>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <SortableTh sortKey="title" currentSort={currentSort} onSort={onSort}>
                Offer
              </SortableTh>
              <SortableTh sortKey="category" currentSort={currentSort} onSort={onSort}>
                Category
              </SortableTh>
              <SortableTh sortKey="status" currentSort={currentSort} onSort={onSort}>
                Status
              </SortableTh>
              <th scope="col" className="py-3 px-3 font-semibold text-neutral-900">
                Flags
              </th>
              <th scope="col" className="py-3 px-3 font-semibold text-neutral-900">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {q.isLoading && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-neutral-700">Loading…</td>
              </tr>
            )}
            {!q.isLoading && offers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-neutral-700">No offers found.</td>
              </tr>
            )}
            {offers.map((o) => {
              const isOpen = openId === o.id;
              const takenDown = o.status === 'TAKEN_DOWN';
              return (
                <tr key={o.id} className="hover:bg-neutral-50/50" data-testid="offer-row">
                  <th scope="row" className="py-3 px-3 font-semibold text-neutral-900 align-top">
                    <UserText as="span" value={o.title} />
                  </th>
                  <td className="py-3 px-3 text-neutral-700 align-top">{o.category}</td>
                  <td className="py-3 px-3 text-neutral-700 align-top">
                    {takenDown ? t('offers.takenDown') : o.status}
                  </td>
                  <td className="py-3 px-3 align-top">
                    {o.flags && o.flags.length > 0 ? (
                      <ul className="flex flex-wrap gap-2 text-xs" aria-label={`Flags for ${o.title}`}>
                        {o.flags.map((f, i) => (
                          <li key={`${f.kind}-${i}`} className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">
                            {f.kind === 'PRICE_OUTLIER' ? 'Price outlier' : 'Keyword'}: {f.detail}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top">
                    {!takenDown && (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        className="min-h-12 rounded-lg border border-red-500 px-3 font-semibold text-red-800 hover:bg-red-50"
                        onClick={() => openTakedown(o.id)}
                      >
                        {t('offers.takedown')}
                      </button>
                    )}
                    {isOpen && (
                      <form className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-3" onSubmit={(e) => e.preventDefault()} aria-label={`Takedown ${o.title}`}>
                        <label className="block text-sm">
                          <span className="block font-medium">Reason code (required)</span>
                          <select
                            value={reasonCode}
                            onChange={(e) => setReasonCode(e.target.value)}
                            aria-invalid={reasonError !== null}
                            className="mt-1 min-h-10 w-full rounded-lg border border-neutral-300 px-2"
                          >
                            <option value="">Select a reason</option>
                            {REASON_CODES.map((r) => (
                              <option key={r.code} value={r.code}>{r.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={notifySupplier} onChange={(e) => setNotifySupplier(e.target.checked)} />
                          Notify supplier
                        </label>
                        {reasonError && <p role="alert" className="text-sm font-semibold text-red-800">{reasonError}</p>}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void takeDown(o)}
                          className="min-h-12 w-full rounded-lg bg-red-700 font-bold text-white disabled:opacity-60"
                        >
                          Confirm takedown
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {submitError !== null && <ErrorExplainer error={submitError} />}
    </div>
  );
}
