# Nebulla — beta status

**Status:** private / closed beta candidate (not a public open launch).  
**Billing:** off (`BILLING_ENABLED` unset). Free during beta.  
**Package:** `nebulla` @ 0.4.0  
**Lean cut:** Legacy V0 + Pencil live APIs frozen by default (`lib/betaLeanFlags.ts`).

## Critical path (invite wave)

Login → project → Plan → **UI Studio Beta** → one Go slice → App Preview.

## What works today

- Sign-in (GitHub / Google / email) and cloud projects with synthetic isolation ids (`cfproj_…`)
- IDE ride: Brainstorm → Plan (Master Plan + Mind Map) → **UI Studio Beta** → Code (Monaco) → preview
- UI Generation v2 (seed templates; Figma refs when env keys probe OK)
- BYOK Grok/xAI (`MAIN_API_KEY_GROK` platform fallback; sidecars reuse the same key unless overridden)
- Secrets, Security Risk Scan, Cloudflare DNS helpers (when configured)
- Workspace durability modes: `local` | `dual` | `r2` (production refuses unsafe `local` unless overridden)
- App Preview authz (grant cookie + `cfproj_` ownership)
- In-process rate limits on auth + chat/Go + UI generate
- CI: `.github/workflows/ci.yml` (lint / test / build)
- Legal pages: Privacy, Terms, DPA; account export / delete
- Landing + welcome onboarding: closed-beta / BYOK Grok only (no V0 step)

## Known limitations

- **Legacy v0 Studio** frozen (API **410** unless `ENABLE_LEGACY_V0=true`)
- **Pencil live mockups** frozen unless `ENABLE_PENCIL=true` (bundled demo SVG may still serve)
- **Nebulla Free monthly AI meter** is off by default; if chat shows a limit, it is almost always **xAI provider quota** on the platform key (add BYOK in Secrets) — not “Upgrade to Pro”
- **No dedicated Render workspace per customer** — shared Nebulla Render service; isolation = `cfproj_` (+ optional per-project D1)
- Stripe checkout UI exists but charging is dormant (no webhook tier upgrade yet)
- Rate limits are per-process memory (not Redis) — fine for single Render instance
- Figma quality depends on owned FileKeys + API rate limits; otherwise seed UI
- No public SLA; expect rough edges

## Local verification (2026-08-05)

- `npm test` — green (includes rate-limit + ops + grok-keys)
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
3. `MAIN_API_KEY_GROK` (+ optional `FIGMA_*`); leave `ENABLE_LEGACY_V0` / `ENABLE_PENCIL` unset
4. `PUBLIC_SITE_URL` + OAuth callbacks match the live host
5. Manual E2E: login → project → Plan → Generate UI → Go slice → App Preview
6. `APP_PREVIEW_PUBLIC` unset; `BILLING_ENABLED` unset for beta
7. Readiness: `GET /api/ops/readiness` and `GET /api/health`
8. Send invites using `docs/closed-beta-invite.md`

## How to get access / help

Invite-only. Security: `security@nebulla.dev`.

## Docs

- Invite copy: `docs/closed-beta-invite.md`
- Runbook: `docs/closed-beta-runbook.md`
- Figma: `docs/figma-reference-library.md`
- Trust Phase 1: `docs/trust/phase-1-checklist.md`
- Hybrid hosting: `docs/migration/render-to-cloudflare.md`
