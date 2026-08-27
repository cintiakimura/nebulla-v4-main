# Nebulla UI Generation Logic v2
## Stitch-like Constrained Generator Spec

This replaces the weak freeform node-generation approach.
UI Studio Beta must generate screens using constrained layout grammar, forced Figma reference access, Master Plan guidelines as hard tokens, and content mapping into slots.

Authority order:
1. This v2 logic
2. `nebulla-project/ui-generation-engine-manual.md` for cycle discipline
3. `nebulla-project/ui-generation-context.md` as cycle memory
4. **`nebula-ui-studio/ui-brief.md`** (primary UI input — full §4 page contracts + §5 tokens; auto-written from Master Plan)
5. Master Plan product truth (§1–§5; §5 = tokens)
6. Generated workspace files for concrete labels/routes/actions

Law of the Land: `nebula-project/project-execution-rules.md` (UI Gen Beta primary; V0/`v0-prompt.md` optional legacy).

If old freeform behavior conflicts with this spec, this spec wins.

---

## 0. Goal

Produce usable, structured, visually coherent UI for UI Studio Beta.

Not acceptable:
- floating disconnected boxes
- raw Master Plan prose as titles
- route slugs as subtitles
- one generic button only
- style corruption errors
- ignoring §5 design direction
- pretending Figma was used when it was not

Acceptable:
- constrained screen templates
- real hierarchy
- real sections
- real actions
- applied design tokens
- honest Figma status
- polished fallback when Figma fails

---

## 1. Core principle

Generate in this exact order only:

1. Classify page
2. Choose layout template family
3. Force Figma reference retrieval
4. Adapt references into template slots
5. Build design tokens from ui-brief / Master Plan §5
6. Map content into slots from **ui-brief** + Master Plan + generated files
7. Render constrained editor model + code
8. Validate with hard quality gate
9. Deliver to UI Studio Beta

Never jump from Master Plan text directly to freeform boxes. Prefer page bodies parsed from `ui-brief.md` when present.

---

## 1.1 Mockup vs final UI

The pre-code mockup (UI Studio Beta / App Preview shell) is a **temporary engagement / structure preview** so the user is not staring at a blank screen while plan/coding run. It is **not** the source of truth for the product.

| Layer | Role | Source of truth |
|-------|------|-----------------|
| Pre-code mockup (UI Studio Beta / App Preview shell) | Fast draft to orient the user; may be incomplete; **must still meet Stitch-minimum structure** | Templates + local refs + brief — **preview only** |
| Master Plan / inference / architecture / pages / features | What the product **is** | Plan + execution rules + coding contracts |
| Post-code Final UI | Restyle after product files exist | Offline sheet catalog + file facts; CSS vars on Nebulla `globals.css`; **does not clone Figma into `app/`** |
| Foundation / Go coding (`app/`, `src/`, real components) | Real product implementation | Plan + coding rules — **NOT mockup pixels** |

**Preview authority (runtime):** App Preview bootstrap must distinguish layers. Pre-code may serve the static UI Gen shell (`index.html` and/or `public/nebula-ui-gen-preview.html`) labeled **Pre-code mockup only**. After meaningful product UI source exists under `app/` / `src/` / `pages/` / `components/`, App Preview must **not** present that mockup as the live product — prefer a real app entry/build when available; otherwise an honest post-code bridge. Post-code UI Gen may refresh Studio + the dedicated mockup artifact; it must not permanently own live Preview.

Normative rules:
1. Mockup may change after coding finishes — that is expected and desired.
2. Coding must **not** implement features by visually cloning the mockup.
3. Coding follows Master Plan, architecture, page list, features, and project-execution / inference-first logic.
4. If mockup and plan disagree, **plan wins**.
5. After successful foundation apply of UI-relevant paths, run **Final UI once** (offline catalog → Studio preview-model + optional CSS variables). Optionally once more after the last autopilot slice (Polish). Max two autopilot Final UI runs. Do not overwrite coded routes with the mockup tree. Live Figma is ingest-only.
6. Pre-code mockup still must not be garbage (Stitch-minimum). “Temporary” ≠ “Email on Kid Home.”
7. Post-code regen still uses local-first references + brief + **file grounding**; meta must record `phase: post_code` (or equivalent).
8. Status copy must distinguish: **Pre-code mockup** | **Final UI (offline catalog)** | **Live app preview** (coded app; CSS vars if `globals.css` is Nebulla-generated).

