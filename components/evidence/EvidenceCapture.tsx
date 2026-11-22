'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useOnlineStatus } from '@/lib/network';
import {
  DEFAULT_MAX_VIDEO_SIZE_BYTES,
  uploadEvidenceWithProgress,
  type CompressImageOptions,
} from '@/lib/upload';

export interface CapturedEvidenceItem {
  id: string; // client id
  file: File;
  name: string;
  type: 'image' | 'video';
  previewUrl: string;
  status: 'compressing' | 'uploading' | 'done' | 'error' | 'cancelled';
  progressPct: number;
  evidenceId?: string;
  sha256?: string;
  error?: string;
}

export interface EvidenceCaptureProps {
  poolId?: string;
  kind?: 'DELIVERY' | 'DISPUTE' | 'WAYBILL' | 'PRODUCT';
  maxFiles?: number;
  maxVideoSizeBytes?: number;
  compressOptions?: CompressImageOptions;
  disabled?: boolean;
  onItemsChange?: (items: CapturedEvidenceItem[]) => void;
  concurrencyLimit?: number;
}

/**
 * Capture photos and video with client-side compression for delivery evidence (Brief 8.4 / Issue #113).
 *
 * Features:
 * - <input capture="environment"> for direct camera access on mobile.
 * - Client-side image compression with configurable maxDimension, quality, and aspect ratio.
 * - Video validation (max size and MIME type) without client re-encoding.
 * - Concurrency limit so low-end mobile devices don't decode many high-res photos at once.
 * - Per-file upload progress (via XMLHttpRequest progress), cancel, and retry.
 * - Memory management: cleans up bitmaps and revokes object URLs.
 * - Offline-aware: disables capture when offline using existing network helper.
 * - Accessible: role="progressbar", aria-valuenow, 44px tap targets, polite announcements.
 */
