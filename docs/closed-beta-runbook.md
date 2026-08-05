# Closed beta runbook

## Before each invite wave

1. `npm run check:ops` — expect `durableWorkspaceOk: true`, empty `warnings`
2. `FIGMA_PROBE_DELAY_MS=5000 npm run check:figma-refs` — PASS preferred; if 429, wait and retry
3. `npm test` + push so CI is green
4. `npm run smoke:prod -- https://nebulla.dev` (or Render URL)
5. Manual path once on prod: login → new project → Plan → Generate UI → one Go → App Preview

## Render env (minimum)

| Var | Notes |
|-----|--------|
| `SESSION_SECRET` | ≥16 chars, not a default |
| `NEBULA_SECRETS_ENCRYPTION_KEY` | dedicated, ≥16 chars |
| `WORKSPACE_STORAGE` | `dual` or `r2` |
| R2 credentials + bucket | required for dual/r2 |
| `PUBLIC_SITE_URL` | matches OAuth callbacks |
| `FIGMA_API_KEY` + `FIGMA_REFERENCE_*` | optional but recommended |
| `BILLING_ENABLED` | leave unset |
| `APP_PREVIEW_PUBLIC` | leave unset |

## During beta

- Watch `GET /api/health` (`warnings` count) and logs for 429 / 5xx
- Collect partner friction in one board; ship fixes before new features
- Do not enable Stripe until webhooks exist

## After closed beta → open free beta

- Landing + `BETA-STATUS.md` limitations still accurate
- Lawyer pass if EU traffic
- Rate limits + durable storage verified under light concurrent use
