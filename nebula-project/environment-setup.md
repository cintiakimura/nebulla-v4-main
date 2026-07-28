> **Scope — Nebula Project (not Nebula Product)**  
> This file is part of **`nebula-project/`**: Nebula **Project** documentation (what variables *mean* and what implementers should expect). The code that *reads* these variables lives in **Nebula Product** (`lib/`, `server.ts`, etc.). See **`nebula-project/README.md`**.

---

# Environment setup — variable reference

This document is the **canonical list** of environment variables Grok and implementers should expect on each project’s Render Web Service (and in local `.env` for development). **Update this file** whenever the platform adds, renames, or deprecates a variable so automation and planning stay aligned with runtime code.

---

## 0. Bring Your Own Key (BYOK) — Nebulla product default

Nebulla’s **main product model** is that each **signed-in user** supplies their own AI API key(s) (Grok / xAI, Anthropic, OpenAI).

| Where | What |
|-------|------|
| **User account (encrypted DB)** | `XAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` saved via Onboarding or Secrets → `PUT /api/byok/keys`. AES-256-GCM via `NEBULA_SECRETS_ENCRYPTION_KEY` (or `SESSION_SECRET` in dev). |
| **Resolve order (chat/coding)** | User encrypted key → optional browser header (migration) → optional platform env fallback |
| **Not allowed** | Writing each user’s AI key into Nebulla’s **shared** Render Web Service env or the repo `.env` |

Status APIs (`GET /api/byok/status`, `/api/config`) return only `configured` + optional last-4 — **never** full keys.

---

## 1. Platform variables

These names and **values are shared across the Nebulla deployment** (ops-owned). Copy from the canonical Nebula vault. Do **not** use placeholders in production. These are **optional fallbacks** when a user has not saved BYOK keys.

| Variable | Role |
|----------|------|
| `MAIN_API_KEY_GROK` | Optional platform main AI brain fallback. Default model **grok-4** on xAI when using an xAI key. Legacy aliases: `MAIN_AI_API_KEY`, `GROK_API_KEY_LUMEN`. **Prefer user BYOK.** |
| `GROK_SWARM_API_KEY` | Nebula-owned swarm / sidecar Grok usage — **set only in Nebula `.env`**. |
| `GROK_TTS_NEW_API_KEY` | Grok TTS (new API) — **set only in Nebula `.env`**. |
| `NEBULA_SECRETS_ENCRYPTION_KEY` | Dedicated key for **AES-256-GCM** encryption of per-user BYOK secrets at rest (falls back to `SESSION_SECRET` in dev). **Required in production** if users save keys. |
| `GROK_3_API_KEY` | Grok B — Master Plan writer (separate from the main brain). |
| `PENCIL_API_KEY` | Nebula UI Studio → Pencil.dev mockups API. |
| `V0_API_KEY` | Optional platform v0 key. Users may also BYOK `V0_API_KEY` via browser header (separate from AI BYOK). |
| `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` | Optional platform Claude fallback (not per-user). |
| `OPENAI_API_KEY` | Optional platform OpenAI fallback (not per-user). |
| `FIGMA_API_KEY` | Optional. Figma personal access token for UI Generation Engine v2. Alone is not enough — see `FIGMA_REFERENCE_FILE_KEYS`. |
| `FIGMA_REFERENCE_FILE_KEYS` | Optional but required with the key for real layout extract. Comma-separated Figma **file keys**. |

Optional related keys: `PENCIL_API_URL`, model overrides such as `GROK_B_MODEL` — see `.env.example` and server code.

---

## 2. Variables from Render

These are **created or assigned when** the Render workspace, PostgreSQL instance, and Web Service exist. Read them from the Render dashboard or API; do not invent hostnames, ports, or URLs.

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Render PostgreSQL → **Connect** / connection string for **that** instance. Required for per-user encrypted BYOK storage. |
| `PUBLIC_SITE_URL` | Render Web Service → public **HTTPS** origin. Must match OAuth and email link bases. |

---

## 2b. Cloudflare D1 (per Nebulla project — user application data)

When a Nebulla project is created, the control plane **auto-provisions one Cloudflare D1 database** (if `CLOUDFLARE_API_TOKEN` + account id are set on the Nebulla server). IDs are stored on `nebula_projects` and written into the project workspace (`.env`, `.env.d1`, `nebula-d1.json`).

| Variable | Role |
|----------|------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id (same as R2 when using `R2_ACCOUNT_ID`) |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 database UUID — use as `database_id` in Workers `wrangler.toml` binding |
| `CLOUDFLARE_D1_DATABASE_NAME` | Human-readable D1 name |

**Do not** put the platform `CLOUDFLARE_API_TOKEN` into the generated app env (account-wide). Apps should use a Workers D1 binding with `CLOUDFLARE_D1_DATABASE_ID`.

---

## 3. User additional secrets (generated app deploys — not Nebulla BYOK)

This section is about secrets for a **customer’s generated app** on **that project’s own** Render Web Service — **not** about stuffing AI BYOK keys into the Nebulla platform service.

- **AI BYOK (Grok / Claude / OpenAI):** stay on the user account via `/api/byok/*` — see §0. Do **not** mirror them into Nebulla’s shared Render env.
- **Other app secrets** (Stripe for the user’s app, Twilio, etc.): when the user has a **dedicated** project deploy target, those may sync to **that** project’s Render service env so the generated app can read them.

When planning Tab 6 (**Environment Setup**) for a generated app, review Secrets and Integrations for non-BYOK integration keys that belong on the **app** service — keep Nebulla platform BYOK separate.
