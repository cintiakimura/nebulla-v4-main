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

## Platform D1 (operator — do this on Render)

Set on the **web service** environment (same names as local `.env`):

| Key | Notes |
|-----|--------|
| `PLATFORM_DB_DRIVER` | `d1` |
| `PLATFORM_D1_DATABASE_ID` | Platform D1 UUID |
| `CLOUDFLARE_API_TOKEN` | Account token with **D1 Edit** |
| `CLOUDFLARE_ACCOUNT_ID` or `R2_ACCOUNT_ID` | Account id |
| `SESSION_SECRET` | Keep existing |
| `NEBULA_SECRETS_ENCRYPTION_KEY` | Keep if you need BYOK continuity |

Then: Manual Deploy. Locally / CI: `npm run check:platform-d1` then `npm run migrate:platform-d1`.

With D1 active, a broken/truncated `DATABASE_URL` is **ignored** (legacy Postgres path only when driver is `postgres`).

**Data:** D4=A empty start — new users on D1; no Postgres dump required.

## Legacy Postgres

Default remains `PLATFORM_DB_DRIVER=postgres` (or unset) using `DATABASE_URL` so existing deploys don’t break until you switch.

## Out of scope

- Neon  
- Cloudflare Containers / Wrangler / Docker as the Nebulla app host  
- DNS cutover of `nebulla.dev` (separate phase after auth works on Render URL)

## Rollback

Set `PLATFORM_DB_DRIVER=postgres` and a valid full `DATABASE_URL`, or remove `PLATFORM_DB_DRIVER` — redeploy.
