**Project Execution Rules**

**Single source of truth** for Grok and the Nebula Product. Studio paths and step detail: **`nebula-ui-studio.md`**. Timeline: **`project-workflow.md`**.

---

## UI/UX workflow at a glance (Grok — read first)

| Order | What | Who | MUST |
|-------|------|-----|------|
| A | Five-section Master Plan saved | Grok | Separate sections; §5 **≤ 15–25 lines** |
| B | Mind Map synced | Product | **Only** from **§4 Pages and navigation** — **not** after §5 or v0 |
| C | `nebula-ui-studio/v0-prompt.md` written | Grok | **Immediately** after Master Plan — §4 + §5 combined |
| D | First v0 generated | Grok → product | **Automatically** after (C); input = `v0-prompt.md` only |
| E | `v0-original/<timestamp>/` saved | Product | Immutable restore copy |
| F | UI Studio open | User | Loads **§5** + **`v0-prompt.md`** + v0 UI |
| G | Apply Changes to All Pages | User | **Warning** → confirm → Grok writes code |

**Grok MUST NOT** skip (C) or (D). **Grok MUST NOT** delay Mind Map (B) until UI/UX or v0 finish.

---

## Core philosophy

- **Grok** — planning, reasoning, coding orchestration.
- **Quality Agent** — manual **Run and Test** only.
- **v0** — one automatic **full** UI pass per baseline from **`nebula-ui-studio/v0-prompt.md`**; per-page regen in UI Studio only.
- **`MAIN_API_KEY_GROK`** — server env only for Grok chat/coding (no user Grok key in UI).
- **Nebula Project** (this folder) ≠ **Nebula Product** (IDE codebase).

---

## Chat vs build — Grok MUST / MUST NOT

| Mode | Grok MUST | Grok MUST NOT |
|------|-----------|----------------|
| Chat | Short prose; one-line status (e.g. file count) | Master Plan bodies, § dumps, UI code, `\`\`\`typescript\` / JSX / SQL fences |
| Master Plan | `<START_MASTERPLAN>…</END_MASTERPLAN>` only | Repeat five sections in chat |
| Implementation | `\`\`\`file:path\` … \`\`\`` → `/api/files/apply-generated` | Paste app code in chat |
| v0 / studio | Write `v0-prompt.md`; trigger product v0 | Paste v0 output or full prompt in chat |

Paths in `\`\`\`file:…\`\`\` are relative to `workspaceRoot` (`data/cloud-projects/{projectKey}`).

---

## Master Plan — five sections (Grok MUST separate)

Grok **MUST** use these headers exactly:

```
### 1. Goal of the app
### 2. Text & Search
### 3. Features and KPIs
### 4. Pages and navigation
### 5. UI/UX design
```

| § | Title | Grok MUST put here | Grok MUST NOT put here |
|---|--------|-------------------|------------------------|
| 1 | Goal of the app | Purpose, users, scope | §2–§5 content |
| 2 | Text & Search | Research, competitors | Pages, UI, code |
| 3 | Features and KPIs | Features + KPIs | Routes, UI, code |
| 4 | **Pages and navigation** | All pages, **`/routes`**, nav, buttons, flows | Visual design essay, code |
| 5 | **UI/UX design** | **Short visual summary only** (15–25 lines max) | Long text, §4 copy, **any code** |

**Grok MUST NOT** merge §2–§5 into §1. **Grok MUST NOT** omit headers.

---

## Rule 1 — UI/UX Design section (CRITICAL)

**Grok MUST** keep **"5. UI/UX design"** (UI/UX Design) **short and concise**.

| Requirement | Detail |
|-------------|--------|
| **Maximum length** | **15–25 lines** (bullets or tight paragraphs) |
| **Purpose** | Visual direction for humans and as input to `v0-prompt.md` |
| **MUST include** | Mood, colors, typography, density, radius, motion, component style (e.g. shadcn + Tailwind) |
| **MUST NOT include** | Long prose; code; JSX/HTML/CSS; full page specs; copy-paste from **Pages and navigation**; the detailed v0 brief |

The **detailed** v0 brief **MUST NOT** live in §5. It **MUST** live in **`nebula-ui-studio/v0-prompt.md`** (Rule 2).

---

## Rule 2 — Backend prompt (Grok MUST — immediately after Master Plan)

**Immediately after** the Master Plan is filled and saved (all five sections, with §5 within line limit):

1. Grok **MUST** create a **concise v0 prompt** ( **800–1200 characters**, hard max **1500** ) that **distills** — not copies —:
   - **"4. Pages and navigation"** → up to **8** routes as `Name → /route` bullets (merge extras into “later pass”)
   - **"5. UI/UX design"** → palette, typography, nav pattern, component vibe only
2. Grok **MUST NOT** paste full §4 paragraphs or long §5 essays into `v0-prompt.md` (v0-pro bills per message; long prompts timeout on Render).
3. Grok **MUST** save it to:

   **`nebula-ui-studio/v0-prompt.md`**

4. Grok **MUST** use `\`\`\`file:nebula-ui-studio/v0-prompt.md\` … \`\`\`` or server automation.
5. Grok **MUST NOT** skip this file, put the full prompt only in chat, or put it only in §5.

Optional mirror: `NEBULA_UI_STUDIO_PROMPT` in `nebula-project/nebula-ui-studio.md`.

---

