'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { IDE_LOCALE_CODES, IDE_LOCALE_LABELS, type IdeLocaleCode, type IdeLocalePref } from '../../lib/i18n/locales';
import { setActiveIdeLocale, t as translate } from '../../lib/i18n/t';
import {
  applyMirrorDetectionFromUserText,
  readLanguagePreferences,
  resolveLanguageState,
  writeLanguagePreferences,
  type ContentLanguageMode,
  type UserLanguagePreferences,
} from '../../lib/i18n/userLanguagePreferences';

export type LanguageContextValue = {
  prefs: UserLanguagePreferences;
  resolvedIdeLocale: IdeLocaleCode;
  resolvedContentLocale: IdeLocaleCode;
  setIdeLocale: (pref: IdeLocalePref) => void;
  setContentMode: (mode: ContentLanguageMode) => void;
  /** Call after user sends a chat message (mirror sticky detection). */
  noteUserMessageForMirror: (text: string) => IdeLocaleCode | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
  localeLabels: typeof IDE_LOCALE_LABELS;
  supportedLocales: typeof IDE_LOCALE_CODES;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserLanguagePreferences>(() => readLanguagePreferences());

  const resolved = useMemo(() => resolveLanguageState(prefs), [prefs]);

  useEffect(() => {
    setActiveIdeLocale(resolved.resolvedIdeLocale);
  }, [resolved.resolvedIdeLocale]);

  useEffect(() => {
    const onExternal = () => setPrefs(readLanguagePreferences());
    window.addEventListener('nebula-language-prefs-changed', onExternal);
    window.addEventListener('storage', onExternal);
    return () => {
      window.removeEventListener('nebula-language-prefs-changed', onExternal);
      window.removeEventListener('storage', onExternal);
    };
  }, []);

  const persist = useCallback((next: UserLanguagePreferences) => {
    setPrefs(next);
    writeLanguagePreferences(next);
  }, []);

  const setIdeLocale = useCallback(
    (pref: IdeLocalePref) => {
      persist({ ...prefs, ideLocale: pref });
    },
    [persist, prefs],
  );

  const setContentMode = useCallback(
    (mode: ContentLanguageMode) => {
      persist({ ...prefs, contentMode: mode });
    },
    [persist, prefs],
  );

  const noteUserMessageForMirror = useCallback(
    (text: string): IdeLocaleCode | null => {
      const updated = applyMirrorDetectionFromUserText(prefs, text);
      if (updated !== prefs) setPrefs(updated);
      const r = resolveLanguageState(updated);
      return r.resolvedContentLocale;
    },
    [prefs],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(key, vars),
    // Rebind when IDE locale changes so consumers re-render with fresh strings
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved.resolvedIdeLocale],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      prefs,
      resolvedIdeLocale: resolved.resolvedIdeLocale,
      resolvedContentLocale: resolved.resolvedContentLocale,
      setIdeLocale,
      setContentMode,
      noteUserMessageForMirror,
      t,
      localeLabels: IDE_LOCALE_LABELS,
      supportedLocales: IDE_LOCALE_CODES,
    }),
    [
      prefs,
      resolved.resolvedIdeLocale,
      resolved.resolvedContentLocale,
      setIdeLocale,
      setContentMode,
      noteUserMessageForMirror,
      t,
    ],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

/** Safe hook when provider may be absent (falls back to EN). */
export function useLanguageOptional(): LanguageContextValue | null {
  return useContext(LanguageContext);
}
