# Figma reference library (Nebulla UI Generation)

**Purpose:** Teach a beginner how to turn the Google Sheet catalog into a **local** Nebulla reference library that Generate UI reads first.

**Sheet (catalog):** https://docs.google.com/spreadsheets/d/1PYQPOWzXnRiTn2j29db7fc9mprg2Yrc-KN5ESKfzo0o/edit?usp=sharing  
Columns: `Bucket`, `Link`, `FileKey`.

## ELI5

1. Nebulla owns a **classified local library** (offline `raw/` + published catalog profiles).  
2. **Generate UI** reads that library first — it does **not** call live Figma by default.  
3. `FIGMA_API_KEY` = your Figma “library card” for **ingest / refresh** (`npm run figma:download`) and optional live Generate.  
4. `FIGMA_REFERENCE_FILE_KEYS` / `FIGMA_REFERENCE_BUCKETS` = which owned design notebooks map to mobile / landing / dashboard / auth.  
5. Links from **Figma Community** often **do not work** in the API until you **Duplicate** them into **your** Figma account, then copy the new key from `figma.com/design/<KEY>/...`.

## Runtime order (Generate UI — single path)

1. Offline extracts: `nebulla-project/figma-library/raw/<fileKey>/document.json`  
2. Published local catalog profiles (scored structure / classification hints)  
3. Stitch Design Brief + Master Plan §5 / ui-brief intelligence  
4. Internal seed patterns (**last resort**)  
5. Live Figma **only if** all hold: `FIGMA_LIVE_ON_GENERATE=1` (or `true`) **and** `FIGMA_API_KEY` set **and** offline + catalog did not yield usable structure  

Default: live **disabled** on Generate. When live is enabled, probe at most **1** file (hard cap **2**). On HTTP 429, stop further live probes and fall back local/seed.

| Status | Meaning |
|--------|---------|
| `offline` | Usable structure from offline `raw/` (not seeds) |
| `success` | Rare live Figma match (`FIGMA_LIVE_ON_GENERATE` on) |
| `skipped` | Catalog + Stitch / ui-brief guidance |
| `weak_matches` | Seed fallback (or live weak after optional probe) |
| `rate_limited` / `unauthorized` / `missing_key` / `failed` | Only when live was attempted (or key missing for ingest docs) |

Never report live `success` when only seeds ran.

## Starter keys (curated shortlist)

Ops CSV (gitignored): `nebulla-project/figma-library/figma-keys.csv`  
Full owned catalog (gitignored): `nebulla-project/figma-library/figma-keys.catalog.csv`  
Example shortlist (committed): `nebulla-project/figma-library/figma-keys.example.csv`

| Role (bucket) | Source | FileKey |
|---------------|--------|---------|
| mobile | Mobile UI kit (owned copy) | `ZEbJpC67UQyeeynt1UR8gT` |
| landing | Whitepace SaaS landing (owned) | `P6lA9sHTHVbnmUfoYbV9Ir` |
| dashboard | Metrix SaaS dashboard (owned) | `TgYmEqMwrWFHBxF2kAVOaF` |
| auth | App login / signup kit (owned) | `MaFREMBRF3vQ8BhtqA2ZpK` |

**Multi-bucket ops shortlist (recommended):**

```bash
FIGMA_REFERENCE_FILE_KEYS=ZEbJpC67UQyeeynt1UR8gT,P6lA9sHTHVbnmUfoYbV9Ir,TgYmEqMwrWFHBxF2kAVOaF,MaFREMBRF3vQ8BhtqA2ZpK
FIGMA_REFERENCE_BUCKETS=mobile=ZEbJpC67UQyeeynt1UR8gT,landing=P6lA9sHTHVbnmUfoYbV9Ir,dashboard=TgYmEqMwrWFHBxF2kAVOaF,auth=MaFREMBRF3vQ8BhtqA2ZpK
FIGMA_REFERENCE_MAX_FILES=4
# Optional rare live Generate probe (default off):
# FIGMA_LIVE_ON_GENERATE=1
```

Known bucket names: `mobile`, `landing`, `dashboard`, `auth`, `web`. Unknown names are ignored.

Curated shortlist only — do **not** mass-download all Community kits.

## Populate offline / catalog on Render

So Generate is not empty on the server:

1. **Ingest (live allowed here):** set `FIGMA_API_KEY` in CI/ops or a one-shot job.  
2. Copy shortlist CSV → `npm run figma:download` → `npm run figma:profile-drafts` → review → `npm run figma:publish-drafts`.  
3. Ship or sync safe non-secret artifacts: `raw/<key>/document.json` and/or published `ui-resource-catalog/profiles/*.json` (no tokens, no huge binaries).  
4. Set `FIGMA_REFERENCE_FILE_KEYS` / `BUCKETS` on the Web Service so offline scan resolves the same keys.  
5. Leave `FIGMA_LIVE_ON_GENERATE` unset unless you intentionally want a live probe.

If offline `raw/` is absent, generation still works: catalog → brief → seeds (no crash).

## Operator steps

1. Figma → Settings → **Personal access tokens** (file content read).  
2. Put token in `FIGMA_API_KEY` (local `.env` / ops). Do not commit it.  
3. Open the sheet → pick buckets (mobile / landing / dashboard / auth).  
4. For each Community link: **Duplicate** → copy key from `figma.com/design/<KEY>/...`.  
5. Set `FIGMA_REFERENCE_FILE_KEYS` + `FIGMA_REFERENCE_BUCKETS`.  
6. Run ingest scripts (below) so `raw/` + catalog profiles exist.  
7. Generate UI → check `nebulla-project/ui-generation-v2-meta.json` → `figma.figma_status`, `figma.selection_mode`, `figma.env_guidance`.

## Probe / ingest scripts

```bash
npm run check:figma-refs          # live probe helper for ops (not Generate default)
npm run figma:download -- ./nebulla-project/figma-library/figma-keys.csv
npm run figma:profile-drafts
npm run figma:publish-drafts -- --only=<draft-id>
```

**Ingest = live allowed. Generate = local-first.**

Details: `nebulla-project/figma-library/README.md`.

## Env names

- `FIGMA_API_KEY` — ingest + optional live Generate  
- `FIGMA_REFERENCE_FILE_KEYS` / `FIGMA_REFERENCE_BUCKETS`  
- `FIGMA_REFERENCE_MAX_FILES` — offline scan width (default 3–4, max 8); live Generate capped at 2  
- `FIGMA_LIVE_ON_GENERATE` — optional; `1` / `true` to allow live on Generate after local miss  