## Rule 3 — v0 trigger (Grok MUST — immediately after `v0-prompt.md`)

**Immediately after** `nebula-ui-studio/v0-prompt.md` is saved:

1. Grok **MUST** **automatically trigger** the **V0 API** (via product/server — not a manual user step for the first pass).
2. The V0 call **MUST** use **`v0-prompt.md`** as the **only** prompt source for the first full generation.
3. Product **MUST** write generated UI into the workspace (`app/`, `src/`, etc.).
4. Product **MUST** save the **original** v0 output to an immutable, **timestamped** folder:

   **`nebula-ui-studio/v0-original/<timestamp>/`**

   Example: `nebula-ui-studio/v0-original/2026-05-25T14-30-00Z/`

5. **MUST NOT** modify `v0-original/<timestamp>/` during studio apply or edits (restore-only).
6. Grok **MUST NOT** paste v0 files in chat.

**V0_API_KEY** **MUST** be configured (onboarding / My services).

---

## Rule 4 — Nebula UI Studio (product MUST)

When the user opens **IDE → UI Studio**, the product **MUST** load:

| # | Source | Required |
|---|--------|----------|
| 1 | Master Plan **"5. UI/UX design"** | **YES** |
| 2 | **`nebula-ui-studio/v0-prompt.md`** | **YES** |
| 3 | First v0 UI + visual editor model | **YES** |

**Product MUST support:**
- Manual editing (drag, resize, text, colors, spacing)
- Per-page v0 regen (optional; saves credits vs full regen)

**Apply Changes to All Pages** (or **Save Changes & Update Code**):

1. User clicks apply.
2. Product **MUST** show a **clear warning** (workspace files will change; may snapshot to `generated-ui/versions/<timestamp>/`).
3. User **MUST** confirm — Cancel **MUST** mean no writes.
4. Then Grok/server apply (Rule 5 / step 6).

**Grok MUST NOT** bypass the warning. **Grok MUST NOT** tell users to paste UI code in chat for studio fixes.

---

## Rule 5 — Mind Map (product MUST — exclusive §4)

| | |
|-|-|
| **MUST** | Generate Mind Map **exclusively** from **"4. Pages and navigation"** |
| **MUST** | Sync as soon as §4 is saved (same turn as Master Plan persist is acceptable) |
| **MUST NOT** | Wait for **UI/UX Design** (§5), `v0-prompt.md`, v0, or UI Studio |
| **MUST NOT** | Use §5 or v0 output as the primary Mind Map source |
| **MUST** | Use `` `/route` `` in §4 for reliable route parsing |

Re-sync only when §4 changes and user/product runs sync again.

---

## UI/UX workflow — numbered steps (strict order)

**1.** Grok completes five-section Master Plan; **§5 ≤ 15–25 lines**, no code, no §4 dump.  
**2.** Product syncs **Mind Map from §4 only** (parallel — **not** after v0).  
**3.** Grok **immediately** writes **`nebula-ui-studio/v0-prompt.md`** (§4 + §5).  
**4.** Grok/product **immediately** triggers **V0 API** from that file; saves **`v0-original/<timestamp>/`**.  
**5.** User refines in **UI Studio** (§5 + `v0-prompt.md` + v0 UI).  
**6.** User **Apply Changes to All Pages** → **warning** → confirm.  
**7.** Grok implements approved UI via **file apply** / `START_CODING`; **Preview** updates.

---

## Grok — final checklist (non-negotiable)

**MUST**
- [ ] Five separated Master Plan sections with exact `###` headers  
- [ ] **UI/UX Design** ≤ **15–25 lines**; no code; no long text; no §4 copy  
- [ ] **`nebula-ui-studio/v0-prompt.md`** immediately after Master Plan (§4 + §5)  
- [ ] **Automatic V0** immediately after prompt file saved  
- [ ] Mind Map from **Pages and navigation** only — do not wait for UI/UX or v0  
- [ ] File apply after user confirms Apply in UI Studio  

**MUST NOT**
- [ ] Dump §2–§5 into Goal of the app  
- [ ] Put detailed v0 brief in §5 or chat instead of `v0-prompt.md`  
- [ ] Block Mind Map on §5, v0, or UI Studio  
- [ ] Paste v0 or app code in chat  
- [ ] Full v0 re-run for small studio tweaks (per-page regen only)  

---

## Mandatory Agent Methods (Grok MUST)

**Before ANY code change or edit:**
- Mentally complete every item in `nebulla-project/code-review-checklist.md`.

**Whenever a bug is reported or discovered:**
- Strictly follow every step in `nebulla-project/debugging-method.md` (Verify → Analyze → Trace → Fix → Validate).
- Never skip steps or jump to a fix.

These two files are **non-negotiable**. Skipping them causes repeated bugs, incomplete fixes, and wasted user time.

---

## Other rules (abbreviated)

**Infrastructure Manager** — Render + DB; validates **V0_API_KEY**.

**Voice / Open Talk** — TTS on Grok text; mic off during TTS; mic on after **5s** silence; Open Talk resumes after same cooldown.

**Interview** — one question at a time; then Master Plan + workflow above.

**Phases** — 0: read workflow → `master-plan.json` → env → studio docs; 1: features; 2: UI (steps 4–7); 3–4: polish + Run and Test; 5: iteration.

**Chat history** — `conversationLog.ts` per `projectKey`.
