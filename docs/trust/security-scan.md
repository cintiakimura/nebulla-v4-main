# Security Scan (Risks) — v1

In-app **pre-publish checklist** for the **active user project workspace** (not Nebulla’s own platform `src/`).

## Positioning

Security Scan is a guided audit for AI-built apps. It is **not** a professional penetration test or compliance certification. Absence of findings does not mean an app is secure.

## What is scanned (v1)

| Checker | Default | Notes |
|--------|---------|--------|
| Credentials / secrets | On | API key patterns, PEM keys, live `.env`, public env secret names, connection strings |
| Auth heuristics | On | Conservative; medium/low confidence unless strong signals |
| Headers / config | On | Advisory only when auth/payments signals exist |
| npm audit | Opt-in | Slower; toggle in UI; cached ~10 minutes per project |

## What is not scanned

- Full RLS / database permission proofs
- Automated “fix all” rewrites
- Nebulla platform repo (use `npm run check:client-secrets` in CI for that)

## Retention

- Scan reports are kept **in memory** on the server for `GET /api/security-scan/latest` (ephemeral; lost on restart).
- Evidence in findings is **redacted** (never full secrets).
- Dismissals are stored in the browser (`localStorage`) per project finding id.

## Contact

Product security questions: `security@nebulla.dev` (see Privacy Policy).
