'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireAuth } from '@/lib/auth';
import { getSupplierDisputes, submitDisputeResponse } from '@/lib/api';
import { hoursLeft, slaBreached } from '@/lib/disputes';
import { uploadEvidence } from '@/lib/upload';

type DisputeState = 'OPEN' | 'RESOLVED' | 'TIMED_OUT';

interface DisputeItem {
  id: string;
  poolId: string;
  opener: string;
  state: DisputeState;
  claimedAmount: number;
  openedAt: string;
  slaDueAt: string;
  msToSla: number;
  itemName?: string;
}

interface ResponseFormState {
  resolution: 'REFUND' | 'REPLACE' | 'REJECT';
  message: string;
  evidenceFile: File | null;
}

function SlaChip({ msToSla, state }: { msToSla: number; state: DisputeState }) {
  const t = useTranslations('supplier.disputes');
  if (state !== 'OPEN') return null;
  const hrs = hoursLeft(msToSla);
  const breached = slaBreached(msToSla);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        breached
          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
          : hrs <= 12
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      }`}
    >
      {breached ? t('slaBreached') : t('slaHours', { hrs })}
    </span>
  );
}

function ResponseForm({
  disputeId,
  poolId,
  onDone,
}: {
  disputeId: string;
  poolId: string;
  onDone: () => void;
}) {
  const t = useTranslations('supplier.disputes');
  const qc = useQueryClient();
  const [form, setForm] = useState<ResponseFormState>({
    resolution: 'REFUND',
    message: '',
    evidenceFile: null,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let evidenceId: string | undefined;
      if (form.evidenceFile) {
        setUploading(true);
        try {
          const result = await uploadEvidence('DISPUTE', poolId, form.evidenceFile);
          evidenceId = result.evidenceId;
        } finally {
          setUploading(false);
        }
      }
      return submitDisputeResponse(disputeId, {
        resolution: form.resolution,
        message: form.message,
        evidenceId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-disputes'] });
      onDone();
    },
    onError: (err: Error) => {
      setUploadError(err.message);
    },
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
      className="mt-4 space-y-4 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 p-4"
    >
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('responseTitle')}</h3>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('resolutionLabel')}</label>
        <select
          value={form.resolution}
          onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value as ResponseFormState['resolution'] }))}
          className="w-full rounded-md border border-gray-500 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        >
          <option value="REFUND">{t('resolutionRefund')}</option>
          <option value="REPLACE">{t('resolutionReplace')}</option>
          <option value="REJECT">{t('resolutionReject')}</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('messageLabel')}</label>
        <textarea
          required
          rows={3}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          placeholder={t('messagePlaceholder')}
          className="w-full rounded-md border border-gray-500 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('evidenceLabel')}</label>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setForm((f) => ({ ...f, evidenceFile: e.target.files?.[0] ?? null }))}
          className="text-sm text-gray-700 dark:text-gray-300"
        />
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t('evidenceHint')}</p>
      </div>

      {(uploadError || mutation.error) && (
        <p className="text-sm text-red-700 dark:text-red-400">
          {uploadError ?? (mutation.error as Error).message}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={mutation.isPending || uploading}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending || uploading ? t('submitting') : t('submitButton')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-gray-500 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          {t('cancelButton')}
        </button>
      </div>
    </form>
  );
}

function DisputeCard({ dispute }: { dispute: DisputeItem }) {
  const t = useTranslations('supplier.disputes');
  const [responding, setResponding] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {dispute.itemName ?? t('unknownItem')}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {t('openedBy', { opener: dispute.opener.slice(0, 8) + '…' })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SlaChip msToSla={dispute.msToSla} state={dispute.state} />
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
              dispute.state === 'OPEN'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                : dispute.state === 'RESOLVED'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {t(`state${dispute.state}`)}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-700 dark:text-gray-300">
        {t('claimedAmount', { amount: dispute.claimedAmount.toLocaleString() })}
      </p>

      {dispute.state === 'OPEN' && !responding && (
        <button
          type="button"
          onClick={() => setResponding(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {t('respondButton')}
        </button>
      )}

      {responding && (
        <ResponseForm
          disputeId={dispute.id}
          poolId={dispute.poolId}
          onDone={() => setResponding(false)}
        />
      )}
    </div>
  );
}

export default function SupplierDisputesPage() {
  const t = useTranslations('supplier.disputes');
  const auth = useRequireAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['supplier-disputes', auth?.address],
    queryFn: () => getSupplierDisputes(auth!.address),
    enabled: !!auth,
  });

  if (!auth) return null;

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-gray-600 dark:text-gray-400">{t('loading')}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-red-700 dark:text-red-400">{t('loadError')}</p>
      </main>
    );
  }

  const disputes: DisputeItem[] = data ?? [];
  const open = disputes.filter((d) => d.state === 'OPEN');
  const closed = disputes.filter((d) => d.state !== 'OPEN');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>

      {open.length === 0 && closed.length === 0 && (
        <p className="text-gray-600 dark:text-gray-400">{t('empty')}</p>
      )}

      {open.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            {t('openSection')} ({open.length})
          </h2>
          {open.map((d) => <DisputeCard key={d.id} dispute={d} />)}
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            {t('closedSection')} ({closed.length})
          </h2>
          {closed.map((d) => <DisputeCard key={d.id} dispute={d} />)}
        </section>
      )}
    </main>
  );
}
