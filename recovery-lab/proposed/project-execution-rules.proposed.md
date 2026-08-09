# Project Execution Rules (PROPOSED — not live)

Status: Candidate depth layer. Conductor: `nebula-project/project-workflow.md`. Promote only after human approval.

---

## 0. Authority relationship

- **`project-workflow.md`** = north-star **order** (wins on sequence / “what next” conflicts)
- **This file** = depth / quality law for steps named in the workflow
- **`nebulla-project/`** guardians = rooms opened when a step or this file names them
- **`inference-first-rules.md`** = Fast Prototype method detail; must stay compatible with workflow intake (gap-fill default; interview opt-in)
- On conflict with legacy V0-era timelines (before / older execution text): **workflow + UI Gen v2 win**
- This file **MUST NOT** define a second competing “mandatory sequence A–G / 6-step UI” that reorders the workflow

---

## 1. Global MUST (aligned to Phase B policies)

1. **Action precision** — Hard verbs only; ban vague-only “consider / try / when possible.”
2. **Branching** — Workflow owns Step ids and IF/ELSE next-step; this file states quality bars and what PARTIAL means.
3. **No invent** — Never invent competitors, studies, statistics, vendors, APIs, or packages.
4. **No mid-run security block** — Security/industry perfection MUST NOT stop Steps 1–12. MVP defaults + Deferred list mid-run. Offer hardenings at workflow **Step 13**; add only if user accepts.
5. **UI Gen v2 primary** — Auto-V0 is **not** the spine. Optional legacy only if key + opt-in. Missing V0 key = success, not failure.
6. **Mockup temporary** — Plan + architecture + features win over mockup pixels. Label pre-code mockup ≠ live app.
7. **One agent / one pipeline** — After a usable goal, chat vs short prompt does not change Steps 1–14 order.
8. **Artifact honesty** — Status labels: `OK` | `PARTIAL` | `MISSING` | `TIMEOUT` | `SKIPPED_OPTIONAL`. Never claim Ready when artifact is MISSING.
9. **Core tags intact** — `<START_MASTERPLAN>`, `START_CODING`, and `file:` blocks MUST remain the implementation channel. [`prompt`]

---

## 2. Depth by workflow step

Do not restate the full action list from workflow — quality bars only.

### Step 1 — Accept / normalize goal
- **Quality bar / MUST:** Primary job stated in plain language; users/constraints captured if present.
- **MUST NOT:** Long interview ladder; invent features not implied by goal.
- **Artifacts:** Goal section in `nebula-project/fast-prototype-memory.md` (or equivalent).
- **Rooms:** `inference-first-rules.md` (3.1); `recovery-lab/proposed/policies-and-steps.md` §2.
- **Fallback quality:** PARTIAL = thin goal but still a primary job; MISSING = unusable → one blocking question.

### Step 2 — Classify type / industry
- **Quality bar / MUST:** Category + platform + risk + confidence; label `assumption:` / `inferred:` when not user-stated.
- **MUST NOT:** Block on low confidence; invent niche taxonomy.
- **Artifacts:** `category-classification.md` or plan notes.
- **Rooms:** `inference-first-rules.md` Step 3.2.
- **Fallback quality:** PARTIAL with labeled assumptions is OK.

### Step 3 — Research (with fallbacks)
- **Quality bar / MUST:** Follow ladder: direct competitors → method/logic analogues (`analogue:`) → labeled category baseline (`baseline:`). Evidence line or exact `No supporting studies found for this feature.` Never invent names/stats. Research MUST shape §2/§3/§4/§5 and ui-brief.
- **MUST NOT:** Halt spine for thin research; invent 8–12 fake competitors.
- **Artifacts:** `competitor-research.md` and/or Master Plan §2 research block.
- **Rooms:** policies-and-steps §3; inference-first research steps.
- **Fallback quality:** PARTIAL/TIMEOUT + baseline is OK to continue.

### Step 4 — Gap-fill assumptions
- **Quality bar / MUST:** Labeled assumptions for roles, MVP pages, stack default, nav, MVP auth (mock/local OK). Start **Deferred** security bullets (not implement). No forced Supabase/Firebase unless plan already names vendor.
- **MUST NOT:** Non-blocking brand interrogation; mid-run security theater that blocks Steps 5–12.
- **Artifacts:** Assumptions + Deferred list in memory.
- **Rooms:** policies-and-steps §2 + §4.
- **Fallback quality:** PARTIAL defaults OK.

### Step 5 — Write Master Plan §§1–5
- **Quality bar / MUST:** Exact five headers; §4 page fields (name, route, purpose, primary_actions, data_entities, authz, empty_state, error_state, nav_links); §5 ≤15–25 lines tokens (mood, hex palette, typography, density, radius, motion, components, nav). Persist `master-plan.json`. Depth implementable from §4 alone.
- **MUST NOT:** Merge §§ into Goal; code or §4 dump in §5; require interview before write when goal usable.
- **Artifacts:** `master-plan.json`.
- **Rooms:** This file §3 Master Plan contract.
- **Fallback quality:** PARTIAL + local fillMissing OK; **do not** block on incomplete security baseline (record Deferred instead).

