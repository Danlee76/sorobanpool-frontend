'use client';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { useConfirm } from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { outcomePreview, sha256Hex, type EvidenceItem, type OutcomeInput, type OutcomeKind } from '@/lib/disputes';
import { formatUsdc, toStroops } from '@/lib/format';
import { runAction, type Prepared } from '@/lib/tx';
import type { DisputeView } from '@/lib/types';

const EvidenceGallery = dynamic(
  () => import('@/components/evidence/EvidenceGallery').then((m) => m.EvidenceGallery),
  {
    loading: () => (
      <div
        role="status"
        aria-label="Loading evidence gallery"
        className="min-h-[6rem] rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-600"
      >
        <span className="sr-only">Loading evidence gallery</span>
        <p>Loading evidence…</p>
      </div>
    ),
  },
);

interface Workspace {
  dispute: DisputeView;
  pool: { id: string; state: string; totalUnits: number; finalUnitPrice: string | null } | null;
  evidence: EvidenceItem[];
}

/** Evidence timeline, a payout preview that matches the contract's maths, a reasoning note (hashed on-chain), and a signed decision. */
export default function ArbiterWorkspace() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('arbiter');
  const common = useTranslations('common');
  const router = useRouter();
  const { ready } = useRequireAuth();
  const { ask, dialog } = useConfirm();
  const q = useQuery({ queryKey: ['arbiter', id], queryFn: () => api<Workspace>(`/arbiter/disputes/${id}`), enabled: ready });
  const [kind, setKind] = useState<OutcomeKind>('ReleaseToSupplier');
  const [units, setUnits] = useState(1);
  const [pct, setPct] = useState(50);
  const [reasoning, setReasoning] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hash, setHash] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    if (!reasoning) setHash('');
    else void sha256Hex(reasoning).then((h) => { if (live) setHash(h); });
    return () => { live = false; };
  }, [reasoning]);
  if (!ready || q.isLoading) return <p>{common('loading')}</p>;
  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;
  const w = q.data!;
  const claimed = toStroops(w.dispute.claimedAmount);
  const price = w.pool?.finalUnitPrice ? toStroops(w.pool.finalUnitPrice) : 0n;
  const optionInput = (k: OutcomeKind): OutcomeInput => (k === 'RefundMember' ? { kind: k, units } : k === 'Split' ? { kind: k, bp: pct * 100 } : { kind: k });
  const preview = outcomePreview(claimed, price, optionInput(kind));
  const outcome = kind === 'RefundMember' ? { kind, units } : kind === 'Split' ? { kind, bp: pct * 100 } : { kind };

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      const reasoningHash = await sha256Hex(reasoning);
      await runAction(() => api<Prepared>(`/arbiter/disputes/${id}/resolve/prepare`, { body: { outcome, reasoning, reasoningHash } }), ask);
      setDone(true);
      setTimeout(() => router.replace('/arbiter'), 2000);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">#{w.dispute.id}</h1>
      <p><span className="text-sm text-neutral-700">{t('claimed')}: </span><strong>{w.dispute.claimedAmount} USD</strong></p>
      <section aria-labelledby="ev-h" className="space-y-2"><h2 id="ev-h" className="font-semibold">{t('evidence')}</h2>
        <EvidenceGallery items={w.evidence} />
      </section>
      <fieldset className="space-y-2">
        <legend className="font-semibold">{t('outcome')}</legend>
        {(['ReleaseToSupplier', 'RefundMember', 'Split', 'RefundPool'] as const).map((k) => {
          const p = outcomePreview(claimed, price, optionInput(k));
          return (
            <label key={k} className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 ${kind === k ? 'border-emerald-800 bg-emerald-50' : 'border-neutral-300'}`}>
              <input type="radio" name="outcome" checked={kind === k} onChange={() => setKind(k)} />
              <span className="flex-1">
                {t(`outcomes.${k}`)}
                <span className="block text-sm text-neutral-700" data-testid={`option-preview-${k}`}>{t('preview', { buyer: `${formatUsdc(p.buyer)} USD`, supplier: `${formatUsdc(p.supplier)} USD` })}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {kind === 'RefundMember' && <><label htmlFor="u" className="block font-medium">{t('unitsToRefund')}</label><input id="u" inputMode="numeric" value={units} onChange={(e) => setUnits(Number(e.target.value.replace(/\D/g, '')) || 0)} className="h-12 w-24 rounded-lg border border-neutral-500 px-3 text-center text-lg" /></>}
      {kind === 'Split' && <><label htmlFor="p" className="block font-medium">{t('memberShare')}</label><input id="p" type="range" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full" /><p>{pct}%</p></>}
      <label htmlFor="why" className="block font-medium">{t('reasoning')}</label>
      <textarea id="why" rows={4} value={reasoning} onChange={(e) => setReasoning(e.target.value)} aria-describedby="why-count why-hash" className="w-full rounded-lg border border-neutral-500 p-3 text-lg" />
      <p id="why-count" className="text-sm text-neutral-700">{t('chars', { count: reasoning.length })}</p>
      <div id="why-hash" className="space-y-1">
        <p className="text-sm font-medium">{t('hashLabel')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code data-testid="reasoning-hash" className="break-all rounded bg-neutral-100 p-2 text-xs">{hash || '-'}</code>
          <button type="button" disabled={!hash} onClick={() => void copyHash()} className="min-h-12 rounded-lg border border-neutral-500 px-3 disabled:opacity-60">{copied ? t('copied') : t('copyHash')}</button>
        </div>
      </div>
      <p role="status" className="rounded-xl bg-neutral-100 p-3 text-sm" data-testid="payout-preview">{t('preview', { buyer: `${formatUsdc(preview.buyer)} USD`, supplier: `${formatUsdc(preview.supplier)} USD` })}</p>
      <button type="button" disabled={busy || reasoning.trim().length < 10 || done} onClick={() => void resolve()} className="min-h-12 w-full rounded-xl bg-emerald-800 text-lg font-bold text-white disabled:opacity-60">{t('resolve')}</button>
      {done && <p role="status" className="rounded-xl bg-emerald-50 p-4 font-bold text-emerald-900">{t('resolved')}</p>}
      {error !== null && <ErrorExplainer error={error} />}
      {dialog}
    </div>
  );
}
