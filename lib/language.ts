import { LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locales';
import { api } from './api';

/** The language a person picked on this device, or null if they never chose one. */
export function cookieLocale(): Locale | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== LOCALE_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return isLocale(value) ? value : null;
  }
  return null;
}

export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** The profile stores the language as a code; older rows may be upper case (`EN`). */
export function profileLocale(language: string | null | undefined): Locale | null {
  const code = language?.trim().toLowerCase();
  return isLocale(code) ? code : null;
}

/**
 * Saves an explicit choice: the cookie for this device, and the profile when signed in so a new phone gets it too.
 * Offline (or on a network error) the profile update is queued and replayed on the next load.
 */
export async function saveLanguage(locale: Locale, { signedIn }: { signedIn: boolean }): Promise<void> {
  writeLocaleCookie(locale);
  if (!signedIn) return;
  try {
    await api('/me', { method: 'PATCH', body: { language: locale }, actionType: 'save-language' });
  } catch (e) {
    // The cookie already switched the language here; a rejected profile update must not undo that.
    console.warn('Could not save the language to the profile:', e);
  }
}
