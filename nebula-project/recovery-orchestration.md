# Nebulla Recovery Orchestration Map

**Status:** Recovery mode active (Phase 0–1 + spine repair)  
**Authority role:** Conductor — coordinates; does **not** replace domain rules.  
**Created:** 2026-08-06  

## Freeze (Phase 0)

Allowed:

- inventory / classification
- critical spine stabilization only

Frozen until spine exits Phase 7:

- new product features
- full 3-screen hybrid polish
- new methodology documents
- visual redesign for its own sake

## Preserved decisions (KEEP — do not discard)

1. Architecture-first product identity  
2. Inference-first default; Guided interview optional  
3. Master Plan 5-section contract  
4. Security baseline when accounts / kids / private data apply  
5. Research-backed assumptions over invention  
6. UI mockup after plan + ui-brief, before full coding  
7. Preview-first / code soft-hide  
8. Hybrid IA: simple Start → Workspace → Dashboard later  
9. Technical documentation after build  
10. One API key = strict sequential stages  

## Official user path

1. Start — enter goal (inference-first)  
2. Workspace — one conversation; observe plan → mockup → code  
3. Dashboard (optional) — Plan, UI Studio, Code, Secrets, Source Control  

## Official machine path (one API key)

```
goal → classify → research → Master Plan §§1–5 → ui-brief
  → UI Gen mockup (plan-first gate)
  → foundation coding slice
  → primary feature slice
  → refine / optional UI refresh
  → technical documentation
```

**Forbidden:** parallel architecture + UI Gen + full codegen; UI before §§4–5 + ui-brief; broad coding before plan draft; restarting discovery when a valid draft exists.

## Active document stack (order)

| Order | Path | Role |
|------:|------|------|
| 1 | `nebula-project/recovery-orchestration.md` | Conductor (this file) |
| 2 | `nebula-project/inference-first-rules.md` | Default intake / stage sequence |
| 3 | `nebula-project/project-execution-rules.md` | Master Plan, security, slices, ui-brief |
| 4 | `nebulla-project/ui-generation-logic-v2.md` (+ engine under `lib/uiGenerationEngine/`) | UI Gen v2 |
| 5 | Guardian set: `debugging-method.md`, `full-bug-database.md`, `code-review-checklist.md`, `incremental-development.md` | NDM / quality |

Lower-order docs must not silently override higher ones.

## Inventory index

- Pages / surfaces → `nebula-project/recovery-inventory-pages.md`  
- Documents → `nebula-project/recovery-inventory-documents.md`  
- Runtime modules → `nebula-project/recovery-inventory-modules.md`  
- Classification summary → section below + canvas  

## Classification summary (Phase 2)

### KEEP

- Inference-first doctrine + start mode storage  
- Master Plan contract + completeness gates  
- Security baseline rule (auto-draft when implied)  
- UI Gen v2 / UI Studio Beta as primary UI path  
- Soft-hide code / preview-first intent  
- NDM + bug DB + code-review checklist  
- Single-key stage order (research → plan → mockup → code)  

### FIX (spine — repair in this order only)

1. **Project identity / file integrity** — consistent `projectKey`; batch memory read; no false 404 noise  
2. **Start / Continue** — bootstrap after reload; Untitled shell hero; rename on free-tier reuse  
3. **Master Plan persistence** — parse tags; auto-continue when Grok returns chat-only (~no tags)  
4. **ui-brief + mockup gate** — plan-first mockup; SEC-only gaps must not block first mockup  
5. **Sequential coding** — coding after mockup triggered; skip post-code UI Gen when early mockup ran  

### QUARANTINE

- Nested stubs: `nebula-project/nebulla-project/`, `nebulla-project/nebulla-project/`  
- Legacy `nebula-project/nebula-ui-studio.md` v0-mandatory language vs Beta-primary  
- Equal-weight methodology cards (keep inference-first primary; interview opt-in only)  
- Chat vs Agent toggle as a start requirement (Agent auto-on for Fast Prototype)  
- Residual auto-V0 as default success path  

### ARCHIVE (candidates — do not delete yet)

- Superseded workflow copies under nested folders once inventory confirms zero runtime refs  
- Dead center pane aliases already redirected (`visual-ui-editor` → beta)  

## Phase 7 spine status (working notes)

| Step | Status | Notes |
|------|--------|--------|
| 7.1 Project/files | Partial | Batch `/api/inference-first/memory` avoids open 404 spam; write paths still need golden-path soak |
| 7.2 Start/Continue | Partial | Bootstrap race fixed; Untitled hero; thin Grok reply needs auto-continue (in working tree) |
| 7.3 Master Plan save | Partial | Persist from tags works when tags exist; auto-continue when missing |
| 7.4 ui-brief + mockup | Partial | Plan-first gate + server ui-brief sync; depends on 7.3 |
| 7.5 Sequential coding | Partial | Await mockup before coding when ready; post-file UI skip if early mockup |

## Golden test (every recovery iteration)

**Brief:** mobile education app for kids to practice reading (ReadNest-style).

Accept:

- Continue does not crash  
- No core identity wipe to Untitled after rename  
- Master Plan not empty placeholder  
- Assumptions visible  
- Mockup can start from plan+brief (not “after coding only”)  
- Refresh keeps project key/name  

Do **not** judge on visual polish or full research richness yet.

## Next actions

1. Keep inventory sheets current as modules change  
2. Land FIX spine commits only (no feature stacking)  
3. Re-run golden test after each spine slice  
4. Postpone Screen 1–3 polish until Phase 7 exit  
