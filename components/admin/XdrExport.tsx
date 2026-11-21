'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Shows an unsigned transaction for signers to load in their wallets, with download and copy actions. */
export function XdrExport({ xdr, filename }: { xdr: string; filename: string }) {
  const t = useTranslations('admin.xdr');
  const [copied, setCopied] = useState(false);

  function download() {
    const url = URL.createObjectURL(new Blob([xdr], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(xdr);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-label={t('label')} className="space-y-3">
      <p className="text-sm text-neutral-700">{t('help')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={download} className="min-h-12 rounded-xl border border-neutral-500 px-4 font-semibold">{t('download')}</button>
        <button type="button" onClick={() => void copy()} className="min-h-12 rounded-xl border border-neutral-500 px-4 font-semibold">{copied ? t('copied') : t('copy')}</button>
      </div>
      <label className="block text-sm font-semibold" htmlFor="xdr-text">{t('label')}</label>
      <textarea id="xdr-text" readOnly value={xdr} rows={5} className="w-full rounded-lg border border-neutral-300 p-2 font-mono text-xs" />
    </section>
  );
}