---

## 2. Inputs

Required inputs for each generation cycle:

### 2.0 UI brief (primary — when present)
- Path: `nebula-ui-studio/ui-brief.md`
- Full §4 page contracts (not an 8-route distill)
- §5 design tokens
- Security/authz notes that affect UI
- Product auto-syncs this from Master Plan on save / Go / status / UI Gen cycle

### 2.1 Master Plan
- §1 Goal
- §2 Tech/research (+ security baseline when auth/data)
- §3 Features/KPIs
- §4 Pages and navigation
- §5 UI/UX design (concise tokens, ≤15–25 lines)

### 2.2 Generated files
- routes
- page names
- headings
- button labels
- component names
- nav structures if present

### 2.3 Runtime
- active project workspace
- page target if selected
- regeneration count
- optional preference feedback

### 2.4 External
- `FIGMA_API_KEY` when available (secret token; local `.env` + Render)
- `FIGMA_REFERENCE_FILE_KEYS` — comma-separated file keys from `figma.com/file/<KEY>/...` (required together with the API key for real structure extract)
- curated Figma reference library / file keys if configured
- internal seed pattern library as fallback

**Render note:** set **both** `FIGMA_API_KEY` and `FIGMA_REFERENCE_FILE_KEYS` on the Web Service env, then redeploy/restart. After Generate UI, read `nebulla-project/ui-generation-v2-meta.json` → `figma.figma_status`, `figma.fallback_used`, `figma.env_guidance`.

---

## 3. Cycle memory

Every cycle must write to:
- `nebulla-project/ui-generation-context.md`
- `nebulla-project/ui-generation-cycle.json`
- `nebulla-project/ui-generation-preview-model.json`
- `nebulla-project/ui-generation-output.tsx`

Must record:
- classification
- chosen template
- figma_status
- selected references
- tokens
- slot content
- quality_gate_result
- regeneration_count

---

## 4. Phase A — Classify page

### A.1 Determine device
- mobile
- web
- landing

Source priority:
1. Master Plan project type
2. generated files (BottomNav, app/, expo, etc.)
3. conservative default

### A.2 Determine page type
Allowed values:
- home
- dashboard
- list
- detail
- auth
- settings
- profile
- checkout
- landing
- empty
- other

### A.3 Determine product function
Examples:
- course
- tasks
- saas_admin
- ecommerce
- booking
- community
- marketing
- general

### A.4 Determine navigation mode
- bottom_tabs
- top_nav
- sidebar
- none

### A.5 Write classification
Do not continue until classification is written to context.

---

## 5. Phase B — Choose layout template family

Generation may only use approved template families.

### B.1 Mobile app templates
1. `mobile_home_hero_cards`
2. `mobile_list_actions`
3. `mobile_dashboard_metrics`
4. `mobile_settings_groups`
5. `mobile_auth_form`
6. `mobile_detail_sections`
7. `mobile_empty_state`

### B.2 Web app templates
1. `web_dashboard_sidebar`
2. `web_list_table`
3. `web_settings_two_column`
4. `web_detail_header_content`
5. `web_auth_center_card`

### B.3 Landing templates
1. `landing_hero_features_cta`
2. `landing_pricing_sections`

### B.4 Template selection rules
- home + mobile + metrics/features → `mobile_home_hero_cards` or `mobile_dashboard_metrics`
- list/tasks/feed → `mobile_list_actions` or `web_list_table`
- settings → settings template
- auth → auth template
- if uncertain, choose the simplest valid template for device + page type

### B.5 Template means structure, not final art
A template defines:
- regions
- slot names
- stacking rules
- spacing rules
- allowed components

It does not allow free-floating absolute chaos.

---

## 6. Phase C — Forced Figma resource access

