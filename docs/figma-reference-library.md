# Figma reference library (Nebulla UI Generation)

**Purpose:** Stock a **local** catalog so Generate UI picks by **sheet category/bucket** — not live Figma, and not only 4 hardcoded keys.

**Sheet (full catalog authority):** https://docs.google.com/spreadsheets/d/1PYQPOWzXnRiTn2j29db7fc9mprg2Yrc-KN5ESKfzo0o/edit?usp=sharing

Committed index: `nebulla-project/figma-library/sheet-catalog.json` (also `sheet-catalog.csv`).  
Re-import: `node scripts/import-figma-sheet-catalog.mjs path/to/sheet-export.csv`  
Expected CSV: **no header**, columns `category,url,file_key` — or a header with `category` / `title` / `design_url|url|link` / `file_key|filekey|key`.

## Runtime order (Generate — single path)

1. Classify device + page type + function (`classifyPage`) → **sheet bucket**
2. Load `sheet-catalog.json`, filter that bucket, **cap 3 keys** (prefer `structure/` then catalog profile)
3. Offline extracts (`structure/` then `raw/`) for those keys only
4. Thin catalog profile for the same key (still offline; no live download)
5. Scored seed catalog / Stitch brief
6. Seed patterns (last resort — only when no category match)
7. Live Figma **only if** `FIGMA_LIVE_ON_GENERATE=1|true` **and** key set **and** offline + catalog miss

Default: live **off**. Generate never scans all ~58 files. Cap: 1 live file (max 2). On 429: stop live probes.

## Four keys = fallback shortlist + committed `structure/`

| Bucket | FileKey | Role |
|--------|---------|------|
| mobile | `ZEbJpC67UQyeeynt1UR8gT` | Committed extract + fallback |
| landing | `P6lA9sHTHVbnmUfoYbV9Ir` | Committed extract + fallback |
| dashboard | `TgYmEqMwrWFHBxF2kAVOaF` | Committed extract + fallback |
| auth | `MaFREMBRF3vQ8BhtqA2ZpK` | Committed extract + fallback |

These are a **safety net** when `sheet-catalog.json` is missing — **not** the whole database.

Lean extracts: `nebulla-project/figma-library/structure/<fileKey>/document.json`  
Full downloads (gitignored): `nebulla-project/figma-library/raw/<fileKey>/document.json`

## Category → bucket

Sheet labels map to buckets (`mobile`, `auth`, `landing`, `dashboard`, `forms`, `ds`, `wireframe`). Unmapped labels become `ds` so they stay selectable. Education/kids uses the **mobile** bucket and avoids crypto/trading kits.

## Operator path (ingest = live; Generate = local)

```bash
# Refresh sheet index (optional)
node scripts/import-figma-sheet-catalog.mjs nebulla-project/figma-library/sheet-source.csv

# Daily ingest: max 10 live downloads / UTC day (priority: missing structure in core buckets)
npm run figma:ingest-daily

# Optional: extract committed structure after a download
npm run figma:extract-structure -- --seed-missing
```

**Render:** deploy with `sheet-catalog.json` + existing `structure/` (4 keys). Do **not** set `FIGMA_LIVE_ON_GENERATE` unless you want rare live probes. `FIGMA_API_KEY` is for ingest jobs only.

Verify after Generate: `nebulla-project/ui-generation-v2-meta.json` →  
`figma.preferred_bucket`, `figma.sheet_category`, `figma.file_key`, `figma.selection_mode`, `pattern_mode`.

| Status / mode | Meaning |
|---------------|---------|
| `offline` / `offline:sheet:bucket:…` | Offline `structure/` drove layout hints |
| `skipped` / `catalog:sheet:bucket:…` | Sheet catalog profile (no extract yet) |
| `skipped` / `local:catalog:…` | Other catalog profile |
| `skipped` / `local:brief:…` | Brief-only (thin) |
| `weak_matches` / `local:seed:…` | Seed fallback |
| `success` / `live:…` | Rare live match |

`pattern_mode`: `figma` if `structure/` used; `catalog` if only a profile; `seed` if no category match. Hints are **not** shipped Figma components.

## Env

- `FIGMA_API_KEY` — ingest / optional live Generate  
- `FIGMA_REFERENCE_FILE_KEYS` / `FIGMA_REFERENCE_BUCKETS` — optional overlay (tests/operators); sheet is default universe  
- `FIGMA_LIVE_ON_GENERATE` — default off  
- `FIGMA_REFERENCE_MAX_FILES` — live capped at 2  
- `FIGMA_INGEST_ACTIVE_BUCKET` — optional ingest priority (e.g. `mobile`)

**Ingest = live allowed. Generate = local-first. The sheet is the library.**
