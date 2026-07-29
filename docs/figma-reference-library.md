# Figma reference library (Nebulla UI Generation)

**Purpose:** Teach a beginner how to turn the Google Sheet catalog into working Nebulla env vars.

**Sheet (catalog):** https://docs.google.com/spreadsheets/d/1PYQPOWzXnRiTn2j29db7fc9mprg2Yrc-KN5ESKfzo0o/edit?usp=sharing  
Columns: `Bucket`, `Link`, `FileKey`.

## ELI5

1. `FIGMA_API_KEY` = your Figma “library card” (secret token).  
2. `FIGMA_REFERENCE_FILE_KEYS` = which design notebooks Nebulla may open.  
3. Nebulla only opens the **first few** keys (default **3**, override with `FIGMA_REFERENCE_MAX_FILES`).  
4. Links from **Figma Community** often **do not work** in the API until you **Duplicate** them into **your** Figma account, then copy the new key from `figma.com/design/<KEY>/...`.

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

After you duplicate 2 more community files, append their **new** `/design/` keys:

```bash
FIGMA_REFERENCE_FILE_KEYS=ZEbJpC67UQyeeynt1UR8gT,<landingDesignKey>,<dashboardDesignKey>
```

## Operator steps

1. Figma → Settings → **Personal access tokens** (or fine-grained token with **file content read**).  
2. Put token in `FIGMA_API_KEY` (local `.env` + Render). Do not commit it.  
3. Open the sheet → pick buckets (mobile / landing / dashboard).  
4. For each Community link: open → **Duplicate** / Open in Figma → copy key from the URL `figma.com/design/<KEY>/...`.  
5. Set `FIGMA_REFERENCE_FILE_KEYS=key1,key2,key3`.  
6. Restart Nebulla locally, or set the same vars on Render and **Manual Deploy**.  
7. Generate UI → check meta: `figma.figma_status` should be `success` when structure extracts (or a clear error / `weak_matches` — never a fake success).

## Probe script

```bash
npm run check:figma-refs
```

Prints PASS/FAIL per key (never prints the token).

## Token note

Fine-grained `figd_` tokens may **403** on `GET /v1/me` if they lack `current_user:read`. That is OK — Nebulla probes **files** for layout. File reads need access to those files + file content scope.

## Render env names (values from your password manager / local `.env`)

- `FIGMA_API_KEY`  
- `FIGMA_REFERENCE_FILE_KEYS`  
- optional: `FIGMA_REFERENCE_MAX_FILES` (default `3`)