### C.1 Local library first on Generate (live opt-in)
Generate UI resource order (must match `figmaReferences.ts`):
1. **PRIMARY for the first pre_code mockup:** offline committed `nebulla-project/figma-library/structure/<fileKey>/document.json` by bucket (`mobile` / `auth` / `landing` / `dashboard`)
2. `raw/<fileKey>/document.json` if present
3. published catalog profiles
4. Stitch / ui-brief floor
5. seed last

Live Figma on Generate runs **only** when `FIGMA_LIVE_ON_GENERATE=1|true` **and** `FIGMA_API_KEY` is set **and** offline + catalog did not yield usable structure (default: live off).  
Ingest/refresh scripts (`figma:download`, profile-drafts, publish) remain the place that may call live Figma for owned keys.  
Never report `offline` or live `success` when only seeds ran. If offline/catalog miss and live is off/unavailable, status is `weak_matches` / `skipped` (not fake success) and seed fallback is used.

### C.2 Required Figma status values
Exactly one:
- `success` (rare live match)
- `offline` (usable offline library)
- `failed`
- `missing_key`
- `unauthorized`
- `rate_limited`
- `weak_matches` (seed fallback / live weak)
- `skipped` (catalog + brief guidance)

### C.3 Retrieval criteria ordered by priority
1. device
2. page type
3. product function
4. navigation mode
5. industry if known
6. density/tone

### C.4 What to extract from Figma
Prefer structural guidance:
- section order
- card patterns
- nav pattern
- hierarchy
- spacing rhythm
- component grouping

Do not copy decorative noise blindly.

### C.5 If Figma fails
Continue with internal seed pattern library.
Never stop the whole generation only because Figma failed.
But never claim Figma success if fallback was used.

### C.6 Write Figma record before continuing
Must include:
- figma_used
- figma_status
- figma_error if any
- candidate refs
- selected refs
- fallback_used

---

## 7. Phase D — Design tokens from Master Plan §5

§5 is hard law when present.

### D.1 Extract tokens
Parse and normalize:
- background
- surface/card
- primary
- accent
- text
- muted text
- border
- radius
- spacing density
- shadow policy
- tone keywords

Example from a plan:
- bg `#0A0B14`
- card `#11131F`
- blue `#3B82F6`
- purple `#7C3AED`
- pink `#C026D3`
- radius `12`
- density spacious

### D.2 Token object shape
All visual values must live in a token object, never as ad-hoc random strings assigned onto wrong fields.

Example shape:
```json
{
  "bg": "#0A0B14",
  "surface": "#11131F",
  "primary": "#3B82F6",
  "accent": "#7C3AED",
  "text": "#FFFFFF",
  "mutedText": "#A1A1AA",
  "border": "#1F2937",
  "radius": 12,
  "gap": 16,
  "pad": 16
}
```

### D.3 Style safety rule
Never assign a hex string where a style object is required.
Never do:
- `node.style = "#0A0B14"`
- `backgroundColor = { something wrong }`

Always:
- `node.style.backgroundColor = tokens.bg`

If a style field is missing, create a valid style object first.

### D.4 If §5 missing
Use a clean neutral professional default token set.
Do not invent neon chaos.

---

## 8. Phase E — Content mapping into slots

### E.1 Slot system
Every template has named slots.
Examples for `mobile_home_hero_cards`:
- `nav_title`
- `hero_title`
- `hero_subtitle`
- `primary_cta`
- `secondary_cta`
- `card_1_title`
- `card_1_value`
- `card_2_title`
- `card_2_value`
- `card_3_title`
- `card_3_value`

### E.2 Content sources
Fill slots from:
1. generated file labels/headings/buttons
2. Master Plan page purpose and features
3. safe short derived labels

### E.3 Clean label rules
Visible text must be human and short.
Forbidden visible text:
- full page purpose paragraphs
- route paths
- raw JSON
- internal engine notes
- “Primary” / “Secondary” unless no better label exists

Examples:
- good: `Home`, `Continue`, `Start Practice`, `Today’s tasks`
- bad: `Tasks screen () - shows today’s micro-tasks as a vertical list...`
- bad: `/tasks-screen-shows-today-s-micro-ta`

