# Nebulla — beta status

**Status:** private / closed beta candidate (not a public open launch).  
**Billing:** off (`BILLING_ENABLED` unset). Free during beta.  
**Package:** `nebulla` @ 0.4.0

## What works today

- Sign-in (GitHub / Google / email) and cloud projects with synthetic isolation ids (`cfproj_…`)
- IDE ride: Brainstorm → Plan (Master Plan + Mind Map) → **UI Studio Beta** → Code (Monaco) → preview
- UI Generation v2 (seed templates; Figma refs when env keys probe OK)
- BYOK AI keys (encrypted on account) with optional platform Grok fallback
- Secrets, Security Risk Scan, Cloudflare DNS helpers (when configured)
- Workspace durability modes: `local` | `dual` | `r2` (production refuses unsafe `local` unless overridden)
- App Preview authz (grant cookie + `cfproj_` ownership)
- In-process rate limits on auth + chat/Go + UI generate
- CI: `.github/workflows/ci.yml` (lint / test / build)
- Legal pages: Privacy, Terms, DPA; account export / delete

## Known limitations

- **Legacy v0 Studio** is disabled (UI Studio Beta only)
- **No dedicated Render workspace per customer** — shared Nebulla Render service; isolation = `cfproj_` (+ optional per-project D1)
- Stripe checkout UI exists but charging is dormant (no webhook tier upgrade yet)
- Rate limits are per-process memory (not Redis) — fine for single Render instance
- Figma quality depends on owned FileKeys + API rate limits; otherwise seed UI
- No public SLA; expect rough edges

## Local verification (2026-08-05)

- `npm test` — green (includes rate-limit + ops)
- `npm run check:ops` — dual storage, R2 ready, no warnings
- Figma probe — still **429** from Figma API (retry later; config is wired)
- `npm run smoke:prod -- https://nebulla.dev` — health/config OK; `/api/ops/readiness` **404 until this branch is deployed**

## Operator checklist (before invites)

```bash
npm run check:ops
FIGMA_PROBE_DELAY_MS=5000 npm run check:figma-refs
npm test
npm run smoke:prod -- https://YOUR_HOST
```

Deploy this branch to Render, then re-smoke until `/api/ops/readiness` returns 200.

On Render, confirm:

1. Strong `SESSION_SECRET` + `NEBULA_SECRETS_ENCRYPTION_KEY`
2. `WORKSPACE_STORAGE=dual` (or `r2`) + R2 credentials/bucket
3. Same `FIGMA_*` / AI keys as local when using those features
4. `PUBLIC_SITE_URL` + OAuth callbacks match the live host
5. Manual E2E: login → project → Plan → Generate UI → Go slice → App Preview
6. `APP_PREVIEW_PUBLIC` unset; `BILLING_ENABLED` unset for beta
7. Readiness: `GET /api/ops/readiness` and `GET /api/health`

## How to get access / help

Invite-only. Security: `security@nebulla.dev`.

## Docs

- Figma: `docs/figma-reference-library.md`
- Trust Phase 1: `docs/trust/phase-1-checklist.md`
- Hybrid hosting: `docs/migration/render-to-cloudflare.md`
