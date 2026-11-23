/**
 * The locales the app ships. Add a code here (and its message files) to turn a language on.
 * Kept free of server-only imports so client components and tests can use it.
 */
export const locales = ['en', 'pcm'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const LOCALE_COOKIE = 'locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Picks the best supported locale from an `Accept-Language` header (RFC 9110), in order of q-value.
 * Only languages we ship are considered, so `ha`, `yo` and `ig` are picked automatically once their
 * catalogs are added to `locales`. Anything else falls back to English.
 */
export function matchAcceptLanguage<T extends string = Locale>(
  header: string | null | undefined,
  supported: readonly T[] = locales as unknown as readonly T[],
  fallback: T = defaultLocale as T,
): T {
  if (!header) return fallback;
  const ranges = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((r) => r.tag && r.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of ranges) {
    if (tag === '*') break;
    const primary = tag.split('-')[0];
    const match = supported.find((l) => l === tag) ?? supported.find((l) => l === primary);
    if (match) return match;
  }
  return fallback;
}
