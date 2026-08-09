# Phase B — Policies and step definitions (PROPOSED — not live)

## 0. Status
- **Not authority** — lab draft only
- **Not project-workflow** — do not treat as north-star order document
- **Input to Phase C** — Phase C assembles `project-workflow.proposed.md` from this catalog + policies
- Source inputs: Phase A scorecard conflicts/draft steps; `from-before` V0-era force; live UI Gen v2 orientation (read-only)

---

## 1. Global agent policies

1. **Action wording** — Use hard verbs only: Create / Research / Write / Validate / Apply / Go to Step N. Ban vague “consider / try / maybe / when possible” as the only instruction.
2. **Branch rule** — Every IF has ELSE with a **next Step id** (or labeled SKIPPED_OPTIONAL). No silent halt.
3. **No invent rule** — Never invent competitors, studies, statistics, vendors, APIs, or packages. If unknown → status MISSING / assumption label / research fallback.
4. **No false mid-run blocks** — Security gaps, industry-standards perfection, missing V0 key, missing Figma live, or strict completeness polish MUST NOT stop Steps 1–12. Use MVP defaults + Deferred list.
5. **End-of-run offer rule** — After critical path (Step 12+), offer security/industry hardenings in plain chat. Add to plan/code only if user accepts. Decline/ignore → continue / idle.
6. **One blocking question max** — Ask at most one question when goal is unusable (cannot state primary job). Else gap-fill and proceed.
7. **Artifact honesty** — Label each required output: `OK` | `PARTIAL` | `MISSING` | `TIMEOUT` | `SKIPPED_OPTIONAL`. Never claim Ready/success when artifact is MISSING.

---

## 2. Gap-fill policy

1. **If** goal states a primary job → **Continue** (usable). **Else** → ask one blocking question → wait → Step 1.
2. **Infer and label** (`assumption:` / `inferred:`): project type, roles, MVP page set, stack default, nav pattern, MVP auth posture (e.g. mock/local).
3. **Research** (Step 3 policy): competitors / analogues / baseline — do not invent.
4. **Ask only when blocking**: goal unusable, or contradictory hard constraints that prevent any MVP. Not for brand, logo, or nice-to-haves.
5. **Never fabricate**: competitor names, study citations, vendor choices presented as user decisions, fake metrics.
6. Chat corrections override inferences; do not restart whole spine — jump to affected step.
7. Missing V0 / Figma live → `SKIPPED_OPTIONAL` — UI Gen v2 path continues.

---

## 3. Research policy

1. **Direct competitors** — List real products in category (target 3–12). Status OK if ≥3; else go to (2).
2. **IF directs < 3** → **Method/logic analogues** (same job in adjacent domains). Label `analogue:`. Status PARTIAL if used.
3. **IF still thin** → **Labeled category baseline** (`baseline: <category>`). Status PARTIAL. Continue — do not block.
4. **Evidence** — For top features: short evidence note **or** exact line: `No supporting studies found for this feature.`
5. **Write** into research artifact: `nebula-project/competitor-research.md` and/or Master Plan §2 (same content). Include: competitors/analogues/baseline, feature map, evidence lines, UI pattern notes.
6. **Must not** invent names/stats; must not wait for perfect research before Step 4.

---

## 4. Security and standards policy

| Phase | Behavior |
|-------|----------|
| **Mid-run (Steps 1–12)** | Bypass hard security/industry blocks. MVP defaults: mock/local auth allowed; **no forced Supabase/Firebase** unless plan already names vendor. Record Deferred lines. |
| **Deferred list** | Append short bullets: auth model TBD, RLS/tenant, PII minimize, camera/selfie policy, COPPA/GDPR notes as relevant — **not** implemented yet. |
| **After critical path (Step 13)** | Plain-language offer in chat. **IF** accept → schedule later slice / amend §2. **IF** decline/ignore → Go idle / Step 14 only on user corrections. |

Must not: stop Foundation/Primary because security baseline incomplete; invent cloud vendors mid-run.

---

## 5. UI generation policy

