# Nebula — persistent conversation memory

This document describes how Nebula stores **long-term conversation context** so the assistant can recall what was discussed across sessions (default **30 days** per entry).

## Where data lives

| Location | Purpose |
|:---------|:--------|
| **`conversation-logs/`** | Actual logs (not this file). One Markdown file per **user** × **project**. |
| **`conversation-log.md`** (this file) | Human-readable specification only. |

Directory layout:

```text
conversation-logs/
  <safe-user-id>/
    <safe-project-name>.md
```

- **User id**: Supabase user id when signed in; otherwise a stable anonymous id stored in the browser (`nebulla_device_user_id`).
- **Project**: Current project name from the IDE (sanitized for filenames).
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

1. **Before each chat request**, the server loads the pruned log for that user/project and injects it as an extra **system** message (after the main Nebula system prompt) so Grok sees prior dialogue.
2. **After a successful reply**, the latest user message and assistant reply are **appended** to the same file.

Restarting the dev server does not clear logs; they are files on disk under `conversation-logs/`.
