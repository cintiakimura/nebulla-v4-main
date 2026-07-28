# App Status (preview runtime health)

Beginner-friendly **App Status** shows whether the live preview is healthy — without requiring DevTools.

## What it is
- A small **chat-header menu** (Cursor-style) plus a **preview dock badge**
- Captures runtime errors from the **preview iframe** (same-origin / workspace bootstrap)
- Translates errors into plain language; raw stacks live under **Technical details**

## What it is not
- Not a full browser console
- Not a replacement for `IdeGrokActivityPanel` (that panel is Agent work progress)
- Not allowed to scrape the user’s entire browser outside the preview

## UI
| Surface | Behavior |
|---------|----------|
| Chat header pulse/alert button | Opens popover: status, up to 3 issue cards, Fix / Clear |
| Preview chrome badge | Green OK / red count — click opens the **same** chat menu (`nebula-open-app-status`) |

Default copy follows **user-communication-rules** Tier 1. Technical details are opt-in.
Menu chrome titles/actions **and** friendly issue bodies use IDE `t()` (`nebulla-project/language-system.md`); IssueCard re-maps on display so locale switches refresh copy.

## Events / store
Module: `src/lib/ideAppRuntimeStatus.ts`

- `nebula-app-runtime-issue` — new/deduped issue
- `nebula-app-runtime-cleared` — cleared
- `nebula-open-app-status` — open chat menu

Issue shape (conceptual):
`id, fingerprint, severity, friendlyTitle, friendlyBody, technicalMessage, stack?, route?, source, at`

## Capture
- Bridge: `src/lib/previewRuntimeBridge.ts`
- On same-origin iframe load: inject `onerror` / `unhandledrejection` / capped `console.error` → `postMessage`
- Cross-origin (e.g. v0 live): cannot read console; parent may still report iframe load failure
- Cleared on project key change

## Chat vs Agent
- **Fix with Agent** switches to Agent if needed (Discovery guard unchanged), then sends `[APP_STATUS_DEBUG]…`
- Chat mode never writes files from App Status alone
- Saying “it’s broken” while an issue exists auto-attaches the latest App Status payload for Verify

## NDM
When `[APP_STATUS_DEBUG]` is present, NDM **Verify** must use it — do not ask “what error do you see?”  
See `nebulla-project/debugging-method.md`.

## Privacy
- Truncate messages/stacks
- No secrets, no localStorage dumps
- Log counts only in `console.info` (no full stacks in host logs)
