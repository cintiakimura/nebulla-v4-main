**Project Workflow**

End-to-end timeline for a new Nebula project.

**Authority (MUST / MUST NOT):** **`project-execution-rules.md`** — do not duplicate law here.  
**Studio paths:** **`nebula-ui-studio.md`**.  
**Changelog / fixtures:** **`CHANGELOG-methodology.md`**, **`fixtures/master-plan/`**.

---

## Lifecycle (pointer summary)

| Step | What happens | Detail lives in |
|------|----------------|-----------------|
| 1 | Login + create project | Product |
| 2 | Connect services (BYOK) | `environment-setup.md` — V0 optional; Grok/Figma per onboarding |
| 3 | Discovery (one question at a time) | execution-rules — Discovery order + Research Pillars |
| 4 | Master Plan §§1–5 | execution-rules — **Master Plan contract** |
| 5 | Mind Map from **§4 only** | execution-rules — Rule MM-1 |
| 6 | Write **`nebula-ui-studio/ui-brief.md`** (§4 + §5 tokens) | execution-rules — Rule UI-1 |
| 7 | **UI Gen v2 (primary)**; V0 only if optional legacy path | execution-rules — Rules UI-3/UI-4; `nebulla-project/ui-generation-logic-v2.md` |
| 8 | UI Studio → Apply (warning + confirm) → file apply | execution-rules — Rule UI-4 |
| 9 | Go / coding by **one slice** + NDM | execution-rules — Incremental Development; `incremental-development.md` |
| 10 | Polish + Run and Test + iterate | Product + Quality Agent |

**§5** stays a short token summary (≤ 15–25 lines). Rich page detail stays in **§4** and **`ui-brief.md`**.

---

## High-level project creation flow

### 1–2. Login & create project
User logs in; names the project.

### 3. Connect services (onboarding)
- Grok / other model keys per product BYOK rules.
- **V0_API_KEY** — **optional** (legacy UI path only).
- Figma keys — optional for UI Gen v2 reference extract.
- Infrastructure Manager: Render, database, workspace IDs (silent).

### 4. Master Plan interview → generation
- Grok: one question at a time (goal → project type → rest → research pillars).
- Emit `<START_MASTERPLAN>…</END_MASTERPLAN>` with exact five headers.
- Product persists `master-plan.json` and syncs Mind Map from §4 only.

### 5. UI path (after complete plan)
1. Grok writes **`nebula-ui-studio/ui-brief.md`**.  
2. Product / Grok runs **UI Gen v2** when ready.  
3. Optional: distill brief → `v0-prompt.md` → V0 if key + opted in.  
4. User refines in UI Studio; Apply requires warning + confirm.

### 6. Foundation & core development
Read order for agents: `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `ui-brief.md` / studio docs → **`project-execution-rules.md`**.  
Implement via Incremental Development — one slice per Go; validate (NDM) before the next.

### 7. Polish & iteration
States, responsive, a11y; manual Run and Test; chat history via `conversationLog.ts`.

---

## Key principles (non-duplicative)

- **Complete plan** = machine checklist in execution-rules (sections + §4 fields + security baseline + ui-brief).  
- **Mind Map ⊆ §4** — never invent pages.  
- **Beta UI primary; V0 optional.**  
- **Security baseline auto-injected** for naïve users.  
- **No large code dumps in chat** — `file:` / Apply pipeline only.  

**Authority:** `project-execution-rules.md`
