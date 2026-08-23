# Nebulla Recovery Orchestration (conductor)
Canonical runtime order: §11 Canonical spine sequence

**Authority:** Single map of record for Recovery & Re-Integration.  
**Does not replace:** `inference-first-rules.md`, `project-execution-rules.md`, or `nebulla-project/` guardians.  
**NO SECOND CONDUCTOR:** Any future recovery note **amends this file**. Do not create sibling “strategy” trees or parallel recovery markdown families.

---

## 1. Freeze + KEEP + paths

### Recovery mode freeze (until Phase 7 exit)

**Allowed**

- Amend this conductor
- Phase 7 spine repair only
- Golden-path verification notes
- Inventory sheet updates only when a Phase 7 fix discovers a new dependency

**Frozen until Phase 7 exit (2 consecutive golden passes)**

- Full 3-screen hybrid UI polish (Phase 8)
- New methodology documents
- Feature stacking
- Visual redesign for its own sake
- Parallel heavy AI jobs (architecture + UI Gen + full codegen at once)

### KEEP (do not discard)

| Keep | Meaning |
|------|---------|
| Architecture-first identity | Master Plan / architecture before feature sprawl |
| Inference-first default | Guided interview opt-in only |
| Master Plan 5-section contract | §§1–5 persist as real files |
| Security baseline | When accounts / kids / private data apply |
| Research-backed assumptions | Prefer research over invention |
| UI mockup after plan + ui-brief | Before full coding |
| Preview-first / code soft-hide | Product UX target |
| Hybrid IA | Start → Workspace → Dashboard later — *target*, not current sprint |
| One API key = strict sequence | No parallel stampede |
| Technical documentation after build | Later |

### Official machine path (must remain)

```text
goal → Master Plan usable (light assumptions) → FULL research (Web Search) → merge plan
  → ui-brief → UI mockup (plan-first) → apply to App Preview
  → foundation coding → primary slice → refine → tech docs
```

**Done means artifacts exist on disk / in preview** — not stage badges or session flags alone.

### Official user path (target IA — not Phase 7 polish)

```text
Start → Workspace (App Preview + Studio + Chat) → Dashboard (later)
```

Phase 7 reconnects the **machine path** inside today’s IDE shell. Phase 8 polishes the three screens.

### Flag discipline (non-negotiable)

- Do **not** treat “mockup started / intent fired” as success.
- `mockupSucceeded` / skip-regeneration only when **persisted UI Gen meta is usable** (gate pass/repair and/or preview applied).
- If a session flag says done but disk/preview is empty → **clear the flag** and repair/regenerate.
- Studio “Ready” without App Preview update is **not** done for step **7.4**.

---

## 2. Phase status

| Phase | Status | Notes |
|-------|--------|--------|
| 0 Stabilize | Complete enough | Stop inventing; inventory exists |
| 1 Inventory | Complete enough | Sheets under `recovery-inventory-*.md` |
| 2 KEEP / FIX / QUARANTINE | Complete enough | Tables below; amend as discoveries land |
| 3–5 Rebuild / reconnect / harden | Folded into Phase 7 spine | Do not open as parallel workstreams |
| **6 Soft-hide code** | Complete enough for now | Park polish; not a blocker for golden path |
| **7 Spine exit** | **ONLY ACTIVE MILESTONE** | Exit = **2 consecutive golden passes** |
| 8 Three-screen polish | Frozen | After Phase 7 exit only |

---

## 3. Phase 7 — ordered steps + artifact contracts

Work **one step per Agent turn / PR** after constitution install. Fix the **earliest failing** step only.

### 7.0 Auth / API-key health precondition

**When:** Before Start / Continue pipeline (Fast Prototype bootstrap, Continue, thin-reply auto-continue).

**Contract**

- Main chat key must be able to succeed (server key or BYOK as configured).
- On **401 / 403 / invalid key / “Grok chat unavailable”**: **stop**. Clear activity. Surface a clear user-facing error.
- Do **not** run a false plan / mockup / coding stampede after auth failure.
- Classify failure as `key/auth fail` (see taxonomy below).

