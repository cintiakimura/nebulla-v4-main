/**
 * Nebulla language system — source of truth
 *
 * Authority for locale behavior. Engines, APIs, guardian docs stay English.
 * Everything a human sees/hears is language-aware.
 */

# Language system (UNBREAKABLE)

## What is language-aware vs English forever

| Layer | Language |
|-------|----------|
| **IDE chrome** (menus, buttons, banners, App Status labels) | `resolvedIdeLocale` via static `t()` catalogs — **never** Grok-per-render |
| **Chat prose / Master Plan user-facing prose / generated UI copy** | `resolvedContentLocale` (Grok follows prompt contract) |
| **TTS / STT** | BCP-47 from `resolvedContentLocale` (fallback `en-US` + one notice) |
| **Engines, APIs, code identifiers, guardian authority markdown** | **English forever** |

Do **not** fork five copies of guardian markdown as runtime truth. Do **not** ask Grok to translate the sidebar each render.

## Preferences

```ts
ideLocale: 'auto' | 'en' | 'fr' | 'it' | 'es' | 'de'   // default auto
contentMode: 'mirror' | 'match_ide'                   // default mirror
detectedContentLocale?: IdeLocaleCode                 // sticky (mirror)
```

Persistence (v1): `localStorage` key `nebula-user-language-prefs-v1` (+ in-memory React context). Optional server user column later.

### Resolve

- **resolvedIdeLocale** — if `auto` → map `navigator.language` to supported set, else `en`
- **resolvedContentLocale** — `match_ide` → same as IDE; `mirror` → sticky detection (see below), else IDE until detection sticks

## Content modes

| Mode | Behavior |
|------|----------|
| **mirror** | Chat / plans follow the user’s writing language (sticky + hysteresis) |
| **match_ide** | Force Chat / Master Plan / UI copy language = IDE locale (**demo lock**: set IDE to IT + match_ide) |

## Mirror hysteresis (must not be flaky)

Implemented in `src/lib/i18n/contentLocalePolicy.ts`:

- Minimum length / confidence before accepting a detection
- Ignore short pastes, stack traces, single English error lines inside a non-EN thread
- Keep previous locale when unsure
- Optional quiet accessory: `t('chat.replyingIn', { lang })` when sticky locale changes

## Prompt contract (every Chat turn)

Injected via `buildLanguagePromptAppendix` into `chatModeSystemAppendix` / `sendIdeAssistantGrokTurn`:

```
IDE_LOCALE: …
CONTENT_LOCALE: …
CONTENT_MODE: mirror | match_ide
```

- User-visible chat + Master Plan prose → **CONTENT_LOCALE**
- Chat personality remains **Chat-only**; express greeting spirit in CONTENT_LOCALE
- Authority docs stay English; obey them, answer in CONTENT_LOCALE
- UI gen / v0 user-facing labels: CONTENT_LOCALE (documented; no Figma library expansion)

Default main AI for language-sensitive Chat remains **Grok**; BYOK models get the same contract.

## Code modules

| Path | Role |
|------|------|
| `src/lib/i18n/locales.ts` | Supported codes, device map, BCP-47 |
| `src/lib/i18n/userLanguagePreferences.ts` | Types, localStorage, resolve |
| `src/lib/i18n/contentLocalePolicy.ts` | Detect + hysteresis |
| `src/lib/i18n/catalogs.ts` / `t.ts` | Static chrome strings + EN fallback |
| `src/lib/i18n/languagePromptAppendix.ts` | System prompt fragment |
| `src/components/i18n/LanguageProvider.tsx` | React context |
| `src/components/settings/LanguageSettingsPanel.tsx` | Settings UX |

## Settings UX

- **IDE language:** Automatic (device) \| English \| Français \| Italiano \| Español \| Deutsch
- **Chat & plans:** Match my writing \| Match IDE language
- Resolved locales shown for demos — **not** a fifth Chat header control

## Demo checklist

1. Device FR + IDE `auto` → chrome FR; Chat mirror follows writing
2. Set IDE → Italiano + Chat & plans → Match IDE → refresh → still IT chrome + CONTENT_LOCALE it
3. Mirror sticky: long Italian thread, paste short English stack → locale stays IT
4. Chat\|Agent, App Status, attach, voice still work; no auto-V0 default

## TODO(i18n): migrate remaining chrome

Architecture + critical surfaces shipped. Remaining (not blocking):

- TopBar / VerticalNav / Explorer labels
- IdeGrokActivityPanel step strings
- Full Onboarding / Welcome copy
- All App Status issue.friendly* generators (runtime messages)
- AssistantSidebar legacy strings
- Error toasts outside Chat banner / upload

Mark machine translations in catalogs with native review when shipping EU fundraising builds.

## Related docs (pointers only)

- `chat-vs-agent-mode.md` — language applies to both modes; personality stays Chat-only
- `chat-personality.md` — greeting spirit in CONTENT_LOCALE
- `user-communication-rules.md` — user-facing strings via IDE `t()` + content locale for chat
- `app-status-runtime.md` — friendly App Status via `t()` / locale
