/**
 * Lightweight content-locale detection + sticky hysteresis for mirror mode.
 * Does not call the network. Authority: nebulla-project/language-system.md
 */

import { isIdeLocaleCode, type IdeLocaleCode } from './locales';

const MIN_DETECT_CHARS = 24;
const STACKISH =
  /\b(at\s+\S+\s*\(|TypeError:|ReferenceError:|SyntaxError:|Cannot read propert|Unhandled Promise|node_modules\/|\/src\/|\.tsx?:\d+)/i;

/** Very small script / keyword heuristics — good enough for sticky mirror, not NLP. */
export function detectLocaleFromText(text: string): { locale: IdeLocaleCode | null; confidence: number } {
  const t = String(text || '').trim();
  if (t.length < MIN_DETECT_CHARS) return { locale: null, confidence: 0 };
  if (STACKISH.test(t) && t.length < 400) return { locale: null, confidence: 0 };

  const lower = t.toLowerCase();
  const scores: Record<IdeLocaleCode, number> = { en: 0, fr: 0, it: 0, es: 0, de: 0 };

  // Accent / character cues
  if (/[àâæçéèêëïîôœùûüÿ]/i.test(t)) scores.fr += 3;
  if (/[àèéìíîòóùú]/i.test(t) && /\b(che|non|per|una|sono|questo|grazie)\b/i.test(lower)) scores.it += 3;
  if (/[áéíóúñ¿¡]/i.test(t)) scores.es += 3;
  if (/[äöüß]/i.test(t)) scores.de += 3;

  const bump = (locale: IdeLocaleCode, words: string[], weight = 1) => {
    for (const w of words) {
      const re = new RegExp(`(?:^|[^\\p{L}])${w}(?:[^\\p{L}]|$)`, 'iu');
      if (re.test(lower)) scores[locale] += weight;
    }
  };

  bump('fr', ['bonjour', 'merci', 'salut', 'créer', 'page', 'site', 'application', 'landing', 'aujourd'], 2);
  bump('fr', ['je', 'nous', 'vous', 'avec', 'pour', 'dans', 'une', 'des'], 0.5);
  bump('it', ['ciao', 'grazie', 'buongiorno', 'creare', 'sito', 'applicazione', 'voglio', 'oggi'], 2);
  bump('it', ['che', 'non', 'per', 'una', 'sono', 'questo', 'della', 'come'], 0.5);
  bump('es', ['hola', 'gracias', 'quiero', 'crear', 'página', 'sitio', 'aplicación', 'hoy'], 2);
  bump('es', ['que', 'para', 'una', 'como', 'este', 'está', 'hacer'], 0.5);
  bump('de', ['hallo', 'danke', 'bitte', 'erstellen', 'website', 'anwendung', 'heute', 'möchte'], 2);
  bump('de', ['und', 'nicht', 'eine', 'der', 'die', 'das', 'ich', 'wir'], 0.5);
  bump('en', ['hello', "what's", 'create', 'landing', 'website', 'build', 'please', 'today'], 2);
  bump('en', ['the', 'and', 'with', 'for', 'this', 'that', 'want', 'would'], 0.4);

  let best: IdeLocaleCode = 'en';
  let bestScore = -1;
  for (const code of Object.keys(scores) as IdeLocaleCode[]) {
    if (scores[code] > bestScore) {
      bestScore = scores[code];
      best = code;
    }
  }
  if (bestScore < 2) return { locale: null, confidence: 0 };
  const confidence = Math.min(1, bestScore / 8);
  return { locale: best, confidence };
}

/**
 * Sticky update: keep previous unless new detection is confident enough
 * and text is not a short English/stack paste.
 */
export function nextDetectedContentLocale(options: {
  text: string;
  previous?: IdeLocaleCode | null;
}): IdeLocaleCode | null {
  const { text, previous } = options;
  const trimmed = String(text || '').trim();
  if (!trimmed) return previous ?? null;

  // Short English-looking paste while sticky on another locale → keep previous
  if (
    previous &&
    previous !== 'en' &&
    trimmed.length < 120 &&
    (/^[A-Za-z0-9\s.,:;!?_\-/\\'"()[\]{}<>@#$%&*+=|~`]+$/.test(trimmed) || STACKISH.test(trimmed))
  ) {
    return previous;
  }

  const { locale, confidence } = detectLocaleFromText(trimmed);
  if (!locale || confidence < 0.35) return previous ?? null;
  if (!previous) return locale;
  if (locale === previous) return previous;
  // Require stronger confidence to switch
  if (confidence < 0.55) return previous;
  return locale;
}

export function normalizeDetectedLocale(value: unknown): IdeLocaleCode | undefined {
  return isIdeLocaleCode(value) ? value : undefined;
}