**Code anchors:** `AIChat.tsx` send path, `sendIdeAssistantGrokTurn`, `MAIN_AI_CHAT_SETUP_HINT`, `continueFailureTaxonomy.ts`.

### 7.1 Identity / files

**Contract:** After successful start, project is not stuck as empty **Untitled**; workspace has a real folder identity; refresh keeps identity.

**Anchors:** `MyProjectsHome.tsx`, `projectNameFromIdea.ts`, free-tier rename, `IdeShell` project open.

### 7.2 Start / Continue

**Contract:** Continue does not crash; chat is alive; bootstrap re-fires when needed (`chatHistoryReady`); Fast Prototype / CONTINUE path can send.

**Anchors:** `AIChat.tsx`, `ideChatBootstrap.ts`, `MyProjectsHome.tsx`.

**On failure — classify (Continue failure taxonomy):**

| Class | Meaning |
|-------|---------|
| `ui crash` | React/render throw; chat panel dead |
| `dead chat` | UI up but send never starts / stuck sending |
| `bootstrap not re-fired` | History load / `chatHistoryReady` / Fast Prototype not scheduled |
| `parse miss` | Model replied but Master Plan tags not extracted |
| `save miss` | Tags present but files not written |
| `key/auth fail` | 401/403/invalid key (see 7.0) |

### 7.3 Master Plan persistence

**Contract:** After a successful planning turn, Master Plan is **not** an empty placeholder. §§1–5 (or strict equivalent) exist as persisted artifacts.

**Anchors:** `persistMasterPlanFromAssistantSource`, Master Plan tab, `project-execution-rules.md`.

### 7.4 ui-brief + mockup + apply-preview → App Preview

**Contract**

1. `ui-brief` exists when plan is usable for mockup.
2. Mockup **success** requires **persisted** UI Gen (gate pass/repair), not session intent alone.
3. **App Preview** is updated via apply-preview (not cyan-only placeholders) when mockup succeeded.
4. No false skip of UI refresh when mockup never landed.

**Anchors:** `uiMockupGate.ts`, `uiStudioBetaEngine.ts` (`hasPersistedUiMockup`, `applyUiStudioBetaToAppPreview`, `markUiMockupSucceeded`), `IdeUiStudioBeta.tsx`, `/api/ide/master-plan-ui-pipeline`.

### 7.5 Sequential coding

**Contract:** Foundation → primary slice after mockup applied (or explicit skip path); one API key sequence; no parallel architecture + UI Gen + full codegen stampede.

**Anchors:** `AIChat.tsx` coding apply, inference-first Step 8.3 / coding slices.

### Phase 7 exit

- [ ] Two consecutive runs of the **golden brief** pass the acceptance checklist below.
- Then unfreeze Phase 8 (3-screen polish) only.

---

## 4. Canonical path resolver rule

**One convention for project file roots during Phase 7.**

| Role | Path |
|------|------|
| Product methodology (this folder) | `nebula-project/` (1 L) — Prefer resolvers that try workspace → repo → `NEBULA_PROJECT_ROOT` |
| Guardian / quality | `nebulla-project/` (2 L) — NDM, bug DB, checklist, incremental |
| Nested stub under `src/` or elsewhere | **Quarantine** — do not teach new hardcoded splits |

**Rules**

- Prefer **existing resolvers** (`server.ts` workspace / `REPO_ROOT` / `NEBULA_PROJECT_ROOT`, client `buildInferenceFirstMemoryBatchUrl`, Studio Beta `nebula-project/ui-studio-beta/…`).
- Do **not** introduce new hardcoded `nebula-project` vs `nebulla-project` forks during Phase 7.
- If a fix discovers a wrong root, fix via resolver — then note in Decision Log + inventory if needed.

---

