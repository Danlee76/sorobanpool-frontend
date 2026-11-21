/**
 * RTL (Right-to-Left) readiness checks and utilities.
 *
 * This module provides checks and utilities to ensure the application
 * is ready for right-to-left languages (Arabic, Hebrew, etc.) by using
 * logical CSS properties instead of physical directions.
 */

/**
 * Check if a CSS class uses physical direction properties that may not
 * work correctly in RTL contexts.
 *
 * Returns list of problematic properties if found.
 */
export function checkPhysicalProperties(css: string): string[] {
  const physicalProps = [
    'left',
    'right',
    'margin-left',
    'margin-right',
    'padding-left',
    'padding-right',
    'border-left',
    'border-right',
    'float',
    'text-align', // Should use start/end or logical variants
  ];

  const found: string[] = [];
  for (const prop of physicalProps) {
    if (css.includes(prop)) {
      found.push(prop);
    }
  }
  return found;
}

/**
 * Suggested logical replacements for physical properties.
 */
export const LOGICAL_REPLACEMENTS: Record<string, string> = {
  left: 'inset-inline-start',
  right: 'inset-inline-end',
  'margin-left': 'margin-inline-start',
  'margin-right': 'margin-inline-end',
  'padding-left': 'padding-inline-start',
  'padding-right': 'padding-inline-end',
  'border-left': 'border-inline-start',
  'border-right': 'border-inline-end',
  'text-align: left': 'text-align: start',
  'text-align: right': 'text-align: end',
  'float: left': 'float: inline-start',
  'float: right': 'float: inline-end',
};

/**
 * Returns the direction string for the current locale.
 * Used for HTML dir attribute: 'ltr' or 'rtl'
 */
export function getTextDirection(locale?: string): 'ltr' | 'rtl' {
  const rtlLocales = ['ar', 'he', 'fa', 'ur', 'yi'];
  const currentLocale = locale || typeof window !== 'undefined'
    ? document.documentElement.lang
    : 'en';

  return rtlLocales.includes(currentLocale.split('-')[0]) ? 'rtl' : 'ltr';
}

/**
 * Checks if current locale is RTL.
 */
export function isRTL(locale?: string): boolean {
  return getTextDirection(locale) === 'rtl';
}
