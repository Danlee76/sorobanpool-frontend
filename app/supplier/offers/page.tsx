'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { OfferView } from '@/lib/types';

export default function SupplierOffers() {
  const common = useTranslations('common');
  const { ready } = useRequireAuth();
  const offers = useQuery({ queryKey: ['supplier-offers'], queryFn: () => api<OfferView[]>('/offers?mine=true'), enabled: ready });
  if (!ready || offers.isLoading) return <p>{common('loading')}</p>;
  if (offers.error) return <ErrorExplainer error={offers.error} onRetry={() => void offers.refetch()} />;
  const rows = offers.data ?? [];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Supplier offers</h1><p className="text-sm text-neutral-700">Review and update the offers available to organizers.</p></div><Link href="/supplier/offers/new" className="min-h-12 rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white">New offer</Link></div>
      {rows.length === 0 ? <p className="rounded-xl border border-dashed border-neutral-400 p-6 text-neutral-700">You have not created any offers yet.</p> : <ul className="space-y-3">{rows.map((offer) => <li key={offer.id} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{offer.title}</h2><p className="text-sm text-neutral-700">{offer.category} · {offer.unitLabel} · MOQ {offer.moq}</p></div><Link href={`/supplier/offers/${offer.id}/edit`} className="min-h-11 rounded-lg border border-neutral-500 px-3 py-2 text-sm font-semibold">Edit</Link></div><p className="mt-2 text-sm text-neutral-700">{offer.description}</p><p className="mt-2 text-sm">Up to {offer.maxUnits} units · {offer.tiersUsdc.length} price tiers · valid until {new Date(offer.validUntil).toLocaleDateString()}</p></li>)}</ul>}
      <Link href="/supplier" className="text-sm font-semibold underline">Back to supplier dashboard</Link>
    </div>
  );
}