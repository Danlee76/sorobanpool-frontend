'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from '@/lib/format';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { api } from '@/lib/api';
import { evidenceTimeline, type EvidenceItem } from '@/lib/disputes';

const fileUrl = (path: string): string =>
  `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}${path}`;

export interface GalleryItem {
  id: string;
  name?: string;
  type?: 'image' | 'video';
  mime?: string;
  previewUrl?: string;
  url?: string;
  evidenceId?: string;
  submitted?: boolean;
  isUploading?: boolean;
  onCancelUpload?: () => void;
  createdAt?: string;
  party?: string;
  kind?: string;
}

export interface EvidenceGalleryProps {
  items: Array<EvidenceItem | GalleryItem>;
  isSubmitted?: boolean;
  onDelete?: (item: GalleryItem | EvidenceItem) => void;
}

function isDisputeItem(item: EvidenceItem | GalleryItem): item is EvidenceItem {
  return 'party' in item && 'kind' in item && !('previewUrl' in item);
}

function getItemName(item: EvidenceItem | GalleryItem, index: number, total: number): string {
  if ('name' in item && item.name) return item.name;
  if ('kind' in item && item.kind) return `${item.kind} (${index + 1} of ${total})`;
  return `Evidence ${index + 1} of ${total}`;
}

function isItemVideo(item: EvidenceItem | GalleryItem): boolean {
  if ('type' in item && item.type === 'video') return true;
  if ('mime' in item && item.mime?.startsWith('video/')) return true;
  return false;
}

/**
 * Evidence Gallery with full-screen viewer and delete-before-submit (Brief 8.4 / Issue #114).
 *
 * Requirements:
 * - Thumbnails as buttons with accessible names (e.g. "Evidence 1 of 3: photo.jpg").
 * - Full-screen viewer as an accessible dialog (role="dialog", aria-modal="true", scroll-locked).
 * - Keyboard navigation: Left/Right arrows navigate, Escape closes, focus moves in and returns.
 * - Deletion offered ONLY for items not yet submitted.
 * - Deleting cancels in-flight upload, updates viewer, and closes viewer if last item removed.
 * - Backwards-compatible with arbiter evidence timeline.
 */
