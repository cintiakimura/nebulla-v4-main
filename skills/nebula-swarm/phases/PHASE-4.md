# Phase 4 – Production Readiness (Swarm assist)

**Law:** `nebula-project/project-execution-rules.md` — **Phase 4**: every button and page works; remove duplicate/redundant code/pages; performance optimization; **run all tests**; **complete report with status for each feature**; final code review and cleanup.

---

## Grok responsibilities (unchanged)

- Execute manual/automated verification, run tests, produce the per-feature report, perform cleanup. Sole author of code changes.

---

## Parallel support bundle

| Agent | Focus |
|-------|--------|
| **Tester** | Full matrix, suggested commands, **empty report template** by feature. |
| **Reviewer** | Final review checklist (dedupe, perf, security hygiene); P0/P1/P2 findings. |
| **Planner** | Ordered closure sequence (e.g. tests → report → cleanup → re-run). |
| **Researcher** | Optional: perf or dependency release notes (public sources only). |

Tester + Reviewer in parallel is the default; Grok serializes execution.

---

## Isolator

Support agents do not run the test suite on Grok’s behalf unless the platform explicitly assigns execution to Grok. No code writes. `ORCHESTRATOR.md`.

**Note:** **Phase 5** (post–first-generation refinement) is defined only in the full execution rules document; it is **not** Phase 4. After first delivery, normal chat + Apply Changes flow applies — swarm packs may be reused with `phase` set appropriately in handoff metadata.
