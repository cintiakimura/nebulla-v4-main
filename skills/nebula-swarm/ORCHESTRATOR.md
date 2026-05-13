# Nebula Swarm Orchestrator

This document defines how **support agents** (Planner, Researcher, Tester, Reviewer) assist **Grok 4.1** without changing Nebula’s **phase system** or **Project Execution Rules**. The law of the land remains `nebula-project/project-execution-rules.md` (and `project-workflow.md` for pre-code ordering). This file only coordinates **parallel preparation** and **artifacts** consumed by Grok.

---

## 1. Non-negotiables

### 1.1 Phase system (100% intact)

- **Pre–Phase 0 gate** — Aligns with `project-workflow.md` steps 8–11 (read order, summary, user questions) before any development work. See `phases/PRE-PHASE-0-GATE.md`.
- **Phase 0 – Foundation** — As defined in Project Execution Rules (read orchestration sources, schema/Prisma, auth, API/secrets, error-handling loop).
- **Phase 1 – Core Features & Quality Control** — Features & KPIs, endpoints, secrets per feature, KPI pass before next feature.
- **Phase 2 – User Interface: Competitor Baseline Analysis** — Competitor baseline, Pencil.dev + `nebula-sysh-ui-sysh-studio.md`, Studio iteration preference.
- **Phase 3 – Polish & User Experience** — Loading/error/empty, responsive, basic a11y, edge cases.
- **Phase 4 – Production Readiness** — Full QA sweep, dedupe, performance, tests + per-feature report, final review.

**Phase 5** (post–first-generation refinement) in Project Execution Rules is **unchanged**: normal chat, plan, **Apply Changes**, silent Code Mode. The swarm does not add phases or reorder 0→4→(5).

Support agents **never** declare a phase complete. Only **Grok**, following Project Execution Rules, advances work and phase intent.

### 1.2 Grok 4.1 is the only effector and voice

| Responsibility | Agent |
|----------------|--------|
| Writes or edits application code, config in the product tree, Prisma/schema files, tests as code | **Grok 4.1 only** |
| Speaks to the user (Initial Conversation, clarifications, Phase 5 chat, summaries, questions) | **Grok 4.1 only** |
| Code Mode output (files only, no chat) | **Grok 4.1 only** |
| Emits Master Plan markers, `START_CODING`, runs fix loops (e.g. up to 5 attempts), applies schema to `Nebula Architecture Spec.md` | **Grok 4.1 only** |
| Plans, research memos, test matrices, review findings (text/structured artifacts) | Planner, Researcher, Tester, Reviewer |

Support agents produce **read-only guidance** under the Project Isolator. They **must not** impersonate Grok to the user, **must not** draft user-visible chat copy for delivery to the user, and **must not** apply patches or run write tools against the codebase.

### 1.3 Project Isolator contract

The Isolator prevents **support agents** from modifying Nebula platform code, orchestration “law,” or the user’s repo through hidden writes. **Grok** remains the sole writer to allowed product paths per Project Execution Rules.

#### ALLOWED_READ (support agents)

Support agents may **read only** paths that are necessary for the active task, within:

1. **Isolated project workspace** — The directory that holds the **user’s generated app** for this project (e.g. cloud: `data/cloud-projects/{projectKey}/` per deployment layout; local/dev: the tree Nebula treats as the project workspace, often alongside or under `nebula-project/` assets as configured in the environment).
2. **Project orchestration & docs** — Files Grok is required to read per rules, for example:
   - `nebula-project/project-execution-rules.md` (read-only for support agents; **do not edit**)
   - `project-workflow.md` (repo root, if present)
   - `nebula-project/master-plan.json`
   - `nebula-project/environment-setup.md`
   - `nebula-project/nebula-sysh-ui-sysh-studio.md`
   - `nebula-project/Nebula Architecture Spec.md`
3. **This swarm pack** — `skills/nebula-swarm/**` (prompts, phase templates, schemas).

Secrets: support agents **must not** paste secret values into artifacts. Refer to placeholders (e.g. `DATABASE_URL` configured in Secrets) and integration **names** only.

#### FORBIDDEN_WRITE (support agents)

Support agents **must not** write, patch, delete, or move:

1. Any **Nebulla / Nebula platform** application source outside the isolated project workspace (e.g. repo `src/`, `server.ts`, `guardian/`, `lib/` that belongs to the IDE/host product — unless your organization explicitly designates a path as “user project only”; default: **forbidden**).
2. **`nebula-project/project-execution-rules.md`**, root **`Project Execution Rules`**, or any file that defines **mandatory** product behavior for Nebula (support output may **quote** requirements; it may not **change** them).
3. **`master-plan.json`**, conversation logs, or Master Plan persistence — **Grok** and product flows own these.
4. **Application code** in the user project — no edits; only Grok implements.

#### ALLOWED_WRITE (support agents only)

