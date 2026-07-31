# Nebula Project vs Nebula Product

This folder is **Nebula Project** — the methodology, rules, and standards that define *how* customer applications should be planned, built, and operated. Treat it as the **“Law of the Land”** for Grok, swarm agents, and human implementers when they work inside a project workspace.

**Nebula Product** is different: it is the Nebula **IDE and platform codebase** (the tool that hosts chat, UI Studio, cloud workspaces, APIs, and the editor). That code lives at the **repository root** — for example `src/`, `lib/`, `public/`, `server.ts`, and build config — **not** under `nebula-project/`.

**Guardian / quality docs** (checklist, bug database, debugging, chat-mode, incremental development, UI generation manuals) live in the sibling folder **`nebulla-project/`** at the repo root — not nested under this folder.

| | **Nebula Project** (`nebula-project/`) | **Guardian docs** (`nebulla-project/`) | **Nebula Product** |
|---|----------------------------------------|----------------------------------------|---------------------|
| **What it is** | Planning, workflow, env reference, master plan, execution rules | Quality / guardian rules for Grok and code review | The IDE/platform that loads those files |
| **Where it lives** | `nebula-project/` (+ copies synced into each cloud project workspace) | `nebulla-project/` at repo root | `src/`, `lib/`, `public/`, etc. |
| **Who edits it** | Product owners update templates here; per-project copies evolve with the project | Product owners / quality maintainers | Engineers working on the Nebula IDE |

When documentation in this folder refers to “the platform” or “the server,” it usually means **Nebula Product** behavior that *implements* these rules — not additional product rules hidden inside `src/`.

### Key files in this folder

- **`project-execution-rules.md`** — Canonical law (Master Plan contract, security baseline, UI brief, Mind Map, Go slices). Wins on conflict.
- **`CHANGELOG-methodology.md`** — Methodology change log (Phases A–F) + operator rollout notes for `MASTER_PLAN_STRICT`.
- **`fixtures/master-plan/`** — Golden Master Plan fixtures for validators (`npm run test:master-plan`).
- **`project-workflow.md`** — Lifecycle pointer (no duplicate MUSTS).
- **`environment-setup.md`** — Canonical environment variable reference for deployments.
- **`nebula-ui-studio.md`** — Studio paths (`ui-brief.md`, optional v0); `NEBULA_UI_STUDIO_*` comment blocks.
- **`ui-studio.md`** — Short pointer into the UI Studio workflow.
- **`master-plan.json`**, **`conversation-log.md`**, **`Nebula Architecture Spec.md`**, **`SKILL.md`** — Planning and agent guidance as applicable to the template.

If you are contributing to **how** projects are run, edit files here (and any workspace copies your pipeline uses). Guardian quality docs belong in **`nebulla-project/`**. If you are contributing to **the IDE itself**, work in Nebula Product paths and keep this separation in mind so rules and code do not drift together unintentionally.
