# Phase A — Authority scorecard

**Status:** Draft lab only — **not live law**.  
**Date:** 2026-08-09  
**Scope:** Analyze / score / draft spine in this file only. No product or live-doc edits.

**Archive note:** On disk, `recovery-lab/from-before/*.md` are **empty (0 bytes)** placeholders (also empty in git history after move `nebulla-project/recovery-lab` → `recovery-lab`). Before-vs-live comparison for workflow uses (1) git history of live `nebula-project/project-workflow.md` (mid-era auto-V0 spine), (2) repo-root `project-workflow.old.md` (early V0-required outline). Execution-rules “before” uses mid-era git + contrast to live. `nebula-ui-studio-before.md` empty — used live `nebula-project/nebula-ui-studio.md` as residual studio reference only.

---

## 1. Role map

| File | Role | Lines or size if easy | Notes |
|------|------|----------------------|-------|
| `nebula-project/project-workflow.md` | conflict / duplicate spine | 69 lines | Claims timeline pointer but **delegates law** to execution-rules; inventory marks **quarantine**; too thin to be sole north star |
| `nebula-project/project-execution-rules.md` | method (+ de-facto spine) | 328 lines | Self-labels “single source of truth”; contains Post–MP order A–G, Discovery, modes, UI rules — **competes** as conductor |
| `nebula-project/inference-first-rules.md` | conflict / duplicate spine | 528 lines | Full numbered Fast Prototype script Steps 2–10; product critical path in practice; peer to workflow/execution |
| `nebulla-project/ui-generation-logic-v2.md` | method (UI room) | 634 lines | UI Gen method when a step opens UI; not product conductor; authority order lists itself #1 for UI |
| `nebula-project/recovery-orchestration.md` | recovery-only | 287 lines | Recovery conductor (Phase 7); **must not** replace product workflow; has its own machine path diagram |
| `recovery-lab/from-before/project-workflow-before.md` | archive | 0 bytes | Empty placeholder — no usable archive body |
| `recovery-lab/from-before/project-execution-rules-before.md` | archive | 0 bytes | Empty placeholder |
| `recovery-lab/from-before/nebula-ui-studio-before.md` | archive | 0 bytes | Empty placeholder |
| `project-workflow.old.md` (repo root) | archive | 62 lines | Informal early outline; V0 required; not in `from-before/` |
| Mid-era `project-workflow` (git ~`3f70840`) | archive | ~140+ lines | Numbered auto-V0 UI sequence; used as BEFORE for §4 |
| `nebula-project/nebula-ui-studio.md` | reference / conflict | 149 lines | Inventory: quarantine; still cited by workflow/execution; V0 optional diagram |

---

## 2. Spine conflicts

| # | Competing “MUST sequences” | Recommendation (Phase A only) |
|---|----------------------------|-------------------------------|
| C1 | **project-workflow** lifecycle table (1–10) vs **inference-first** Steps 3.1→10.2 vs **execution-rules** mode sequence + Post–MP A–G | **One north star:** revive a single **project-workflow** as conductor (order only). Execution-rules = depth. Inference-first = method opened by workflow step “usable goal → Fast Prototype.” |
| C2 | **recovery-orchestration** official machine path vs product workflow/inference-first | Keep recovery as **recovery-only**; product user journey must not require reading recovery conductor. |
| C3 | **UI Gen v2** primary (live execution + studio) vs mid-era / old workflow **auto-V0 mandatory** spine | **UI Gen v2 wins.** Do **not** restore auto-V0 as spine. |
| C4 | Inventory authority order `orchestration → inference-first → execution` vs execution-rules “timeline pointer = workflow” vs workflow “authority = execution-rules” | Circular. North star should be **workflow**; stop mutual “the other file is law.” |
| C5 | Workflow step 3 “Discovery one question at a time” vs inference-first “never interrogate by default” | Workflow must name **gap-fill / inference** as default; interview = opt-in branch. |
| C6 | Security baseline **MUST inject / can block Go** (execution-rules + strict mode) vs product principle “security must not block critical path mid-run” | Conflict with evaluation criteria. Recommend: MVP defaults mid-run; hardenings offered **after** draft; user accepts. |

**North-star preference:** a single **project-workflow** (to be drafted in Phase B as `project-workflow.proposed.md` only) as conductor for the product user journey.

