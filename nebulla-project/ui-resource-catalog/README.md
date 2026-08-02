# UI Resource Catalog (FS pilot)

Hand-authored **Resource Profiles** for Nebulla UI Gen matching.

- **Local/dev/tests:** read from `profiles/*.json` (`UI_RESOURCE_CATALOG=fs`, default).
- **Production:** sync to Cloudflare **R2** (+ index.json). Not Render Postgres / SQL.

## Add a profile

1. Copy an existing JSON in `profiles/`.
2. Fill fields per `nebulla-project/ui-resource-profile.schema.json`.
3. Optionally add `previews/{id}.png` and set `preview_local`: `previews/{id}.png`.
4. Run `npm run test:ui-gen` (matching tests).

## Sync to Cloudflare R2

```bash
npm run ui-resources:sync-r2
```

Requires existing R2 env (`CLOUDFLARE_*` / `R2_*`). Optional: `UI_RESOURCE_CATALOG=r2` at runtime.

## Vision draft (optional)

```bash
npx tsx scripts/classify-ui-resource-preview.ts path/to/preview.png --fixture
```

Writes a **draft** JSON under `drafts/` for human review — does not overwrite published profiles.

## Grok assist (Phase G, optional)

When the generate call has an API key and `UI_RESOURCE_GROK_ASSIST` is not `0`:

1. **Brief refine** — structured JSON roles only (personality, density, dos/donts, a11y). Rejects layout fields.
2. **Rematch** — only if score below threshold / low confidence; Grok may pick from a pre-scored shortlist of profile ids.

Layout stays template-first. Slot polish remains separate (`polishSlotsForContentLocale`).
