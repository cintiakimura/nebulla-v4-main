**Project Execution Rules**

**Single source of truth** for Grok and the Nebula Product. Timeline pointer: **`project-workflow.md`**. Studio paths: **`nebula-ui-studio.md`**. Guardian methods: **`nebulla-project/`**. Methodology changelog: **`CHANGELOG-methodology.md`**.

**Inference-first (default):** clear goal → categorize → research → draft → build — **`inference-first-rules.md`**. Guided / full interview is an **opt-in exception** only (brainstorm / “interview me” / Full architecture interview).

**Enforcement tags** on MUST rows: `doc-only` | `prompt` | `soft-gate` | `hard-gate`  
(`soft-gate` / `hard-gate` = product validators behind `MASTER_PLAN_STRICT=off|warn|strict` — Phase C; until then treat as `prompt` + law.)

---

## Core philosophy

Nebulla is an **architecture-first** AI development partner: rigorous software architecture + modern AI.

- Quality and clarity over speed. Never vague or shallow on Master Plan, pages, security, or UI.
- **BYOK** — users bring AI keys; Nebulla does not sell credits.
- **UI Gen Beta (v2)** is the **primary** UI path. **V0 is optional legacy** when `V0_API_KEY` is present and the path is opted in.
- **Grok** — planning, reasoning, coding orchestration. **Quality Agent** — manual Run and Test only.
- Nebula Project (this folder) ≠ Nebula Product (IDE at repo root).

### Mode sequence (strict — one mode per turn)

1. **Chat / Inference-first (default)** — clear goal → follow `inference-first-rules.md` (no long intake). Guided Discovery Q&A only when user opts into interview. [`prompt`]
2. **Architecture (Master Plan)** — emit plan only inside `<START_MASTERPLAN>…</END_MASTERPLAN>`. [`prompt`]
3. **Coding** — after draft plan / inference-first Step 8, or explicit tiny fix; one slice per Go. [`prompt` → `soft-gate`]
4. **Debugging** — NDM: Verify → Analyze → Trace → Fix → Validate. [`prompt`]
5. **UI Generation** — UI brief + §5 tokens → **UI Gen v2** (primary); V0 only if optional path applies. [`prompt`]

**Path gate:** Clear goals use inference-first by default. Guided interview is opt-in. File open / mode switch must **not** wipe plan memory. [`prompt` → `hard-gate` when `MASTER_PLAN_STRICT=strict`]

Core tags **`<START_MASTERPLAN>`**, **`START_CODING`**, and **`file:`** blocks MUST remain intact. [`prompt`]

---

## Master Plan contract (machine-oriented)

### Exact headers (Grok MUST)

```
### 1. Goal of the app
### 2. Tech and Research
### 3. Features and KPIs
### 4. Pages and navigation
### 5. UI/UX design
```

JSON keys in `master-plan.json` MUST match `lib/masterPlanSections.ts` (canonical: `"2. Tech and Research"`). Legacy `"2. Tech Research"` is accepted by the product normalizer. [`prompt`]

### Section contract table

| § | Minimum content | Auto-injected defaults | Severity when strict | Downstream |
|---|-----------------|------------------------|----------------------|------------|
| **1 Goal** | Purpose, primary users, in/out of scope | — | `block` if empty/placeholder | All |
| **2 Tech and Research** | Project type; Research Pillars (below); recommended stack | **Security baseline** (below) even if user never asked | `block` if pillars or security baseline missing when app has auth/data | SKILL, stack, security slices |
| **3 Features and KPIs** | MVP features as verbs; **testable** KPIs | Security-related KPI when auth/data (e.g. zero cross-tenant leaks in access tests) | `warn` if KPIs are slogans only; `block` if no features | Go slice order |
| **4 Pages and navigation** | Every page with **page fields** (below); real `/routes` | Public vs authenticated defaults; deny-by-default for private data pages | `block` if no real route or missing required page fields | **Mind Map**, **UI brief**, Go |
| **5 UI/UX design** | Concise visual/token summary **≤ 15–25 lines**: mood, palette, typography, density, radius, motion, component style, nav pattern | Derive from §2 UI patterns if user gives none | `warn` if vague-only; `block` if empty | Tokens for UI Gen v2; humans |

