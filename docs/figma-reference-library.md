# Figma reference library (Nebulla UI Generation)

**Purpose:** Stock a **local** shortlist so Generate UI reads offline/catalog structure — not live Figma by default.

**Sheet (catalog):** https://docs.google.com/spreadsheets/d/1PYQPOWzXnRiTn2j29db7fc9mprg2Yrc-KN5ESKfzo0o/edit?usp=sharing  

## Runtime order (Generate — single path)

1. Offline extracts (`structure/` then `raw/`) for resolved bucket keys  
2. Scored catalog profile  
3. Stitch / ui-brief (thinner)  
4. Seed patterns (last resort)  
5. Live Figma **only if** `FIGMA_LIVE_ON_GENERATE=1|true` **and** key set **and** offline + catalog miss  

Default: live **off**. Cap: 1 live file (max 2). On 429: stop live probes.

## Curated shortlist (owned keys only)

| Bucket | FileKey |
|--------|---------|
| mobile | `ZEbJpC67UQyeeynt1UR8gT` |
| landing | `P6lA9sHTHVbnmUfoYbV9Ir` |
| dashboard | `TgYmEqMwrWFHBxF2kAVOaF` |
| auth | `MaFREMBRF3vQ8BhtqA2ZpK` |

Committed lean extracts (safe, no secrets):  
`nebulla-project/figma-library/structure/<fileKey>/document.json`  

Full downloads (gitignored, optional):  
`nebulla-project/figma-library/raw/<fileKey>/document.json`  

When env vars are unset, Generate falls back to this shortlist + buckets so Render still hits `structure/`.

## Operator path (local + Render)

```bash
# 1) Optional: refresh full raw from Figma (ingest — live allowed here)
cp nebulla-project/figma-library/figma-keys.example.csv nebulla-project/figma-library/figma-keys.csv
# ensure FIGMA_API_KEY in .env
npm run figma:download

# 2) Build/refresh lean committed structure (also seeds missing buckets)
npm run figma:extract-structure -- --seed-missing

# 3) Optional: drafts → review → publish catalog profiles
npm run figma:profile-drafts
npm run figma:publish-drafts -- --only=<draft-id>

# 4) Generate UI — expect meta figma_status=offline (or catalog), not seed-by-default
```

**Render:** deploy the repo with `structure/` committed (already). Set optional `FIGMA_REFERENCE_*` to override. Do **not** set `FIGMA_LIVE_ON_GENERATE` unless you want rare live probes. `FIGMA_API_KEY` is for ingest jobs only.

Verify after Generate: `nebulla-project/ui-generation-v2-meta.json` →  
`figma.figma_status`, `figma.selection_mode`, `figma.preferred_bucket`, `pattern_mode`.

| Status / mode | Meaning |
|---------------|---------|
| `offline` / `offline:bucket:…` | Offline library drove layout |
| `skipped` / `local:catalog:…` | Catalog profile drove structure |
| `skipped` / `local:brief:…` | Brief-only (thin) |
| `weak_matches` / `local:seed:…` | Seed fallback |
| `success` / `live:…` | Rare live match |

## Env

- `FIGMA_API_KEY` — ingest / optional live Generate  
- `FIGMA_REFERENCE_FILE_KEYS` / `FIGMA_REFERENCE_BUCKETS` — override shortlist  
- `FIGMA_LIVE_ON_GENERATE` — default off  
- `FIGMA_REFERENCE_MAX_FILES` — offline scan width; live capped at 2  

**Ingest = live allowed. Generate = local-first.**
