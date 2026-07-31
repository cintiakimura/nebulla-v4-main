# Methodology changelog

Tracks Law-of-the-Land and guardian-doc changes for Master Plan → Mind Map → UI → Go reliability.  
**Canon:** if docs disagree, `project-execution-rules.md` wins.

---

## Phase A — Freeze & baseline (2026-07-31)

No production behavior change. Inventory, contradictions, fixtures, and proposed contract decisions for sign-off before Phase B.

### A1. Active methodology inventory

#### Wave 0 — Orient

| File | Role |
|------|------|
| `nebula-project/README.md` | Canon split: Project vs Guardian vs Product |
| `nebula-project/project-workflow.md` | Lifecycle overview; duplicates UI/v0 sequence (must stay pointer-only after Phase B) |

#### Wave 1 — Master Plan + Discovery

| File | Role |
|------|------|
| `nebula-project/project-execution-rules.md` | **Canonical law** — phases, Master Plan §§1–5, Discovery, Mind Map, UI/v0 sequence, Go/incremental |
| `nebulla-project/chat-mode-detection.md` | Mode pick + “complete Master Plan” gate before Coding/UI |
| `nebula-project/SKILL.md` | User-app design source order (§2 → §5 → uploads) |

#### Wave 2 — Build methodology

| File | Role |
|------|------|
| `nebulla-project/incremental-development.md` | One coherent slice per Go |
| `nebulla-project/debugging-method.md` | NDM: Verify → Analyze → Trace → Fix → Validate |
| `nebulla-project/code-review-checklist.md` | Pre-apply quality bar |
| `nebulla-project/app-status-runtime.md` | Runtime/health expectations for agent |

#### Wave 3 — Mind Map

| File | Role |
|------|------|
| Rules inside `project-execution-rules.md` + `project-workflow.md` | Mind Map **only** from §4 — no separate Mind Map bible |

#### Wave 4 — UI generation

| File | Role |
|------|------|
| `nebulla-project/ui-generation-logic-v2.md` | **Primary** UI Gen Beta authority (tokens, Figma, gate) |
| `nebulla-project/ui-generation-sequence.md` | Sequence companion |
| `nebulla-project/ui-generation-context.md` | Per-cycle context file contract |
| `nebulla-project/ui-generation-engine-manual.md` | Operator/engine step manual |
| `nebula-project/nebula-ui-studio.md` | Studio file + **legacy v0-mandatory** sequence (conflicts with Beta-primary) |
| `nebula-project/ui-studio.md` | Short pointer into studio |
| `docs/figma-reference-library.md` | Ops (owned Figma keys) — not agent law |

#### Wave 5 — Communication

| File | Role |
|------|------|
| `nebulla-project/user-communication-rules.md` | How agent talks to users |
| `nebulla-project/chat-personality.md` | Tone |
| `nebulla-project/chat-vs-agent-mode.md` | Chat vs Agent product toggle |

#### Wave 6 — Supporting

| File | Role |
|------|------|
| `nebula-project/environment-setup.md` | Env var reference |
| `docs/migration/*`, `docs/trust/*` | Infra / trust — supporting only |

#### Explicitly NOT law

| File | Why |
|------|-----|
| `Project-Execution-Rules.old.md`, `project-workflow.old.md` | Archives |
| `nebula-project/Nebula Architecture Spec.md` | Auto stub |
| `nebula-project/master-plan.json`, `conversation-log.md` | Runtime artifacts |
| `nebulla-project/full-bug-database.md`, `ide-black-ui.md`, `language-system.md` | QA / chrome / i18n |
| `nebula-project/nebulla-project/*` | Nested seed copies of guardian UI docs — not a second canon |

#### Product enforcement touchpoints (for later phases)

| Area | Path |
|------|------|
| Section keys / normalize | `lib/masterPlanSections.ts` |
| Master Plan synthesis | `lib/nebulaMasterPlanSynthesis.ts` |
| Discovery / Go / APIs | `server.ts` |
| Mode detection | `src/lib/chatModeDetector.ts` + `chat-mode-detection.md` |
| Chat surface | `src/lib/grokChatArtifacts.ts` |
| UI Gen v2 | `lib/uiGenerationEngine/**` |
| Workspace seed | `lib/nebulaCloudProjectRoot.ts` |

---

### Baseline contradictions

