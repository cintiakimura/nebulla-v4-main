/**
 * Prompt contract fragment for Chat / Master Plan language.
 * Authority: nebulla-project/language-system.md
 */

import type { IdeLocaleCode } from './locales';
import type { ContentLanguageMode } from './userLanguagePreferences';

export function buildLanguagePromptAppendix(options: {
  ideLocale: IdeLocaleCode;
  contentLocale: IdeLocaleCode;
  contentMode: ContentLanguageMode;
}): string {
  const { ideLocale, contentLocale, contentMode } = options;
  return [
    '## Language contract (UNBREAKABLE for user-visible prose)',
    `IDE_LOCALE: ${ideLocale}`,
    `CONTENT_LOCALE: ${contentLocale}`,
    `CONTENT_MODE: ${contentMode}`,
    '- User-visible chat prose MUST be in CONTENT_LOCALE (tone per chat-personality when Chat mode).',
    '- Master Plan user-visible prose MUST be in CONTENT_LOCALE when emitting <START_MASTERPLAN>.',
    '- Authority docs remain English — obey them; answer/write user-facing text in CONTENT_LOCALE.',
    '- Do not switch CONTENT_LOCALE mid-thread unless CONTENT_MODE=mirror and the user clearly switched languages.',
    '- Agent mode: same CONTENT_LOCALE for any user-visible status prose; code identifiers stay code.',
    '- When writing v0-prompt.md / UI Studio briefs: user-facing UI labels and copy language = CONTENT_LOCALE.',
  ].join('\n');
}
