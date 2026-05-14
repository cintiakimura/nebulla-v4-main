# Pre–Phase 0 Gate

This gate matches **`project-workflow.md`** before any development: **Initial Setup (4)**, **Foundation Phase — read order (5)**, and the flows in **`nebula-project/project-execution-rules.md`**. Nothing here starts **Phase 0 – Foundation** until Grok has completed the product’s required pre-code steps per those files.

**Grok 4.1** alone conducts user conversation (one question per turn where required), fills the Master Plan, emits coding markers, and enters Code Mode. Optional **Quality Agent** prep is **manual only** (**Run and Test**), not a pre-phase gate.

---

## Gate checklist (Grok executes; others assist read-only)

1. **Read order** — `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `ui-studio.md` → `project-execution-rules.md` → `nebula-ui-studio.md` (per `project-workflow.md` §5 and `ui-studio.md`), plus Secrets & Integrations review.
2. **Summary** — Project summary, tech stack, and missing pieces aligned with **Initial Setup (4)** in `project-workflow.md` and `project-execution-rules.md`.
3. **User gaps** — If anything material is missing, Grok asks the user **before** coding.
4. **Start development** — Only after the above does Grok begin **Foundation Phase (Phase 0)** per execution rules.

---

## Parallel support (orchestrator)

- **Quality Agent** — **manual only** (**Run and Test**); optional after large reads, not a gate blocker. No Planner/Researcher pipeline for new work.

---

## Isolator reminder

Support agents: **ALLOWED_READ** only on project docs and workspace; **FORBIDDEN_WRITE** on code, rules, and `master-plan.json`. See `ORCHESTRATOR.md`.
