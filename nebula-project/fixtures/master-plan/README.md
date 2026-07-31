# Master Plan golden fixtures

Phase A baselines for future `MASTER_PLAN_STRICT` validation (Phase C).  
Keys use canonical names from `lib/masterPlanSections.ts`.

## Files

| Fixture | Intent |
|---------|--------|
| `good-crud-auth.json` | Complete §§1–5, page contracts, auth + RLS/PII |
| `thin-legacy.json` | Bare-minimum shape still common in the wild |
| `naive-insecure.json` | Has pages/features but missing security baseline |

## Expected gate results

| Fixture | `off` | `warn` | `strict` |
|---------|-------|--------|----------|
| `good-crud-auth.json` | pass | pass | pass |
| `thin-legacy.json` | pass (no checks) | pass + gaps (`legacy`, thin §4, weak §2) | **block** Go / incomplete |
| `naive-insecure.json` | pass (no checks) | pass + gaps incl. `SEC_*` | **block** until security baseline filled |

Gap code examples (Phase C): `PAGES_THIN`, `PAGE_MISSING_ACTIONS`, `SEC_RLS_MISSING`, `SEC_AUTH_MISSING`, `KPI_UNTESTABLE`, `UI_TOKENS_MISSING`, `RESEARCH_THIN`.

## How to use

```bash
npm run test:master-plan
```

- Validator: `lib/masterPlanCompleteness.ts`
- Status API: `GET /api/master-plan/status`
- Manual runbook: see `CHANGELOG-methodology.md` § A3

Plan-body tests use `checkUiBrief: false`. Go / status / UI Gen sync **auto-write** `nebula-ui-studio/ui-brief.md` from the Master Plan before checking.

Also: `npm run test:ui-brief` — asserts full §4 in ui-brief vs short v0-prompt distill.