1. **Primary path** — UI Gen v2 + `nebula-ui-studio/ui-brief.md` + §5 tokens.
2. **Auto-V0** — **Not the spine.** Optional/manual legacy only if product still supports key + opt-in. Never require `V0_API_KEY` for success.
3. **Mockup** — Temporary engagement preview. Stitch-minimum honesty. Status must say pre-code mockup ≠ live app.
4. **Plan wins** — Coding implements Master Plan / features / architecture; mockup pixels are non-authoritative.
5. **Post-code refresh** — At most **one** automatic UI Gen pass after UI-relevant apply (when product defines it later). No infinite regen loop.
6. **Must not** restore before-era “Immediately trigger V0” as mandatory (before workflow steps 2–4 / execution C–D).

---

## 6. Step definitions catalog

Critical path after a usable goal. Workflow assembly (Phase C) will order these; IDs are stable.

### Step 1 — Accept / normalize goal
- **Verb:** Extract
- **Input artifact:** User message / brief
- **Actions:**
  1. Extract primary job, users, constraints.
  2. IF unusable → ask one blocking question → stop turn.
  3. ELSE Write normalized goal text.
- **Done when:** Goal text saved with non-empty primary job.
- **Output artifact:** `fast-prototype-memory.md` goal section (or equivalent memory)
- **IF success:** Go to Step 2
- **IF fail / partial:** status MISSING → one question → stay Step 1
- **Must not:** Start interview ladder; invent features not implied by goal

### Step 2 — Classify type / industry
- **Verb:** Classify
- **Input artifact:** Normalized goal
- **Actions:**
  1. Write primary category, platform (`web` / `mobile` / `both` / `unknown`), risk, confidence.
  2. Label inferences `assumption:` / `inferred:`.
- **Done when:** Classification fields present (confidence may be medium/low).
- **Output artifact:** `category-classification.md` (or §1/§2 notes)
- **IF success:** Go to Step 3
- **IF fail / partial:** status PARTIAL + labeled assumptions → Go to Step 3
- **Must not:** Block for low confidence; invent niche taxonomy

### Step 3 — Research (with fallbacks)
- **Verb:** Research
- **Input artifact:** Classification + goal
- **Actions:**
  1. Apply Research policy §3 (direct → analogue → baseline).
  2. Write feature map + UI pattern notes + evidence lines.
- **Done when:** Research artifact exists with ≥1 of: directs / analogues / baseline; no invented names.
- **Output artifact:** `competitor-research.md` and/or plan §2 research block
- **IF success:** Go to Step 4
- **IF fail / partial:** status PARTIAL + category baseline → Go to Step 4
- **IF TIMEOUT:** status TIMEOUT + baseline → Go to Step 4
- **Must not:** Invent competitors/studies; halt spine for thin research

### Step 4 — Gap-fill assumptions
- **Verb:** Infer
- **Input artifact:** Goal + classification + research
- **Actions:**
  1. Apply Gap-fill policy §2.
  2. Write assumption list (roles, pages, stack, MVP auth).
- **Done when:** Assumptions list written with labels.
- **Output artifact:** assumptions in `fast-prototype-memory.md`
- **IF success:** Go to Step 5
- **IF fail / partial:** status PARTIAL → Go to Step 5 with defaults
- **Must not:** Ask non-blocking brand questions; force cloud vendor

### Step 5 — Write Master Plan §§1–5
- **Verb:** Write
- **Input artifact:** Goal + research + assumptions
- **Actions:**
  1. Emit `<START_MASTERPLAN>…</END_MASTERPLAN>` with exact five headers.
  2. Fill §4 page fields (name, route, purpose, primary_actions, data_entities, authz, empty/error, nav_links).
  3. Keep §5 to 15–25 lines tokens (mood, palette hex, type, density, radius, motion, components, nav).
  4. Persist `master-plan.json`.
- **Done when:** Five sections non-empty; ≥1 real `/route` in §4; §5 has palette + typography + density.
- **Output artifact:** `master-plan.json`
- **IF success:** Go to Step 6
- **IF fail / partial:** status PARTIAL → fillMissing local defaults → Go to Step 6 (do not block on security perfection)
- **Must not:** Merge §§ into Goal; put page specs in §5; require interview first

