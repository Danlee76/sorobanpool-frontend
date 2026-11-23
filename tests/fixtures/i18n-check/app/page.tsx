// Fixture for scripts/i18n-check.test.ts: one missing key (greeting.missing) and one unused key (greeting.unused).
import { useTranslations } from 'next-intl';

export default function Page({ tier }: { tier: 'gold' | 'silver' }) {
  const t = useTranslations('greeting');
  const root = useTranslations();
  const what = 'errors.generic.what';
  return (
    <p>
      {t('hello')} {t('missing')} {t(`tier.${tier}`)} {root(what)}
    </p>
  );
}
