'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { XdrExport } from '@/components/admin/XdrExport';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { checkParam, draftIsValid, paramChanges, type ParamSpec } from '@/lib/params';

interface Proposal {
  txXdr: string;
}

export default function AdminParams() {
  const q = useQuery({ queryKey: ['admin', 'params'], queryFn: () => api<{ params: ParamSpec[] }>('/admin/params') });
  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return null;
  return <ParamEditor key={q.dataUpdatedAt} specs={q.data.params} />;
}

function ParamEditor({ specs }: { specs: ParamSpec[] }) {
  const t = useTranslations('admin.params');
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(specs.map((s) => [s.key, String(s.value)])));
  const changes = paramChanges(specs, draft);
  const valid = draftIsValid(specs, draft);
  const propose = useMutation({
    mutationFn: () => api<Proposal>('/admin/params/proposals', { body: { changes: Object.fromEntries(changes.map((c) => [c.key, c.to])) } }),
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-700">{t('help')}</p>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (changes.length > 0 && valid) propose.mutate();
        }}
      >
        {specs.map((spec) => {
          const id = `param-${spec.key}`;
          const hint = `${id}-hint`;
          const raw = draft[spec.key] ?? '';
          const check = checkParam(spec, raw);
          return (
            <div key={spec.key}>
              <label htmlFor={id} className="block font-semibold">{spec.label}</label>
              <p id={hint} className="text-xs text-neutral-700">{t('range', { min: spec.min, max: spec.max, unit: spec.unit })}</p>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                value={raw}
                aria-describedby={hint}
                aria-invalid={!check.ok}
                onChange={(e) => {
                  const next = e.target.value;
                  setDraft((d) => ({ ...d, [spec.key]: next }));
                  propose.reset();
                }}
                className="mt-1 min-h-12 w-full rounded-lg border border-neutral-500 px-3"
              />
              {!check.ok && <p role="alert" className="mt-1 text-sm text-red-800">{t(`error.${check.error}`, { min: spec.min, max: spec.max, unit: spec.unit })}</p>}
            </div>
          );
        })}

        <section aria-labelledby="diff-h" className="space-y-2">
          <h2 id="diff-h" className="font-semibold">{t('diff')}</h2>
          {changes.length === 0 ? (
            <p className="text-neutral-700">{t('noChanges')}</p>
          ) : (
            <ul className="space-y-1">
              {changes.map((c) => (
                <li key={c.key} className="flex justify-between rounded-lg bg-white p-3 text-sm">
                  <span>{c.label}</span>
                  <span className="tabular-nums">{t('change', { from: c.from, to: c.to, unit: c.unit })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          type="submit"
          disabled={changes.length === 0 || !valid || propose.isPending}
          className="min-h-12 w-full rounded-xl bg-emerald-800 text-lg font-bold text-white disabled:opacity-60"
        >
          {propose.isPending ? t('preparing') : t('prepare')}
        </button>
      </form>

      {propose.error && <ErrorExplainer error={propose.error} onRetry={() => propose.mutate()} />}
      {propose.data && <XdrExport xdr={propose.data.txXdr} filename="sorobanpool-params-proposal.xdr" />}
    </div>
  );
}
