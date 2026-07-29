# Render + Cloudflare D1 (Nebulla)

**Status:** Active hybrid plan (2026-07-29)  
**Locked:** App stays on **Render**. Platform auth DB → **Cloudflare D1**. No Neon. No Cloudflare Containers for hosting Nebulla.

## North star

| Piece | Where |
|-------|--------|
| Web / API / IDE | **Render** (`nebulla-v4-main`) |
| Platform auth DB (users, sessions, projects, BYOK) | **Cloudflare D1** when `PLATFORM_DB_DRIVER=d1` |
| Per-project app DBs | **Cloudflare D1** (auto via `lib/nebulaD1Provisioning.ts`) |
| Uploads / assets | **Cloudflare R2** |
| Custom domain DNS helpers | Cloudflare DNS API (later / optional) |

## Platform D1 — Render env checklist

Set on the **web service** environment (same names as local `.env`):

| Key | Required | Notes |
|-----|----------|--------|
| `PLATFORM_DB_DRIVER` | yes | Must be `d1` |
| `PLATFORM_D1_DATABASE_ID` | yes | Platform D1 UUID |
| `CLOUDFLARE_API_TOKEN` | yes | Account token with **D1 Edit** |
| `CLOUDFLARE_ACCOUNT_ID` or `R2_ACCOUNT_ID` | yes | Account id |
| `SESSION_SECRET` | yes | Keep existing |
| `NEBULA_SECRETS_ENCRYPTION_KEY` | if BYOK | Keep for secret continuity |

### After setting env

1. **Manual Deploy** on Render (env alone does not reload the process).  
2. Locally / CI (with same credentials): `npm run check:platform-d1` then `npm run migrate:platform-d1`.  
3. Smoke on the Render URL:
   - `GET /api/health` → OK  
   - `GET /api/config` → platform DB ready / no truncated-Postgres hint when driver is `d1`  
   - Sign-up / login / session  
4. Only then consider DNS cutover for `nebulla.dev` (separate phase).

With D1 active, a broken/truncated `DATABASE_URL` is **ignored** (legacy Postgres path only when driver is `postgres`).

**Data:** D4=A empty start — new users on D1; no Postgres dump required.

## Figma on the same Render service (optional)

| Key | Notes |
|-----|--------|
| `FIGMA_API_KEY` | Token with file content read |
| `FIGMA_REFERENCE_FILE_KEYS` | Owned `/design/<KEY>/` ids (not raw Community catalog IDs) |
| `FIGMA_REFERENCE_BUCKETS` | Optional `mobile=…,landing=…,dashboard=…` |
| `FIGMA_REFERENCE_MAX_FILES` | Default 3, max 8 |

See `docs/figma-reference-library.md`. Probe: `npm run check:figma-refs`.

## Legacy Postgres

Default remains `PLATFORM_DB_DRIVER=postgres` (or unset) using `DATABASE_URL` so existing deploys don’t break until you switch.

## Out of scope

- Neon as primary platform DB  
- Cloudflare Containers / Wrangler / Docker as the Nebulla app host  
- DNS cutover of `nebulla.dev` (separate phase after auth works on Render URL)

## Rollback

Set `PLATFORM_DB_DRIVER=postgres` and a valid full `DATABASE_URL`, or remove `PLATFORM_DB_DRIVER` — redeploy.