### E.4 Missing content
If a slot has no real content:
- use a minimal honest placeholder
- or omit optional slot
Do not fabricate a different product.

---

## 9. Phase F — Constrained render

### F.1 Render only through template regions
Each region is a vertical/horizontal stack with explicit:
- direction
- gap
- padding
- alignment
- width rules

No free-float scattered absolute boxes unless a template explicitly needs one controlled overlay.

### F.2 Component whitelist
Allowed components:
- screen
- nav_bar
- top_bar
- bottom_tabs
- hero
- section
- card
- metric_card
- list
- list_item
- button_primary
- button_secondary
- text_title
- text_body
- text_muted
- form_field
- divider
- empty_state

Do not invent uncontrolled random shapes.

### F.3 Editor model requirements
The preview model must:
- use valid style objects only
- use parent/child relationships for layout
- be selectable in Properties
- preserve tokens in styles
- remain stable after save/reload

### F.4 Code output requirements
Also emit React + Tailwind page code that mirrors the same structure.
Code is secondary to constrained preview model quality, but must remain coherent.

---

## 10. Phase G — Hard quality gate

A generation is successful only if all pass:

### G.1 Structure checks
- has a clear title slot filled with clean text
- has at least one real content region
- has a primary action when page type needs one
- uses chosen template regions
- no fragmented overlapping chaos

### G.2 Visual checks
- tokens applied to background/surface/text/primary
- radius/spacing consistent
- contrast readable
- no style-object corruption

### G.3 Content checks
- no raw prose dump titles
- no route-slug subtitles
- labels are short and human
- product function recognizable

### G.4 Metadata checks
- figma_status recorded truthfully
- template name recorded
- tokens recorded
- quality_gate_result recorded

### G.5 Failure handling
If gate fails:
1. run one controlled repair pass only
2. repair structure/labels/tokens
3. if still fail, mark `quality_gate_result = weak`
4. still deliver best attempt, but do not claim strong success

---

## 11. Phase H — Delivery to UI Studio Beta

### H.1 Write artifacts
- preview model JSON
- output TSX
- context notebook
- cycle policy/status

### H.2 User-visible stages
- Classifying page
- Choosing layout
- Fetching Figma references
- Applying design tokens
- Mapping content
- Rendering UI
- Validating
- Ready in preview

Status copy must distinguish:
- **Pre-code mockup** — cheap placeholder before coding (seed + §5; offline catalog optional)
- **Final UI (offline catalog)** — one restyle after product files exist (optional second after Polish)
- **Live app preview** — coded `app/`; mockup is not the product

### H.3 Regeneration
- max 3 (user-driven Generate again)
- each regeneration may change template only if previous template failed quality
- after 3, preference recovery question
- **Final UI** is separate: once after first Foundation product apply, optionally once after Polish (max two autopilot runs). Does not rewrite `app/` logic. User Generate again still uses the 3-attempt budget.

---

## 12. Explicit anti-patterns

Never do these:
1. freeform random rectangle soup
2. assign hex string as a whole style object
3. ignore §5 when present
4. mark Figma success without selected refs
5. use description paragraphs as UI labels
6. declare success for title + one button only
7. depend on old V0 eligibility for Beta preview
8. mutate style fields on non-object values

---

## 13. Minimum valid examples

### Example A — mobile metrics home
Must include:
- top title
- short subtitle
- 3 metric cards in a clean stack/grid
- one primary CTA
- tokenized colors from §5

### Example B — tasks list
Must include:
- title `Tasks`
- list of task rows/cards
- start/action button labels from files when available
- optional FAB/secondary action
- clean spacing

### Example C — settings
Must include:
- title `Settings`
- grouped rows
- clear labels
- no marketing hero nonsense

---

## 14. Implementation guidance for Cursor

Implement as a v2 path inside UI generation engine for UI Studio Beta only.

