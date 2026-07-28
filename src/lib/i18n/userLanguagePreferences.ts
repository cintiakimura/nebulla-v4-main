/**
 * User language preferences (localStorage). Authority: language-system.md
 */

import {
  isIdeLocaleCode,
  resolveIdeLocale,
  type IdeLocaleCode,
  type IdeLocalePref,
} from './locales';
import { nextDetectedContentLocale, normalizeDetectedLocale } from './contentLocalePolicy';

export type ContentLanguageMode = 'mirror' | 'match_ide';

export type UserLanguagePreferences = {
  ideLocale: IdeLocalePref;
  contentMode: ContentLanguageMode;
  detectedContentLocale?: IdeLocaleCode;
};

const STORAGE_KEY = 'nebula-user-language-prefs-v1';

const DEFAULT_PREFS: UserLanguagePreferences = {
  ideLocale: 'auto',
  contentMode: 'mirror',
};

export function normalizeContentMode(value: unknown): ContentLanguageMode {
  return value === 'match_ide' ? 'match_ide' : 'mirror';
}

export function normalizeIdeLocalePref(value: unknown): IdeLocalePref {
  if (value === 'auto') return 'auto';
  return isIdeLocaleCode(value) ? value : 'auto';
}

export function readLanguagePreferences(): UserLanguagePreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserLanguagePreferences>;
    return {
      ideLocale: normalizeIdeLocalePref(parsed.ideLocale),
      contentMode: normalizeContentMode(parsed.contentMode),
      detectedContentLocale: normalizeDetectedLocale(parsed.detectedContentLocale),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeLanguagePreferences(prefs: UserLanguagePreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(
      new CustomEvent('nebula-language-prefs-changed', { detail: { ...prefs } }),
    );
  } catch {
    /* ignore */
  }
}

export type ResolvedLanguage = {
  prefs: UserLanguagePreferences;
  resolvedIdeLocale: IdeLocaleCode;
  resolvedContentLocale: IdeLocaleCode;
};

export function resolveLanguageState(
  prefs: UserLanguagePreferences,
  deviceLang?: string | null,
): ResolvedLanguage {
  const resolvedIdeLocale = resolveIdeLocale(prefs.ideLocale, deviceLang);
  const resolvedContentLocale =
    prefs.contentMode === 'match_ide'
      ? resolvedIdeLocale
      : prefs.detectedContentLocale || resolvedIdeLocale;
  return { prefs, resolvedIdeLocale, resolvedContentLocale };
}

/** Update sticky detection after a user Chat message (mirror mode only). */
export function applyMirrorDetectionFromUserText(
  prefs: UserLanguagePreferences,
  userText: string,
): UserLanguagePreferences {
  if (prefs.contentMode !== 'mirror') return prefs;
  const next = nextDetectedContentLocale({
    text: userText,
    previous: prefs.detectedContentLocale ?? null,
  });
  if (!next || next === prefs.detectedContentLocale) return prefs;
  const updated = { ...prefs, detectedContentLocale: next };
  writeLanguagePreferences(updated);
  return updated;
}
