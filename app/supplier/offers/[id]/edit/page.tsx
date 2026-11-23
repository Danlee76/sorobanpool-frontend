'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { OfferView } from '@/lib/types';

const input = 'h-12 w-full rounded-lg border border-neutral-500 px-3 text-lg';

export default function EditOffer() {
  const { ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const offer = useQuery({ queryKey: ['supplier-offer', params.id], queryFn: () => api<OfferView>(`/offers/${params.id}`), enabled: ready && Boolean(params.id) });
  const [form, setForm] = useState<Partial<OfferView> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!ready || offer.isLoading) return <p>Loading…</p>;
  if (offer.error || !offer.data) return <ErrorExplainer error={offer.error ?? new Error('Offer not found')} />;
  const values = form ?? offer.data;
  const set = (key: keyof OfferView) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...values, [key]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`/supplier/offers/${params.id}`, { method: 'PATCH', body: { title: values.title, description: values.description, maxUnits: Number(values.maxUnits), maxPerMember: Number(values.maxPerMember), leadTimeHours: Number(values.leadTimeHours) } });
      await qc.invalidateQueries({ queryKey: ['supplier-offers'] }); router.push('/supplier/offers');
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <form className="space-y-4" onSubmit={(e) => void save(e)}><h1 className="text-2xl font-bold">Edit offer</h1><label className="block font-medium" htmlFor="title">Title</label><input id="title" required value={values.title} onChange={set('title')} className={input} /><label className="block font-medium" htmlFor="description">Description</label><textarea id="description" required value={values.description} onChange={set('description')} className="min-h-28 w-full rounded-lg border border-neutral-500 p-3 text-lg" /><label className="block font-medium" htmlFor="maxUnits">Maximum units</label><input id="maxUnits" type="number" min="1" required value={values.maxUnits} onChange={set('maxUnits')} className={input} /><label className="block font-medium" htmlFor="maxPerMember">Maximum per member</label><input id="maxPerMember" type="number" min="1" required value={values.maxPerMember} onChange={set('maxPerMember')} className={input} /><label className="block font-medium" htmlFor="leadTimeHours">Lead time (hours)</label><input id="leadTimeHours" type="number" min="0" required value={values.leadTimeHours} onChange={set('leadTimeHours')} className={input} /><div className="flex gap-3"><button type="button" onClick={() => router.back()} className="min-h-12 flex-1 rounded-xl border border-neutral-500 font-semibold">Cancel</button><button disabled={busy} className="min-h-12 flex-1 rounded-xl bg-emerald-800 font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save changes'}</button></div>{error !== null && <ErrorExplainer error={error} />}</form>;
}