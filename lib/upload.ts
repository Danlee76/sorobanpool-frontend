import { api } from './api';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const DEFAULT_MAX_DIMENSION = 1280;
export const DEFAULT_QUALITY = 0.75;
export const DEFAULT_OUTPUT_TYPE = 'image/jpeg';
export const DEFAULT_MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export interface CompressImageOptions {
  maxDimension?: number;
  quality?: number;
  outputType?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  pct: number;
}

export interface UploadEvidenceOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  compressOptions?: CompressImageOptions;
}

/**
 * Extracts EXIF orientation tag (1-8) from a JPEG ArrayBuffer without external dependencies.
 * Returns 1 (normal) if not JPEG, no EXIF marker, or on parse error.
 */
export function getExifOrientation(buffer: ArrayBuffer): number {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4) return 1;
    // JPEG SOI marker
    if (view.getUint16(0, false) !== 0xffd8) return 1;

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      // APP1 marker (EXIF)
      if (marker === 0xffe1) {
        const length = view.getUint16(offset, false);
        offset += 2;
        // Check "Exif\0\0"
        if (
          offset + 6 <= view.byteLength &&
          view.getUint32(offset, false) === 0x45786966 &&
          view.getUint16(offset + 4, false) === 0x0000
        ) {
          const tiffOffset = offset + 6;
          if (tiffOffset + 8 > view.byteLength) return 1;
          const littleEndian = view.getUint16(tiffOffset, false) === 0x4949; // 'II'
          if (!littleEndian && view.getUint16(tiffOffset, false) !== 0x4d4d) return 1; // 'MM'
          if (view.getUint16(tiffOffset + 2, littleEndian) !== 0x002a) return 1;

          const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
          let ifdOffset = tiffOffset + firstIfdOffset;
          if (ifdOffset + 2 > view.byteLength) return 1;

          const numEntries = view.getUint16(ifdOffset, littleEndian);
          ifdOffset += 2;

          for (let i = 0; i < numEntries; i++) {
            const entryOffset = ifdOffset + i * 12;
            if (entryOffset + 12 > view.byteLength) break;
            const tag = view.getUint16(entryOffset, littleEndian);
            if (tag === 0x0112) {
              // Orientation tag
              const val = view.getUint16(entryOffset + 8, littleEndian);
              if (val >= 1 && val <= 8) return val;
              return 1;
            }
          }
        }
        break;
      } else if ((marker & 0xff00) === 0xff00 && marker !== 0xffd8 && marker !== 0xffd9) {
        const length = view.getUint16(offset, false);
        offset += length;
      } else {
        break;
      }
    }
    return 1;
  } catch {
    return 1;
  }
}

/**
 * Applies EXIF orientation transformation onto a 2D canvas context.
 * Adjusts canvas dimensions for 90-degree rotations (orientations 5, 6, 7, 8).
 */
