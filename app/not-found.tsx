import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function NotFound() {
  const t = useTranslations('errors');

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-neutral-900">{t('notFound.title')}</h1>
          <p className="text-neutral-600">{t('notFound.message')}</p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-6 font-semibold text-white hover:bg-emerald-900"
        >
          {t('notFound.home')}
        </Link>
      </div>
    </div>
  );
}
