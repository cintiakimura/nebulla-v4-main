# Project Workflow

**North-star sequence** for the single Nebulla agent.

- After a **usable goal**, chat vs short prompt does **not** change pipeline order — only intake before Step 1.
- This file is the **conductor** (order, verbs, artifacts, next step).
- Other docs are **rooms** opened by step number — do not re-explain them here.
- Depth contracts: `project-execution-rules.md`. Fast Prototype detail: `inference-first-rules.md`. UI method: `nebulla-project/ui-generation-logic-v2.md`.
- Policy catalog (lab, until execution-rules align): `recovery-lab/proposed/policies-and-steps.md`.

---

## Doctrine

- One agent; one sequence; chat vs short prompt only changes intake, not pipeline order after goal is usable
- Numbered actions only; every IF has ELSE + Go to Step N
- No inventing competitors / studies / vendors
- Research: direct → method analogues → labeled baseline
- Security / industry: never block critical path; MVP mid-run; offer after Step 13; add only if user accepts
- UI Gen v2 primary; auto-V0 not spine; mockup temporary; plan wins over mockup pixels
- This file is conductor; other docs are rooms opened by step number
- Missing optional dependency → status label (`OK` / `PARTIAL` / `MISSING` / `TIMEOUT` / `SKIPPED_OPTIONAL`) + continue (never freeze pipeline)

---

## Intake note (before Step 1)

- Short prompt or chat: extract primary job, users, constraints. Same critical path after goal is usable.
- Prefer infer + label (`assumption:` / `inferred:`) over interview. Gap-fill detail: `inference-first-rules.md` + `recovery-lab/proposed/policies-and-steps.md` §2.
- **IF** goal unusable (no primary job) → ask **at most one** blocking question → do **not** start Step 1 until answered.
- Interview / brainstorm = opt-in exception only — does not replace Steps 1–14 once goal is usable.

---

## Critical path

### Step 1 — Accept / normalize goal
1. Extract primary job, users, constraints from user text.
2. Write normalized goal into memory.
- **Input:** User message / brief
- **Output:** Goal section in `nebula-project/fast-prototype-memory.md` (or equivalent)
- **Done when:** Non-empty primary job saved
- **IF OK:** Go to Step 2
- **IF PARTIAL/MISSING/TIMEOUT:** One blocking question if unusable → stay Step 1; else label PARTIAL → Go to Step 2
- **Open room (only if needed):** `recovery-lab/proposed/policies-and-steps.md` §2 Gap-fill
- **Must not:** Start long interview; invent features not implied by goal

### Step 2 — Classify type / industry
1. Classify category, platform (`web` / `mobile` / `both` / `unknown`), risk, confidence.
2. Label inferences.
- **Input:** Normalized goal
- **Output:** `nebula-project/category-classification.md` (or plan notes)
- **Done when:** Classification fields present (low confidence allowed)
- **IF OK:** Go to Step 3
- **IF PARTIAL/MISSING/TIMEOUT:** Label assumptions → Go to Step 3
- **Open room (only if needed):** `nebula-project/inference-first-rules.md` Step 3.2
- **Must not:** Block for low confidence; invent niche taxonomy

### Step 3 — Research (with fallbacks)
1. Research direct competitors (target ≥3).
2. IF directs < 3 → method/logic analogues (`analogue:`).
3. IF still thin → labeled category baseline (`baseline:`).
4. Write feature map, UI patterns, evidence or exact `No supporting studies found for this feature.`
- **Input:** Goal + classification
- **Output:** `nebula-project/competitor-research.md` and/or Master Plan §2 research block
- **Done when:** ≥1 of directs / analogues / baseline; no invented names
- **IF OK:** Go to Step 4
- **IF PARTIAL/MISSING/TIMEOUT:** Baseline + continue → Go to Step 4
- **Open room (only if needed):** `recovery-lab/proposed/policies-and-steps.md` §3 Research
- **Must not:** Invent competitors/studies; halt spine for thin research

