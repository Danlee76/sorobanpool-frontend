import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from './locales';

export { locales, type Locale } from './locales';

export default getRequestConfig(async () => {
  // An explicit choice (the cookie) wins. Otherwise use the browser's Accept-Language for this request only:
  // nothing is written, so the cookie is set only when the person picks a language.
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookie) ? cookie : matchAcceptLanguage((await headers()).get('accept-language'));
  const ui = (await import(`../messages/${locale}.json`)).default as Record<string, Record<string, unknown>>;
  const contractErrors = (await import(`../messages/errors.${locale}.json`)).default as Record<string, unknown>;
  // Contract error text lives in its own file (generated from the contracts' error codes) and merges under `errors`.
  return { locale, messages: { ...ui, errors: { ...(ui.errors ?? {}), ...contractErrors } } };
});
