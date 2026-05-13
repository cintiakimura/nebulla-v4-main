# Phase 2 – User Interface: Competitor Baseline Analysis (Swarm assist)

**Law:** `nebula-project/project-execution-rules.md` — **Phase 2**: **before** generating UI, analyze **top competitors**; extract common patterns (layout, hierarchy, buttons, color, spacing, navigation); use as baseline; generate UI with **Pencil.dev** + **`nebula-sysh-ui-sysh-studio.md`**; prefer Studio/Pencil iteration; Grok sends the required detailed Pencil prompt for first version.

Phase definition and order are **unchanged** (competitor work precedes UI generation).

---

## Grok responsibilities (unchanged)

- Own competitor analysis in product flow (may consume Researcher packet).
- Author Pencil prompt and code integration per mandatory stack (React, Tailwind, shadcn/ui, Lucide, Pencil — no alternate UI stacks per rules).

---

## Parallel support bundle

| Agent | Focus |
|-------|--------|
| **Researcher** | Competitor matrix, pattern list, citations (feeds Grok’s baseline narrative). |
| **Reviewer** | Confirms “baseline before UI” ordering; checks alignment with `nebula-sysh-ui-sysh-studio.md` process. |
| **Tester** | UI acceptance checklist (baseline patterns, critical flows) — checklist only. |
| **Planner** | Sequencing: research merge → Grok baseline summary → Pencil prompt → implementation steps. |

Researcher and Reviewer can run in parallel once Master Plan / category context is fixed.

---

## Isolator

No UI code from support agents. `ORCHESTRATOR.md`.
