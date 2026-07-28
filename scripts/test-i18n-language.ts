/**
 * Unit checks for language resolve + mirror hysteresis.
 * Run: npx tsx scripts/test-i18n-language.ts
 */
import assert from 'node:assert/strict';
import {
  nextDetectedContentLocale,
  detectLocaleFromText,
} from '../src/lib/i18n/contentLocalePolicy.ts';
import {
  resolveLanguageState,
  type UserLanguagePreferences,
} from '../src/lib/i18n/userLanguagePreferences.ts';
import { resolveIdeLocale, mapDeviceLanguageToIdeLocale } from '../src/lib/i18n/locales.ts';
import { tLocale } from '../src/lib/i18n/t.ts';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section('device mapping');
assert.equal(mapDeviceLanguageToIdeLocale('fr-FR'), 'fr');
assert.equal(mapDeviceLanguageToIdeLocale('it-IT'), 'it');
assert.equal(mapDeviceLanguageToIdeLocale('pt-BR'), 'en');
assert.equal(resolveIdeLocale('auto', 'de-DE'), 'de');
assert.equal(resolveIdeLocale('it', 'fr-FR'), 'it');

section('match_ide forces content = IDE');
{
  const prefs: UserLanguagePreferences = {
    ideLocale: 'it',
    contentMode: 'match_ide',
    detectedContentLocale: 'fr',
  };
  const r = resolveLanguageState(prefs, 'en-US');
  assert.equal(r.resolvedIdeLocale, 'it');
  assert.equal(r.resolvedContentLocale, 'it');
}

section('mirror uses sticky detection when present');
{
  const prefs: UserLanguagePreferences = {
    ideLocale: 'en',
    contentMode: 'mirror',
    detectedContentLocale: 'es',
  };
  const r = resolveLanguageState(prefs);
  assert.equal(r.resolvedContentLocale, 'es');
}

section('hysteresis: short English paste keeps Italian');
{
  const next = nextDetectedContentLocale({
    text: 'TypeError: Cannot read property of undefined',
    previous: 'it',
  });
  assert.equal(next, 'it');
}

section('hysteresis: short ASCII paste keeps French');
{
  const next = nextDetectedContentLocale({
    text: 'OK thanks',
    previous: 'fr',
  });
  assert.equal(next, 'fr');
}

section('detection: confident Italian');
{
  const { locale, confidence } = detectLocaleFromText(
    'Ciao, vorrei creare un sito web per la mia applicazione oggi grazie',
  );
  assert.equal(locale, 'it');
  assert.ok(confidence >= 0.35);
}

section('detection: too short → null');
{
  const { locale } = detectLocaleFromText('ciao');
  assert.equal(locale, null);
}

section('catalog EN fallback');
{
  assert.match(tLocale('en', 'chat.greeting'), /create today/i);
  assert.match(tLocale('it', 'chat.greeting'), /Ciao|creare/i);
  // Missing key falls back to key string or EN — ensure known key works in de
  assert.ok(tLocale('de', 'chat.thinking').length > 0);
}

console.log('\nAll i18n language tests passed.\n');