- **`skills/nebula-swarm/artifacts/{run-id}/`** — Ephemeral run outputs (handoff fragments, checklists).  
  If the environment disallows even this, agents return artifacts **inline to the orchestration runner** (e.g. parent Grok session) without touching disk.

Grok may read artifacts from `artifacts/` when the parent process merges them into a **handoff packet** for implementation.

### 1.4 Output style

- **Dense, not long:** bullets/tables; no filler; no re-quoting whole sections of execution rules — cite only.
- **Researcher:** ≤6 bullets in primary prose.
- **Handoff packet:** stay short enough for one model context alongside chat history.
- **Grok’s user reply:** natural; no swarm mechanics unless the user asks; final summary often **150–200 words** when summarizing a turn.

---

## 2. Artifact: handoff packet

After support work, the runner merges outputs into one **handoff packet** for Grok (JSON shape: `schemas/handoff-packet.schema.json`).

Sections:

- `intensity` — `light` | `balanced` | `full_quality` (Partner UI default: **full_quality**). **Runtime policy (Nebulla Partner):** Planner+Researcher **once**, only in **`pre_phase_0`**, tracked in `nebula-project/nebula-swarm-state.json`. Tester only on explicit test / run-tests / final-validation language. Reviewer (Full Quality) only on explicit review request or **big feature complete** phrasing — not routine coding turns. **Light/Balanced** = Grok 3 lane; **Full Quality** may add **Reviewer** (Grok 4.1) when selected.
- `phase` — Current execution phase (0–4) or `pre_phase_0` for the gate.
- `planner` — Ordered tasks and exit criteria for **this** phase only.
- `researcher` — Citations, competitor notes, API doc pointers (no secrets).
- `tester` — Test matrix, commands, expected results (Grok runs tests).
- `reviewer` — Findings with severity; no code blocks that constitute “the patch” unless labeled **illustrative only — Grok must author final code**.

Grok **does not** treat support-agent code snippets as authoritative; Grok authors all committed code.

### 2.1 Nebula Partner — when the handoff runs (cost + law)

The Partner client (`src/lib/nebulaSwarmGate.ts`) **does not** invoke the swarm API on every user message. It runs support agents on phase shifts, the first session message, explicit plan/research/swarm/step-by-step requests, major bug/blocker phrasing, or after a failed chat call — **not** on routine follow-ups (“yes”, small edits). Typical implementation work uses **direct Grok 4.1** only.

The server (`lib/nebulaSwarmHandoff.ts`) **never** ingests the whole codebase: capped orchestrator + role prompts + execution-rules excerpt, optional **short conversation summary** and **≤3 focus paths / snippets** supplied by the client (`window.nebulaSwarmFocusPaths`, `window.nebulaSwarmFocusSnippets`), strict JSON output mode for support agents, and hard limits on user-line length. **Intensity** applies only when a handoff actually runs.

---

## 3. Parallel execution model

For the **current** phase:

1. **Build a DAG** — Planner defines dependencies (e.g. Phase 2 competitor matrix before UI prompt suggestions). Researcher, Tester, and Reviewer tasks that **do not** depend on each other may run **in parallel** (separate sub-agent invocations, jobs, or turns).
2. **No parallel Grok writers** — Only one Grok coding session applies changes at a time; swarm shortens **thinking and prep**, not commit concurrency.
3. **Merge** — Single handoff packet + short internal priority list (P0/P1/P2) for Grok.
4. **Execute** — Grok implements per Project Execution Rules (including Code Mode silence when required).

### Suggested parallel bundles (non-binding)

| Phase | Typical parallel support |
|-------|---------------------------|
| Pre-0 | Researcher (stack/API surface) + Reviewer (readiness vs security checklist) while Planner sequences read order and gaps. |
| 0 | Researcher (integration patterns) + Reviewer (schema vs Master Plan) + Tester (future smoke outline); Planner: foundation checklist. |
| 1 | Researcher (per-feature docs) + Reviewer (completed feature) + Tester (regression rows) across **different** features where independent. |
| 2 | Researcher (competitors) + Reviewer (baseline vs studio doc) + Tester (UI acceptance outline). |
| 3 | Reviewer (a11y/edge) + Tester (state matrices) in parallel. |
| 4 | Tester (full matrix + report template) + Reviewer (cleanup/perf checklist) in parallel; Grok runs tests and fixes. |

---

## 4. Agent index

| Agent | Role file |
|-------|-----------|
| Planner | `agents/PLANNER.md` |
| Researcher | `agents/RESEARCHER.md` |
| Tester | `agents/TESTER.md` |
| Reviewer | `agents/REVIEWER.md` |

Phase-specific prompts and checklists: `phases/PHASE-*.md`, `phases/PRE-PHASE-0-GATE.md`.

---

## 5. Versioning

When Project Execution Rules change, update **phase files** and this orchestrator’s **section 1** references to stay aligned. Do not duplicate full phase text from the rules file; **point to it** and add swarm-only deltas (parallel hints, artifact shapes).
