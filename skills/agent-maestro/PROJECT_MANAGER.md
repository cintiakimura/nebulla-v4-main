# Project Manager (control plane)

**Role:** infrastructure orchestration — not a chat persona. Product docs call this **Infrastructure Manager**; code and API paths use **Project Manager**. Runs **silently** (no user-facing messages).

**Canonical spec:** `skills/nebula-swarm/agents/PROJECT_MANAGER.md`

## When it runs

1. After **My services** onboarding actions (client `POST /api/control-plane/project-manager/run`).
2. After **`POST /api/projects`** (new or updated cloud project name).
3. Optional **manual** same endpoint (automation / internal tools only).

## What it does (summary)

- **Render:** ensures each `nebula_projects` row has a `workspace_id` (Render **project** id from Nebula’s Render API account, or synthetic `local-…` fallback).
- **Grok:** persists **only** the user’s main **`GROK_API_KEY`** override (encrypted at rest). Never writes `GROK_SWARM_API_KEY` or `GROK_TTS_NEW_API_KEY` (Nebula `.env` only).
- **Usage:** returns monthly token snapshot for dashboards (no chat).

## Security

- At-rest encryption uses `NEBULA_SECRETS_ENCRYPTION_KEY` (preferred) or derives from `SESSION_SECRET` in dev.
- Do not log decrypted keys or full API keys.
