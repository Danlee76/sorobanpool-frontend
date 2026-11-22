'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';

/** WhatsApp first: one tap, with the message already written. Falls back to the OS share sheet or a copied link. */
export function ShareButton({ slug, product, price }: { slug: string; product: string; price: string }) {
  const t = useTranslations('pool');
  const common = useTranslations('common');
  const { showToast } = useToast();
  const [isSharing, setIsSharing] = useState(false);
  
  const link = typeof window === 'undefined' ? `/p/${slug}` : `${window.location.origin}/p/${slug}`;
  const text = t('shareText', { product, price, link });

  const handleShare = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsSharing(true);

    try {
      // Try native Web Share API first
      if (navigator.share) {
        await navigator.share({
          title: product,
          text: `${product} - ${price}`,
          url: link,
        });
        setIsSharing(false);
        return;
      }

      // Fallback to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        showToast(t('linkCopied'), 'success');
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = link;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(t('linkCopied'), 'success');
      }
    } catch (error) {
      // User cancelled share or error occurred
      if (error instanceof Error && error.name !== 'AbortError') {
        showToast(common('error'), 'error');
      }
    } finally {
      setIsSharing(false);
    }
  };

  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-green-700 px-4 font-semibold text-white hover:bg-green-800"
      >
        {t('share')}
      </a>
      <button
        onClick={handleShare}
        disabled={isSharing}
        className="flex min-h-12 items-center justify-center rounded-xl border-2 border-emerald-800 px-4 font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60 sm:w-auto"
        aria-label={t('copyLink')}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span className="ml-2">{t('copyLink')}</span>
      </button>
    </div>
  );
}