### Step 6 — Mind map from §4 only
- **Quality bar / MUST:** Mind Map routes ⊆ §4; sync when §4 saved; use `` `/route` `` for parsing. Force kept from before: MUST NOT wait for §5 / UI / V0.
- **MUST NOT:** Invent pages; use UI/mockup as primary source.
- **Artifacts:** Mind-map JSON / IDE mind map.
- **Rooms:** Rule MM-1 (this file historically); fidelity when product enforces.
- **Fallback quality:** PARTIAL after one retry still continues.

### Step 7 — Write UI brief
- **Quality bar / MUST:** `nebula-ui-studio/ui-brief.md` includes every §4 page (required fields) + §5 tokens + authz UI notes. Primary UI input. Not truncated to 8 routes as sole truth.
- **MUST NOT:** Put full brief only in §5 or only in chat.
- **Artifacts:** `nebula-ui-studio/ui-brief.md`.
- **Rooms:** Rule UI-1 quality (this file); studio path notes in `nebula-ui-studio.md` if needed.
- **Fallback quality:** PARTIAL stub → regenerate once; still Go to Step 8.

### Step 8 — UI Gen v2 mockup
- **Quality bar / MUST:** Run UI Gen v2 primary. Label **Pre-code mockup**. Honest gate: weak → PARTIAL, no false strong Ready. Auto-V0 not required.
- **MUST NOT:** Treat mockup as coding spec; require V0; pretend Figma live if offline/seed.
- **Artifacts:** Studio model / meta (+ optional mockup HTML).
- **Rooms:** `nebulla-project/ui-generation-logic-v2.md` (do not paste).
- **Fallback quality:** PARTIAL/weak mockup MUST NOT block Foundation (Step 9).

### Step 9 — Foundation coding slice
- **Quality bar / MUST:** One coherent Foundation slice (shell/routes/layout). `file:` apply to disk. Mentally apply `code-review-checklist.md`. Plan wins over mockup. Append Deferred security only.
- **MUST NOT:** Dump all §4 routes; invent BaaS; paste app code in chat; implement full security stack mid-run.
- **Artifacts:** Foundation files under `app/` / `src/` / equiv.
- **Rooms:** `incremental-development.md`; coding checklist.
- **Fallback quality:** PARTIAL/TIMEOUT → report; retry Foundation before Primary.

### Step 10 — Validate Foundation
- **Quality bar / MUST:** NDM happy path for shell/routes; Preview honesty (mockup vs coded).
- **MUST NOT:** Skip to features with broken shell; claim live app if Preview is mockup/bridge only.
- **Artifacts:** Validation note / App Status.
- **Rooms:** `debugging-method.md`; `app-status-runtime.md` when present.
- **Fallback quality:** One smallest fix then continue if shell exists; else Step 9.

### Step 11 — Primary feature slice + validate
- **Quality bar / MUST:** Exactly one Primary slice for core user job; apply; validate happy path. Do not stop forever at Auth-only.
- **MUST NOT:** Secondary/Polish dump in same Go; clone mockup as sole UI.
- **Artifacts:** Primary product files.
- **Rooms:** `incremental-development.md` + NDM.
- **Fallback quality:** PARTIAL with listed gaps OK to present (Step 12).

### Step 12 — Present draft
- **Quality bar / MUST:** Honest summary: category, assumptions, pages, mockup vs code. Invite corrections. Beginner-friendly chat (`user-communication-rules.md`).
- **MUST NOT:** Restart full spine; overclaim interactive live app.
- **Artifacts:** Chat summary.
- **Rooms:** `user-communication-rules.md`.
- **Fallback quality:** PARTIAL summary still proceeds to Step 13.

### Step 13 — End-of-run deferred offers
- **Quality bar / MUST:** Offer security/industry hardenings from Deferred list in plain language. Accept → later slice / amend §2. Decline/ignore → stop offers this run.
- **MUST NOT:** Block earlier steps waiting for accept; silently add cloud vendors; treat offer as mid-run gate.
- **Artifacts:** Chat offer (+ optional later task).
- **Rooms:** policies-and-steps §4; security baseline content may be proposed here (not forced earlier).
- **Fallback quality:** SKIPPED_OPTIONAL if Deferred empty.

### Step 14 — Refine changed parts only
- **Quality bar / MUST:** Update only affected plan/slices/UI; preserve the rest.
- **MUST NOT:** Full regenerate unless user asks.
- **Artifacts:** Revised plan/files.
- **Rooms:** Jump to affected Step depth.
- **Fallback quality:** PARTIAL → report → idle.

---

## 3. Master Plan contract (depth)

### Exact headers (MUST)

```
### 1. Goal of the app
### 2. Tech and Research
### 3. Features and KPIs
### 4. Pages and navigation
### 5. UI/UX design
```

JSON keys MUST match `lib/masterPlanSections.ts` (canonical `"2. Tech and Research"`). Legacy `"2. Tech Research"` accepted by normalizer.

