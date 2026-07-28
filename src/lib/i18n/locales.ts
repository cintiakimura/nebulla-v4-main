/**
 * Supported IDE locales and device-language mapping.
 * Authority: nebulla-project/language-system.md
 */

export const IDE_LOCALE_CODES = ['en', 'fr', 'it', 'es', 'de'] as const;

export type IdeLocaleCode = (typeof IDE_LOCALE_CODES)[number];
export type IdeLocalePref = 'auto' | IdeLocaleCode;

export const IDE_LOCALE_LABELS: Record<IdeLocaleCode, string> = {
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  de: 'Deutsch',
};

/** BCP-47 tags for SpeechRecognition / TTS. */
export const LOCALE_TO_BCP47: Record<IdeLocaleCode, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  it: 'it-IT',
  es: 'es-ES',
  de: 'de-DE',
};

export function isIdeLocaleCode(value: unknown): value is IdeLocaleCode {
  return typeof value === 'string' && (IDE_LOCALE_CODES as readonly string[]).includes(value);
}

/** Map navigator.language → supported code; unknown → en. */
export function mapDeviceLanguageToIdeLocale(deviceLang?: string | null): IdeLocaleCode {
  const raw = (deviceLang || (typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en')
    .trim()
    .toLowerCase();
  const primary = raw.split('-')[0] || 'en';
  if (isIdeLocaleCode(primary)) return primary;
  return 'en';
}

export function resolveIdeLocale(pref: IdeLocalePref, deviceLang?: string | null): IdeLocaleCode {
  if (pref === 'auto') return mapDeviceLanguageToIdeLocale(deviceLang);
  return isIdeLocaleCode(pref) ? pref : 'en';
}

export function bcp47ForLocale(code: IdeLocaleCode): string {
  return LOCALE_TO_BCP47[code] || LOCALE_TO_BCP47.en;
}
