'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { locales, type Locale } from '@/i18n/locales';
import { saveLanguage } from '@/lib/language';
import { useSession } from '@/lib/store';

/** Each language is named in that language, so someone who cannot read the current one can still find theirs. */
const LABEL_KEY: Record<Locale, 'english' | 'pidgin'> = { en: 'english', pcm: 'pidgin' };

/**
 * The visible language control (Settings and the footer). Choosing sets the `locale` cookie, which is the only
 * place the cookie is written, and saves the choice to the profile when signed in.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('settings');
  const current = useLocale();
  const router = useRouter();
  const signedIn = useSession((s) => s.status === 'authed');

  async function choose(locale: Locale) {
    await saveLanguage(locale, { signedIn });
    router.refresh();
  }

  const btn = compact
    ? 'inline-flex min-h-12 items-center rounded-full px-3 font-semibold underline-offset-4'
    : 'min-h-12 w-full rounded-xl border border-neutral-500 font-semibold';
  const on = compact ? 'underline text-emerald-950' : 'border-emerald-800 bg-emerald-50';

  // The compact form sits inside the footer's <p>, so it must be phrasing content.
  const Group = compact ? 'span' : 'div';
  return (
    <Group role="group" aria-label={t('language')} className={compact ? 'inline-flex items-center gap-1' : 'flex gap-3'}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={current === l}
          onClick={() => void choose(l)}
          className={`${btn} ${current === l ? on : ''}`}
        >
          {t(LABEL_KEY[l])}
        </button>
      ))}
    </Group>
  );
}