### § expectations

| § | MUST | MUST NOT |
|---|------|----------|
| 1 | Purpose, primary users, in/out of scope | Dump of §§2–5 |
| 2 | Project type; research (direct/analogue/baseline); recommended stack; Deferred security notes mid-run | Invented competitors/stats; forced vendor |
| 3 | MVP features as verbs; ≥1 testable KPI | Slogan-only KPIs as sole content |
| 4 | Every page with page fields + real `/routes` | Page names only with no routes/fields |
| 5 | ≤15–25 lines: mood, palette, typography, density, radius, motion, components, nav | Code; long prose; §4 copy; full ui-brief |

### §4 page fields (per page)

`name`, `route`, `purpose`, `primary_actions`, `data_entities`, `authz`, `empty_state`, `error_state`, `nav_links`.

### Mind map

- From **§4 only** (workflow Step 6 owns order; this reinforces quality).
- MUST NOT invent pages; MUST NOT wait for UI/V0.

### Security baseline (timing remapped)

- Mid-run: MVP/auth mock OK; write **Deferred** lines; do **not** hard-block Steps 5–12 for missing RLS/PII polish.
- Full baseline (auth model, tenant/RLS, roles, secrets, PII, deny-by-default) offered at **Step 13**; merge into §2 only if user accepts.
- If product still auto-drafts baseline into §2 as assumptions, treat as **draft/Deferred**, not a Go blocker for MVP.

### Tags

`<START_MASTERPLAN>`, `START_CODING`, `file:` MUST remain intact.

---

## 4. Coding / debug depth

**Before ANY code change (Steps 9–11, 14):**
1. Mentally complete `nebulla-project/code-review-checklist.md`.
2. Obey Incremental Development: Build → Debug/Validate → Next (`incremental-development.md`).
3. Mockup non-authoritative — plan wins.

**Each Go / START_CODING:** one coherent slice only; smallest safe file set; no full §4 dump.

**On bug / failure:**
1. Match `full-bug-database.md` when useful.
2. NDM: Verify → Analyze → Trace → Fix → Validate (`debugging-method.md`).
3. Output only ` ```file:relative/path` ` blocks.

**MVP stack:**
- No unsolicited Supabase/Firebase/BaaS unless plan names the vendor.
- Prefer mock/local auth for first slices when Deferred.

**Chat:** Do not paste app/UI code dumps; use apply pipeline.

---

## 5. UI depth

- Method room: **`nebulla-project/ui-generation-logic-v2.md`** (do not paste full manual here).
- Primary inputs: `ui-brief.md` + §5 tokens + plan; Figma local-first / seed per product.
- Stitch-minimum honesty; no false Ready / Gate pass theater.
- Regen limits / preference recovery: as product already defines — do not invent new product policy in this proposal.
- Optional V0 legacy (Rule UI-3 style): only if key + opt-in; never required for success.
- Studio Apply: warning + confirm before writes when user-driven Apply path is used.

---

## 6. Removed / demoted from old execution-rules

| Old requirement | Fate |
|-----------------|------|
| “Single source of truth” / competing timeline vs workflow | **Demoted** — conductor is workflow; this file is depth |
| Mode sequence as peer spine (Chat→Arch→Coding→…) | **Remapped** — modes are rooms; order is Steps 1–14 |
| Discovery order as default interview ladder | **Remapped** — Steps 1–4 gap-fill; interview opt-in |
| Post–MP table A–G as second sequence | **Dropped as spine** — covered by workflow Steps 5–8 |
| Auto-V0 immediate after Master Plan (before C–D; “MUST NOT skip”) | **Dropped** — UI Gen v2 Step 8; V0 optional legacy only |
| `v0-prompt.md` as sole/primary UI input | **Remapped** — `ui-brief.md` Step 7 |
| `V0_API_KEY` required for UI success | **Dropped** |
| Security baseline MUST inject + can block Go/strict completeness mid-run | **Remapped** — Deferred mid-run; offer Step 13; MVP continue |
| Research “8–12 competitors” hard bar | **Softened** — ladder allows analogues/baseline; never invent to hit 8–12 |
| Mandatory 6-step UI/UX generation (V0) from before | **Dropped as law** — force kept only for Mind Map timing + §5 brevity |
| Phases 0–5 narrative as alternate conductor | **Demoted** — pointer only; workflow Steps win |
| Final checklist “security baseline when auth/data” as Go hard bar | **Remapped** — aim for quality; do not hard-block MVP mid-run |

---

## 7. Non-goals

- Not live until promoted (Phase H+)
- Not a second conductor
- Not a full UI Gen v2 reprint
- Not code / gate / prompt wiring this turn
- Not auto-V0 spine revival

---

## Completion checklist

- [x] Only `recovery-lab/proposed/project-execution-rules.proposed.md` (+ optional link)
- [x] Live `project-execution-rules.md` untouched
- [x] Live `project-workflow.md` untouched
- [x] Zero code changes
