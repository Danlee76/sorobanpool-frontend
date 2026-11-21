'use client';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { evidenceTimeline, type EvidenceItem } from '@/lib/disputes';

const fileUrl = (path: string): string => `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}${path}`;

/** One piece of evidence. The signed URL is fetched only when asked, and fetched again once if it fails to load (it expires). */
function EvidenceThumb({ item }: { item: EvidenceItem }) {
  const t = useTranslations('arbiter');
  const common = useTranslations('common');
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const refetched = useRef(false);

  async function load(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const r = await api<{ url: string }>(`/evidence/${item.id}/url`);
      setSrc(fileUrl(r.url));
    } catch {
      setSrc(null);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function onBroken() {
    if (refetched.current) {
      setSrc(null);
      setFailed(true);
      return;
    }
    refetched.current = true;
    setSrc(null);
    void load();
  }

  if (!src) {
    return (
      <div className="space-y-1">
        {failed && <p role="alert" className="text-sm text-red-800">{t('linkFailed')}</p>}
        <button type="button" disabled={busy} onClick={() => void load()} className="min-h-12 rounded-lg border border-neutral-500 px-3 disabled:opacity-60">
          {busy ? common('loading') : failed ? t('tryAgain') : t('view')}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {item.mime.startsWith('image/') && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL from the API, not optimizable by next/image
        <img src={src} alt={t('evidenceAlt', { kind: item.kind })} onError={onBroken} className="max-h-48 rounded-lg border border-neutral-200 object-contain" />
      )}
      <a href={src} target="_blank" rel="noopener noreferrer" download className="inline-flex min-h-12 items-center underline">{t('download')}</a>
    </div>
  );
}

/** Evidence from every party on one timeline, oldest first. */
export function EvidenceGallery({ items }: { items: EvidenceItem[] }) {
  const t = useTranslations('arbiter');
  const ordered = evidenceTimeline(items);
  if (ordered.length === 0) return <p className="text-neutral-700">{t('noEvidence')}</p>;
  return (
    <ol aria-label={t('timeline')} className="space-y-3">
      {ordered.map((e) => (
        <li key={e.id} className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-sm text-neutral-700">
            <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString()}</time>
            {e.party && <> · {t(`parties.${e.party}`)}</>} · {e.kind}
          </p>
          <EvidenceThumb item={e} />
        </li>
      ))}
    </ol>
  );
}