## 5. KEEP / FIX / QUARANTINE (working)

### KEEP

- Inference-first sequence + Master Plan contract + security baseline rules
- UI mockup gate + plan-first Studio Beta trigger
- Preview-first product direction; soft-hide code (done enough)
- Memory batch `/api/inference-first/memory`
- Apply-preview bridge (Studio Beta → App Preview)

### FIX (Phase 7 spine only)

- 7.0 key/auth fail-fast
- Earliest broken link among 7.1–7.5 per golden brief
- Flag/artifact honesty for mockup + preview

### QUARANTINE

- Legacy V0 / Pencil auto paths (frozen by default)
- Nested duplicate `nebula-project` stubs under product trees
- Parallel “recovery strategy” docs outside this conductor
- Phase 8 visual redesign until exit criteria met

---

## 6. Golden brief + acceptance checklist

**Fixed brief (do not invent a different one for exit criteria):**

> A mobile education app for kids to practice reading; teachers track progress.

| # | Check |
|---|--------|
| 1 | Continue does not crash |
| 2 | Key/auth failure is visible (not silent pipeline) |
| 3 | Project identity not stuck Untitled after successful start |
| 4 | Master Plan not empty placeholder |
| 5 | ui-brief exists when plan usable |
| 6 | Mockup success requires persisted gen; App Preview not cyan-only when mockup succeeded |
| 7 | No false skip of UI refresh when mockup never landed |
| 8 | Refresh keeps project identity |

**Exit:** two consecutive full passes. Record dates/results in Decision Log.

---