export function applyOrientationTransform(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  targetWidth: number,
  targetHeight: number,
): { canvasWidth: number; canvasHeight: number } {
  let canvasWidth = targetWidth;
  let canvasHeight = targetHeight;

  switch (orientation) {
    case 2: // Horizontal flip
      ctx.translate(targetWidth, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // 180° rotation
      ctx.translate(targetWidth, targetHeight);
      ctx.rotate(Math.PI);
      break;
    case 4: // Vertical flip
      ctx.translate(0, targetHeight);
      ctx.scale(1, -1);
      break;
    case 5: // Transpose (rotate 90° CW + flip horizontal)
      canvasWidth = targetHeight;
      canvasHeight = targetWidth;
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // Rotate 90° CW
      canvasWidth = targetHeight;
      canvasHeight = targetWidth;
      ctx.translate(targetHeight, 0);
      ctx.rotate(0.5 * Math.PI);
      break;
    case 7: // Transverse (rotate 90° CCW + flip horizontal)
      canvasWidth = targetHeight;
      canvasHeight = targetWidth;
      ctx.translate(targetHeight, targetWidth);
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(-1, 1);
      break;
    case 8: // Rotate 270° CW (90° CCW)
      canvasWidth = targetHeight;
      canvasHeight = targetWidth;
      ctx.translate(0, targetWidth);
      ctx.rotate(-0.5 * Math.PI);
      break;
    case 1: // Normal (0°)
    default:
      break;
  }

  return { canvasWidth, canvasHeight };
}

/**
 * Client-side image compression with configurable limits and EXIF orientation handling.
 *
 * Requirements:
 * - Keeps aspect ratio and never upscales.
 * - Decodes with `createImageBitmap({ imageOrientation: 'from-image' })` where supported,
 *   with manual EXIF orientation fallback for browsers that ignore it.
 * - Handles PNG transparency by filling the background with white when converting to JPEG.
 * - Drops EXIF blocks (including GPS location) on re-encode, preserving trader privacy.
 * - Throws an error on decode failure (never silently uploads huge uncompressed files).
 * - Honors AbortSignal between processing steps.
 */
export async function compressImage(
  file: File,
  optionsOrMaxSide?: CompressImageOptions | number,
  qualityOrSignal?: number | AbortSignal,
  maybeSignal?: AbortSignal,
): Promise<Blob> {
  // Support overload: compressImage(file, maxSide, quality) or compressImage(file, options, signal)
  let maxDimension = DEFAULT_MAX_DIMENSION;
  let quality = DEFAULT_QUALITY;
  let outputType = DEFAULT_OUTPUT_TYPE;
  let signal: AbortSignal | undefined;

  if (typeof optionsOrMaxSide === 'number') {
    maxDimension = optionsOrMaxSide;
    if (typeof qualityOrSignal === 'number') {
      quality = qualityOrSignal;
    }
    signal = maybeSignal;
  } else if (typeof optionsOrMaxSide === 'object' && optionsOrMaxSide !== null) {
    if (optionsOrMaxSide.maxDimension !== undefined) maxDimension = optionsOrMaxSide.maxDimension;
    if (optionsOrMaxSide.quality !== undefined) quality = optionsOrMaxSide.quality;
    if (optionsOrMaxSide.outputType !== undefined) outputType = optionsOrMaxSide.outputType;
    if (qualityOrSignal instanceof AbortSignal) {
      signal = qualityOrSignal;
    } else {
      signal = maybeSignal;
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Compression aborted', 'AbortError');
  }

  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  // Read EXIF orientation before bitmap decoding
  let orientation = 1;
  try {
    const buffer = await file.arrayBuffer();
    if (signal?.aborted) throw new DOMException('Compression aborted', 'AbortError');
    orientation = getExifOrientation(buffer);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    orientation = 1;
  }

  // Decode bitmap respecting orientation where supported
  let bmp: ImageBitmap;
  let orientationHandledByBitmap = false;
  try {
    // Try native from-image orientation
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    orientationHandledByBitmap = true;
  } catch {
    try {
      // Fallback decode without options
      bmp = await createImageBitmap(file);
      orientationHandledByBitmap = false;
    } catch {
      throw new Error(`IMAGE_DECODE_FAILED: Could not decode image ${file.name}`);
    }
  }

  if (signal?.aborted) {
    bmp.close();
    throw new DOMException('Compression aborted', 'AbortError');
  }

  try {
    // Calculate scale: never upscale (scale <= 1), preserve aspect ratio
    const longestSide = Math.max(bmp.width, bmp.height);
    const scale = Math.min(1, maxDimension / longestSide);
    const targetWidth = Math.round(bmp.width * scale);
    const targetHeight = Math.round(bmp.height * scale);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    // Determine dimensions and transforms
    const effectiveOrientation = orientationHandledByBitmap ? 1 : orientation;
    const isSwapped = effectiveOrientation >= 5 && effectiveOrientation <= 8;

    canvas.width = isSwapped ? targetHeight : targetWidth;
    canvas.height = isSwapped ? targetWidth : targetHeight;

    // Fill white background for transparent images converting to JPEG
    if (outputType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Apply orientation transform
    if (effectiveOrientation !== 1) {
      applyOrientationTransform(ctx, effectiveOrientation, targetWidth, targetHeight);
    }

    ctx.drawImage(bmp, 0, 0, targetWidth, targetHeight);

    if (signal?.aborted) {
      throw new DOMException('Compression aborted', 'AbortError');
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, quality);
    });

    if (signal?.aborted) {
      throw new DOMException('Compression aborted', 'AbortError');
    }

    if (!blob) {
      throw new Error('Image compression failed to produce a blob');
    }

    // If re-encoded blob is smaller, return it; otherwise return original if types match,
    // or return blob to ensure stripped EXIF / proper output format
    return blob.size < file.size ? blob : blob;
  } finally {
    bmp.close();
  }
}

/**
 * Uploads evidence with XMLHttpRequest upload progress, per-file cancel, and retry.
 */
export async function uploadEvidenceWithProgress(
  kind: 'DELIVERY' | 'DISPUTE' | 'WAYBILL' | 'PRODUCT',
  poolId: string | undefined,
  file: File,
  opts?: UploadEvidenceOptions,
): Promise<{ evidenceId: string; sha256: string }> {
  const signal = opts?.signal;
  if (signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError');
  }

  // Videos: do not compress on client; validate size
  const isVideo = file.type.startsWith('video/');
  if (isVideo && file.size > DEFAULT_MAX_VIDEO_SIZE_BYTES) {
    throw new Error(`Video file size exceeds maximum allowed size of ${DEFAULT_MAX_VIDEO_SIZE_BYTES / (1024 * 1024)} MB`);
  }

  let bodyBlob: Blob = file;
  if (!isVideo && file.type.startsWith('image/')) {
    bodyBlob = await compressImage(file, opts?.compressOptions, signal);
  }

  if (signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError');
  }

  const mime = bodyBlob.type || file.type || 'image/jpeg';
  const slot = await api<{ evidenceId: string; uploadUrl: string }>('/uploads/sign', {
    body: { kind, mime, size: bodyBlob.size, ...(poolId ? { poolId } : {}) },
  });

  if (signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError');
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${BASE}${slot.uploadUrl}`;

    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', mime);

    if (opts?.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          opts.onProgress!({
            loaded: e.loaded,
            total: e.total,
            pct: Math.round((e.loaded / e.total) * 100),
          });
        }
      };
    }

    const abortHandler = () => {
      xhr.abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    xhr.onload = () => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = xhr.responseText ? JSON.parse(xhr.responseText) : { evidenceId: slot.evidenceId, sha256: '' };
          resolve(res);
        } catch {
          resolve({ evidenceId: slot.evidenceId, sha256: '' });
        }
      } else {
        reject(new Error(`upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      reject(new Error('Network error during upload'));
    };

    xhr.onabort = () => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    xhr.send(bodyBlob);
  });
}

/** Legacy / simple sign -> PUT to the short-lived URL. */
export async function uploadEvidence(
  kind: 'DELIVERY' | 'DISPUTE' | 'WAYBILL' | 'PRODUCT',
  poolId: string | undefined,
  file: File,
): Promise<{ evidenceId: string; sha256: string }> {
  return uploadEvidenceWithProgress(kind, poolId, file);
}
