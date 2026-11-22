'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { useConfirm } from '@/components/ConfirmDialog';
import { PickupChecklist } from '@/components/pool/PickupChecklist';
import { EvidenceCapture, type CapturedEvidenceItem } from '@/components/evidence/EvidenceCapture';
import { EvidenceGallery } from '@/components/evidence/EvidenceGallery';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { runAction, type Prepared } from '@/lib/tx';
import type { PoolView } from '@/lib/types';

/** Count the goods, photograph them, confirm. This is the step that pays the supplier, so it asks for proof. */
export default function Delivery() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('organize.delivery');
  const common = useTranslations('common');
  const router = useRouter();
  const { ready } = useRequireAuth();
  const { ask, dialog } = useConfirm();
  const q = useQuery({ queryKey: ['pool', id], queryFn: () => api<PoolView>(`/pools/${id}`), enabled: ready });
  const [received, setReceived] = useState<string | null>(null);
  const [capturedItems, setCapturedItems] = useState<CapturedEvidenceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!ready || q.isLoading) return <p>{common('loading')}</p>;
  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;
  const pool = q.data!;
  const rawCount = received ?? String(pool.totalUnits);
  const count = Number(rawCount);
  const validCount = /^\d+$/.test(rawCount) && Number.isSafeInteger(count) && count >= 0 && count <= pool.totalUnits;
  const short = validCount ? Math.max(0, pool.totalUnits - count) : 0;

  const uploadedEvidenceIds = capturedItems
    .filter((i) => i.status === 'done' && i.evidenceId)
    .map((i) => i.evidenceId!);

  async function submit() {
    if (!validCount || uploadedEvidenceIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await runAction(
        () =>
          api<Prepared>(`/pools/${id}/delivery/prepare`, {
            body: { receivedUnits: count, evidenceIds: uploadedEvidenceIds },
          }),
        ask,
      );
      setDone(true);
      setTimeout(() => router.replace('/organize'), 2500);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const initialMembers = pool.pickupMembers ?? (pool.membersList ? pool.membersList.map((m, i) => ({
    id: m.id || String(i + 1),
    displayName: m.displayName,
    units: m.units ?? 1,
    allocatedUnits: m.allocatedUnits ?? m.units ?? 1,
    status: (m.status ?? (m.pickedUp ? 'collected' : 'pending')) as 'pending' | 'collected',
    pickedUp: m.pickedUp,
  })) : undefined);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-neutral-700">{t('intro')}</p>

      {/* Units received input */}
      <div>
        <label htmlFor="received" className="block font-medium">{t('received')}</label>
        <input
          id="received"
          inputMode="numeric"
          pattern="[0-9]*"
          type="number"
          min={0}
          max={pool.totalUnits}
          step={1}
          value={rawCount}
          onChange={(e) => setReceived(e.target.value)}
          aria-invalid={!validCount}
          aria-describedby="received-error"
          className="mt-1 h-12 w-28 rounded-lg border border-neutral-500 px-3 text-center text-lg"
        />
        <p className="mt-1 text-sm text-neutral-700">{t('ordered', { count: pool.totalUnits })}</p>
        {!validCount && <p id="received-error" role="alert" className="text-red-700">Enter a whole number between 0 and {pool.totalUnits}.</p>}
        {short > 0 && <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm">{t('short', { count: short })} The received units are allocated proportionally across member orders; members receive refunds for unallocated units.</p>}
      </div>

      {/* Evidence Capture & Review Gallery */}
      <div className="space-y-3">
        <p className="font-medium">{t('photos')} ({uploadedEvidenceIds.length})</p>
        <EvidenceCapture
          poolId={id}
          disabled={busy || done}
          onItemsChange={setCapturedItems}
        />
        {capturedItems.length > 0 && (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50/50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-neutral-800">
              Evidence Review ({capturedItems.length})
            </h2>
            <EvidenceGallery
              items={capturedItems}
              isSubmitted={done}
              onDelete={(item) => {
                setCapturedItems((prev) => prev.filter((i) => i.id !== item.id));
              }}
            />
          </div>
        )}
      </div>

      {/* Confirm Delivery Action */}
      <button
        type="button"
        disabled={busy || !validCount || uploadedEvidenceIds.length === 0 || done}
        onClick={() => void submit()}
        className="min-h-12 w-full rounded-xl bg-emerald-800 text-lg font-bold text-white disabled:opacity-60"
      >
        {t('submit')}
      </button>

      {/* Organizer Pickup Checklist (Brief 8.4) */}
      <div className="mt-8 pt-6 border-t border-neutral-200">
        <PickupChecklist
          poolId={id}
          initialMembers={initialMembers}
          totalExpectedUnits={pool.totalUnits}
          onRefreshNeeded={() => void q.refetch()}
        />
      </div>

      {done && <p role="status" className="rounded-xl bg-emerald-50 p-4 font-bold text-emerald-900">{t('success')}</p>}
      {error !== null && <ErrorExplainer error={error} />}
      {dialog}
    </div>
  );
}
