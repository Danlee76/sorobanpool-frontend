'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ErrorExplainer } from '@/components/feedback/ErrorExplainer';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { PoolView } from '@/lib/types';

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('receipt');
  const common = useTranslations('common');
  const { ready } = useRequireAuth();
  const q = useQuery({
    queryKey: ['pool', id],
    queryFn: () => api<PoolView>(`/pools/${id}`),
    enabled: ready,
  });

  if (q.error) return <ErrorExplainer error={q.error} onRetry={() => void q.refetch()} />;
  if (!ready || q.isLoading) return <p>{common('loading')}</p>;

  const pool = q.data!;
  const mine = pool.myCommitment;

  if (!mine || pool.state !== 'Settled') {
    return (
      <div className="p-6">
        <p className="text-neutral-700">{t('notAvailable')}</p>
      </div>
    );
  }

  const tierAmount = pool.tierDifferenceRefund ? parseFloat(pool.tierDifferenceRefund) : 0;
  const shortfallAmount = pool.shortfallRefund ? parseFloat(pool.shortfallRefund) : 0;
  const disputeAmount = pool.disputeRefund ? parseFloat(pool.disputeRefund) : 0;
  const totalRefund = tierAmount + shortfallAmount + disputeAmount;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('shareTitle'),
          text: t('shareText', { product: pool.offer?.title || '' }),
          url: window.location.href,
        });
      } catch (err) {
        // User cancelled or share failed
        console.error('Share failed:', err);
      }
    }
  };

  return (
    <>
      <div className="receipt-container mx-auto max-w-2xl p-6 print:max-w-none print:p-8">
        <div className="receipt-content space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm print:border-none print:shadow-none">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-emerald-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-neutral-600">SorobanPool</p>
          </div>

          <div className="space-y-3 border-y border-neutral-200 py-4">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">{t('receiptId')}</span>
              <span className="font-mono font-medium">{pool.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">{t('date')}</span>
              <span className="font-medium">
                {pool.filledAt ? new Date(pool.filledAt).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold">{t('productDetails')}</h2>
            <div className="space-y-2 rounded-lg bg-neutral-50 p-4">
              <p className="font-semibold">{pool.offer?.title || t('unknownProduct')}</p>
              <p className="text-sm text-neutral-700">
                {pool.offer?.description || ''}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-neutral-700">{t('units')}</span>
              <span className="font-medium">{mine.units}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-700">{t('unitPrice')}</span>
              <span className="font-medium">
                ${pool.finalUnitPriceUsdc || pool.currentUnitPriceUsdc}
              </span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold">
              <span>{t('totalPaid')}</span>
              <span className="text-emerald-800">${mine.paid}</span>
            </div>
          </div>

          {totalRefund > 0 && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="font-semibold text-emerald-900">{t('refunds')}</h3>
              <div className="space-y-1 text-sm">
                {tierAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-emerald-800">{t('tierRefund')}</span>
                    <span className="font-medium">${tierAmount.toFixed(2)}</span>
                  </div>
                )}
                {shortfallAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-emerald-800">{t('shortfallRefund')}</span>
                    <span className="font-medium">${shortfallAmount.toFixed(2)}</span>
                  </div>
                )}
                {disputeAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-emerald-800">{t('disputeRefund')}</span>
                    <span className="font-medium">${disputeAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-emerald-300 pt-1 font-semibold">
                  <span>{t('totalRefund')}</span>
                  <span>${totalRefund.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="font-semibold">{t('supplierDetails')}</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('supplier')}</span>
                <span className="font-medium">{pool.supplier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('pickupLocation')}</span>
                <span className="font-medium">{pool.hub.address}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg bg-neutral-50 p-4 text-xs">
            <p className="font-medium">{t('blockchainRef')}</p>
            <p className="break-all font-mono text-neutral-600">
              <a
                href={`${process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://stellar.expert/explorer/testnet'}/tx/${pool.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 underline print:text-black print:no-underline"
              >
                {pool.id}
              </a>
            </p>
          </div>

          <div className="border-t border-neutral-200 pt-4 text-center text-xs text-neutral-500">
            <p>{t('footer')}</p>
          </div>
        </div>

        <div className="mt-6 flex gap-3 print:hidden">
          <button
            onClick={handlePrint}
            className="flex-1 rounded-xl border-2 border-emerald-800 bg-white px-4 py-3 font-semibold text-emerald-900 hover:bg-emerald-50"
          >
            {t('print')}
          </button>
          {navigator.share && (
            <button
              onClick={() => void handleShare()}
              className="flex-1 rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white hover:bg-emerald-900"
            >
              {t('share')}
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          .receipt-container {
            width: 148mm; /* A5 width */
            max-width: 148mm;
            margin: 0 auto;
          }
          .receipt-content {
            page-break-inside: avoid;
          }
          @page {
            size: A5;
            margin: 10mm;
          }
        }
      `}</style>
    </>
  );
}