## 7. Decision Log

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-08 | Phases 0–2 + 6 complete enough; only active milestone = Phase 7 exit | Reduce parallel streams; reconnect spine before polish |
| 2026-08-08 | Phase 8 (3-screen polish) frozen until 2 golden passes | Avoid redesign while machine path broken |
| 2026-08-08 | Done = artifacts, not session flags | False “mockup started” skipped App Preview |
| 2026-08-08 | Amendments: 7.0 auth precondition; canonical path resolver; Continue taxonomy | Fail-fast keys; stop path drift; debug Continue classes |
| 2026-08-08 | NO SECOND CONDUCTOR — amend this file only | Prevent strategy fragmentation |
| 2026-08-08 | Studio ↔ Preview reconnect shipped in product (`0176` lineage) | 7.4 artifact apply-preview + persisted success flags |
| 2026-08-08 | Constitution installed in this conductor; Phase 7.0 fail-fast + taxonomy in code | Single map of record; stop false pipeline on 401/403/missing key |
| 2026-08-08 | Phase 7.1: shortNameFromIdea + hide orchestration paths (CHANGELOG / `.nebula-*`) | Long brief no longer names project “me an responsiven…”; platform files out of user tree |
| 2026-08-08 | Phase 7.4: loadable-model honesty; Studio repair Generate; auth merge when SEC markers lack sign-in | Stop false “mockup already on disk”; unblock strict Go SEC_AUTH_MISSING |
| 2026-08-08 | Hide D1/secrets/.env + nebula-*-preview.html from explorer; unmount Mind Map when leaving Plan | Confidential files + React Flow bleed over Preview/Studio |
| 2026-08-08 | Phase 7.4: reset false regen/preference-recovery when no loadable model; mount repair without regenerate; prefer Home over Login; strip platform cyan canvas; seed preview cards | Figma rate-limit + empty cycles left Studio Waiting and cyan Login shell |
| 2026-08-08 | Phase 7.5: arch-only ```file:``` no longer counts as coding; Foundation Go after persisted mockup or skip; `canStartFoundationCoding` | ui-brief apply skipped Foundation — explorer stuck on preview shell only |
| 2026-08-08 | App Preview shell renders template chrome (top bar, metrics, progress, bottom tabs) from meta classification | Phase H wrote hero+cards only — Studio richer than Preview |
| 2026-08-08 | Early Phase 8: Generate UI builds up to 3 plan screens into Studio + App Preview switcher; Live Activity is logo-only row | User needed multi-screen mockup + compact throbber before full Phase 8 polish |
| 2026-08-08 | Start home: remove inference/interview chooser; label Prompt; unify ide-glass-card; Continue = btn-cyan chips; missing goal/platform asked in chat | Markup on Start modal — simplify path; chat owns gaps |
| 2026-08-08 | MVP soft-continue: Figma 429 → seed patterns (amber, not hard fail); Go auto-merges industry security baseline + demotes SEC_* blocks | Stop blocking first MVP on optional Figma / security docs polish |
| 2026-08-08 | User "go" / "start coding" + assistant "Starting Foundation…" force Go pipeline even without START_CODING tag | Chat promised coding but never called runGoCodeAndApply |
| 2026-08-08 | Figma 429: probe other keys → offline raw library → catalog+Stitch brief → seed last; stop Nebulla-seed-only short-circuit | UI was ignoring Figma DB / Stitch / Grok brief path |
| 2026-08-08 | Security Accept loop: tighten negation ("no PII" ≠ skip security); Auth model TBD ≠ done; ensureSecurityBaselineInPlan + banner honesty | Accept claimed success but SEC polish kept blocking |
| 2026-08-08 | Security baseline = auto-applied §2 assumptions (asset); SEC_* warn-only; Accept optional; never hard-block Go/Foundation on MVP | Product: liability was treating security polish as Go gate |
| 2026-08-08 | Single Figma model: Generate = local-first (offline→catalog→brief→seed); live only if FIGMA_LIVE_ON_GENERATE + key + local miss | Invert live-first dual logic; ingest scripts keep live |
| 2026-08-08 | Ship structure/ shortlist + apply hints into slots/render; default bucket keys; honest offline/catalog/brief/seed status | Local-first was coded but Render empty + hints unused |
| 2026-08-08 | Stitch-minimum enforcement: page-type slot binding, gate fails Email-on-Home / sparse shells; Preview only on pass | Logic existed; exam wasn’t grading it |
| 2026-08-08 | Mockup ≠ final UI: coding ignores mockup pixels (plan wins); one post-code UI refresh after successful UI-relevant apply | Pre-code draft was treated as sticky / coding spec |
| 2026-08-08 | Auth page_type is page-local only; global `/login` fileRoutes must not force Email onto Kid Home (post-code grounding exposed) | classifyPage joined workspace routes into every page |
| 2026-08-09 | Fast Prototype auto-runs one Primary slice after Foundation (Step 9.2); further slices still need user continue | Pipeline stopped after Foundation with no Step 9.2 |
| 2026-08-09 | Artifact sync 45s soft-timeout (no forever hang); hard-skip unsolicited Supabase/Firebase on apply unless plan names vendor | Same stuck sync + Supabase-by-default loop |
| 2026-08-09 | Concrete §5/ui-brief (no Industry-appropriate filler); bare Go skips Phase-A LLM + client 55s kick abort→poll; Preview labeled shell/static | Same poor UI prompt + Go stuck ~42s + non-interactive preview |
| 2026-08-09 | Preview authority: coded app UI detected → bootstrap does not serve UI Gen mockup as live product; mockup only at public/nebula-ui-gen-preview.html post-code | App Preview stuck on static mockup after Grok wrote real app/src files |
| 2026-08-09 | Drop X-Nebulla-Preview-Status (em-dash crashed Node setHeader); Fast Prototype auto-Primary also after Auth/shell labels | Preview black-screen Invalid character in header; Go stopped at Auth-only |
| 2026-08-09 | Phase E: promoted `project-workflow.proposed.md` → live `project-workflow.md` (Steps 1–14 north star). UI Gen v2 primary; security defer-to-end (Step 13); research direct→analogues→baseline. `project-execution-rules.md` not modified this turn. | Thin live workflow was pointer-only; competing spines with inference-first / execution-rules |
| 2026-08-14 | Render-only stack: apply drops supabase paths; Go/coding/security text never treat RLS as a hosted BaaS; skip warn “stack is Render-only” | Grok invented src/lib/supabase.ts from security language |
| 2026-08-14 | Wired §11 spine phases 1–8: junk-goal stop; brief pages; Go label exact; hard-stop Go/UI Gen if plan/brief unusable after auto-repair | Conductor contract must match runtime; one key, one stroke |
| 2026-08-14 | Phase 3 research is **mandatory** before ui-brief success and Foundation Go. Skip-with-reason removed as Fast Prototype default. Assumptions may pre-fill plan; Web Search overwrites/corrects. Demo skip `NEBULLA_SKIP_RESEARCH=1` default OFF. | Inference-first ≠ skip research; artifact `nebula-project/competitor-research.md` is load-bearing (Gate R) |
| 2026-08-14 | COMPREHENSION FIRST: user brief + links rank above competitor research; extract dense briefs — do not re-interview filled slots. Gate R unchanged. | Stop “main goal?” loops when roles/privacy/tone/study URLs are already in the brief |
| 2026-08-18 | Product finish = A until two goldens. One prompt → Foundation → stop. User Continue for Primary. `FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT = false`. Failed research/mockup does not start Foundation. | Stop the next Agent from turning autopilot back on while Gate R / apply are still flaky |
| 2026-08-23 | Product finish = B. One prompt → research → mockup → Foundation → Primary → Secondary → Polish. `FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT = true`. Failed Gate R still stops. Refresh does not restart Code pass 1. | User must not babysit Continue; first prompt should land a functional MVP |
| 2026-08-23 | Product finish restored = A. `FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT = false`. One Foundation lands or fails honestly. Continue with empty explorer = Retry Foundation, not Primary. Gate R 409 never looks like Code pass 1. | Production looped Code pass 1 / Continue before Foundation landed; Mode B stays off |