export function EvidenceGallery({
  items,
  isSubmitted = false,
  onDelete,
}: EvidenceGalleryProps) {
  const t = useTranslations('arbiter');
  const locale = useLocale();
  const common = useTranslations('common');

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const thumbnailRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // If arbiter timeline items only (legacy dispute view)
  const isPureArbiterTimeline = items.length > 0 && items.every(isDisputeItem) && !onDelete;

  const total = items.length;
  const isOpen = activeIndex !== null && activeIndex >= 0 && activeIndex < total;
  const currentItem = isOpen ? items[activeIndex] : null;

  // Navigation handlers (wraps around)
  const goToNext = useCallback(() => {
    if (total === 0) return;
    setActiveIndex((prev) => (prev === null ? 0 : (prev + 1) % total));
  }, [total]);

  const goToPrev = useCallback(() => {
    if (total === 0) return;
    setActiveIndex((prev) => (prev === null ? 0 : (prev - 1 + total) % total));
  }, [total]);

  const closeViewer = useCallback(() => {
    setActiveIndex(null);
    setDeleteConfirmIndex(null);
    // Return focus to thumbnail that opened it
    setTimeout(() => {
      prevFocusRef.current?.focus();
    }, 0);
  }, []);

  // Keyboard navigation & focus trap
  useEffect(() => {
    if (!isOpen) return;

    // Lock page scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into dialog
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeViewer();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'Tab' && dialogRef.current) {
        // Focus trap
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeViewer, goToNext, goToPrev]);

  const openViewer = (index: number) => {
    prevFocusRef.current = thumbnailRefs.current.get(index) ?? (document.activeElement as HTMLElement);
    setActiveIndex(index);
  };

  const handleDelete = (index: number) => {
    const item = items[index];
    if (!item) return;

    const itemIsSubmitted = isSubmitted || ('submitted' in item && item.submitted);
    if (itemIsSubmitted) return;

    // If item has in-flight cancel callback, call it
    if ('onCancelUpload' in item && typeof item.onCancelUpload === 'function') {
      item.onCancelUpload();
    }

    const itemName = getItemName(item, index, total);
    setAnnouncement(`Removed ${itemName}`);

    onDelete?.(item);

    // Adjust viewer position
    if (total <= 1) {
      closeViewer();
    } else if (index === total - 1) {
      setActiveIndex(index - 1);
    }
  };

  // Legacy dispute view for arbiter timeline
  if (isPureArbiterTimeline) {
    const ordered = evidenceTimeline(items as EvidenceItem[]);
    if (ordered.length === 0) return <p className="text-neutral-700">{t('noEvidence')}</p>;
    return (
      <ol aria-label={t('timeline')} className="space-y-3">
        {ordered.map((e) => (
          <li key={e.id} className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-sm text-neutral-700">
              <time dateTime={e.createdAt}>{formatDateTime(e.createdAt, locale)}</time>
              {e.party && <> · {t(`parties.${e.party}`)}</>} · {e.kind}
            </p>
            <EvidenceThumb item={e} />
          </li>
        ))}
      </ol>
    );
  }

  // Interactive gallery (delivery evidence or general reviewer)
  return (
    <div className="space-y-3">
      {/* Polite live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {total === 0 ? (
        <p className="text-sm text-neutral-500">No evidence items yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {items.map((item, index) => {
            const accessibleName = `Evidence ${index + 1} of ${total}: ${getItemName(item, index, total)}`;
            const isVideo = isItemVideo(item);
            const preview =
              'previewUrl' in item && item.previewUrl
                ? item.previewUrl
                : 'url' in item && item.url
                  ? fileUrl(item.url)
                  : '';

            return (
              <div key={item.id || index} className="group relative">
                <button
                  ref={(el) => {
                    if (el) thumbnailRefs.current.set(index, el);
                    else thumbnailRefs.current.delete(index);
                  }}
                  type="button"
                  onClick={() => openViewer(index)}
                  aria-label={accessibleName}
                  className="relative aspect-square w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 hover:ring-2 hover:ring-emerald-600 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden transition-all min-h-[44px] min-w-[44px]"
                >
                  {preview && !isVideo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt=""
                      aria-hidden="true"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center font-bold text-xs text-neutral-600">
                      {isVideo ? '▶ VIDEO' : 'FILE'}
                    </div>
                  )}
                  <span className="sr-only">{accessibleName}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-screen dialog viewer */}
      {isOpen && currentItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Evidence preview"
          ref={dialogRef}
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 text-white"
        >
          {/* Top toolbar */}
          <div className="flex items-center justify-between pb-3">
            <p className="text-sm font-semibold text-neutral-200">
              Evidence {activeIndex + 1} of {total}: {getItemName(currentItem, activeIndex, total)}
            </p>
            <div className="flex items-center gap-2">
              {/* Delete button (only for items not yet submitted) */}
              {!isSubmitted && !('submitted' in currentItem && currentItem.submitted) ? (
                deleteConfirmIndex === activeIndex ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-300">Confirm delete?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirmIndex(null);
                        handleDelete(activeIndex);
                      }}
                      className="min-h-[44px] min-w-[44px] rounded-lg bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmIndex(null)}
                      className="min-h-[44px] min-w-[44px] rounded-lg bg-neutral-700 px-2 text-xs font-semibold hover:bg-neutral-600"
                    >
                      {common('cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmIndex(activeIndex)}
                    aria-label={`Delete ${getItemName(currentItem, activeIndex, total)}`}
                    className="min-h-[44px] min-w-[44px] rounded-lg bg-neutral-800 px-3 text-xs font-semibold text-red-400 hover:bg-neutral-700 hover:text-red-300"
                  >
                    Delete
                  </button>
                )
              ) : (
                <span className="text-xs text-neutral-400">
                  Cannot delete submitted evidence
                </span>
              )}

              {/* Close button */}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={closeViewer}
                aria-label="Close evidence preview"
                className="min-h-[44px] min-w-[44px] rounded-lg bg-neutral-800 px-3 text-sm font-bold text-white hover:bg-neutral-700"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Media preview area */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {/* Previous button */}
            <button
              type="button"
              onClick={goToPrev}
              aria-label="Previous evidence"
              className="absolute left-2 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/60 p-3 text-xl text-white hover:bg-black/80"
            >
              ◀
            </button>

            <div className="flex max-h-full max-w-full items-center justify-center p-2">
              {isItemVideo(currentItem) ? (
                <video
                  controls
                  autoPlay
                  src={
                    'previewUrl' in currentItem && currentItem.previewUrl
                      ? currentItem.previewUrl
                      : 'url' in currentItem && currentItem.url
                        ? fileUrl(currentItem.url)
                        : ''
                  }
                  className="max-h-[75vh] max-w-full rounded-lg"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    'previewUrl' in currentItem && currentItem.previewUrl
                      ? currentItem.previewUrl
                      : 'url' in currentItem && currentItem.url
                        ? fileUrl(currentItem.url)
                        : ''
                  }
                  alt={getItemName(currentItem, activeIndex, total)}
                  className="max-h-[75vh] max-w-full rounded-lg object-contain"
                />
              )}
            </div>

            {/* Next button */}
            <button
              type="button"
              onClick={goToNext}
              aria-label="Next evidence"
              className="absolute right-2 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/60 p-3 text-xl text-white hover:bg-black/80"
            >
              ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Legacy arbiter timeline single thumb */
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
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="min-h-12 rounded-lg border border-neutral-500 px-3 disabled:opacity-60"
        >
          {busy ? common('loading') : failed ? t('tryAgain') : t('view')}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {item.mime.startsWith('image/') && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={t('evidenceAlt', { kind: item.kind })}
          onError={onBroken}
          className="max-h-48 rounded-lg border border-neutral-200 object-contain"
        />
      )}
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        download
        className="inline-flex min-h-12 items-center underline"
      >
        {t('download')}
      </a>
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
            <RelativeTime value={e.createdAt} />
            {e.party && <> · {t(`parties.${e.party}`)}</>} · {e.kind}
          </p>
          <EvidenceThumb item={e} />
        </li>
      ))}
    </ol>
  );
}
