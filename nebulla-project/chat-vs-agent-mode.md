# Chat vs Agent (interaction mode)

User-controlled lock in the IDE chat header. Orthogonal to automatic detector modes (`guided` / `free` / `coding` / …).

| Mode | Purpose | Writes files? | Best for |
|------|---------|---------------|----------|
| **Chat** | Brainstorm, discovery, planning, research talk | No | Voice / Open talk; BYOK while thinking |
| **Agent** | Implement, Go, file apply, debug fixes | Yes (under Master Plan gates) | Building after the plan is ready |

## Why it exists

- With **BYOK**, every agent/tool turn spends the user’s key. Accidental coding during brainstorming is expensive and surprising.
- Nebulla’s voice path is strongest for long-form product conversation. Chat mode keeps that cheap, interruptible, and non-destructive.
- Auto `chatModeDetector` alone is not enough — users need an obvious lock.

## Defaults & persistence

- Default: **Chat** (including after Master Plan is complete).
- Persisted per project key in `localStorage` (`nebula-assistant-interaction-mode:<projectKey>`).
- Does **not** auto-switch on “sounds good” voice affirmations.

## Behavior

- **Chat + coding/debug/UI intent** → local reply with **Switch to Agent** / **Stay in Chat** (no Grok coding pipeline).
- **Chat + Go** → same CTA (Go is Agent-only).
- **Agent** → existing Go / `START_CODING` / `file:` apply path; Discovery / Master Plan gates still apply.
- System prompt appendix `USER_INTERACTION_MODE` reinforces the lock for the model.

### Fix with Agent (from App Status)

- Chat-header / preview **App Status** “Fix with Agent” switches to **Agent** when needed (same Discovery guard as the toggle).
- Do **not** silently write files while still in Chat.
- Sends a turn with `[APP_STATUS_DEBUG]` (primary + related issues, optional `ide_open_file`) so NDM Verify has evidence — see `nebulla-project/app-status-runtime.md`.
- Agent turns still include IDE/workspace appendix (`IDE_EDITOR_SURFACE`) like any normal Agent send.
- After a successful file apply: accessory nudges **Reload preview**; App Status auto-clears when the quiet window stays healthy.

## Related

- `nebulla-project/language-system.md` — IDE chrome `t()` + Chat/Plan `CONTENT_LOCALE` (applies to both Chat and Agent; personality stays Chat-only)
- `nebulla-project/chat-personality.md` — **UNBREAKABLE** Chat brainstorming personality + greeting
- `nebulla-project/chat-mode-detection.md` — detector sequence (Discovery → Architecture → Coding …)
- `nebulla-project/app-status-runtime.md` — preview health → NDM Verify
- `nebulla-project/ui-generation-logic-v2.md` §17 — **Generate UI** = UI Studio Beta + seed patterns (Figma optional); Legacy v0 Studio is advanced-only
- `src/lib/ideAssistantInteractionMode.ts` — types + storage helpers
- `src/components/ide/AIChat.tsx` — toggle UI + gates
