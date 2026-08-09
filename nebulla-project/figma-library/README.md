# Figma library ingest (offline)

**Generate UI:** local-first — `structure/<fileKey>/document.json` (committed) → `raw/` (optional full download) → catalog → brief → seed. Live only with `FIGMA_LIVE_ON_GENERATE=1` (default **off**).

**Side ingest ≠ user Generate.** The daily job builds the offline library in the background. Master Plan / Go / UI Gen / coding never call or wait on it.

## Operator path (capped daily side job)

```bash
cp nebulla-project/figma-library/figma-keys.example.csv nebulla-project/figma-library/figma-keys.csv
# edit keys if needed (owned Duplicate keys only — never invent keys)

# Requires FIGMA_API_KEY. Max 10 file keys per UTC day. Sleep 8–10s between live calls.
# On HTTP 429 → status rate_limited and stop (no hammer).
npm run figma:ingest-daily
```

Watch progress:

1. **CLI** — prints `state=… today=N/10 remaining=… | message`
2. **File** — `nebulla-project/figma-library/ingest-status.json`
3. **API (dev/admin)** — `GET /api/admin/figma-ingest/status`  
   `POST /api/admin/figma-ingest/run` starts one job if idle (409 if already running).  
   Enabled when `NODE_ENV !== production` or `FIGMA_INGEST_API=1`.

### Status states

| `state` | Meaning |
|---------|---------|
| `idle` | Not running; may still have keys left |
| `running` | Actively downloading / extracting |
| `rate_limited` | Hit HTTP 429 — run stopped |
| `error` | Missing key / download or extract failure |
| `daily_cap_reached` | Already used today’s 10 slots |
| `complete_shortlist` | All shortlist keys have usable `structure/` |

### Stuck vs working

- **Working:** `state=running` and `updatedAt` refreshes at least every key (and during pacing sleeps).
- **Likely stuck:** `state=running` but `updatedAt` older than **15 minutes** (process killed mid-run). Re-run `npm run figma:ingest-daily` — stale lock/`running` is recovered to `idle`.

## Full bulk download (optional)

Uncapped sequential download (existing tools):

```bash
npm run figma:download
npm run figma:extract-structure -- --seed-missing
# or: npm run figma:extract-structure -- --key=<fileKey>
```

## Paths

| Path | Role |
|------|------|
| `structure/{fileKey}/document.json` | **Committed** lean extracts — Generate primary |
| `raw/{fileKey}/document.json` | Full download (gitignored) |
| `ingest-status.json` | Side-job status (gitignored) |
| `figma-keys.example.csv` | Curated shortlist (mobile/landing/dashboard/auth) |
| `figma-keys.csv` | Operator shortlist override (gitignored) |
| `../ui-resource-catalog/profiles/` | Published catalog after review |

Do not mass-download Community. Shortlist only. Do not enable live Figma on Generate by default.

See `docs/figma-reference-library.md`.
