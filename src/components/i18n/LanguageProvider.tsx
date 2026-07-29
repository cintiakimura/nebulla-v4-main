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
import { fetchJson } from '../../lib/apiFetch';
import { withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

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

const CONTENT_LOCALE_PATH = 'nebulla-ide/content-locale.json';

function isIdeAppRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  return p === '/app' || p === '/ide';
}

async function syncContentLocaleToWorkspace(contentLocale: IdeLocaleCode): Promise<void> {
  // Avoid noisy 403s on landing/login while a stale projectKey is still in localStorage.
  if (!isIdeAppRoute()) return;
  try {
    await fetchJson(withProjectQuery('/api/files/content'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(
        withProjectBody({
          path: CONTENT_LOCALE_PATH,
          content: JSON.stringify(
            { contentLocale, updatedAt: new Date().toISOString() },
            null,
            2,
          ),
        }),
      ),
    });
  } catch {
    /* workspace may not be ready yet — v0 builder falls back to en */
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserLanguagePreferences>(() => readLanguagePreferences());

  const resolved = useMemo(() => resolveLanguageState(prefs), [prefs]);

  useEffect(() => {
    setActiveIdeLocale(resolved.resolvedIdeLocale);
    try {
      document.documentElement.lang = resolved.resolvedIdeLocale;
    } catch {
      /* ignore */
    }
  }, [resolved.resolvedIdeLocale]);

  useEffect(() => {
    void syncContentLocaleToWorkspace(resolved.resolvedContentLocale);
  }, [resolved.resolvedContentLocale]);

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
    (key: string, vars?: Record<string, string | number>) => translate(key, vars),
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
