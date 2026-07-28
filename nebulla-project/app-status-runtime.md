# App Status (preview runtime health)

Beginner-friendly **App Status** shows whether the live preview is healthy — without requiring DevTools.

## What it is
- A small **chat-header menu** (Cursor-style) plus a **preview dock badge**
- Captures runtime errors from the **workspace preview iframe** (same-origin bootstrap)
- Translates errors into plain language; raw stacks live under **Technical details**

## What it is not
- Not a full browser console
- Not a replacement for `IdeGrokActivityPanel` (that panel is Agent work progress)
- Not allowed to scrape the user’s entire browser outside the preview
- **Not** a cross-origin / v0 live preview surface — IDE App Preview is **workspace bootstrap only** (Phase 5)

## UI
| Surface | Behavior |
|---------|----------|
| Chat header pulse/alert button | Opens popover: status, up to 3 issue cards, Fix / Clear |
| Preview chrome badge | Green OK / red count — click opens the **same** chat menu (`nebula-open-app-status`) |

Default copy follows **user-communication-rules** Tier 1. Technical details are opt-in.
Menu chrome titles/actions **and** friendly issue bodies use IDE `t()` (`nebulla-project/language-system.md`); IssueCard re-maps on display so locale switches refresh copy.
Relative times use `appStatus.time.*` catalog keys.

**Language:** IDE chrome = device / IDE prefs; chat & plans = Grok + CONTENT_LOCALE mirror (`language-system.md`).

## Events / store
Module: `src/lib/ideAppRuntimeStatus.ts`

- `nebula-app-runtime-issue` — new/deduped issue
- `nebula-app-runtime-cleared` — cleared (manual or validated)
- `nebula-open-app-status` — open chat menu
- `nebula-reload-app-preview` — bump preview rev (Validate CTA)
- `nebula-app-runtime-looks-fixed` — healthy window after Fix + reload

Issue shape (conceptual):
`id, fingerprint, severity, friendlyTitle, friendlyBody, technicalMessage, stack?, route?, source, at`

## Capture (same-origin workspace)
| Layer | Where |
|-------|--------|
| **Early** | Bootstrap HTML inject (`wrapHtmlWithPreviewRuntimeBridge` in `/api/app-preview/bootstrap`) |
| **Backup** | Parent `injectPreviewRuntimeBridge` on iframe load |
| Script | `src/lib/previewRuntimeBridgeScript.ts` |

| Signal | `source` |
|--------|----------|
| `window.onerror` / `unhandledrejection` | `preview` |
| Capped `console.error` | `preview` |
| Patched `fetch` throw or `!ok` (≥400) — **no bodies/headers** | `network` |
| Iframe load / meta / empty workspace shell / failed apply | `build` |

- Cleared on project key change
- `/api/app-preview/meta` always returns `preferV0: false` — iframe never loads v0.dev

## Chat vs Agent
- **Fix with Agent** switches to Agent if needed (Discovery guard unchanged), then sends `[APP_STATUS_DEBUG]…` with **primary + up to 2 related** issues and optional `ide_open_file`
- Saying “it’s broken” / FR·IT·ES·DE equivalents while an issue exists auto-attaches the multi-issue payload
- Chat mode never writes files from App Status alone
- Agent turns still receive `IDE_EDITOR_SURFACE` / workspace appendix like any other Agent send

## Validate loop (post-fix)
1. Successful Agent file apply on an App Status turn (`shouldMarkAppStatusValidation`) → mark fingerprints pending + accessory “Reload preview to validate”
2. Reload begins → validation **anchor** set (mark or `noteAppRuntimeValidationReload`) **before** navigation
3. Same-origin preview load / bridge ready → quiet timer (~4s); anchor is **not** moved to onLoad (so boot-time errors still count)
4. Only watched fingerprints with `at` after the anchor block resolve (pre-mark leftovers do not)
5. If none reappear → clear watched issues + “Looks fixed.”; if they reappear → keep pending and advance anchor for the next attempt
6. Failed apply does **not** start Validate; surfaces as App Status `build` instead
7. Manual **Clear** remains for power users

## NDM + bug hints
When `[APP_STATUS_DEBUG]` is present, NDM **Verify** must use it — do not ask “what error do you see?”  
Pattern hints from `src/lib/bugDatabaseSnippet.ts` may appear as `BUG_DATABASE_HINTS` in the system appendix (not the full `full-bug-database.md`).  
Soft NDM tip recognizes Verify language in en/fr/it/es/de (CONTENT_LOCALE).  
See `nebulla-project/debugging-method.md`.

## Tests
- `npm run test:app-status` — contract (payload, multilingual, Validate logic)
- `npm run test:app-status-smoke` — bootstrap wrap + ingest + Validate smoke

## Privacy
- Truncate messages/stacks
- No secrets, no request/response bodies, no localStorage dumps
- Log counts only in `console.info` (no full stacks in host logs)

## Manual demo checklist (10 min)
1. Open IDE **Preview** (workspace bootstrap)
2. Cause a runtime error in the preview app
3. Confirm App Status goes red
4. Fix with Agent → files apply
5. Reload (or use CTA) → within ~4s App Status green **without** Clear
6. Optional: say “non funziona” / “ça marche pas” with an issue present → payload attaches
