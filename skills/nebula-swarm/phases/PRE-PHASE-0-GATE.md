# Pre–Phase 0 Gate

This gate matches **`project-workflow.md`** before any development: steps **8–11** and the Initial Conversation / Master Plan / `START_CODING` flow described in **`nebula-project/project-execution-rules.md`**. Nothing here starts **Phase 0 – Foundation** until Grok has completed the product’s required pre-code steps per those files.

**Grok 4.1** alone conducts user conversation (one question per turn where required), fills the Master Plan, emits coding markers, and enters Code Mode. Support agents assist **only** with internal prep.

---

## Gate checklist (Grok executes; others assist read-only)

1. **Read order** — `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `nebula-sysh-ui-sysh-studio.md` → `project-execution-rules.md`, plus Secrets & Integrations review (per workflow step 8).
2. **Summary** — Project summary, tech stack, missing pieces (step 9).
3. **User gaps** — If anything material is missing, Grok asks the user **before** coding (step 10).
4. **Start development** — Only after the above does Grok begin **Phase 0** per execution rules (step 11).

---

## Parallel support (orchestrator)

Run in parallel when inputs are available:

| Agent | Task |
|-------|------|
| **Planner** | Checklist for steps 8–11; explicit “blockers” list for Grok to resolve with user. |
| **Researcher** | Early stack / integration / competitor landscape notes (no secrets). |
| **Reviewer** | Readiness vs security/roles mentions in Master Plan; flags missing HIPAA/copyright/API-key clarity per execution rules Initial Conversation criteria. |
| **Tester** | Outline future smoke scope from Pages and Navigation / Features (no code). |

**Merge:** single handoff packet with `phase: "pre_phase_0"` for Grok.

---

## Isolator reminder

Support agents: **ALLOWED_READ** only on project docs and workspace; **FORBIDDEN_WRITE** on code, rules, and `master-plan.json`. See `ORCHESTRATOR.md`.