### Step 4 — Gap-fill assumptions
1. Infer roles, MVP pages, stack default, nav, MVP auth (mock/local OK).
2. Write labeled assumption list; start Deferred security bullets (not implement).
- **Input:** Goal + classification + research
- **Output:** Assumptions in `fast-prototype-memory.md` + Deferred list
- **Done when:** Assumptions list written with labels
- **IF OK:** Go to Step 5
- **IF PARTIAL/MISSING/TIMEOUT:** Defaults + PARTIAL → Go to Step 5
- **Open room (only if needed):** `recovery-lab/proposed/policies-and-steps.md` §2 + §4
- **Must not:** Ask non-blocking brand Qs; force Supabase/Firebase; block on security

### Step 5 — Write Master Plan §§1–5
1. Emit `<START_MASTERPLAN>…</END_MASTERPLAN>` with exact five headers.
2. Fill §4 page fields; §5 tokens ≤15–25 lines (hex palette, type, density, nav).
3. Persist `master-plan.json`.
- **Input:** Goal + research + assumptions
- **Output:** `master-plan.json`
- **Done when:** Five sections non-empty; ≥1 real `/route`; §5 has palette + typography + density
- **IF OK:** Go to Step 6
- **IF PARTIAL/MISSING/TIMEOUT:** Local fillMissing defaults → Go to Step 6 (no security block)
- **Open room (only if needed):** `nebula-project/project-execution-rules.md` Master Plan contract
- **Must not:** Merge §§ into Goal; put page specs in §5; require interview first

### Step 6 — Mind map from §4 only
1. Sync Mind Map exclusively from §4.
2. Do not wait for UI / mockup / V0.
- **Input:** Master Plan §4
- **Output:** Mind-map artifact (IDE / JSON)
- **Done when:** Mind-map routes ⊆ §4 (no invented pages)
- **IF OK:** Go to Step 7
- **IF PARTIAL/MISSING/TIMEOUT:** Retry once from §4 → Go to Step 7
- **Open room (only if needed):** `nebula-project/project-execution-rules.md` Rule MM-1
- **Must not:** Delay for §5/UI/V0; invent pages absent from §4

### Step 7 — Write UI brief
1. Write `nebula-ui-studio/ui-brief.md` from full §4 + §5 tokens (+ authz UI notes).
- **Input:** §4 + §5
- **Output:** `nebula-ui-studio/ui-brief.md`
- **Done when:** File exists and is more than a thin stub
- **IF OK:** Go to Step 8
- **IF PARTIAL/MISSING/TIMEOUT:** Regenerate from plan → Go to Step 8
- **Open room (only if needed):** `nebula-project/project-execution-rules.md` Rule UI-1
- **Must not:** Truncate to 8 routes as sole truth; put full brief only in §5

### Step 8 — UI Gen v2 mockup
1. Generate UI via UI Gen v2 (primary).
2. Label **Pre-code mockup** (not live app).
3. IF gate weak → PARTIAL; do not claim strong success.
- **Input:** ui-brief + §5 + plan
- **Output:** UI Studio model / meta (+ optional mockup HTML artifact)
- **Done when:** Studio/meta usable OR honest PARTIAL/weak recorded; V0 not required
- **IF OK:** Go to Step 9
- **IF PARTIAL/MISSING/TIMEOUT:** Continue coding → Go to Step 9
- **Open room (only if needed):** `nebulla-project/ui-generation-logic-v2.md`
- **Must not:** Auto-trigger V0 as mandatory; treat mockup as product spec

### Step 9 — Foundation coding slice
1. Build Foundation only (shell, routing, layout).
2. Apply via `file:` / apply pipeline to disk.
3. Append Deferred security lines if needed — do not implement full security stack.
- **Input:** Master Plan + ui-brief (plan wins over mockup)
- **Output:** Workspace product files (Foundation under `app/` / `src/` / equiv.)
- **Done when:** Foundation files on disk
- **IF OK:** Go to Step 10
- **IF PARTIAL/MISSING/TIMEOUT:** Report → stay Step 9 or user retry
- **Open room (only if needed):** `nebulla-project/incremental-development.md`
- **Must not:** Dump all §4 routes; clone mockup as sole UI; invent BaaS vendors