---

## 7.1 Phase 3 amendment (research stroke)

- **Assumptions** start the map (type/industry/users/safe defaults) so the user is not interrogated.
- **Research is mandatory** on Fast Prototype / Start / Continue. Skip-with-reason is **not** the default.
- Product runs **one Web Search** heavy job (`POST /api/grok/research` → xAI Responses API `tools: [{ type: "web_search" }]`) and writes `nebula-project/competitor-research.md`.
- **Gate R** then **Gate A** (ui-brief) then UI Gen then Go. IF research missing or below minimum THEN do not treat ui-brief as success and do not start Foundation Go.
- User-visible: `Stopped: research not complete — Foundation will not start.`

---

## 8. Working agreement

1. **One spine stream** — no parallel “rebuild dashboard” + “new methodology” + “spine fix”.
2. **One Phase 7 step per PR / Agent turn** after this constitution install (except this install turn = constitution + 7.0 + at most the earliest clear break).
3. **Authority order for agents:** this file → `inference-first-rules.md` → `project-execution-rules.md` → `nebulla-project/ui-generation-logic-v2.md` + `lib/uiGenerationEngine/` → guardian set.
4. **Inventory sheets** (`recovery-inventory-*.md`) — use them; expand only when a Phase 7 fix discovers a dependency.
5. Prefer **orchestration fixes** over new systems.

---

## 9. Inventory index

| Sheet | Path |
|-------|------|
| Pages | `nebula-project/recovery-inventory-pages.md` |
| Documents | `nebula-project/recovery-inventory-documents.md` |
| Modules | `nebula-project/recovery-inventory-modules.md` |

Live overview canvas (optional): Cursor canvas `nebulla-recovery-map` — not a second conductor.

---

## 10. Exact next-Agent prompt template

```text
Recovery mode. Authority: nebula-project/recovery-orchestration.md.
ONLY Phase 7.<N>. Symptom: <one line>.
Do not redesign. Do not start Phase 8. Do not add methodology docs.
```