### Step 6 — Mind map from §4 only
- **Verb:** Sync
- **Input artifact:** Master Plan §4
- **Actions:**
  1. Sync Mind Map exclusively from §4 routes/pages.
  2. Do not wait for UI / mockup / V0.
- **Done when:** Mind-map artifact routes ⊆ §4 (no invented pages).
- **Output artifact:** mind-map JSON / IDE mind map
- **IF success:** Go to Step 7
- **IF fail / partial:** status PARTIAL → retry once from §4 → Go to Step 7
- **Must not:** Delay for §5/UI; invent pages not in §4

### Step 7 — Write UI brief
- **Verb:** Write
- **Input artifact:** §4 + §5 (+ authz notes)
- **Actions:**
  1. Write `nebula-ui-studio/ui-brief.md` with full §4 contracts + §5 tokens.
  2. Include Stitch chrome / device line when known.
- **Done when:** `ui-brief.md` exists and length > thin stub.
- **Output artifact:** `nebula-ui-studio/ui-brief.md`
- **IF success:** Go to Step 8
- **IF fail / partial:** status PARTIAL → regenerate from plan → Go to Step 8
- **Must not:** Truncate to 8 routes as sole truth; put full brief only in §5

### Step 8 — UI Gen v2 mockup
- **Verb:** Generate
- **Input artifact:** ui-brief + §5 + plan
- **Actions:**
  1. Run UI Gen v2 (primary).
  2. Label result **Pre-code mockup** (not live app).
  3. IF gate weak → status PARTIAL; keep best attempt; do not claim strong success.
- **Done when:** Studio/meta usable OR honest PARTIAL/weak recorded; auto-V0 not required.
- **Output artifact:** UI Studio model / meta (+ optional mockup HTML artifact)
- **IF success:** Go to Step 9
- **IF fail / partial:** status PARTIAL → Go to Step 9 (coding not blocked on mockup perfection)
- **Must not:** Auto-trigger V0 as mandatory; treat mockup as product spec

### Step 9 — Foundation coding slice
- **Verb:** Build
- **Input artifact:** Master Plan + ui-brief (plan wins over mockup)
- **Actions:**
  1. Implement Foundation only (shell, routing, layout).
  2. Apply via `file:` / apply pipeline to disk.
  3. Append Deferred security lines if needed — do not implement full security stack.
- **Done when:** Foundation files on disk under `app/` / `src/` / equivalent.
- **Output artifact:** workspace product files (Foundation)
- **IF success:** Go to Step 10
- **IF fail / partial:** status PARTIAL/TIMEOUT → report → stay Step 9 or user retry
- **Must not:** Dump all §4 routes; clone mockup as sole UI; invent Supabase/Firebase

### Step 10 — Validate Foundation
- **Verb:** Validate
- **Input artifact:** Foundation files + Preview/App Status if any
- **Actions:**
  1. NDM happy-path check for shell/routes.
  2. Confirm Preview status honesty (mockup vs coded).
- **Done when:** Happy path noted OK or issues listed with status.
- **Output artifact:** validation note / App Status
- **IF success:** Go to Step 11
- **IF fail / partial:** status PARTIAL → fix smallest issue once → Go to Step 11 if shell exists else Step 9
- **Must not:** Skip to polish features with broken shell

### Step 11 — Primary feature slice + validate
- **Verb:** Build then Validate
- **Input artifact:** Plan §3/§4 core job + Foundation
- **Actions:**
  1. Implement **one** Primary feature slice only.
  2. Apply to disk.
  3. Validate happy path for that job.
- **Done when:** Primary files on disk + validation OK or PARTIAL with listed gaps.
- **Output artifact:** workspace product files (Primary)
- **IF success:** Go to Step 12
- **IF fail / partial:** status PARTIAL → present gaps → Go to Step 12
- **Must not:** Implement Secondary/Polish dump; stop forever at Auth-only without Primary attempt

### Step 12 — Present draft
- **Verb:** Present
- **Input artifact:** Plan + mockup status + coded slices
- **Actions:**
  1. Summarize category, assumptions, pages, mockup vs code honesty.
  2. Invite corrections.
