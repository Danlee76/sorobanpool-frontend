import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { locales, DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from './locales';

export * from './locales';

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const s = source[key];
    const t = target[key];
    if (s !== undefined && s !== null) {
      if (
        typeof s === 'object' &&
        !Array.isArray(s) &&
        typeof t === 'object' &&
        t !== null &&
        !Array.isArray(t)
      ) {
        result[key] = deepMerge(t as Record<string, unknown>, s as Record<string, unknown>);
      } else {
        result[key] = s;
      }
    }
  }
  return result;
}

export default getRequestConfig(async () => {
  // An explicit choice (the cookie) wins. Otherwise use the browser's Accept-Language for this request only.
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookie) ? cookie : matchAcceptLanguage((await headers()).get('accept-language'));

  const enUi = (await import('../messages/en.json')).default as Record<string, Record<string, unknown>>;
  const enErrors = (await import('../messages/errors.en.json')).default as Record<string, unknown>;
  const baseEn: Record<string, unknown> = { ...enUi, errors: { ...(enUi.errors ?? {}), ...enErrors } };

  if (locale === 'en') {
    return { locale, messages: baseEn };
  }

  try {
    const ui = (await import(`../messages/${locale}.json`)).default as Record<string, Record<string, unknown>>;
    let contractErrors: Record<string, unknown> = {};
    try {
      contractErrors = (await import(`../messages/errors.${locale}.json`)).default as Record<string, unknown>;
    } catch {
      // Fall back to English contract errors if missing
    }
    const targetMessages: Record<string, unknown> = { ...ui, errors: { ...(ui.errors ?? {}), ...contractErrors } };
    return { locale, messages: deepMerge(baseEn, targetMessages) };
  } catch {
    return { locale: DEFAULT_LOCALE, messages: baseEn };
  }
});
