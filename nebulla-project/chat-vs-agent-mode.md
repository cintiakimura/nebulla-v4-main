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

## Related

- `nebulla-project/chat-mode-detection.md` — detector sequence (Discovery → Architecture → Coding …)
- `src/lib/ideAssistantInteractionMode.ts` — types + storage helpers
- `src/components/ide/AIChat.tsx` — toggle UI + gates
