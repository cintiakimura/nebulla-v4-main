# Figma library ingest (offline)

Batch-download **owned** Figma FileKeys, draft `UiResourceProfile` JSON, then publish reviewed kits into the UI Gen catalog.

**Runtime (Generate UI):** **local-first** — offline `raw/<fileKey>/document.json` → published catalog + Stitch / ui-brief → seed last resort. Live Figma runs on Generate **only** when `FIGMA_LIVE_ON_GENERATE=1|true` **and** `FIGMA_API_KEY` is set **and** offline + catalog missed usable structure (max 1 file, cap 2).

**Ingest / refresh:** these scripts may call live Figma for multiple owned keys. That is intentional — keep library fresh so Generate stays local.

## Pipeline

```bash
# 1) Copy example → fill owned keys only (Duplicate Community files first)
cp nebulla-project/figma-library/figma-keys.example.csv nebulla-project/figma-library/figma-keys.csv
# edit figma-keys.csv — remove YOUR_OWNED_* placeholders

# 2) Download (reads FIGMA_API_KEY from .env automatically)
npm run figma:download
# or: npm run figma:download -- ./nebulla-project/figma-library/figma-keys.csv

# 3) Heuristic profile drafts (only after download succeeds)
npm run figma:profile-drafts

# 4) Review drafts (especially template_id), then publish selected ids
npm run figma:publish-drafts -- --only=figma_somekit_abcdefgh
```

`figma:profile-drafts` / `figma:publish-drafts` fail until step 2 has created `raw/` and drafts — that is expected.

## Paths

| Path | Role |
|------|------|
| `figma-keys.csv` | Ops shortlist (4 buckets) — gitignored; used by download + mirrors `.env` |
| `figma-keys.catalog.csv` | Full owned catalog from Sheet3 (machine buckets) — gitignored |
| `figma-keys.example.csv` | Committed example shortlist |
| `raw/{fileKey}/document.json` | Downloaded Figma file (Generate primary) |
| `download-manifest.json` | Resume + status |
| `profile-drafts/*.json` | Drafts with `_draft_meta` |
| `../ui-resource-catalog/profiles/` | Live catalog after publish |

`raw/`, manifests, drafts, and `figma-keys.csv` are gitignored. On Render, either run download for the shortlist in deploy/ops **or** ship safe non-secret offline/profile artifacts so Generate is not empty.

## Review before publish

For each draft confirm: `platform`, `page_types` (1–3), `density`, `personality`, and set **`template_id`** to a real v2 template when you want layout override (e.g. `landing_hero_features_cta`). Without `template_id`, match still helps preferred offline key resolution.

See `docs/figma-reference-library.md` for Duplicate / bucket env setup and the single Generate-time order.
