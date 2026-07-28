'use client';

import { Languages } from 'lucide-react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { IdeLocalePref } from '../../lib/i18n/locales';
import type { ContentLanguageMode } from '../../lib/i18n/userLanguagePreferences';

/** Settings block: IDE language + Chat & plans content mode. */
export function LanguageSettingsPanel() {
  const {
    prefs,
    resolvedIdeLocale,
    resolvedContentLocale,
    setIdeLocale,
    setContentMode,
    t,
    localeLabels,
    supportedLocales,
  } = useLanguage();

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-5">
      <h3 className="text-sm font-headline text-slate-200 flex items-center gap-2 border-b border-white/10 pb-2">
        <Languages className="w-4 h-4 text-slate-400" aria-hidden />
        {t('settings.language')}
      </h3>

      <div className="space-y-2">
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline">
          {t('settings.ideLanguage')}
        </label>
        <p className="text-xs text-slate-400 leading-relaxed">{t('settings.ideLanguageHint')}</p>
        <select
          value={prefs.ideLocale}
          onChange={(e) => setIdeLocale(e.target.value as IdeLocalePref)}
          className="w-full max-w-md bg-black/35 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
        >
          <option value="auto">{t('settings.ide.auto')}</option>
          {supportedLocales.map((code) => (
            <option key={code} value={code}>
              {localeLabels[code]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline">
          {t('settings.contentMode')}
        </label>
        <p className="text-xs text-slate-400 leading-relaxed">{t('settings.contentModeHint')}</p>
        <select
          value={prefs.contentMode}
          onChange={(e) => setContentMode(e.target.value as ContentLanguageMode)}
          className="w-full max-w-md bg-black/35 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
        >
          <option value="mirror">{t('settings.content.mirror')}</option>
          <option value="match_ide">{t('settings.content.matchIde')}</option>
        </select>
      </div>

      <div className="rounded-lg border border-white/5 bg-black/25 px-3 py-2 space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">
          {t('settings.resolved')}
        </p>
        <p className="text-xs text-slate-300">
          {t('settings.resolvedIde', { locale: `${resolvedIdeLocale} (${localeLabels[resolvedIdeLocale]})` })}
        </p>
        <p className="text-xs text-slate-300">
          {t('settings.resolvedContent', {
            locale: `${resolvedContentLocale} (${localeLabels[resolvedContentLocale]})`,
          })}
        </p>
      </div>
    </section>
  );
}