| # | Conflict | Where | Impact |
|---|----------|--------|--------|
| C1 | **§4 asks for rich page contracts** (name, purpose, roles, sections, buttons, nav, data, `/routes`) but **downstream UI brief is capped at 800–1200 chars** and may keep only **≤8 routes** | `project-execution-rules.md` Rule 2; `project-workflow.md`; `nebula-ui-studio.md` | Page detail written then discarded → bare-minimum UIs and weak coding prompts |
| C2 | **§5 ≤ 15–25 lines** (tokens only) **and** is treated as hard visual law for UI Gen v2 — while **detailed brief is supposed to live in `v0-prompt.md`**, which Beta path should not require | execution-rules Rule 1; `ui-generation-logic-v2.md` §5 tokens; studio still v0-centric | No first-class **UI brief** for Beta; §5 vs v0-prompt split is v0-era |
| C3 | **V0 auto-trigger is NON-NEGOTIABLE** in Project docs; product north-star is **UI Gen Beta primary, V0 optional** | execution-rules Rules 3–4; workflow 6-step; `nebula-ui-studio.md` vs `ui-generation-logic-v2.md` | Agents/prompts still push V0; BYOK users without V0 look “broken” |
| C4 | **“Complete Master Plan”** is prose-only (substance + 8–12 competitors). No machine checklist; no security baseline required | execution-rules; `chat-mode-detection.md` | Naïve users get plans without RLS/authz/PII; Go can proceed on thin substance |
| C5 | Template `master-plan.json` key **`2. Tech Research`** vs canonical **`2. Tech and Research`** (aliases exist in code) | `nebula-project/master-plan.json` vs `lib/masterPlanSections.ts` | Confusing for humans/fixtures; code already normalizes |
| C6 | **SKILL.md** sources design from §2/§5 only — **does not mention §4 page contracts** or UI brief | `SKILL.md` | Design skill underweights navigation/page truth |
| C7 | Execution-rules §4 table is rich; **no required fields for authz, empty/error states, or security** on each page | execution-rules § table | Security not auto-injected; Mind Map/UI miss edge states |
| C8 | Nested `nebula-project/nebulla-project/*` duplicates guardian UI docs | seed layout | Drift risk if editors update only one copy |

**Observed failure modes (current product behavior):**

1. Thin §4 in practice → Mind Map and coding slices under-specified.  
2. Weak/absent security in plans → apps ship without RLS/authz notes.  
3. Prompt conflict: rich plan law vs short v0-prompt + mandatory V0.  
4. Beta UI gen reads Master Plan extracts but law still centers `v0-prompt.md`.

---

### Proposed Master Plan contract decisions (sign-off before Phase B)

These are **proposals** for Phase B — do not treat as shipped law until approved.

| ID | Decision | Recommendation |
|----|----------|----------------|
| D1 | Where does rich UI page detail live? | **Prefer separate `nebula-ui-studio/ui-brief.md`** generated from **§4 (full page contracts) + §5 (tokens)**. §5 stays concise visual/token summary (15–25 lines OK). |
| D2 | Role of `v0-prompt.md` | **Legacy optional** — distill of UI brief for V0 only (800–1200 chars). **Not** required for Beta UI Gen. |
| D3 | Primary UI path after Master Plan | **UI Gen v2 (Beta)** when ready; V0 only if `V0_API_KEY` present and user/path opts in. |
| D4 | §4 minimum page fields | Per page: `name`, `route`, `purpose`, `primary_actions`, `data_entities`, `authz`, `empty_state`, `error_state`, `nav_links`. |
| D5 | Security baseline (auto-inject) | Even if user never asks: auth model, RLS/tenant isolation note, secrets handling, PII classification, “deny by default” for private data — must appear in §2 and/or §3/§4. |
| D6 | Machine-complete checklist | “Complete” = all five sections non-placeholder + §4 ≥1 real route with D4 fields + security baseline when auth/data present + §5 has palette+type+density. |
| D7 | Feature flag | `MASTER_PLAN_STRICT=off\|warn\|strict` (Phase C). Default `off` or `warn` until fixtures pass. |
| D8 | Legacy plans | Thin plans classified `legacy`; warn in `warn` mode; block Go only in `strict` for **new** projects. |
| D9 | Template key | Normalize seed `master-plan.json` to `"2. Tech and Research"` in Phase B (tiny, safe). |
| D10 | Enforcement tags | Every MUST in execution-rules tagged `doc-only` \| `prompt` \| `soft-gate` \| `hard-gate` in Phase B rewrite. |

**User: approve / amend D1–D10 before Phase B rewrite.**

---

### A3. Manual baseline runbook

**Happy path (today):**