---
# Nebulla spine — synchronized sequence (canonical contract)

Philosophy: one user Grok API key. Speed comes from a car-engine sequence: clear strokes, synchronized, one heavy xAI job at a time per project turn. Progress is artifact-based. Labels must match reality. UI Gen v2 is the only auto mockup engine. Go Code must not invent product UI from an empty brief.

Global rules:
1) One heavy Grok job at a time per project turn (plan-fill OR research OR UI Gen OR Go). If a job is already running, join it; do not pretend a new kick started.
2) Next phase only when the required artifact exists, or a documented auto-repair runs first and succeeds.
3) Honest labels only. Never show "App looks OK" or "generating all files in one pass" when artifacts are missing or the job is a single Foundation slice.
4) Default path is mockup-before-code. Code-only is allowed only with an explicit user-visible "mockup deferred — coding Foundation" label.
5) Research is mandatory. Assumptions may pre-fill; Web Search corrects. Never label research as optional skip on the default path.

PHASE 1 — Identity / Start
Entry: user submits goal (Start / Continue / Fast Prototype).
IF goal is empty or junk THEN stop and ask for a short goal; do not open Go or UI Gen.
IF goal is usable THEN set project key and a sensible name; continue to Phase 2.
Artifact out: project identity (key + non-junk name).

PHASE 2 — Master Plan usable
Entry: identity OK.
IF Master Plan is missing or thin (no usable §1 goal / type / pages signal) THEN run one plan-fill pass and write Master Plan (light assumption defaults allowed; label them).
IF after fill the plan is still unusable THEN hard-stop with a clear message; do not start research, UI Gen, or Go.
IF plan is usable THEN continue to Phase 3.
Artifact out: Master Plan on disk with usable goal and page/route signal.

PHASE 3 — FULL research (Web Search) — Gate R
Entry: Master Plan usable.
IF research artifact `nebula-project/competitor-research.md` is missing OR below minimum (fewer than 5 real competitor names, empty rankings, missing UI/UX patterns / evidence / assumptions, or stale goal fingerprint) THEN run one research stroke: labeled assumptions → Web Search → write the file → merge into plan (Phase 3b). Do not re-run on every poll tick; reuse until the goal materially changes.
IF Foundation Go or UI Gen is in flight THEN do not start research in parallel (one heavy job); queue or wait.
IF after the stroke Gate R still fails THEN hard-stop. Activity: "Stopped: research not complete — Foundation will not start." Do not treat ui-brief as success. Do not start UI Gen or Foundation Go.
IF Gate R passes THEN continue to Phase 3b then Phase 4.
Labels: "Researching competitors and patterns (Web Search)…" → "Writing research notes…" → "Updating Master Plan from research…".
Demo-only skip: `NEBULLA_SKIP_RESEARCH=1` or workspace `nebulla-ide/skip-research.json` `{ "skip": true }` — default **OFF**.
Artifact out: competitor-research.md meeting Gate R minimum.

PHASE 3b — Merge research into plan
Entry: Gate R OK.
Confirmed items become plan facts; rejected assumptions marked corrected; never leave invented competitor names after research completes.
`ensureMasterPlanBeforeGo` / plan synthesis MUST read the research artifact and prefer it over model invention for competitors, features, and UI pattern lines.
Artifact out: Master Plan §2 (and thin §3/§5) patched from research.

PHASE 4 — ui-brief (fuel for UI Gen) — Gate A
Entry: Gate R OK; Master Plan merged.
IF ui-brief.md is missing OR too short (under ~80 characters / no pages) THEN auto-build ui-brief from Master Plan §4, §5, goal, **and research outputs** (ranked features, UI patterns, competitor-informed labels). IF auto-build is not possible THEN hard-stop with message: finish plan so ui-brief can be generated; do not start UI Gen or Foundation Go.
IF ui-brief is OK THEN continue to Phase 5.
Hard rule: activity must never say Foundation coding is fine while Gate R or this gate fails. Label: "Building ui-brief…".
Artifact out: ui-brief.md usable (pages + enough text for tokens/slots + research-backed UI).