export function EvidenceCapture({
  poolId,
  kind = 'DELIVERY',
  maxFiles = 10,
  maxVideoSizeBytes = DEFAULT_MAX_VIDEO_SIZE_BYTES,
  compressOptions,
  disabled = false,
  onItemsChange,
  concurrencyLimit = 2,
}: EvidenceCaptureProps) {
  const t = useTranslations('organize.delivery');
  const common = useTranslations('common');
  const isOnline = useOnlineStatus();

  const [items, setItems] = useState<CapturedEvidenceItem[]>([]);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeCountRef = useRef<number>(0);
  const queueRef = useRef<string[]>([]);
  const isMountedRef = useRef<boolean>(true);

  // Notify parent of items update
  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  // Clean up object URLs and abort all controllers on unmount
  useEffect(() => {
    isMountedRef.current = true;
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      for (const ctrl of controllers.values()) {
        ctrl.abort();
      }
      controllers.clear();
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<CapturedEvidenceItem>) => {
    if (!isMountedRef.current) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  // Process next item in the concurrency queue
  const processQueue = useCallback(async () => {
    if (activeCountRef.current >= concurrencyLimit || queueRef.current.length === 0) {
      return;
    }

    const nextId = queueRef.current.shift();
    if (!nextId) return;

    activeCountRef.current += 1;

    setItems((current) => {
      const target = current.find((i) => i.id === nextId);
      if (!target || target.status === 'cancelled') {
        activeCountRef.current = Math.max(0, activeCountRef.current - 1);
        setTimeout(processQueue, 0);
        return current;
      }

      const ctrl = new AbortController();
      abortControllersRef.current.set(nextId, ctrl);

      // Start upload
      void (async () => {
        try {
          updateItem(nextId, { status: target.type === 'image' ? 'compressing' : 'uploading', progressPct: 0 });

          const result = await uploadEvidenceWithProgress(kind, poolId, target.file, {
            signal: ctrl.signal,
            compressOptions,
            onProgress: (p) => {
              updateItem(nextId, {
                status: 'uploading',
                progressPct: p.pct,
              });
            },
          });

          updateItem(nextId, {
            status: 'done',
            progressPct: 100,
            evidenceId: result.evidenceId,
            sha256: result.sha256,
          });

          setAnnouncement(`Upload completed for ${target.name}`);
        } catch (err: unknown) {
          if (ctrl.signal.aborted) {
            updateItem(nextId, { status: 'cancelled' });
            setAnnouncement(`Upload cancelled for ${target.name}`);
          } else {
            const message = err instanceof Error ? err.message : 'Upload failed';
            updateItem(nextId, { status: 'error', error: message });
            setAnnouncement(`Upload failed for ${target.name}: ${message}`);
          }
        } finally {
          abortControllersRef.current.delete(nextId);
          activeCountRef.current = Math.max(0, activeCountRef.current - 1);
          setTimeout(processQueue, 0);
        }
      })();

      return current;
    });
  }, [concurrencyLimit, kind, poolId, compressOptions, updateItem]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: CapturedEvidenceItem[] = [];
    const filesArray = Array.from(fileList);

    for (const file of filesArray) {
      if (items.length + newItems.length >= maxFiles) {
        setAnnouncement(`Maximum limit of ${maxFiles} files reached`);
        break;
      }

      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (!isVideo && !isImage) {
        setAnnouncement(`File type not supported for ${file.name}`);
        continue;
      }

      if (isVideo && file.size > maxVideoSizeBytes) {
        const maxMb = Math.round(maxVideoSizeBytes / (1024 * 1024));
        const id = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        newItems.push({
          id,
          file,
          name: file.name,
          type: 'video',
          previewUrl: '',
          status: 'error',
          progressPct: 0,
          error: `Video exceeds ${maxMb} MB limit`,
        });
        continue;
      }

      const id = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let previewUrl = '';
      try {
        previewUrl = URL.createObjectURL(file);
      } catch {
        previewUrl = '';
      }

      newItems.push({
        id,
        file,
        name: file.name,
        type: isVideo ? 'video' : 'image',
        previewUrl,
        status: 'uploading',
        progressPct: 0,
      });

      queueRef.current.push(id);
    }

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems]);
      setTimeout(processQueue, 0);
    }
  };

  const cancelUpload = (id: string) => {
    const ctrl = abortControllersRef.current.get(id);
    if (ctrl) {
      ctrl.abort();
      abortControllersRef.current.delete(id);
    }
    // Also remove from pending queue if queued
    queueRef.current = queueRef.current.filter((itemId) => itemId !== id);
    updateItem(id, { status: 'cancelled' });
  };

  const retryUpload = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    updateItem(id, { status: 'uploading', progressPct: 0, error: undefined });
    queueRef.current.push(id);
    setTimeout(processQueue, 0);
  };

  const removeItem = (id: string) => {
    cancelUpload(id);
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const effectiveDisabled = disabled || !isOnline;

  return (
    <div className="space-y-4">
      {/* Polite live announcement region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {!isOnline && (
        <p
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900"
        >
          You are offline. Capture and uploads are paused until connection returns.
        </p>
      )}

      <div>
        <label
          className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-emerald-800 p-4 font-semibold text-emerald-900 transition-colors ${
            effectiveDisabled ? 'cursor-not-allowed opacity-50 bg-neutral-100' : 'hover:bg-emerald-50/50'
          }`}
        >
          <span>{t('addPhoto')}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            disabled={effectiveDisabled}
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = ''; // Reset so choosing the same file twice triggers onChange
            }}
          />
        </label>
        <p className="mt-1 text-xs text-neutral-500">
          Photos are compressed before upload. Videos up to 50 MB.
        </p>
      </div>

      {/* Captured items list with progress, cancel, and retry */}
      {items.length > 0 && (
        <ul aria-label="Captured evidence" className="space-y-3">
          {items.map((item) => {
            const isUploading = item.status === 'compressing' || item.status === 'uploading';
            const isError = item.status === 'error';
            const isDone = item.status === 'done';
            const isCancelled = item.status === 'cancelled';

            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs"
              >
                {/* Thumbnail / Preview */}
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100 border border-neutral-200">
                  {item.type === 'image' && item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt={`Preview of ${item.name}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs font-bold text-neutral-500">
                      {item.type === 'video' ? 'VIDEO' : 'FILE'}
                    </div>
                  )}
                </div>

                {/* Details and progress bar */}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{item.name}</p>

                  {isUploading && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-neutral-600">
                        <span>
                          {item.status === 'compressing' ? 'Compressing…' : 'Uploading…'}
                        </span>
                        <span>{item.progressPct}%</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuenow={item.progressPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Upload progress for ${item.name}`}
                        className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
                      >
                        <div
                          className="h-full bg-emerald-700 transition-all duration-150"
                          style={{ width: `${item.progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {isDone && (
                    <p className="text-xs font-semibold text-emerald-800">✓ Uploaded</p>
                  )}

                  {isError && (
                    <p role="alert" className="text-xs font-semibold text-red-700">
                      {item.error || 'Upload failed'}
                    </p>
                  )}

                  {isCancelled && (
                    <p className="text-xs text-neutral-500">Upload cancelled</p>
                  )}
                </div>

                {/* Controls (min 44px tap target) */}
                <div className="flex shrink-0 items-center gap-1">
                  {isUploading && (
                    <button
                      type="button"
                      onClick={() => cancelUpload(item.id)}
                      aria-label={`Cancel upload of ${item.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-lg px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                      {common('cancel')}
                    </button>
                  )}

                  {(isError || isCancelled) && (
                    <button
                      type="button"
                      onClick={() => retryUpload(item.id)}
                      disabled={effectiveDisabled}
                      aria-label={`Retry upload of ${item.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-lg px-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="min-h-[44px] min-w-[44px] rounded-lg px-2 text-xs font-semibold text-neutral-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