Suggested modules:
- `classifyPage.ts`
- `selectTemplate.ts`
- `figmaReferences.ts`
- `designTokens.ts`
- `mapSlots.ts`
- `renderTemplateModel.ts`
- `qualityGate.ts`
- `runUiGenerationCycleV2.ts`

Keep old path inert if needed, but Beta active generator must use v2 logic.

Do not leave the current freeform model builder as the main success path.

---

## 15. Acceptance criteria

1. Generate UI uses a named template family
2. Figma is attempted and status is truthful
3. §5 tokens are applied as a token object
4. visible labels are clean
5. layout is stacked/structured, not fragmented floating chaos
6. no `Cannot create property 'backgroundColor' on string` class errors
7. weak skeleton cannot pass as high quality
8. UI Studio Beta preview shows the v2 result
9. build passes

---

## 16. One-line doctrine

**Template first. Figma forced. Tokens mandatory. Content mapped into slots. No freeform chaos.**

---

## 17. Seed-first product mode (addendum)

**Default delivery path does not require Figma.**

| Mode | When | Behavior |
|------|------|----------|
| **Seed (built-in patterns)** | `FIGMA_API_KEY` and/or `FIGMA_REFERENCE_FILE_KEYS` unset, or Figma probe fails | Constrained templates + seed structure hints; `pattern_mode: seed`; never fake `figma_status: success` |
| **Figma (optional)** | Both env vars set and retrieval succeeds | Structure hints from reference files; `pattern_mode: figma` only on real success |

Product rules:

1. **Primary Generate UI surface** = **UI Studio Beta** (Legacy v0 Studio is advanced / optional only).
2. **Delivered** means: quality gate is `pass` or `repair` **and** workspace App Preview is synced (`index.html` / preview shell) so IDE Preview matches Beta.
3. Gate `weak` → clear warning, **no** Preview overwrite, not “Ready”.
4. Grok API key is **optional** for structured seed generate; used for CONTENT_LOCALE microcopy polish and guided preference rewrite when present.
5. Locale polish rewrites **slot strings only** — never layout/template/nodes.

Manual 10-min check (no Figma): Master Plan present → Generate UI in Beta → status shows built-in patterns + gate → open App Preview → structure/labels match → optional CONTENT_LOCALE polish when Grok key set.

### Prod smoke (nebulla.dev)
1. Login → IDE → Master Plan with **§4 + §5** saved (ui-brief present).
2. **UI Studio Beta** → **Generate UI**.
3. Confirm badges: pattern mode (`Built-in patterns…` or Figma), Figma status (never fake success), gate (`pass` / `repair` / `weak`).
4. If gate `pass|repair` → App Preview updates; if `weak` → Preview **not** overwritten + banner explains retry.
5. Optional Figma quality: Duplicate landing/dashboard files → set  
   `FIGMA_REFERENCE_BUCKETS=mobile=<KEY>,landing=<KEY>,dashboard=<KEY>` (+ `FIGMA_API_KEY` / `FIGMA_REFERENCE_FILE_KEYS`) → redeploy → Generate UI again → meta `figma.selection_mode` shows `bucket:…`.
6. Debug without DevTools archaeology: `nebulla-project/ui-generation-v2-meta.json` → `pattern_mode`, `figma.figma_status`, `figma.selection_mode`, `figma.preferred_bucket`, `preview_applied`.
7. **Resource match pilot:** same meta → `resource_match` (`id`, `score`, `selection_mode`, `reasons[]`), `design_brief_path`, and `design_brief_summary`. Landing projects must not pick `platform: mobile` profiles when landing profiles exist. Low score → `below_threshold` and normal `selectTemplate` fallback (not random). Regen / alternate preference re-matches excluding the previous template id.
8. **Design Brief authority:** thin §5 still compiles solid role defaults; Grok refine may adjust roles/density/dos only (spacing resyncs with density). Phase D tokens follow the brief; preference contrast must not replace primary role.

Smoke: `npm run test:ui-gen`.

Catalog (FS default): `nebulla-project/ui-resource-catalog/`. Production optional: `npm run ui-resources:sync-r2` when R2 env is set (`UI_RESOURCE_CATALOG=r2`).