### Step 10 — Validate Foundation
1. Validate shell/routes happy path (NDM).
2. Confirm Preview honesty (mockup vs coded).
- **Input:** Foundation files + Preview / App Status if any
- **Output:** Validation note / App Status
- **Done when:** Happy path OK or issues listed with status
- **IF OK:** Go to Step 11
- **IF PARTIAL/MISSING/TIMEOUT:** Fix smallest issue once → Go to Step 11 if shell exists else Step 9
- **Open room (only if needed):** `nebulla-project/debugging-method.md`
- **Must not:** Skip to features with broken shell

### Step 11 — Primary feature slice + validate
1. Build **one** Primary feature slice (core user job).
2. Apply to disk.
3. Validate that job’s happy path.
- **Input:** Plan §3/§4 core job + Foundation
- **Output:** Workspace product files (Primary)
- **Done when:** Primary files on disk + validation OK or PARTIAL with listed gaps
- **IF OK:** Go to Step 12
- **IF PARTIAL/MISSING/TIMEOUT:** Present gaps → Go to Step 12
- **Open room (only if needed):** `nebulla-project/incremental-development.md` + NDM
- **Must not:** Secondary/Polish dump; stop forever at Auth-only without Primary attempt

### Step 12 — Present draft
1. Summarize category, assumptions, pages, mockup vs code honesty.
2. Invite corrections.
- **Input:** Plan + mockup status + coded slices
- **Output:** Chat summary
- **Done when:** User-facing summary delivered
- **IF OK:** Go to Step 13
- **IF PARTIAL/MISSING/TIMEOUT:** PARTIAL summary → Go to Step 13
- **Open room (only if needed):** `nebulla-project/user-communication-rules.md`
- **Must not:** Restart full spine; claim live interactive app if Preview is mockup/bridge only

### Step 13 — End-of-run deferred offers
1. Offer security/industry hardenings in plain language (from Deferred list).
2. IF accept → schedule later slice / amend plan.
3. IF decline/ignore → stop offers this run.
- **Input:** Deferred list + draft
- **Output:** Chat offer (+ optional later task)
- **Done when:** Offer made (acceptance optional)
- **IF OK:** Go to Step 14 or idle
- **IF PARTIAL/MISSING/TIMEOUT:** SKIPPED_OPTIONAL if empty Deferred → idle
- **Open room (only if needed):** `recovery-lab/proposed/policies-and-steps.md` §4
- **Must not:** Block earlier steps for accept; silently add vendors

### Step 14 — Refine changed parts only
1. Update only affected plan sections / slices / UI from user corrections.
2. Preserve the rest.
- **Input:** User corrections
- **Output:** Revised plan/files
- **Done when:** Targeted artifacts updated
- **IF OK:** Idle / await next correction
- **IF PARTIAL/MISSING/TIMEOUT:** Report → idle
- **Open room (only if needed):** Jump to affected Step id; do not re-copy rooms here
- **Must not:** Full regenerate unless user asks

---

## End of critical path

- **Deferred offer:** Step 13 — security/standards in chat; accept → later slice; decline/ignore → move on.
- **Run complete** when all of the following exist or are honestly labeled PARTIAL with reason:
  - Normalized goal + classification + research (or baseline)
  - `master-plan.json` (§§1–5)
  - Mind map from §4
  - `nebula-ui-studio/ui-brief.md`
  - UI Gen v2 mockup attempt (OK or PARTIAL)
  - Foundation files on disk
  - Primary feature files on disk (or PARTIAL with listed gap)
  - User-facing draft summary
  - Deferred offer made or SKIPPED_OPTIONAL