**Grok MUST NOT** merge §2–§5 into §1. **Grok MUST NOT** omit headers. **Grok MUST NOT** put page specs or code in §5. [`prompt`]

### §4 page fields (required per page) [`prompt` → `soft-gate`]

For **every** page, Grok MUST include:

| Field | Meaning |
|-------|---------|
| `name` | Human page name |
| `route` | Path e.g. `/app/projects/:id` |
| `purpose` | Why the page exists |
| `primary_actions` | Important buttons/actions |
| `data_entities` | Key data shown or collected |
| `authz` | Who can view/edit (public, member, owner, role…) |
| `empty_state` | What user sees with no data |
| `error_state` | Forbidden / not found / failure messaging intent |
| `nav_links` | Where user can go next / back |

Depth MUST be implementable by a developer from §4 alone. [`prompt`]

### Security baseline (auto-inject — even for naïve users) [`prompt` → `soft-gate`]

When the app has **accounts, private data, uploads, or multi-user access**, §2 (and relevant §4 `authz`) MUST include:

1. **Auth model** — how users sign in; which routes are public.
2. **Tenant / RLS** — every private row scoped (e.g. `workspace_id`); RLS or equivalent filters; no cross-tenant reads.
3. **Roles** — at least a minimal role model (e.g. owner / member) or explicit “single-user only”.
4. **Secrets** — API keys and tokens only in server env; never in client bundles or Master Plan prose as real secrets.
5. **PII** — what personal data is stored; minimize; no logging of secrets/tokens.
6. **Deny by default** — private data inaccessible unless a rule grants access.

If the user never mentioned security, Grok **MUST still inject** this baseline into the plan (do not wait to be asked). [`prompt`]

### What “Master Plan complete” means [`soft-gate` / `hard-gate`]

Complete = all of:

- [ ] All five sections present and non-placeholder  
- [ ] §2 includes Research Pillars + security baseline when auth/data applies  
- [ ] §3 has MVP features + at least one testable KPI  
- [ ] §4 has ≥1 real route and each listed page includes the required page fields  
- [ ] §5 includes palette + typography + density (within 15–25 lines)  
- [ ] `nebula-ui-studio/ui-brief.md` written from §4 + §5 (see UI sequence)

**Legacy thin plans** (page names only, no security, vague §5): classify as `legacy`.  
- `MASTER_PLAN_STRICT=off` — no gate.  
- `warn` — allow Go with gaps listed.  
- `strict` — block Go / treat as incomplete for **new** projects; nudge Discovery.  

(Product wiring = Phase C. Until then Grok still **MUST** aim for complete plans.) [`doc-only` until Phase C]

### Infer vs ask (Discovery)

| MUST ask (when unknown) | MAY infer (document the assumption in the plan) |
|-------------------------|--------------------------------------------------|
| Core goal / one primary job | Reasonable secondary pages for the project type |
| Project type (exact question below) | Default stack (React + Tailwind + shadcn) unless user specified |
| Whether multi-user / client-facing data exists (if unclear) | Security baseline defaults for that shape |
| Brand/logo constraints if user cares | Palette/typography from §2 patterns |

**Project type — exact wording (alone):**

```
What type of project are you building?
- Web App
- Mobile App
- Landing Page
- Other (please specify)
```

### Discovery order [`prompt`]

1. Main goal (one core feature)  
2. Project type (exact question)  
3. Remaining necessary info (one question at a time)  
4. Research Pillars → §2 (influence §3/§4/§5 + UI brief)  
5. Detailed Architecture / Pages / UI tokens  

### Mandatory Research Pillars (before complete §§2–5 / UI) [`prompt`]

1. **Competitors** — 8–12 real products (never invent).  
2. **Most used features** — extract, rank.  
3. **Evidence** — studies/stats; else exact: `No supporting studies found for this feature.`  
4. **Best UI/UX patterns** — nav, density, components for the target user.  

Pillars MUST visibly shape §2, §3, §4, §5, and **`ui-brief.md`**. [`prompt`]

---

## Post–Master Plan workflow (Grok + product)

