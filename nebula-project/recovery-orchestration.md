# Nebulla Recovery Orchestration (conductor)

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
goal → classify/research → Master Plan §§1–5 → ui-brief
  → UI mockup (plan-first) → apply to App Preview
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

*End of conductor. Amend in place.*
