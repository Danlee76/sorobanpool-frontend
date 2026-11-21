'use client';
import { lazy, Suspense, useState } from 'react';

// Lazy load QR code generation to keep it out of trader bundles
const QRCodeSVG = lazy(async () => {
  const qr = await import('qrcode');
  return {
    default: ({ value, size = 200 }: { value: string; size?: number }) => {
      const [svg, setSvg] = useState<string>('');
      
      // Generate QR code as SVG on mount
      qr.toString(value, { 
        type: 'svg',
        width: size,
        margin: 2,
        errorCorrectionLevel: 'M',
      })
        .then(setSvg)
        .catch(console.error);
      
      return (
        <div 
          dangerouslySetInnerHTML={{ __html: svg }} 
          aria-hidden="true"
          className="inline-block"
        />
      );
    },
  };
});

export interface PoolQrProps {
  /** The pool's share slug */
  slug: string;
  /** Pool title for the alt text */
  title: string;
}

/**
 * QR code for a pool link in the organizer view.
 * Lazy-loaded so it doesn't affect trader bundles.
 */
export function PoolQr({ slug, title }: PoolQrProps) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/p/${slug}` : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="font-semibold">Share this pool</h3>
      <p className="text-sm text-neutral-700">
        Show this QR code to people in person, or copy the link to share online.
      </p>
      
      <div className="flex flex-col items-center gap-4 rounded-lg bg-neutral-50 p-4">
        <Suspense 
          fallback={
            <div 
              className="flex size-[200px] items-center justify-center rounded-lg bg-neutral-200"
              role="status"
            >
              <span className="text-sm text-neutral-600">Loading QR code...</span>
            </div>
          }
        >
          <div 
            role="img" 
            aria-label={`QR code linking to ${title} pool at ${url}`}
          >
            <QRCodeSVG value={url} size={200} />
          </div>
        </Suspense>
        
        <p className="max-w-full break-all text-center text-xs text-neutral-600">
          {url}
        </p>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-emerald-800 font-semibold text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
      >
        {copied ? (
          <>
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy link
          </>
        )}
      </button>
    </div>
  );
}
