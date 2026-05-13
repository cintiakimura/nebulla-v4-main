# Environment setup — variable reference

This document is the **canonical list** of environment variables Grok and implementers should expect on each project’s Render Web Service (and in local `.env` for development). **Update this file** whenever the platform adds, renames, or deprecates a variable so automation and planning stay aligned with runtime code.

---

## 1. Platform variables

These names and **values are shared across every Nebula project**: copy the same Nebula-owned vendor keys from the canonical Nebula configuration (for example the nebulla-v3 repo `.env` / vault). Do **not** use placeholders in production.

| Variable | Role |
|----------|------|
| `GROK_API_KEY` | Grok 4 — primary brain (chat, orchestration). |
| `GROK_TTS_NEW_API_KEY` | Grok TTS (new API) for text-to-speech. |
| `GROK_3_API_KEY` | Grok B — Master Plan writer (separate from the main brain). |
| `PENCIL_API_KEY` | Nebula UI Studio → Pencil.dev mockups API. |

Optional related keys (only if your deployment diverges from defaults): `PENCIL_API_URL`, model overrides such as `GROK_B_MODEL` — see `.env.example` and server code.

---

## 2. Variables from Render

These are **created or assigned when** the Render workspace, PostgreSQL instance, and Web Service exist. Read them from the Render dashboard or API; do not invent hostnames, ports, or URLs.

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Render PostgreSQL → **Connect** / connection string for **that** instance (internal or external URL as appropriate). Paste verbatim. |
| `PUBLIC_SITE_URL` | Render Web Service → public **HTTPS** origin (assigned URL or custom domain). Must match OAuth and email link bases for that deployment. |

---

## 3. User additional secrets

Anything the user adds on the dashboard page **Secrets and Integrations** (API keys, tokens, third-party secrets) must be **mirrored** to that **same project’s** Render Web Service **environment variables** for the running app to see them.

- **On create:** after the deploy target exists, perform an initial sync so Render env matches what the user saved.
- **On update:** every add, edit, or remove on Secrets and Integrations should trigger an **idempotent** sync to Render (names aligned with what the server expects).
- **Source of truth for production:** the process reads **Render env** for that service; the dashboard is the editor, not a browser-only store.

When planning or generating Tab 6 (**Environment Setup**) work, review Secrets and Integrations for the active project so no user-supplied integration is missing from the Render env checklist.
