# Inference-First Rules (Fast Prototype)

**Single behavioral script for Fast Prototype.**  
Do not skip steps. Do not reorder steps.  
Complete each step and write its required output before starting the next step.

Still obey plan format and downstream contracts in:
- `nebula-project/project-execution-rules.md`
- `nebulla-project/` guardian docs
- UI Gen rules when generating UI

Inference-first is the **default standard path**. Brainstorm / full architecture interview is an optional exception (see §2).

---

## 0. Operating law

From a clear user goal:

1. **Categorize** the app  
2. **Research** industry standards and competitors  
3. **Draft** architecture  
4. **Build** first prototype  
5. **Refine** only after the user sees the draft  

Ask a question only when a step is blocked.  
Never interrogate by default.  
Never invent competitors, studies, or statistics.

**Runtime (Recovery §11):** Phase 3 research is a **product Web Search stroke** that writes `nebula-project/competitor-research.md`. Chat may pre-fill labeled assumptions; it must **not** skip research or invent competitor names. Gate R requires 5–10 real names plus rankings, UI/UX patterns, evidence, and assumptions-vs-confirmed. Demo-only skip: `NEBULLA_SKIP_RESEARCH=1` (default **OFF**).

---

## 1. Required working files

Create and maintain these files inside the active project:

| File | Purpose |
|------|---------|
| `nebula-project/fast-prototype-memory.md` | Running memory for this mode |
| `nebula-project/category-classification.md` | App category and risk profile |
| `nebula-project/industry-standards.md` | Roles, features, security, UI defaults |
| `nebula-project/competitor-research.md` | Competitors, feature map, evidence, UI patterns |
| `nebula-project/master-plan.json` or Master Plan source of truth used by product | Draft architecture |
| `nebula-ui-studio/ui-brief.md` | UI implementation brief after plan draft |

If a file does not exist when needed, **Create** it before continuing.

---

## 2. Default path / mode check

### Step 2.1 — Default = inference-first
**Default behavior** is this inference-first sequence. No special “Fast Prototype activation” is required.

When the user gives a goal (or a clear brief to build):

1. categorize  
2. research  
3. draft  
4. build  

If the goal is already clear, **do not interrogate by default**.  
**Ask** only when a step is blocked (vague goal, low classification confidence, platform unknown when architecture depends on it, or contradictory requirements).

Do **not** treat inference-first as a mode the user must opt into first.

### Step 2.2 — Optional exception = brainstorm / full interview
Use brainstorm / full architecture interview **only** when the user explicitly wants to:

- explore or brainstorm  
- debate options  
- be interviewed / answer guided discovery questions  
- run “Full architecture interview”

Until they ask for that, stay on inference-first.  
Pure debug and pure file-open remain outside this script (existing Coding / Debug / File paths).

### Step 2.3 — Write path flag
**Write** into `fast-prototype-memory.md`:

- path = `inference_first` (default) or `guided_interview` (exception)
- reason (goal received / user requested interview / …)
- timestamp

**Output required:** updated `fast-prototype-memory.md`

---

## COMPREHENSION FIRST

Rank user brief above competitor research. Do not re-interview a dense brief.

1. **Rank-1 sources:** the user’s goal text, uploads, and explicit URLs/links in the message.
2. **Rank-2 sources:** `nebula-project/competitor-research.md` (Gate R) and industry defaults.
3. **Extract in one pass** when the brief already specifies roles, main flows, privacy/safety, AI tone, gamification, or research links — write them into the Master Plan / working memory. **Do not** ask discovery questions for those slots.
4. **Ask at most ONE** clarifying question only when a blocking gap remains (e.g. web vs mobile vs landing cannot be inferred).
5. **Research stroke:** prioritize user-cited sources (e.g. a PMC/study URL) when present; then competitors. Competitors refine features/UI; they **must not** override user privacy, tone, or role constraints. Gate R still requires a valid `competitor-research.md` before Foundation Go.
6. **Figma live success is not required** to comprehend the app or to start Foundation after gates pass.
7. **If blocked:** name the concrete gate (research incomplete / security / ui-brief / …). Do not spin on vague “syncing.”

---

## 3. Sequence lock

Execute steps **3.1 → 10.2 in order**.  
Do not jump ahead to **UI mockup** before Step 8.1 (ui-brief) + §§1–5 exist.  
Do not jump ahead to **coding** before Step 8.3 (UI mockup) has been triggered.  
**Single API key:** Research/Architecture AI turn → UI Gen stage → Coding stage (sequential, not concurrent).

---

### Step 3.1 — Collect minimum goal
**Extract** the app goal from the user message.

Must capture:
- what the app does
- who it is for, if stated
- any constraints already stated (kids, payments, mobile, schools, etc.)

If goal is too vague to classify, **Ask** only one clarification question, then stop this turn.

**Output required:** goal text saved in `fast-prototype-memory.md`

---

### Step 3.2 — Categorize app type and industry
**Categorize** the product.

