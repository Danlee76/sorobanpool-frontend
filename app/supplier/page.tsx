'use client';
import { UserText } from '@/components/ui/UserText';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ActivateRole } from '@/components/ActivateRole';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { useConfirm } from '@/components/ConfirmDialog';
import { Countdown } from '@/components/pool/Countdown';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { formatNaira, formatUsdc, stroopsToNairaCeil } from '@/lib/format';
import { useSession } from '@/lib/store';
import { runAction, type Prepared } from '@/lib/tx';
import { uploadEvidence } from '@/lib/upload';
import type { PoolCard, PoolView, SupplierProfile } from '@/lib/types';

const input = 'h-12 w-full rounded-lg border border-neutral-500 px-3 text-lg';

function ApplyForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('supplier');
  const [f, setF] = useState({ businessName: '', cacNumber: '', address: '', state: 'FCT', lga: '', categories: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api('/suppliers/apply', { body: { ...f, categories: f.categories.split(',').map((c) => c.trim()).filter(Boolean), deliveryAreas: [{ state: f.state }] } });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const ok = f.businessName.length > 1 && f.cacNumber.length > 4 && f.address.length > 4 && f.lga.length > 1 && f.categories.length > 1;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <p className="text-neutral-700">{t('applyIntro')}</p>
      <label htmlFor="biz" className="block font-medium">{t('business')}</label><input id="biz" value={f.businessName} onChange={set('businessName')} className={input} />
      <label htmlFor="cac" className="block font-medium">{t('cac')}</label><input id="cac" value={f.cacNumber} onChange={set('cacNumber')} className={input} />
      <label htmlFor="addr" className="block font-medium">{t('address')}</label><input id="addr" value={f.address} onChange={set('address')} className={input} />
      <div className="flex gap-3"><div className="flex-1"><label htmlFor="st" className="block text-sm font-medium">{t('state')}</label><input id="st" value={f.state} onChange={set('state')} className={input} /></div><div className="flex-1"><label htmlFor="lg" className="block text-sm font-medium">{t('lga')}</label><input id="lg" value={f.lga} onChange={set('lga')} className={input} /></div></div>
      <label htmlFor="cat" className="block font-medium">{t('categories')}</label><input id="cat" value={f.categories} onChange={set('categories')} className={input} />
      <button disabled={busy || !ok} className="min-h-12 w-full rounded-xl bg-emerald-800 text-lg font-bold text-white disabled:opacity-60">{t('apply')}</button>
      {error !== null && <ErrorExplainer error={error} />}
    </form>
  );
}

