# Nebula — persistent conversation memory

This document describes how Nebula stores **long-term conversation context** so the assistant can recall what was discussed across sessions (default **30 days** per entry).

## Where data lives

| Location | Purpose |
|:---------|:--------|
| **`conversation-logs/`** | Actual logs (not this file). One Markdown file per **user** × **project key** (`projectKey` / disk scope). |
| **`conversation-log.md`** (this file) | Human-readable specification only. |
| **`conversationLog.ts`** (repo root) | Server module: append, load, retention, memory injection for Grok. |

Directory layout:

```text
conversation-logs/
  <safe-user-id>/
    <safe-project-key>.md
```

- **User id**: session user id when signed in; otherwise `anonymous` (aligned with Grok `userId`).
- **Project key**: Same value as the cloud workspace / browser `projectKey` (guest UUID, `default`, or cloud workspace id) — **not** the display name alone.
- **Project label**: Stored inside each file’s metadata table for humans; path uses **key** only.
- **Safe segments**: Non-alphanumeric characters are replaced so paths stay portable and safe.

## File format (each `*.md`)

Each log is a Markdown file with a small metadata table and a **Transcript** section. Entries look like:

```markdown
### 2026-04-19T12:00:00.000Z • user

What the user said.

### 2026-04-19T12:00:05.000Z • assistant

What the model replied.
```

## Retention and size

- Entries **older than 30 days** (by timestamp) are removed the next time the log is read or appended.
- When sending context to the model, the server may **truncate from the oldest** entries if the total text exceeds an internal limit (~100k characters), so very long histories stay usable.

## Behavior

1. **Before each chat request**, the server loads the pruned log for that user / **project key** and injects it as an extra **system** message (after the main Nebula system prompt) so Grok sees prior dialogue.
2. **After a successful reply** from `POST /api/grok/chat`, the latest user message and assistant reply are **appended** to the same file.
3. **Clients** (Partner sidebar, IDE chat) call **`GET /api/conversation-log`** (with `projectKey` + `projectName` query from the browser) to restore the visible transcript after reload or project open.

Restarting the dev server does not clear logs; they are files on disk under `conversation-logs/`.
