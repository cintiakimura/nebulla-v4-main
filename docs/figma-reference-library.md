# Figma reference library (Nebulla UI Generation)

**Purpose:** Teach a beginner how to turn the Google Sheet catalog into working Nebulla env vars.

**Sheet (catalog):** https://docs.google.com/spreadsheets/d/1PYQPOWzXnRiTn2j29db7fc9mprg2Yrc-KN5ESKfzo0o/edit?usp=sharing  
Columns: `Bucket`, `Link`, `FileKey`.

## ELI5

1. `FIGMA_API_KEY` = your Figma “library card” (secret token).  
2. `FIGMA_REFERENCE_FILE_KEYS` = which design notebooks Nebulla may open (comma-separated owned keys).  
3. `FIGMA_REFERENCE_BUCKETS` (optional) = tag keys by page family so landing/dashboard do not steal a mobile kit.  
4. Nebulla only opens the **first few** keys (default **3**, override with `FIGMA_REFERENCE_MAX_FILES`, max **8**).  
5. Links from **Figma Community** often **do not work** in the API until you **Duplicate** them into **your** Figma account, then copy the new key from `figma.com/design/<KEY>/...`.

## Starter keys (curated)

| Role | Source | FileKey | API probe (2026-07-29) |
|------|--------|---------|-------------------------|
| Mobile screens | Sheet `/design/` copy | `ZEbJpC67UQyeeynt1UR8gT` | **OK** (~37 frames) |
| Landing / web | Sheet community e.g. Whitepace `1156860863353724933` | *(duplicate first)* | Community ID → **404** until duplicated |
| Dashboard / admin | Sheet e.g. Metrix `1149477096761797772` or TailAdmin `1214477970819985778` | *(duplicate first)* | Community ID → **404** until duplicated |
| Auth (optional) | Sheet e.g. `1335900219638650169` | *(duplicate first)* | Community ID → **404** until duplicated |

**Local starter (works today with one owned file):**

```bash
FIGMA_REFERENCE_FILE_KEYS=ZEbJpC67UQyeeynt1UR8gT
```

**Multi-bucket (optional — quality for varied page types, not mandatory):**

```bash
FIGMA_REFERENCE_FILE_KEYS=ZEbJpC67UQyeeynt1UR8gT,<landingDesignKey>,<dashboardDesignKey>
FIGMA_REFERENCE_BUCKETS=mobile=ZEbJpC67UQyeeynt1UR8gT,landing=<landingDesignKey>,dashboard=<dashboardDesignKey>
```

Known bucket names: `mobile`, `landing`, `dashboard`, `auth`, `web`. Unknown names are ignored.

- One owned mobile file is enough for **mobile-focused** generation.  
- Multi-bucket only matters when you generate **landing / dashboard / web** and want Figma structure that matches.

## Operator steps

1. Figma → Settings → **Personal access tokens** (or fine-grained token with **file content read**).  
2. Put token in `FIGMA_API_KEY` (local `.env` + Render). Do not commit it.  
3. Open the sheet → pick buckets (mobile / landing / dashboard).  
4. For each Community link: open → **Duplicate** / Open in Figma → copy key from the URL `figma.com/design/<KEY>/...`.  
5. Set `FIGMA_REFERENCE_FILE_KEYS=key1,key2,key3` (and optional `FIGMA_REFERENCE_BUCKETS=...`).  
6. Restart Nebulla locally, or set the same vars on Render and **Manual Deploy**.  
7. Generate UI → check meta: `nebulla-project/ui-generation-v2-meta.json` → `figma.figma_status`, `figma.figma_error`, `figma.env_guidance`, `figma.key_diagnostics`.  
   - `success` only when structure extracts.  
   - Never a fake success on seed fallback (`weak_matches` / `missing_key` / `unauthorized` / `failed`).

## Probe script

```bash
npm run check:figma-refs
```

Prints PASS/FAIL **per key** with HTTP outcome (never prints the token). Also prints parsed `FIGMA_REFERENCE_BUCKETS` if set.

## Offline library ingest (optional)

Build an internal raw + profile catalog **without** calling Figma on every Generate UI:

```bash
cp nebulla-project/figma-library/figma-keys.example.csv nebulla-project/figma-library/figma-keys.csv
# edit figma-keys.csv — owned FileKeys only (Duplicate Community first)

export FIGMA_API_KEY=figd_…
npm run figma:download -- ./nebulla-project/figma-library/figma-keys.csv
npm run figma:profile-drafts
# review drafts (set/confirm template_id), then:
npm run figma:publish-drafts -- --only=<draft-id>
```

Details: `nebulla-project/figma-library/README.md`. Runtime still uses env keys + seed until profiles are published.

## Failure path (engine)

```text
missing FIGMA_API_KEY → missing_key → seed
/me 401 → unauthorized → seed
/me 429 → rate_limited → seed
/me 403 → continue (OK for fine-grained tokens)
empty keys → weak_matches + env_guidance → seed
bucket tag missing for this page type → weak_matches (seed; avoids wrong mobile kit)
per file: 404 / 401|403 / 429 / 5xx(retry once) / extract score
bestScore < 4 → weak_matches → seed
else → success + structure_hints
network/throw → failed → seed
```

## Token note

Fine-grained `figd_` tokens may **403** on `GET /v1/me` if they lack `current_user:read`. That is OK — Nebulla probes **files** for layout. File reads need access to those files + file content scope.

## Render env names (values from your password manager / local `.env`)

- `FIGMA_API_KEY`  
- `FIGMA_REFERENCE_FILE_KEYS`  
- optional: `FIGMA_REFERENCE_BUCKETS`  
- optional: `FIGMA_REFERENCE_MAX_FILES` (default `3`, max `8`)