1. **Discovery** — chat one question at a time (goal → project type → rest → research pillars).  
2. **Master Plan** — five sections via `<START_MASTERPLAN>` → persisted to `master-plan.json`.  
3. **Mind Map sync** — product sync from §4 only (`/api/workspace/mind-map/sync-from-master-plan`).  
4. **UI** — law says write `v0-prompt.md` → auto V0; Beta path uses UI Gen v2 from Master Plan + Figma/seeds when configured.  
5. **Go** — foundation / one slice per `incremental-development.md`; NDM before next slice.

**What to watch when replaying a fixture app (e.g. simple CRUD + auth):**

- Does §4 list every route with actions/authz, or only page names?  
- Does the plan mention RLS / who can read whose rows?  
- Does the agent insist on V0 when only Grok+Figma BYOK is set?  
- Does Mind Map invent pages not in §4?  
- Does Go dump many routes in one pass?

**Fixtures:** see `nebula-project/fixtures/master-plan/README.md`.

---

## Phase B — Wave 1 law rewrite (2026-07-31)

**User approved D1–D10.** Docs-only; no `MASTER_PLAN_STRICT` product gates yet (Phase C).

### Old → new (summary)

| Topic | Old | New |
|-------|-----|-----|
| Rich UI detail | Forced into short `v0-prompt.md` (800–1200 chars, ≤8 routes) | **`nebula-ui-studio/ui-brief.md`** from full §4 + §5 tokens |
| §5 | Short summary also treated as sole detailed brief source via v0 | Tokens only (≤15–25 lines); brief is separate |
| V0 | NON-NEGOTIABLE auto-trigger | **Optional legacy** when key + opted in |
| UI primary | V0 | **UI Gen v2 (Beta)** |
| §4 | Rich prose list, unevenly enforced | Required page fields (incl. authz, empty/error) |
| Security | Mostly absent from “complete” | **Auto-inject baseline** for auth/data apps |
| Complete plan | Prose “substance” | Machine checklist in execution-rules |
| Seed key | `"2. Tech Research"` | `"2. Tech and Research"` |
| MUST tags | None | `doc-only` / `prompt` / `soft-gate` / `hard-gate` |

### Files touched

- `nebula-project/project-execution-rules.md` — full rewrite (contract + UI brief + V0 optional)
- `nebula-project/project-workflow.md` — pointer lifecycle (no duplicate law)
- `nebula-project/SKILL.md` — §4 → ui-brief → §2 → §5 order
- `nebulla-project/chat-mode-detection.md` — complete = checklist + ui-brief
- `nebula-project/nebula-ui-studio.md`, `ui-studio.md` — aligned paths (prevent contradiction)
- `nebula-project/master-plan.json` — canonical §2 key

### Migration note (legacy plans)

Existing thin `master-plan.json` files remain loadable. Until Phase C:

- No hard Go block in product code from this phase.
- Agents/prompts should still target the new contract.
- When Phase C lands: `warn` lists gaps; `strict` blocks **new** incomplete projects; legacy classified, not crashed.

### Residual risks (before Phase C)

- Server/Discovery prompts may still instruct “mandatory V0” until Phase C prompt alignment.
- Product may not yet write `ui-brief.md` automatically.
- Nested `nebula-project/nebulla-project/*` seed copies may still mention old UI sequence — Wave 4 / seed sync later.

---

## Phase C — Soft enforcement (2026-07-31)

### Shipped

| Item | Detail |
|------|--------|
| Validator | `lib/masterPlanCompleteness.ts` — gaps + shape + `allowGo` |
| Flag | `MASTER_PLAN_STRICT=off\|warn\|strict` (default **off**) — documented in `.env.example` |
| Go gate | `server.ts` go-code: **409** + `MASTER_PLAN_INCOMPLETE` when `strict` and block gaps |
| Status API | `GET /api/master-plan/status` — mode, gaps, allowGo |
| Discovery complete | `isMasterPlanCompleteForDiscovery` delegates to validator (plan body; no ui-brief required to leave Discovery) |
| Prompts | Synthesis, autopilot, Go coding, IDE chat appendix — ui-brief primary, V0 optional, security auto-inject, §4 page fields |
| Tests | `npm run test:master-plan` against Phase A fixtures |

### Default safety

Production/local default remains **`off`** — no hard Go break until operators set `warn` or `strict`.

### Residual risks (historical — see Phase F polish)

- Nested seed copies of guardian docs may lag.

---

## Phase E (slice) — UI brief auto-write (2026-07-31)

### Shipped