/** A group buy waiting on this supplier: accept or decline within the window, then mark dispatched. */
export function PoolRow({ card }: { card: PoolCard }) {
  const t = useTranslations('supplier');
  const locale = useLocale();
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const view = useQuery({ queryKey: ['pool', card.id], queryFn: () => api<PoolView>(`/pools/${card.id}`), refetchInterval: 8_000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Waybill capture state (#127)
  const [showWaybill, setShowWaybill] = useState(false);
  const [waybillFile, setWaybillFile] = useState<File | null>(null);
  const [waybillPreview, setWaybillPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const p = view.data;

  async function act(action: 'accept' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      await runAction(() => api<Prepared>(`/pools/${card.id}/${action}/prepare`, { body: {} }), ask);
      await qc.invalidateQueries({ queryKey: ['pool', card.id] });
      await qc.invalidateQueries({ queryKey: ['pools', 'mine'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function dispatchPool(withWaybill: boolean) {
    setBusy(true);
    setError(null);
    try {
      let waybillHash: string | undefined;
      if (withWaybill && waybillFile) {
        const { sha256 } = await uploadEvidence('WAYBILL', card.id, waybillFile);
        waybillHash = sha256;
      }
      await runAction(() => api<Prepared>(`/pools/${card.id}/dispatch/prepare`, { body: waybillHash ? { waybillHash } : {} }), ask);
      await qc.invalidateQueries({ queryKey: ['pool', card.id] });
      await qc.invalidateQueries({ queryKey: ['pools', 'mine'] });
      setShowWaybill(false);
      setWaybillFile(null);
      setWaybillPreview(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setWaybillFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setWaybillPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  // finalUnitPriceUsdc is whole stroops. After the 1.5% platform fee the supplier gets about 98.5% of units x price.
  const payout = p?.finalUnitPriceUsdc && p.ngnPerUsd ? formatNaira(stroopsToNairaCeil((BigInt(p.totalUnits) * BigInt(p.finalUnitPriceUsdc) * 985n) / 1000n, p.ngnPerUsd), locale) : null;
  const btn = 'min-h-12 flex-1 rounded-xl font-bold disabled:opacity-60';
  // Accept window: use API-supplied value or fall back to 24 h (#128)
  const acceptWindowHours = p?.acceptWindowHours ?? 24;

  return (
    <li className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4" data-testid="supplier-pool">
      <UserText as="p" className="font-semibold" value={card.title} />
      <p className="text-sm text-neutral-700">{card.state} · {card.totalUnits} units</p>
      {card.state === 'Filled' && p && (
        <>
          {p.filledAt && (
            <p className="text-sm">
              <span>{t('acceptBy')}: </span>
              <Countdown
                deadline={new Date(new Date(p.filledAt).getTime() + acceptWindowHours * 3_600_000).toISOString()}
                warnHours={6}
                criticalHours={1}
                showExplainer
              />
            </p>
          )}
          {payout && <p className="text-sm font-medium">{t('payout', { amount: payout })}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => void act('accept')} className={`${btn} bg-emerald-800 text-white`}>{t('accept')}</button>
            <button disabled={busy} onClick={() => void act('reject')} className={`${btn} border border-neutral-500`}>{t('reject')}</button>
          </div>
        </>
      )}
      {card.state === 'Accepted' && !showWaybill && (
        <button disabled={busy} onClick={() => setShowWaybill(true)} className={`${btn} w-full bg-emerald-800 text-white`}>{t('dispatch')}</button>
      )}
      {card.state === 'Accepted' && showWaybill && (
        <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3" data-testid="waybill-capture">
          <p className="text-sm font-medium">{t('waybillTitle')}</p>
          <p className="text-xs text-neutral-600">{t('waybillNote')}</p>
          {waybillPreview && (
            <img src={waybillPreview} alt={t('waybillPreviewAlt')} className="max-h-48 w-full rounded-lg object-contain border border-neutral-200" data-testid="waybill-preview" />
          )}
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFileChange} aria-label={t('waybillCapture')} data-testid="waybill-input" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="min-h-12 w-full rounded-lg border-2 border-emerald-800 text-sm font-semibold text-emerald-900">
            {waybillFile ? t('waybillRetake') : t('waybillCapture')}
          </button>
          <div className="flex gap-2">
            <button
              disabled={busy || !waybillFile}
              onClick={() => void dispatchPool(true)}
              className={`${btn} bg-emerald-800 text-white`}
              data-testid="dispatch-with-waybill"
            >
              {t('dispatchWithWaybill')}
            </button>
            <button
              disabled={busy}
              onClick={() => void dispatchPool(false)}
              className={`${btn} border border-neutral-500 text-sm`}
              data-testid="dispatch-skip-waybill"
            >
              {t('dispatchSkipWaybill')}
            </button>
          </div>
          <button type="button" onClick={() => { setShowWaybill(false); setWaybillFile(null); setWaybillPreview(null); }} className="min-h-12 w-full text-sm text-neutral-600 hover:text-neutral-700">
            {t('cancel')}
          </button>
        </div>
      )}
      {error !== null && <ErrorExplainer error={error} />}
      {dialog}
    </li>
  );
}

function BondPanel() {
  const t = useTranslations('supplier');
  const bond = useQuery({ queryKey: ['bond'], queryFn: () => api<{ total: string; reserved: string }>('/bonds/me') });
  const freeUsdc = bond.data ? String(BigInt(bond.data.total) - BigInt(bond.data.reserved)) : null;
  return (
    <section aria-labelledby="bond-h" className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 id="bond-h" className="font-semibold">{t('bond')}</h2>
      <p className="text-sm">{t('bondTotal', { total: `${bond.data?.total ?? '0'} USD` })}</p>
      {freeUsdc !== null && (
        <p className="text-sm text-emerald-800">{t('bondFree', { free: `${freeUsdc} USD` })}</p>
      )}
      <Link href="/supplier/bond" className="flex min-h-12 items-center justify-center rounded-lg border border-neutral-500 text-sm font-semibold">
        {t('bondManage')}
      </Link>
    </section>
  );
}

export default function Supplier() {
  const t = useTranslations('supplier');
  const common = useTranslations('common');
  const { ready } = useRequireAuth();
  const me = useSession((s) => s.me);
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['supplier'], queryFn: () => api<SupplierProfile | null>('/suppliers/me'), enabled: ready });
  const pools = useQuery({ queryKey: ['pools', 'mine'], queryFn: () => api<PoolCard[]>('/pools?mine=true'), enabled: ready && profile.data?.kybStatus === 'APPROVED', refetchInterval: 15_000 });
  if (!ready || profile.isLoading) return <p>{common('loading')}</p>;
  if (profile.error) return <ErrorExplainer error={profile.error} onRetry={() => void profile.refetch()} />;
  const status = profile.data?.kybStatus; // no status means no application yet
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {!status && <ApplyForm onDone={() => void qc.invalidateQueries({ queryKey: ['supplier'] })} />}
      {/* Registering on-chain comes first: the attestor can only verify a supplier that exists in the registry. */}
      {(status === 'PENDING' || status === 'APPROVED') && <ActivateRole role="Supplier" ns="supplier" />}
      {status === 'PENDING' && <p role="status" className="rounded-xl bg-amber-50 p-4">{t('pending')}</p>}
      {status === 'REJECTED' && <p role="status" className="rounded-xl bg-red-50 p-4">{t('rejected')}</p>}
      {status === 'APPROVED' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2"><Link href="/supplier/offers" className="flex min-h-12 items-center justify-center rounded-xl border border-emerald-800 px-4 font-bold text-emerald-900">Manage offers</Link><Link href="/supplier/offers/new" className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-4 font-bold text-white">{t('newOffer')}</Link></div>
          <section aria-labelledby="sp-h" className="space-y-3">
            <h2 id="sp-h" className="font-semibold">{t('pools')}</h2>
            {pools.data?.filter((p) => p.supplier === me?.walletAddress).length === 0 && <p className="text-neutral-700">{t('noPools')}</p>}
            <ul className="space-y-3">{pools.data?.filter((p) => p.supplier === me?.walletAddress).map((p) => <PoolRow key={p.id} card={p} />)}</ul>
          </section>
          <Link href="/supplier/statement" className="flex min-h-12 items-center justify-center rounded-xl border border-neutral-500 px-4 font-semibold">{t('statementLink')}</Link>
          <BondPanel />
        </>
      )}
    </div>
  );
}
