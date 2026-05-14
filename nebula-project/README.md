# Nebula Project vs Nebula Product

This folder is **Nebula Project** — the methodology, rules, and standards that define *how* customer applications should be planned, built, and operated. Treat it as the **“Law of the Land”** for Grok, swarm agents, and human implementers when they work inside a project workspace.

**Nebula Product** is different: it is the Nebula **IDE and platform codebase** (the tool that hosts chat, UI Studio, cloud workspaces, APIs, and the editor). That code lives at the **repository root** — for example `src/`, `lib/`, `public/`, `server.ts`, and build config — **not** under `nebula-project/`.

| | **Nebula Project** | **Nebula Product** |
|---|-------------------|---------------------|
| **What it is** | Rules, workflows, env reference, master plan shape, execution rules | The application that loads those files and automates the workflow |
| **Where it lives** | `nebula-project/` (+ copies synced into each cloud project workspace) | `src/`, `lib/`, `public/`, etc. |
| **Who edits it** | Product owners update templates here; per-project copies evolve with the project | Engineers working on the Nebula IDE |

When documentation in this folder refers to “the platform” or “the server,” it usually means **Nebula Product** behavior that *implements* these rules — not additional product rules hidden inside `src/`.

### Key files in this folder

- **`project-execution-rules.md`** — Phase model and non‑negotiable execution rules for implementation.
- **`project-workflow.md`** — Canonical read order and high-level lifecycle (the active copy may also live at the repo root for syncing into workspaces; see note in that file).
- **`environment-setup.md`** — Canonical environment variable reference for deployments.
- **`nebula-ui-studio.md`** — Persisted Nebula UI Studio prompt and generated UI code sections (machine-oriented HTML comments).
- **`ui-studio.md`** — Short pointer into the UI Studio workflow and `nebula-ui-studio.md`.
- **`master-plan.json`**, **`Nebula Architecture Spec.md`**, **`SKILL.md`** — Planning and agent guidance as applicable to the template.

If you are contributing to **how** projects are run, edit files here (and any workspace copies your pipeline uses). If you are contributing to **the IDE itself**, work in Nebula Product paths and keep this separation in mind so rules and code do not drift together unintentionally.
