# Figma library ingest (offline)

**Generate UI:** local-first — `structure/<fileKey>/document.json` (committed) → `raw/` (optional full download) → catalog → brief → seed. Live only with `FIGMA_LIVE_ON_GENERATE=1`.

**Ingest:** these scripts may call live Figma to refresh owned shortlist keys.

## Operator path

```bash
cp nebulla-project/figma-library/figma-keys.example.csv nebulla-project/figma-library/figma-keys.csv
# edit keys if needed (owned Duplicate keys only)

npm run figma:download
npm run figma:extract-structure -- --seed-missing
# commit updated structure/ so Render has offline hits without raw/

npm run figma:profile-drafts   # optional
npm run figma:publish-drafts -- --only=<id>
```

After deploy: Generate UI → meta should show `figma_status: offline` (or catalog), not seed-by-default. Live Figma not required.

## Paths

| Path | Role |
|------|------|
| `structure/{fileKey}/document.json` | **Committed** lean extracts — Generate primary |
| `raw/{fileKey}/document.json` | Full download (gitignored) |
| `figma-keys.example.csv` | Curated shortlist (mobile/landing/dashboard/auth) |
| `../ui-resource-catalog/profiles/` | Published catalog after review |

Do not mass-download Community. Shortlist only.

See `docs/figma-reference-library.md`.
