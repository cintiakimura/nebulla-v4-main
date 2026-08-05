# UI Resource Catalog (FS pilot)

Hand-authored **Resource Profiles** for Nebulla UI Gen matching.

- **Local/dev/tests:** read from `profiles/*.json` (`UI_RESOURCE_CATALOG=fs`, default).
- **Production:** sync to Cloudflare **R2** (+ index.json). Not Render Postgres / SQL.

## Add a profile

1. Copy an existing JSON in `profiles/`.
2. Fill fields per `nebulla-project/ui-resource-profile.schema.json`.
3. Optionally add `previews/{id}.png` and set `preview_local`: `previews/{id}.png`.
4. Run `npm run test:ui-gen` (matching tests).

**From Figma kits (offline):** see `nebulla-project/figma-library/README.md` — `figma:download` → `figma:profile-drafts` → review `template_id` → `figma:publish-drafts`.

## Sync to Cloudflare R2

```bash
npm run ui-resources:sync-r2 -- --dry-run   # list profiles, no upload
npm run ui-resources:sync-r2               # upload when R2 env is configured
```

Requires existing R2 env (`CLOUDFLARE_*` / `R2_*`). Optional: `UI_RESOURCE_CATALOG=r2` at runtime.
FS remains production-capable for demos when R2 is unset.

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

**Grok must never:** invent freeform layout, new templates, product structure, or bypass the quality gate.

## Figma keys on profiles

Optional `figma_file_key` per profile. Prefer **bucket-tagged** env keys (`FIGMA_REFERENCE_BUCKETS=mobile=…,landing=…,dashboard=…`) over copying a mobile kit onto landing/dashboard profiles. Seed path stays valid when Figma is missing.
