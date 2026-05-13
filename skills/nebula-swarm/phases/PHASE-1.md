# Phase 1 – Core Features & Quality Control (Swarm assist)

**Law:** `nebula-project/project-execution-rules.md` — **Phase 1**: build features **one by one** using **Features & KPIs**; backend endpoints; verify secrets/integrations **before** each feature; data processing logic; **each feature passes KPIs** before the next.

Swarm assists with prep and review in parallel across **different** features where independent.

---

## Grok responsibilities (unchanged)

- Strict feature ordering with KPI pass gates.
- Endpoint and logic implementation; secrets present per feature.

---

## Parallel support bundle

| Agent | Focus |
|-------|--------|
| **Planner** | Per-feature ordering from Master Plan; KPI ↔ acceptance mapping. |
| **Researcher** | Per-feature external docs (parallel across features when no shared blocker). |
| **Tester** | KPI test ideas and regression rows for completed vs in-flight features. |
| **Reviewer** | Completed feature vs plan and execution rules; security/process flags. |

**Constraint:** Do not parallelize **conflicting** assumptions about the same feature; Planner resolves sequencing.

---

## Isolator

Support agents: read-only on project + docs; no code writes. `ORCHESTRATOR.md`.
