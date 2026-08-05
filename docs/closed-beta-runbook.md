# Closed beta runbook

## Product surface (lean)

- **In:** login → project → Plan → UI Studio Beta → one Go → App Preview
- **Out (frozen):** Legacy V0 Studio APIs (410), Pencil live mockups — override only with `ENABLE_LEGACY_V0` / `ENABLE_PENCIL`
- **Keys:** one platform Grok key (`MAIN_API_KEY_GROK`); users BYOK in Secrets

## Before each invite wave

1. `npm run check:ops` — expect `durableWorkspaceOk: true`, empty `warnings`
2. `FIGMA_PROBE_DELAY_MS=5000 npm run check:figma-refs` — PASS preferred; if 429, wait and retry (do not block invites)
3. `npm test` + push so CI is green
4. `npm run smoke:prod -- https://nebulla.dev` (or Render URL) — require `/api/ops/readiness` 200
5. Manual path once on prod: login → new project → Plan → Generate UI → one Go → App Preview
6. Send invites from `docs/closed-beta-invite.md` (3 feedback questions)

## Render env (minimum)

| Var | Notes |
|-----|--------|
| `SESSION_SECRET` | ≥16 chars, not a default |
| `NEBULA_SECRETS_ENCRYPTION_KEY` | dedicated, ≥16 chars |
| `WORKSPACE_STORAGE` | `dual` or `r2` |
| R2 credentials + bucket | required for dual/r2 |
| `PUBLIC_SITE_URL` | matches OAuth callbacks |
| `MAIN_API_KEY_GROK` | platform AI (sidecars fall back here) |
| `FIGMA_API_KEY` + `FIGMA_REFERENCE_*` | optional but recommended |
| `ENABLE_LEGACY_V0` / `ENABLE_PENCIL` | leave unset |
| `BILLING_ENABLED` | leave unset |
| `APP_PREVIEW_PUBLIC` | leave unset |

## During beta

- Watch `GET /api/health` (`warnings` count) and logs for 429 / 5xx
- Collect partner friction with the three invite questions; ship fixes before new features
- Do not enable Stripe until webhooks exist
- Do not re-enable Legacy V0 / Pencil without a clear partner need

## After closed beta → open free beta

- Landing + `BETA-STATUS.md` limitations still accurate
- Lawyer pass if EU traffic
- Rate limits + durable storage verified under light concurrent use