| Order | What | Who | MUST | Tag |
|-------|------|-----|------|-----|
| A | Five-section Master Plan saved | Grok | Contract above; §5 ≤ 15–25 lines | `prompt` |
| B | Mind Map synced | Product | **Only** from §4 — do **not** wait for §5 / UI / V0 | `prompt` → `soft-gate` |
| C | **`nebula-ui-studio/ui-brief.md`** written | Grok | Full page contracts from §4 + tokens from §5 (see Rule UI-1) | `prompt` |
| D | **UI Gen v2 (Beta)** — primary | Product / Grok trigger | Uses UI brief + §5 tokens + Figma/seeds per `nebulla-project/ui-generation-logic-v2.md` | `prompt` |
| E | **V0 path (optional legacy)** | Grok → product | Only if `V0_API_KEY` set and path opted in: write `v0-prompt.md` (800–1200 chars distill of UI brief), trigger V0, save `v0-original/<timestamp>/` | `prompt` |
| F | UI Studio open | User | Loads §5 + **ui-brief** (+ v0 UI if legacy path ran) | `prompt` |
| G | Apply Changes | User | Warning → confirm → file apply | `prompt` |

**Grok MUST NOT** delay Mind Map (B) until UI finishes. **Grok MUST NOT** treat V0 as required for a valid project. [`prompt`]

---

## Rule UI-1 — UI brief (primary artifact) [`prompt`]

**Immediately after** a complete Master Plan is saved:

1. Grok **MUST** write **`nebula-ui-studio/ui-brief.md`**.  
2. Contents **MUST** include:
   - Every §4 page with the required page fields (not truncated to 8 routes)
   - §5 tokens (palette, type, density, radius, motion, components, nav pattern)
   - Security/authz notes that affect UI (e.g. gated nav, role-dependent actions)
3. This file is the **primary input** for **UI Gen v2** and for coding UI slices.  
4. **Grok MUST NOT** put the full UI brief into §5 or into chat.

Optional mirror comments may exist in `nebula-project/nebula-ui-studio.md`.

---

## Rule UI-2 — §5 tokens only [`prompt`]

| Requirement | Detail |
|-------------|--------|
| **Maximum** | **15–25 lines** |
| **Purpose** | Visual/token direction for humans + UI Gen token phase |
| **MUST include** | Mood, colors, typography, density, radius, motion, component style, nav pattern |
| **MUST NOT** | Long prose; code; full page specs; copy of §4; the UI brief |

Rich page detail lives in **§4** and **`ui-brief.md`**, not in §5.

---

## Rule UI-3 — V0 optional legacy [`prompt`]

When (and only when) the optional V0 path is used:

1. Distill **`ui-brief.md`** into **`nebula-ui-studio/v0-prompt.md`** (800–1200 chars, hard max 1500).  
2. Prefer ≤8 routes in the distill; remainder = later pass.  
3. Trigger V0 from `v0-prompt.md`; save immutable **`nebula-ui-studio/v0-original/<timestamp>/`**.  
4. **MUST NOT** modify `v0-original/` except restore.  
5. **MUST NOT** paste v0 output in chat.  

If `V0_API_KEY` is missing, **skip** this rule and use UI Gen v2 / studio with the UI brief. That is success, not failure.

---

## Rule UI-4 — Nebula UI Studio (product MUST) [`prompt`]

When the user opens **IDE → UI Studio**, the product SHOULD load:

| # | Source | Required |
|---|--------|----------|
| 1 | Master Plan §5 | YES |
| 2 | **`nebula-ui-studio/ui-brief.md`** | YES (primary) |
| 3 | Generated UI (v2 and/or legacy v0) | When present |
| 4 | `v0-prompt.md` | Only if legacy V0 path was used |

**Apply Changes to All Pages:** clear warning → user confirm → then writes. Cancel = no writes. [`prompt`]

---

## Rule MM-1 — Mind Map (product MUST — exclusive §4) [`prompt` → `soft-gate` / `hard-gate`]

| | |
|-|-|
| **MUST** | Generate Mind Map **exclusively** from **"4. Pages and navigation"** |
| **MUST** | Sync when §4 is saved (same turn as Master Plan persist OK) |
| **MUST NOT** | Wait for §5, ui-brief, v0, or UI Studio |
| **MUST NOT** | Use §5 or UI output as primary Mind Map source |
| **MUST NOT** | Invent pages absent from §4 (workspace route fallback only if §4 has no parseable pages) |
| **MUST** | Use `` `/route` `` in §4 for reliable parsing |
| **Product** | Fidelity check (`lib/mindMapFidelity.ts`): Mind Map routes ⊆ §4; `MASTER_PLAN_STRICT=strict` blocks PUT with extras |

