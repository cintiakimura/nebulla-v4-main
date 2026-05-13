# Nebula Swarm (`skills/nebula-swarm`)

Lightweight **multi-agent support** around **Grok 4.1** for Nebula projects. This pack does **not** replace `nebula-project/project-execution-rules.md` or `project-workflow.md`; it adds **parallel preparation** (plans, research, test matrices) plus an optional **Reviewer** pass on the draft handoff (Full Quality intensity in the Partner UI) while keeping **Phases 0–4** (and **Phase 5** after first delivery) exactly as defined in those documents.

## Who does what

| Role | Writes code / tests in repo | Talks to user | Typical output |
|------|----------------------------|---------------|----------------|
| **Grok 4.1** | Yes (sole author) | Yes (sole product voice) | Code, Code Mode files, chat |
| Planner, Researcher, Tester, Reviewer | **No** | **No** | Artifacts under `artifacts/` or inlined handoff |

## Start here

1. Read **`ORCHESTRATOR.md`** — phase-locked DAG, **Project Isolator**, handoff packet rules.
2. Pick the phase file in **`phases/`** (or **`PRE-PHASE-0-GATE.md`** before development).
3. **Swarm intensity** (Partner UI): **Light** = Planner + Researcher; **Balanced** = +Tester; **Full Quality** = +Reviewer (Grok 4.1 on server after the Grok 3 parallel pass). Merge into one handoff for Grok.
4. Use **`schemas/handoff-packet.schema.json`** if you want machine-validated merged output.

## Layout

```
skills/nebula-swarm/
  README.md                 ← you are here
  ORCHESTRATOR.md           ← coordination + Isolator contract
  agents/                   ← role prompts
  phases/                   ← phase-specific checklists + parallel hints
  schemas/                  ← handoff JSON schema
  artifacts/                ← ephemeral runs (see .gitignore inside)
```

## Law vs pack

- **Law:** `nebula-project/project-execution-rules.md`, `project-workflow.md`.
- **Pack:** Swarm prompts and artifacts only. Conflicts always resolve in favor of **law**.