Write:
- primary category
- secondary category if needed
- platform assumption (`web` / `mobile` / `both` / `unknown`)
- risk profile (`low` / `standard` / `high`)
- confidence (`high` / `medium` / `low`)

Category examples:
- education
- marketplace
- booking_scheduling
- saas_b2b
- ecommerce
- health_wellness
- finance_money
- community_social
- marketing_landing
- other

Risk rules:
- payments, kids, health, identity, school authority → `high`
- accounts + private user data → at least `standard`
- public brochure / simple utility → `low`

**Create/Update** `nebula-project/category-classification.md` with the classification.

**Output required:** `category-classification.md`

If confidence is `low`, **Ask** one classification question and stop.  
Otherwise continue.

---

### Step 4.1 — Create research workspace
**Create** or clear the research section in:

- `nebula-project/competitor-research.md`
- `nebula-project/industry-standards.md`

Write headers for:
- competitors
- recurring features
- evidence
- UI/UX patterns
- security/data defaults

**Output required:** both files exist with headers

---

### Step 4.2 — Research category standards
**Research** industry standards for this category in four areas:

1. data protection expectations  
2. security baseline  
3. common MVP features  
4. common UI/UX patterns  

**Write** the findings into `industry-standards.md`.

Must include:
- default roles
- MVP feature list
- security/data-protection baseline
- default navigation pattern
- default UI tone/density notes

**Output required:** filled `industry-standards.md`

---

### Step 5.1 — Find competitors
**Find** minimum 5 and maximum 10 **real** competitors or close category products.

Rules:
- real products only
- never invent names
- **Gate R:** fewer than 5 real names (or invented placeholders) means research is **not done** — do not continue to ui-brief success or Foundation Go. Honest shortfall is recorded, not a pass.

**Write** the list into `competitor-research.md` under `## Competitors` (product Web Search writes this file; chat must not invent the list).

**Output required:** competitor list in `competitor-research.md`

---

### Step 5.2 — Map competitor features
**Map** features across the competitors.

For each major feature/concept, note:
- feature name
- how many competitors show it
- whether it appears core or secondary

Then **List** the most recurrent features, ranked.

**Write** the feature map into `competitor-research.md` under `## Feature map`.

**Output required:** ranked recurring-feature map

---

### Step 5.3 — Research evidence for key features
**Research** whether the top recurring features have supporting studies, papers, or reputable statistics.

For each top feature:
- if evidence exists, summarize it briefly with source type
- if none, write exactly:
  `No supporting studies found for this feature.`

**Write** results into `competitor-research.md` under `## Evidence`.

**Output required:** evidence section completed

---

### Step 6.1 — Analyze competitor UI/UX
**Analyze** the competitors’ common UI/UX patterns:

- layout structure
- navigation style
- density
- color tendency
- accessibility tendencies
- tone of voice
- branding style

**Write** a concise pattern summary into `competitor-research.md` under `## UI/UX patterns`.

**Output required:** UI/UX pattern summary

---

### Step 6.2 — Apply standards package
**Apply** category standards + competitor evidence into one implementation package.

Package must define:
- roles
- MVP features
- pages/navigation
- security/data-protection baseline
- UI pattern family

**Update** `industry-standards.md` with the final package labeled:
- `validated common pattern`
- or `assumption`

**Output required:** final standards package in `industry-standards.md`

---

### Step 7.1 — Draft Master Plan Section 1
**Draft** `### 1. Goal of the app`

Include:
- purpose
- primary users
- in-scope / out-of-scope
- explicit assumptions

**Write** into the Master Plan source of truth.

**Output required:** Section 1 saved

---

### Step 7.2 — Draft Master Plan Section 2
**Draft** `### 2. Tech and Research`

Include:
- project type
- category classification
- competitor/pattern summary
- recommended stack defaults unless user specified otherwise
- security baseline when risk is standard/high or accounts/private data exist

**Write** into the Master Plan source of truth.

**Output required:** Section 2 saved

---

### Step 7.3 — Draft Master Plan Section 3
**Draft** `### 3. Features and KPIs`

Include:
- MVP features as verbs
- at least one testable KPI
- security-related KPI when auth/private data exists

Prefer recurrent competitor features over inventive extras.

**Write** into the Master Plan source of truth.

**Output required:** Section 3 saved

---

### Step 7.4 — Draft Master Plan Section 4
**Draft** `### 4. Pages and navigation`

For every page, **Write**:
- name
- route
- purpose
- primary_actions
- data_entities
- authz
- empty_state
- error_state
- nav_links

Build the minimum viable page graph for the MVP only.

**Write** into the Master Plan source of truth.

**Output required:** Section 4 saved

---

### Step 7.5 — Draft Master Plan Section 5
**Draft** `### 5. UI/UX design` in 15–25 lines

Include:
- mood
- palette
- typography
- density
- radius
- motion
- component style
- nav pattern

Base this on Step 6 analysis and category standards, unless the user already gave brand constraints.

**Write** into the Master Plan source of truth.

**Output required:** Section 5 saved

---

### Step 7.6 — Record assumptions
**List** all important assumptions in `fast-prototype-memory.md`.