PHASE 5 — UI mockup (UI Gen v2 only)
Entry: Gate R OK and ui-brief OK, unless user explicitly ordered code-only with visible "mockup deferred" label (research still required).
IF regeneration count is already at max (3) THEN preference recovery only; no silent fourth Generate.
IF ui-brief OK THEN run runUiGenerationCycleV2 only: classify → template → offline Figma/structure → tokens → slots → render → quality gate → write preview model.
IF quality gate is weak after one repair THEN status is weak / try Generate again; not Ready; not App looks OK.
IF gate is pass or repair AND model is loadable THEN write engine preview model and apply to preview shell using existing honesty helpers.
IF model is not loadable THEN clear false "already on disk" flags; status is waiting or failed.
Hard rule: never mark mockup success from flags alone without a loadable preview model. Never claim Ready from an empty research-backed brief.
Artifact out: loadable ui-generation-preview-model OR honest weak/waiting status.

Resource order (mandatory): offline Figma structure/catalog first → named template slots from brief → seed only as fallback. Seed-only empty shell must not be status Ready. Post-code UI Gen may replace the pre-code mockup; coding ignores mockup pixels and follows Master Plan + ui-brief + NDM.

PHASE 6 — Foundation Go Code (one slice)
Entry default: Gate R + Gate A; Phase 5 has a loadable mockup OR explicit honest mockup-deferred coding.
IF research is still missing or below minimum THEN block Go; activity: "Stopped: research not complete — Foundation will not start."
IF ui-brief is still missing or too short THEN block Go; repair brief or stop.
IF a Go job is already running for this project THEN join poll only; label: "Joining in-flight Foundation job…".
IF pre-work (plan ensure / research) is still running and the job is not scheduled yet THEN label: "Preparing plan before Grok Code…"; do not say "Grok Code running".
IF job is scheduled or xAI completion is in flight THEN label exactly: "Grok Code: Foundation slice (up to ~3 min, no stream)". Never say "generating all files in one pass".
IF completion returns THEN apply files and go to Phase 7.
IF timeout THEN honest timeout message; no false OK.
Artifact out: applied file paths from one Foundation slice.

PHASE 7 — Apply + route depth check
Entry: Go completion applied.
IF plan has multiple pages/routes AND disk only has a shell (App.tsx / main.tsx / no app/ or pages/ routes) THEN status is thin Foundation / missing routes; not App looks OK. Optional one targeted follow-up slice only if policy allows and user-visible.
IF real routes exist for the plan THEN continue to honesty labels (same as prior spine: mockup vs code shell).
IF apply wrote zero product files THEN honest failure.
IF loadable mockup exists THEN preview may show mockup; label mockup vs coded shell clearly.
IF only CODE EXISTS shell THEN label as code shell / Open Code; not live app success.
IF no mockup and no routes THEN do not show App looks OK.
IF a post-code UI refresh is desired THEN run a separate post_code UI Gen cycle only after files exist; never mix it into an in-flight Go job.
Artifact out: real routes on disk when plan is multi-page.

PHASE 8 — Debug / next slice (frozen shell — do not redesign)
Only after Phase 7 did not lie about routes. NDM or next slice still one heavy job at a time.

Sync chain (must hold):
Goal → Plan usable → Research (Gate R) → merge → ui-brief OK (Gate A) → UI Gen v2 (loadable or honest weak) → Go Foundation → Apply → Routes check → Next slice/NDM.

This contract does not replace UI Gen v2 internals. It synchronizes when UI Gen and Go may run, what must exist first, and what the UI is allowed to claim. Implementation work should only wire IF/IF NOT gates and labels to these phases; no Phase 8 shell redesign; no multi-model split; no parallel heavy jobs without join/queue visibility.

*End of conductor. Amend in place.*
