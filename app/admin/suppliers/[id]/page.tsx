'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api, ApiError } from '@/lib/api';

interface Application { userId: string; businessName: string; cacNumber: string; address: string; state: string; lga: string; categories: string[] }
interface SupplierDetail { application: Application; checks: { cac: 'PASS' | 'FAIL' | 'PENDING'; bank: 'PASS' | 'FAIL' | 'PENDING' } }
interface SupplierDocument { id: string; name: string; signedUrl: string }
interface DecisionResult { auditId?: string }

export default function SupplierReview() {
  const t = useTranslations('admin.kyb');
  const qc = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const userId = String(id);

  const detail = useQuery({ queryKey: ['admin', 'kyb', userId], queryFn: () => api<SupplierDetail>(`/admin/suppliers/${userId}`) });
  const docs = useQuery({ queryKey: ['admin', 'kyb', userId, 'documents'], queryFn: () => api<SupplierDocument[]>(`/admin/suppliers/${userId}/documents`) });

  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hint, setHint] = useState('');
  const [result, setResult] = useState<{ approve: boolean; auditId?: string } | null>(null);

  async function decide(approve: boolean) {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError('Enter a reason before deciding.');
      setResult(null);
      return;
    }
    setReasonError(null);
    setBusy(true);
    setError(null);
    setHint('');
    setResult(null);
    try {
      const res = await api<DecisionResult>(`/admin/suppliers/${userId}/decision`, { body: { approve, reason: trimmed } });
      setResult({ approve, auditId: res?.auditId });
      await qc.invalidateQueries({ queryKey: ['admin', 'kyb'] });
    } catch (e) {
      // Verification is written on-chain with the attestor key, which only works once the supplier has activated their account.
      if (e instanceof ApiError && e.contractCode === 201) setHint(t('needsActivation'));
      else setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (detail.error) return <ErrorExplainer error={detail.error} onRetry={() => void detail.refetch()} />;
  const app = detail.data?.application;

  return (
    <div className="space-y-4">
      <Link href="/admin/suppliers" className="text-sm font-semibold underline">Back to applications</Link>

      {app && (
        <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4" aria-labelledby="application-heading">
          <h2 id="application-heading" className="font-semibold">{app.businessName}</h2>
          <p className="text-sm text-neutral-700">CAC {app.cacNumber} · {app.address}, {app.lga}, {app.state}</p>
          <p className="text-sm">{app.categories.join(', ')}</p>
          {detail.data && (
            <ul className="flex gap-3 text-sm" aria-label="Checks">
              <li>CAC check: <strong>{detail.data.checks.cac}</strong></li>
              <li>Bank check: <strong>{detail.data.checks.bank}</strong></li>
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4" aria-labelledby="documents-heading">
        <h2 id="documents-heading" className="font-semibold">Documents</h2>
        {docs.error && <ErrorExplainer error={docs.error} onRetry={() => void docs.refetch()} />}
        {docs.data?.length === 0 && <p className="text-sm text-neutral-700">No documents uploaded.</p>}
        <ul className="space-y-1">
          {docs.data?.map((d) => (
            <li key={d.id}>
              <a href={d.signedUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">
                {d.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <form
        className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
        aria-labelledby="decision-heading"
        onSubmit={(e) => e.preventDefault()}
      >
        <h2 id="decision-heading" className="font-semibold">Decision</h2>
        <label className="block text-sm">
          <span className="block font-medium">Reason (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            aria-invalid={reasonError !== null}
            aria-describedby={reasonError ? 'reason-error' : undefined}
            className="mt-1 w-full rounded-lg border border-neutral-300 p-2"
          />
        </label>
        {reasonError && <p id="reason-error" role="alert" className="text-sm font-semibold text-red-800">{reasonError}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void decide(true)} className="min-h-12 flex-1 rounded-xl bg-emerald-800 font-bold text-white disabled:opacity-60">{t('approve')}</button>
          <button type="button" disabled={busy} onClick={() => void decide(false)} className="min-h-12 flex-1 rounded-xl border border-neutral-500 font-bold disabled:opacity-60">{t('reject')}</button>
        </div>
      </form>

      {result && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900">
          {t('done')}
          {result.auditId && <span className="block text-sm font-normal">Audit entry {result.auditId}</span>}
        </p>
      )}
      {hint && <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 font-semibold">{hint}</p>}
      {error !== null && <ErrorExplainer error={error} />}
    </div>
  );
}
