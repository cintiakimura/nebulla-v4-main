# Phase 1 complete checklist (GDPR product baseline)

Implemented in-repo (2026-07-28). Lawyer review still recommended before public EU launch.

- [x] Phase 0 data map: `docs/trust/phase-0-data-map.md`
- [x] Privacy Policy rewritten (subprocessors, AI, retention, rights, contacts)
- [x] Terms refreshed + DPA link
- [x] DPA template at `/legal/dpa`
- [x] App routes: `/privacy`, `/terms`, `/legal/dpa`, `/reset-password`
- [x] Account: AI providers blurb, data export, legal/security links, clearer delete copy
- [x] `GET /api/auth/data-export` (JSON; no plaintext keys)
- [x] Delete account also removes `conversation-logs/<userId>/`
- [x] Production boot refuses weak `SESSION_SECRET` / `NEBULA_SECRETS_ENCRYPTION_KEY`
- [x] `npm run check:client-secrets` (+ included in `npm test`)

**Not in Phase 1:** SOC 2 claims, audit log table, CI npm audit fail-on-critical (Phase 2).

**Security Scan (product):** In-app Risk Scan v1 shipped — see `docs/trust/security-scan.md`. Guided checklist for user project workspaces (credentials + auth heuristics + optional npm audit). Not a pen-test; not a compliance claim.

**Ops reminder:** set strong `SESSION_SECRET` and `NEBULA_SECRETS_ENCRYPTION_KEY` on Render before next production deploy.
