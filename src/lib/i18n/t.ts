/**
 * IDE chrome translator. Static catalogs only — never call Grok for t().
 */

import { translateKey } from './catalogs';
import type { IdeLocaleCode } from './locales';

let activeIdeLocale: IdeLocaleCode = 'en';

/** Used by LanguageProvider so module-level t() stays in sync. */
export function setActiveIdeLocale(locale: IdeLocaleCode): void {
  activeIdeLocale = locale;
}

export function getActiveIdeLocale(): IdeLocaleCode {
  return activeIdeLocale;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  return translateKey(activeIdeLocale, key, vars);
}

/** Explicit locale (e.g. tests / SSR). */
export function tLocale(
  locale: IdeLocaleCode,
  key: string,
  vars?: Record<string, string | number>,
): string {
  return translateKey(locale, key, vars);
}
