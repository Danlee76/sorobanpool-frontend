'use client';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api, session } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { formatDate, formatUsdc } from '@/lib/format';
import type { Statement } from '@/lib/types';

export default function StatementPage() {
  const locale = useLocale();
  const t = useTranslations('statement');
  const common = useTranslations('common');
  const { ready } = useRequireAuth();
  const q = useQuery({ queryKey: ['statement'], queryFn: () => api<Statement>('/suppliers/statement'), enabled: ready });

  async function csv() {
    // The export needs the bearer token, so fetch it and hand the browser a file instead of linking to the URL.
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/v1/suppliers/statement?format=csv`, { headers: { authorization: `Bearer ${session.access}` } });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'statement.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!ready || q.isLoading) return <p>{common('loading')}</p>;
  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data!;
  const usd = (x: string) => formatUsdc(x, locale);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-neutral-700">{t('note')}</p>

      {s.lines.length === 0 ? (
        <p data-testid="statement-empty">{t('empty')}</p>
      ) : (
        <>
          {/* Responsive table: scroll horizontally on narrow screens */}
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                  <th className="px-4 py-3 font-semibold">{t('product')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('gross')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('fees')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('net')}</th>
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l) => (
                  <tr key={l.poolId} data-testid="statement-line" className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{l.product}</p>
                      <p className="text-xs text-neutral-600">
                        {formatDate(l.settledAt, locale)} &middot; {l.unitsDelivered} {t('units')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">{usd(l.gross)}</td>
                    <td className="px-4 py-3 text-right text-neutral-600">
                      {usd(String(BigInt(l.platformFee) + BigInt(l.organizerFee)))}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{usd(l.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr data-testid="statement-total" className="border-t-2 border-neutral-300 bg-neutral-50 font-bold">
                  <td className="px-4 py-3">{t('total')}</td>
                  <td className="px-4 py-3 text-right">{usd(s.total.gross)}</td>
                  <td className="px-4 py-3 text-right text-neutral-600">
                    {usd(String(BigInt(s.total.platformFee) + BigInt(s.total.organizerFee)))}
                  </td>
                  <td className="px-4 py-3 text-right">{usd(s.total.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <button type="button" onClick={() => void csv()} className="min-h-12 w-full rounded-xl border-2 border-emerald-800 font-bold text-emerald-900">
        {t('csv')}
      </button>
    </div>
  );
}
