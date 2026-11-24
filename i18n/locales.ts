export type TextDirection = 'ltr' | 'rtl';

export interface LocaleConfig {
  code: string;
  name: string;
  documentLang: string;
  dir: TextDirection;
}

export const LOCALES: readonly LocaleConfig[] = [
  { code: 'en', name: 'English', documentLang: 'en', dir: 'ltr' },
  { code: 'pcm', name: 'Pidgin', documentLang: 'en-NG', dir: 'ltr' },
  { code: 'ha', name: 'Hausa', documentLang: 'ha', dir: 'ltr' },
  { code: 'yo', name: 'Yorùbá', documentLang: 'yo', dir: 'ltr' },
  { code: 'ig', name: 'Igbo', documentLang: 'ig', dir: 'ltr' },
] as const;

export const locales = ['en', 'pcm', 'ha', 'yo', 'ig'] as const;
export type Locale = (typeof locales)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function getLocaleConfig(code: string): LocaleConfig {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}