| Item | Detail |
|------|--------|
| Builder | `lib/nebulaUiBrief.ts` — full §4 + §5 + security notes (no 8-route / 1500-char cap) |
| Sync | `syncUiBriefFromMasterPlan` / `syncUiArtifactsFromMasterPlan` |
| Triggers | Master Plan tab update, Go, `/api/master-plan/status`, UI Gen v2 cycle |
| Studio mirror | `NEBULA_UI_STUDIO_PROMPT` mirrors **ui-brief** (not short v0) |
| UI Gen v2 | Prefers parsed pages + design tokens from `ui-brief.md` |
| Legacy | `v0-prompt.md` still written as short distill for optional V0 |
| Tests | `npm run test:ui-brief` |

---

## Phase D — Build methodology + Mind Map ⊆ §4 (2026-07-31)

| Item | Detail |
|------|--------|
| Docs | `incremental-development.md`, `debugging-method.md`, `code-review-checklist.md`, `chat-mode-detection.md` locked to complete-plan + security slice |
| Detector | `chatModeDetector` UI patterns include ui-brief; describeChatMode updated |
| Mind Map sync | §4-only when pages parse; no workspace invent when §4 present |
| Fidelity | `lib/mindMapFidelity.ts` — PUT blocks extras in `strict`; warn otherwise |
| Heading parse | `### Name \`/route\`` now yields correct mind-map routes |
| Tests | `npm run test:mind-map`, `npm run test:chat-mode` |

## Phase F — Communication + UI polish (2026-07-31)

| Item | Detail |
|------|--------|
| Docs | Honest “plan incomplete” copy; Agent/Chat gate notes |
| Banner | `MasterPlanStatusBanner` on Master Plan panel (`GET /api/master-plan/status`) |
| Go 409 | Friendly message via `formatGoBlockedByPlanMessage` (no gap codes) |
| Go CTA | Hint when Discovery incomplete |
| Prompts | System prompt: ui-brief primary, V0 optional |
| Env | `.env.example` recommends `warn` for staging rollout |
| Tests | `npm run test:master-plan-status` |

### Operator rollout (optional)

1. Local/staging: `MASTER_PLAN_STRICT=warn`  
2. New projects in prod: `strict` when comfortable  
3. Unset / `off` to rollback instantly (no doc redeploy)

Default if unset remains **`off`** (safe).

---

## Phase G — Residual sync / ops (2026-07-31)

| Item | Detail |
|------|--------|
| Nested seeds | `nebula-project/nebulla-project/*` → pointers to repo-root Guardian docs (no second canon) |
| UI Gen law | `ui-generation-logic-v2.md` + sequence: **ui-brief** in authority/inputs |
| Local gate | `.env` set `MASTER_PLAN_STRICT=warn` (staging step of rollout) |
| Workspace seed | New cloud projects also get `CHANGELOG-methodology.md` via `copyIfMissing` |

### Ops checklist (Render / staging)

1. Set `MASTER_PLAN_STRICT=warn` on staging → verify Master Plan banner + Go still works  
2. Spot-check a naïve app: gaps appear; security baseline nudged in Discovery  
3. When ready: `strict` for **new** projects only  
4. Rollback: unset or `off` (no redeploy of markdown required)

---

## Program status

| Phase | Status |
|-------|--------|
| A — Baseline fixtures | **Done** |
| B — Wave 1 law rewrite | **Done** |
| C — Soft enforcement + `MASTER_PLAN_STRICT` | **Done** (default off if unset) |
| D — Incremental / modes / Mind Map ⊆ §4 | **Done** |
| E — UI brief + Beta primary wiring | **Done** |
| F — Communication + UI polish | **Done** |
| G — Residual sync / ops | **Done** (prod `strict` still operator choice) |

### Executed ops (2026-07-31)

| Item | Status |
|------|--------|
| Route-parse bugfix (`/2fa`, empty ui-brief routes) | Committed `0131` |
| Fixture pilots | `npm run test:methodology-pilots` (CRUD+auth, thin-legacy, naïve-insecure, multi-page `/2fa`) |
| Render `nebulla-v4-main` | `MASTER_PLAN_STRICT=warn` set; deploy **live** (`0133` + smoke `/api/health` OK) |
| Docker build break | Fixed AIChat import (`src/lib/masterPlanSections` re-export) — was blocking Render |
| Prod `strict` | **Deferred** — smoke `warn` first; then raise when ready |
| Live IDE click-through | Still human (Master Plan banner + Go in browser) |

### Still operator-owned

1. After Render deploy turns live: open Master Plan → confirm banner; try Go on a thin plan (should warn, not 409)  
2. When comfortable: set Render `MASTER_PLAN_STRICT=strict` (new projects)  
3. Do **not** commit `.env`