---

## 3. Per-file quality scores

| File | Strength | Precision | Branch safety | Enforcement fit | Drift risk |
|------|----------|-----------|---------------|-----------------|------------|
| project-workflow.md (live) | Medium | Low | Low | Low | High |
| project-execution-rules.md | High | High | Medium | Medium | High |
| inference-first-rules.md | High | High | Medium | Medium | Medium |
| ui-generation-logic-v2.md | High | High | Medium | Medium | Medium |
| recovery-orchestration.md | High | High | Medium | Medium (recovery) | Low (if recovery-only) |
| from-before/* (empty) | — | — | — | — | — |
| project-workflow.old.md | Medium | Low | Low | Low | High |

### Evidence (1–2 gaps each)

**project-workflow (live)**  
- Pointer tables, not hard verbs with Done artifacts.  
- Points at many peers (`execution-rules`, `nebula-ui-studio`, fixtures, env) → drift.  
- Still frames step 3 as Discovery interview while product default is inference-first.

**project-execution-rules**  
- Strong contracts (§4 fields, Research Pillars, Agent Methods, mockup non-authoritative).  
- Gap: most MUST tagged `prompt` / `doc-only until Phase C`; `MASTER_PLAN_STRICT` default off → sounds like law, soft in product.  
- Security auto-inject + completeness checklist can **block** critical path — conflicts with “security end-of-run offer.”  
- Contains full Post–MP timeline → acts as second conductor.

**inference-first-rules**  
- Best numbered Create/Research/Write/Output pattern in the stack.  
- Gap: requires working files (`competitor-research.md` etc.) without clear ELSE if product compresses into one MP turn.  
- Research “never invent” is clear; **method-analogue → category baseline** ladder not explicit as named fallback chain.  
- Security/standards baked into Steps 4–7 mid-run (not end-of-run offer).

**ui-generation-logic-v2**  
- Clear phases + anti-patterns; mockup vs final / preview authority present.  
- Gap: Gate: pass ≈ Stitch structure, not product-quality UI; “temporary mockup” can under-specify user expectation.  
- Lists its own authority order for UI (fine as room; dangerous if treated as product conductor).

**recovery-orchestration**  
- Precise freeze / Phase 7 / Decision Log.  
- Gap: “Official machine path” duplicates product spine → agents may treat recovery as product north star.

**Archives**  
- Lab `from-before` empty — cannot score body quality.  
- Mid-era workflow: High force on UI steps, but wrong spine (auto-V0).  
- `project-workflow.old.md`: short numbered list; V0 required; no IF/ELSE research fallback.

---

## 4. Before vs live (workflow + execution-rules only)

### What BEFORE had that LIVE lost
- **Forced numbered UI sequence** in workflow itself (Immediate → v0-prompt → auto V0 → Studio → Apply) — live workflow is a thin pointer.  
- **MUST language inside workflow** (not only in execution-rules).  
- Explicit **critical timing** (Mind Map not blocked by UI; UI steps immediate after plan).  
- Mid-era: denser agent-facing “who/when/action” tables for UI.

### What LIVE has that BEFORE lacked
- **Inference-first** default (no long interview by default).  
- **UI Gen v2** + `ui-brief.md` as primary UI path; V0 optional legacy.  
- Master Plan **page fields**, Research Pillars wording, enforcement tags, fixtures.  
- **Mockup non-authoritative** / plan-wins coding clause.  
- Recovery conductor + inventory discipline (separate from product workflow).  
- Fast Prototype post-code UI refresh steps (in inference-first).

### What must NOT be restored from before
- **Auto-V0 as mandatory spine** / `V0_API_KEY` required for success.  
- Interview-as-default for every clear goal.  
- Treating “automatic initial setup = DB schema + v0” as the only first success.  
- Any return to v0-prompt as sole UI input.

---

## 5. Recommended north-star step list (DRAFT ONLY — do not write workflow file)

> **DRAFT FOR PHASE B ONLY — NOT LIVE LAW.**

After a usable goal exists:

1. **Classify** — Write category + platform assumption + risk + confidence (labeled assumption if inferred). Done: classification recorded.  
2. **Gap-fill** — Infer missing roles/pages/stack with labels; ask **at most one** blocking question only if goal unusable. Done: assumptions list.  
3. **Research** — Competitors if findable; ELSE method/logic analogues; ELSE labeled category baseline. Never invent names/stats. Done: research notes in §2 (or research file).  
4. **Write Master Plan §§1–5** — Exact headers; §4 page fields; §5 tokens 15–25 lines. Done: `master-plan.json` persisted.  
5. **Sync Mind Map from §4 only** — No wait for UI. Done: mind-map artifact ⊆ §4.  
6. **Write ui-brief** — Full §4 contracts + §5 tokens. Done: `nebula-ui-studio/ui-brief.md`.  
7. **Generate UI Gen v2 mockup** — Temporary engagement preview; Stitch-minimum. Done: Studio/meta ready (not “live app”).  
8. **Build Foundation slice** — Shell/routes/layout only. Done: foundation files applied.  
9. **Validate Foundation** — NDM happy path / Preview honesty. Done: validate before next.  
10. **Build Primary feature slice** — Core user job only. Done: primary files applied.  
11. **Validate Primary** — Happy path for core job. Done: ready to present.  
12. **Present draft** — Summary + assumptions + invite corrections. Done: user sees draft.  
13. **Offer hardenings (end-of-run)** — Security / industry / compliance suggestions in chat only; add to plan/code **only if user accepts**. Done: offer made (acceptance optional).  
14. **Refine changed parts only** — On user corrections. Done: targeted updates.

**Bypass mid-run:** Do not stop the critical path for full security/industry perfection; use MVP defaults + labeled assumptions through step 12.

---

## 6. Gap-fill policy (DRAFT bullets only)

- Prefer **infer + label** (`assumption:` / `inferred:`) over interview when goal is usable.  
- Fill: project type, roles, MVP pages, stack default, nav pattern, MVP security defaults — from category norms.  
- Research: direct competitors → method/logic analogues → labeled category baseline; never invent competitors/studies/vendors.  
- **One blocking question max** when goal unusable (cannot state primary job). Else continue.  
- Chat corrections override inferences; do not restart whole spine.  
- Do not treat missing brand/logo as blocking.  
- Do not treat missing V0 key as failure (UI Gen v2 path).

---

## 7. Promote plan for later phases (not executed now)

| Phase | Action |
|-------|--------|
| **B** | Write `recovery-lab/proposed/project-workflow.proposed.md` only (from §5 draft) |
| **C** | Human review of proposed workflow |
| **D** | Promote workflow only into live `nebula-project/project-workflow.md` (explicit human approve) |
| **E** | Align `project-execution-rules.md` to “depth behind steps” (demote duplicate timeline; security end-of-run offer policy) |

### Phase A deliberately did not change
- Any file under `nebula-project/` or `nebulla-project/`  
- Any runtime/code  
- No `project-workflow.proposed.md` / `project-execution-rules.proposed.md`  
- No promotion of drafts to live law  
- No auto-V0 restoration  
- Empty `from-before` archives not filled/fabricated

---

## 8. Deferred observations

(Not fixed this turn — list only.)

- App Preview previously crashed on non-ASCII `X-Nebulla-Preview-Status` (em-dash); header should stay ASCII / omitted.  
- UI Gate: pass can clear with Stitch-minimum while slots repeat page name (“Teacher Dashboard” × N).  
- Fast Prototype often stops at Foundation/Auth; Primary auto-continue incomplete when slice labeled Auth.  
- Preview iframe cannot run workspace Vite/Next/Expo; post-code may need honest bridge vs fake mockup.  
- `MASTER_PLAN_STRICT` default `off` → thin §5 / incomplete §4 still Go.  
- `recovery-lab/from-before/*` empty — archive capture incomplete.  
- Inventory marks `project-workflow.md` quarantine while product still points to it as timeline.  
- Circular authority: workflow ↔ execution-rules ↔ inference-first ↔ recovery machine path.  
- Local uncommitted product fixes (preview authority, §5 filler, etc.) may exist outside this Phase A scope — not audited here as code changes.

---

## 9. Completion checklist

- [x] Only `recovery-lab/proposed/scorecard.md` written (plus optional lab README)
- [x] Zero edits under `nebula-project/` and `nebulla-project/`
- [x] Zero code changes
- [x] No proposed workflow/execution files created this turn
