# Phase 0 – Foundation (Swarm assist)

**Law:** `nebula-project/project-execution-rules.md` — **Phase 0 – Foundation** (read orchestration sources in order: `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `ui-studio.md` → `project-execution-rules.md` → `nebula-ui-studio.md`; Secrets & Integrations; Prisma/schema from **Pages and Navigation**; auth; base API structure; error handling with run/fix up to 5 attempts).

This file adds **parallel support** only. Phase numbering and goals are **unchanged**.

---

## Grok responsibilities (unchanged)

- Comprehend all mandated files.
- Create schema / Prisma models; maintain **`Nebula Architecture Spec.md`** as DB SSOT after Pages & Navigation (per rules §12).
- GitHub auth setup; ask user about additional login methods if applicable.
- Missing APIs/secrets: ask user in chat and use Secrets & Integrations.
- Run code after changes; auto-fix loop (cap 5) then escalate.

---

## Parallel support bundle

| Agent | Focus |
|-------|--------|
| **Planner** | Ordered Phase 0 checklist; explicit dependency: schema after Pages & Navigation understood. |
| **Researcher** | Integration patterns, public docs pointers for planned APIs (no secret values). |
| **Reviewer** | Master Plan vs schema intent; roles/RLS mentions; rule alignment. |
| **Tester** | Future smoke / foundation test outline (commands TBD by Grok after stack exists). |

Outputs feed the handoff packet; **Grok** implements.

---

## Isolator

Support agents must not write application code or orchestration law. See `ORCHESTRATOR.md`.
