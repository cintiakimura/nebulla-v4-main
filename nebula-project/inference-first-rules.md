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

## 3. Sequence lock

Execute steps **3.1 → 10.2 in order**.  
Do not jump ahead to coding before Step 8 is complete.

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
- if fewer than 5 reliable ones are available, write the ones found and state the shortfall honestly

**Write** the list into `competitor-research.md` under `## Competitors`.

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

### Step 9.1 — Build foundation slice
**Build** the first coding slice only:
- app shell
- routing
- layout
- base design tokens if needed

Use incremental development.  
Do not implement all features in one pass.

**Output required:** foundation files applied

---

### Step 9.2 — Build primary feature slice
**Build** the next slice for the core user job only.

Then **Validate** before expanding.

**Output required:** primary feature slice applied and checked

---

### Step 9.3 — Generate first UI
**Generate** first UI through UI Gen v2 using:
- `ui-brief.md`
- Section 5 tokens
- current page structure

**Output required:** UI preview/draft available in UI Studio Beta

---

### Step 10.1 — Present draft to user
**Present** a short summary of:
- category chosen
- key assumptions
- main pages
- what was generated

Invite corrections.  
Do not restart the whole flow.

**Output required:** user-facing summary

---

### Step 10.2 — Refine only changed parts
**Update** only the parts the user corrects:
- plan sections
- research notes if needed
- affected slices

**Preserve** everything else.

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
2. competitor research has real names or honest shortfall note  
3. feature map exists  
4. evidence section exists  
5. all 5 Master Plan sections exist with correct headers  
6. every §4 page has required fields  
7. security baseline exists when required  
8. assumptions are listed  
9. `ui-brief.md` exists  

If any item fails: **Repair** that item before coding further.

---

## 7. One-line rule

**Categorize → Research → Map → Analyze → Draft → Build → Present → Refine. Never skip. Never invent. Never forget.**