- **Done when:** User-facing summary delivered.
- **Output artifact:** chat summary
- **IF success:** Go to Step 13
- **IF fail / partial:** status PARTIAL summary → Go to Step 13
- **Must not:** Restart full spine; claim live interactive app if Preview is mockup/bridge only

### Step 13 — End-of-run deferred offers
- **Verb:** Offer
- **Input artifact:** Deferred list + draft
- **Actions:**
  1. Offer security/industry hardenings in plain language.
  2. IF user accepts → schedule later slice / amend plan.
  3. IF decline/ignore → stop offers this run.
- **Done when:** Offer made (acceptance optional).
- **Output artifact:** chat offer (+ optional later task)
- **IF success:** Go to Step 14 or idle
- **IF fail / partial:** SKIPPED_OPTIONAL if no deferred items → idle
- **Must not:** Block earlier steps waiting for accept; silently add vendors

### Step 14 — Refine changed parts only
- **Verb:** Update
- **Input artifact:** User corrections
- **Actions:**
  1. Update only affected plan sections / slices / UI.
  2. Preserve the rest.
- **Done when:** Targeted artifacts updated.
- **Output artifact:** revised plan/files
- **IF success:** idle / await next correction
- **IF fail / partial:** status PARTIAL → report → idle
- **Must not:** Full regenerate unless user asks

---

## 7. Mapping from before (V0 era) → now

| Old mandatory step (before) | New step | Dropped / remapped reason |
|----------------------------|----------|---------------------------|
| Master Plan interview (one Q at a time default) | Steps 1–4 gap-fill | Inference default; interview opt-in only |
| Emit five-section Master Plan | Step 5 | Kept force; headers/§5 length kept |
| Mind Map from §4 only (must not wait for UI/v0) | Step 6 | **Kept** — before timing force retained |
| Immediately write `v0-prompt.md` | Step 7 `ui-brief.md` | Remapped primary artifact; V0 distill not spine |
| Immediately auto-trigger V0 API | Step 8 UI Gen v2 | **Dropped as mandatory** — V0 optional legacy only |
| Save `v0-original/<timestamp>/` | — / optional legacy | Not required for success |
| UI Studio loads §5 + v0-prompt + v0 UI | Step 8 Studio + ui-brief + v2 | Remapped inputs |
| Apply Changes → file apply | Product UX; coding via Steps 9–11 | Kept confirm/apply idea; not auto-V0 gate |
| Foundation Phase 0 after v0 | Steps 9–10 | Coding after mockup trigger; plan wins over mockup |
| V0_API_KEY required | — | **Dropped** — BYOK Grok; V0 optional |
| Security/brand collected in interview before build | Steps 4 MVP defaults + Step 13 offer | Mid-run bypass; end-of-run offer |

Before quote (force kept): Mind Map “MUST NOT be delayed until after §5 or v0.”  
Before quote (force dropped as spine): “Immediately trigger the V0 API… Do not wait for user action.”

---

## 8. Explicit non-goals this phase

- Did not write `project-workflow.proposed.md` (Phase C)
- Did not write `project-execution-rules.proposed.md`
- Did not edit live `nebula-project/**` or `nebulla-project/**`
- Did not edit `recovery-lab/from-before/**`
- Did not change code, gates, prompts, or IDE UI
- Did not promote any draft to live law
- Did not restore auto-V0 spine

### Deferred (code/runtime — not fixed)

- Preview header non-ASCII crash risk; Preview mockup-vs-coded authority
- UI Gate pass with repetitive slot labels
- Primary slice skipped when first Go labeled Auth
- iframe cannot run workspace Vite/Next/Expo
- `MASTER_PLAN_STRICT` default off vs thin plans

---

## 9. Completion checklist

- [x] Only `recovery-lab/proposed/policies-and-steps.md` (optional scorecard note)
- [x] Zero edits under `nebula-project/` and `nebulla-project/`
- [x] Zero code changes
- [x] No `project-workflow.proposed.md` this turn

## Phase C link

- North-star candidate: `recovery-lab/proposed/project-workflow.proposed.md`
- Assembled from this catalog Steps 1–14 (no merges)
- Next: Phase D human review — no promote until explicit approval