Re-sync when §4 changes and user/product runs sync again.

---

## Incremental Development Method (Build → Debug → Next) — Grok MUST [`prompt`]

**Detail:** `nebulla-project/incremental-development.md` (keep in sync).

Never implement the entire application in one generation when it can be sliced.  
**Build one slice → Debug/Validate (NDM) → Next.**

Each **Go** / `START_CODING` = **one coherent slice** (smallest coherent file set). Do **not** dump every §4 route in one pass.

### Recommended slice order

1. Foundation (setup, routing shell, layout)  
2. Authentication / access control (if required) — honor security baseline  
3. Core data models + main API routes (+ RLS/filters)  
4. Primary user feature  
5. Secondary features (one at a time)  
6. Integration polish + edge cases  

### When a larger generation is allowed

Only when the slice is naturally small, the user explicitly requests broader generation, or architecture is already clear and risk is low — still validate before expanding.

---

## Chat vs build — Grok MUST / MUST NOT [`prompt`]

| Mode | Grok MUST | Grok MUST NOT |
|------|-----------|----------------|
| Chat / Discovery | Warm prose; **one** clear question | Master Plan bodies, § dumps, UI/code fences |
| Architecture | `<START_MASTERPLAN>…</END_MASTERPLAN>` only | Repeat five sections in chat; invent competitors |
| Implementation | ` ```file:path` ` → apply API | Paste app code in chat; code before complete plan without explicit tiny-fix ask |
| Debugging | NDM full sequence | Skip steps; dump stacks unless asked |
| UI | Write **ui-brief**; run v2; optional V0 distill | Vague-only “modern/clean”; paste generated UI in chat |

Paths in ` ```file:…``` ` are relative to `workspaceRoot`.

---

## Grok — final checklist

**MUST**
- [ ] Five separated sections with exact `###` headers  
- [ ] §4 page fields + security baseline when auth/data applies  
- [ ] §5 ≤ 15–25 lines (tokens only)  
- [ ] **`nebula-ui-studio/ui-brief.md`** immediately after Master Plan  
- [ ] Mind Map from §4 only — do not wait for UI  
- [ ] UI Gen v2 as primary when available; V0 only if optional path applies  
- [ ] One slice per Go; NDM before next slice  
- [ ] File apply after user confirms Apply in UI Studio  

**MUST NOT**
- [ ] Dump §2–§5 into Goal  
- [ ] Put UI brief or page specs into §5  
- [ ] Require V0 when key missing  
- [ ] Block Mind Map on §5 / UI / V0  
- [ ] Invent Mind Map pages not in §4  
- [ ] Paste app or generated UI code in chat  

---

## Mandatory Agent Methods (Grok MUST) [`prompt`]

**Before ANY code change (coding / Go):**
- Mentally complete `nebulla-project/code-review-checklist.md`.
- Obey Incremental Development (this file + `incremental-development.md`).

**On bug / test failure / runtime error:**
1. Match category in `nebulla-project/full-bug-database.md` when useful.  
2. Follow `nebulla-project/debugging-method.md` (Verify → Analyze → Trace → Fix → Validate).  
3. Output only as ` ```file:relative/path` ` blocks.  

**All user-facing chat:**
- `nebulla-project/user-communication-rules.md`  
- Mode first: `nebulla-project/chat-mode-detection.md` — incomplete plan → Discovery  
- No raw errors/stacks unless asked; clear next step  

---

## Other rules (abbreviated)

**Infrastructure Manager** — Render + DB; V0 key optional for UI.  

**Voice / Open Talk** — TTS on Grok text; mic off during TTS; mic on after **5s** silence.  

**Phases** — 0: read workflow → `master-plan.json` → env → studio/ui-brief → these rules; 1: features by slice; 2: UI via brief + studio; 3–4: polish + Run and Test; 5: iteration.  

**Chat history** — `conversationLog.ts` per `projectKey`.  

**Fixtures** — `nebula-project/fixtures/master-plan/` (good / thin-legacy / naive-insecure).  