Examples:
- assumed roles
- assumed platform
- assumed auth requirement
- assumed navigation pattern

**Output required:** assumption list saved

---

### Step 8.1 — Create UI brief
**Create/Update** `nebula-ui-studio/ui-brief.md` from:
- Section 4 page contracts
- Section 5 tokens
- authz/security notes that affect UI

**Output required:** `ui-brief.md`

---

### Step 8.2 — Sync architecture views
**Sync** Mind Map from Section 4 only.

Do not wait for UI generation to finish.

**Output required:** Mind Map updated from §4

---

### Step 8.3 — Generate UI mockup now (before coding finishes)
**Generate** the first UI mockup through UI Gen v2 / UI Studio Beta using:
- `ui-brief.md`
- Section 5 tokens
- §4 page structure

**Gate:** only after §§1–5 draft + `ui-brief.md` exist.  
**Do not** wait for foundation/feature coding to finish.  
**Do not** start mockup before this gate.  
**Single API key:** finish the architecture AI turn first; product then runs UI Gen as the next stage; coding follows after mockup is triggered (or completes).

Record `stage=ui_mockup` in `fast-prototype-memory.md` (or product stage flag).

**Output required:** UI preview/draft available in UI Studio Beta

---

### Step 9.1 — Build foundation slice
**Build** the first coding slice only (after Step 8.3 has been triggered):
- app shell
- routing
- layout
- base design tokens if needed

Use incremental development.  
Do not implement all features in one pass.  
Record `stage=coding`.

**Output required:** foundation files applied

---

### Step 9.2 — Build primary feature slice
**Build** the next slice for the core user job only.

In **Fast Prototype**, the product auto-runs **one** primary feature Go after a successful Foundation apply (max one auto continue per project session — no infinite loop). Further slices still need the user (“continue building” / next Go).

Then **Validate** before expanding.

**Output required:** primary feature slice applied and checked

---

### Step 9.3 — Post-code UI refresh (one automatic pass)
After **successful** Foundation/Go apply of UI-relevant files (`app/`, `src/`, pages/components, etc.), the product runs **one** post-code UI path:
- Prefer refresh App Preview from coded entry routes when available
- Also run **one** UI Gen cycle grounded on **plan + generated file facts** (routes, buttons, headings from disk) — not a blind clone of the pre-code mockup

Rules:
- Max **one** automatic post-code UI refresh/regen per project session unless the user clicks Generate again (no infinite loop).
- Do **not** block coding on mockup perfection; do **not** skip post-code refresh when UI-relevant files actually landed.
- Pre-code mockup (Step 8.3) must not depend on this step; post-code may replace that preview.
- Coding still ignores mockup pixels — Master Plan / architecture / features win on conflict.

**Output required:** status distinguishes pre-code mockup vs post-code UI refresh; meta records `phase: post_code` when that pass ran

---

### Step 10.1 — Present draft to user
**Present** a short summary of:
- category chosen
- key assumptions
- main pages
- that UI mockup was generated from researched patterns + plan
- that coding continues in slices next

Invite corrections.  
Do not restart the whole flow.

**Output required:** user-facing summary

---

### Step 10.2 — Refine only changed parts
**Update** only the parts the user corrects:
- plan sections
- research notes if needed
- affected slices
- UI mockup if visual direction changed

**Preserve** everything else. Record `stage=refine`.

**Output required:** revised plan + revised affected files only

---

## 4. Anti-amnesia rules

### Step 11.1 — Persist before mode switch
**Save** all working files before any mode change.

### Step 11.2 — Reload memory on agent/coding entry
**Read** these files first before acting:
- `fast-prototype-memory.md`
- `category-classification.md`
- `industry-standards.md`
- `competitor-research.md`
- Master Plan
- `ui-brief.md`

### Step 11.3 — Forbid reset
**Do not** restart from Step 3.1 if a valid draft already exists, unless the user changes the goal materially.

---

## 5. Question policy

**Ask** only when blocked:
- goal missing/too vague
- category confidence low
- platform unknown and architecture depends on it
- contradictory requirements

**Do not ask first** for:
- full feature lists
- full page lists
- UI taste questions already covered by standards
- roles that are obvious from category

---

## 6. Quality gate before calling the draft complete

**Verify** all of the following:

1. category file exists  
2. competitor research has **5–10 real names** (Gate R; honest shortfall is not done)  
3. feature map exists  
4. evidence section exists  
5. all 5 Master Plan sections exist with correct headers  
6. every §4 page has required fields  
7. security baseline exists when required  
8. assumptions are listed  
9. `ui-brief.md` exists  
10. UI mockup stage has been triggered (Step 8.3) before foundation/feature coding expands  

If any item fails: **Repair** that item before coding further. Do not call the architecture draft complete until §§1–5 + ui-brief exist; do not treat coding as the unlock for the first mockup.

---

## 7. One-line rule

**Categorize → Research → Map → Analyze → Draft → UI mockup → Build → Present → Refine. Never skip. Never invent. Never forget.**
