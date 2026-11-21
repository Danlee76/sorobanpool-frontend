'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { useConfirm } from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { formatUsdc } from '@/lib/format';
import { runAction, type Prepared } from '@/lib/tx';
import type { BondInfo } from '@/lib/types';

const input = 'h-12 w-full rounded-lg border border-neutral-500 px-3 text-lg';

export default function BondPage() {
  const t = useTranslations('bond');
  const common = useTranslations('common');
  const { ready } = useRequireAuth();
  const { ask, dialog } = useConfirm();
  const qc = useQueryClient();
  const bond = useQuery({
    queryKey: ['bond'],
    queryFn: () => api<BondInfo>('/bonds/me'),
    enabled: ready,
  });

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const info = bond.data;
  const freeUsdc = info ? String(BigInt(info.total) - BigInt(info.reserved)) : null;
  const freeNum = freeUsdc ? Number(BigInt(freeUsdc)) / 1e7 : 0;
  const depositOk = /^\d+(\.\d{1,7})?$/.test(depositAmount) && Number(depositAmount) > 0;
  const withdrawNum = Number(withdrawAmount);
  const withdrawOk = /^\d+(\.\d{1,7})?$/.test(withdrawAmount) && withdrawNum > 0 && withdrawNum <= freeNum;

  async function deposit() {
    setBusy(true);
    setError(null);
    try {
      await runAction(() => api<Prepared>('/bonds/deposit/prepare', { body: { amountUsdc: depositAmount } }), ask);
      setDepositAmount('');
      await qc.invalidateQueries({ queryKey: ['bond'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      await runAction(() => api<Prepared>('/bonds/withdraw/prepare', { body: { amountUsdc: withdrawAmount } }), ask);
      setWithdrawAmount('');
      await qc.invalidateQueries({ queryKey: ['bond'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!ready || bond.isLoading) return <p>{common('loading')}</p>;
  if (bond.error) return <ErrorExplainer error={bond.error} onRetry={() => void bond.refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/supplier" className="text-sm text-neutral-600 hover:text-neutral-700">&larr; {t('back')}</Link>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </div>

      {/* Explainer: why bond matters */}
      <section className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900" data-testid="bond-explainer">
        <p className="font-semibold">{t('whyTitle')}</p>
        <p className="mt-1">{t('whyBody')}</p>
      </section>

      {/* Bond overview */}
      <section aria-labelledby="bond-overview-h" className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
        <h2 id="bond-overview-h" className="font-semibold">{t('overview')}</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between" data-testid="bond-total">
            <dt className="text-neutral-600">{t('total')}</dt>
            <dd className="font-medium">{info ? formatUsdc(info.total) : '—'} USD</dd>
          </div>
          <div className="flex justify-between" data-testid="bond-reserved">
            <dt className="text-neutral-600">{t('reserved')}</dt>
            <dd className="font-medium text-amber-800">{info ? formatUsdc(info.reserved) : '—'} USD</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-100 pt-1" data-testid="bond-free">
            <dt className="font-semibold">{t('free')}</dt>
            <dd className="font-bold text-emerald-800">{freeUsdc ? formatUsdc(freeUsdc) : '—'} USD</dd>
          </div>
        </dl>
        <p className="text-xs text-neutral-600">{t('reservedNote')}</p>
      </section>

      {/* Deposit */}
      <section aria-labelledby="bond-deposit-h" className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
        <h2 id="bond-deposit-h" className="font-semibold">{t('depositTitle')}</h2>
        <label htmlFor="deposit-amt" className="block text-sm font-medium">{t('depositLabel')}</label>
        <input
          id="deposit-amt"
          inputMode="decimal"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value.replace(/[^\d.]/g, ''))}
          className={input}
          placeholder="0.00"
        />
        <button
          disabled={busy || !depositOk}
          onClick={() => void deposit()}
          className="min-h-12 w-full rounded-xl bg-emerald-800 font-bold text-white disabled:opacity-60"
          data-testid="deposit-btn"
        >
          {t('depositBtn')}
        </button>
      </section>

      {/* Withdrawal — limited to free bond */}
      <section aria-labelledby="bond-withdraw-h" className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
        <h2 id="bond-withdraw-h" className="font-semibold">{t('withdrawTitle')}</h2>
        <p className="text-sm text-neutral-600">{t('withdrawNote', { free: freeUsdc ? formatUsdc(freeUsdc) : '0' })}</p>
        <label htmlFor="withdraw-amt" className="block text-sm font-medium">{t('withdrawLabel')}</label>
        <input
          id="withdraw-amt"
          inputMode="decimal"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d.]/g, ''))}
          className={input}
          placeholder="0.00"
        />
        {withdrawAmount && !withdrawOk && withdrawNum > freeNum && (
          <p className="text-sm text-red-700" data-testid="withdraw-limit-error">{t('withdrawLimitError')}</p>
        )}
        <button
          disabled={busy || !withdrawOk}
          onClick={() => void withdraw()}
          className="min-h-12 w-full rounded-xl border-2 border-emerald-800 font-bold text-emerald-900 disabled:opacity-60"
          data-testid="withdraw-btn"
        >
          {t('withdrawBtn')}
        </button>
      </section>

      {error !== null && <ErrorExplainer error={error} />}
      {dialog}
    </div>
  );
}
