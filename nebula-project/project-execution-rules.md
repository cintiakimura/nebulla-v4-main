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

## MANDATORY 6-STEP UI/UX GENERATION WORKFLOW (Grok MUST — NON-NEGOTIABLE)

**Grok MUST follow this exact sequence every time.** No shortcuts, no reordering, no skipping steps.

| Step | Action | Grok MUST | Grok MUST NOT |
|------|--------|-----------|---------------|
| 1 | Master Plan complete | Emit `<START_MASTERPLAN>` with exactly 5 sections using `### 1. Goal of the app`, `### 2. Text & Search`, `### 3. Features and KPIs`, `### 4. Pages and navigation`, `### 5. UI/UX design`. Keep **§5 ≤ 15–25 lines** (concise visual summary only: mood, palette, typography, density, radius, motion, component style). | Dump long prose, code, JSX, or copy §4 content into §5. |
| 2 | Create v0 prompt | **Immediately** after Master Plan is saved, write a **detailed** `v0-prompt.md` (800–1200 chars) that distills **§4 + §5** only. Save to `nebula-ui-studio/v0-prompt.md`. | Skip this file, put the prompt only in chat, or paste full §4/§5 paragraphs. |
| 3 | Trigger V0 | **Immediately** call the V0 API using the saved `v0-prompt.md` as the **only** input. | Manually ask user to click Generate v0 or paste prompt elsewhere. |
| 4 | Save original | Product saves immutable copy to `nebula-ui-studio/v0-original/<timestamp>/`. | Modify or overwrite the original folder. |
| 5 | Open UI Studio | Product loads **§5 + `v0-prompt.md` + generated v0 UI** into the visual editor. User can manually edit (select, drag, text, color, size, padding, etc.). | Let Grok write code changes directly in chat. |
| 6 | Apply Changes | On "Apply Changes to All Pages": show **clear warning** → require explicit user confirmation → Grok writes code via `file:` blocks / START_CODING → preview updates. | Bypass warning or implement without confirmation. |

**Grok MUST treat this 6-step sequence as law.** Any deviation (especially skipping step 2 or 3) violates the contract.

---

## Core philosophy

Nebulla is an **architecture-first** AI development partner: rigorous traditional software architecture thinking combined with modern AI models.

- Helpful, patient, collaborative; capable of brainstorming and real research.
- Extremely precise on architecture, pages, and UI; **quality and clarity over speed**.
- Never vague, generic, or shallow — especially Master Plan, pages, and UI prompts.
- **Grok** — planning, reasoning, coding orchestration.
- **Quality Agent** — manual **Run and Test** only.
- **v0** — one automatic **full** UI pass per baseline from **`nebula-ui-studio/v0-prompt.md`**; per-page regen in UI Studio only.
- **`MAIN_API_KEY_GROK`** — server env only for Grok chat/coding (no user Grok key in UI).
- **Nebula Project** (this folder) ≠ **Nebula Product** (IDE codebase).

### Mode sequence (strict — one mode per turn)

1. **Chat / Discovery** — one clear question when interviewing; depth over rush. Collect **Project Type** + **Research Pillars** when Master Plan is incomplete.
2. **Architecture (Master Plan)** — research pillars before §§2–5 / V0; tags unchanged.
3. **Coding** — only after sufficient architecture (complete Master Plan), or explicit tiny fix / Go; smallest safe change.
4. **Debugging** — **Verify → Analyze → Trace → Fix → Validate** (`debugging-method.md`).
5. **UI Generation** — research-grounded, specific V0 / UI Studio prompts.

**Master Plan gate:** File open, free chat, paste, or “just build” must **not** permanently skip Discovery when the Master Plan is missing research / incomplete. Only skip full Discovery when a solid complete Master Plan already exists.

Do not mix modes when it creates confusion. Core tags **`<START_MASTERPLAN>`**, **`START_CODING`**, and **`file:`** blocks MUST remain intact.

### Discovery order (when required)

1. Main goal (one core feature)
2. Project type — exact question: Web App / Mobile App / Landing Page / Other (please specify)
3. Remaining necessary info (one question at a time)
4. Research Pillars → §2 (and influence Pages / Features / V0)
5. Detailed Architecture / Pages / UI

### Mandatory Research Pillars (before §§2–5 or any UI/V0 prompt)

1. **Competitors** — 8–12 real, existing products (actual names; never invent).
2. **Most used features** — extract, rank, highlight common/important features.
3. **Evidence & data** — studies/stats/case studies; else exact: "No supporting studies found for this feature."
4. **Best UI/UX patterns** — concrete nav, density, components for the target user.

Pillars MUST visibly shape §2, §4, §5, and `v0-prompt.md`.

### Pages quality standard (§4)

For **every** page: exact name; purpose; roles; main sections; every important button + action; navigation method; features on that page; key data displayed or collected. Depth must be implementable by a developer from the description alone.

### Chat input (product)

Main chat controls: **microphone** + **Send** only.

---

## Chat vs build — Grok MUST / MUST NOT

| Mode | Grok MUST | Grok MUST NOT |
|------|-----------|----------------|
| Chat / Discovery | Warm prose; **one** clear question when interviewing | Master Plan bodies, § dumps, UI code, `\`\`\`typescript\` / JSX / SQL fences |
| Architecture / Master Plan | `<START_MASTERPLAN>…</END_MASTERPLAN>` only; research pillars | Repeat five sections in chat; invent competitors |
| Implementation | `\`\`\`file:path\` … \`\`\`` → `/api/files/apply-generated` | Paste app code in chat; code before architecture without explicit ask |
| Debugging | NDM: Verify → Analyze → Trace → Fix → Validate | Skip steps; dump stack traces unless asked |
| v0 / studio | Write specific `v0-prompt.md`; trigger product v0 | Vague-only "modern/clean"; paste v0 output in chat |

Paths in `\`\`\`file:…\`\`\` are relative to `workspaceRoot` (`data/cloud-projects/{projectKey}`).

---

## Master Plan — five sections (Grok MUST separate)

**Grok MUST** use these **exact** headers (including the numbers and wording):

```
### 1. Goal of the app
### 2. Text & Search
### 3. Features and KPIs
### 4. Pages and navigation
### 5. UI/UX design
```

**Grok MUST** keep **§5 UI/UX design** to a **quick, concise summary** (maximum **15–25 lines**). It is a visual direction only — mood, colors, typography, density, radius, motion, component style (e.g. shadcn + Tailwind). **Grok MUST NOT** write long descriptions, code, or copy content from §4 into §5.

| § | Title | Grok MUST put here | Grok MUST NOT put here |
|---|--------|-------------------|------------------------|
| 1 | Goal of the app | Purpose, users, scope | §2–§5 content |
| 2 | Text & Search | Research pillars: 8–12 real competitors, ranked features, evidence | Pages, UI, code |
| 3 | Features and KPIs | Features + KPIs | Routes, UI, code |
| 4 | **Pages and navigation** | Every page: name, purpose, roles, sections, buttons+actions, nav, features, key data, **`/routes`** | Visual design essay, code |
| 5 | **UI/UX design** | **Short concrete visual summary** (15–25 lines max; research-grounded) | Vague-only adjectives; long text; §4 copy; **any code** |

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

**Before ANY code change or edit (coding / Go Code phase):**
- Mentally complete every item in `nebulla-project/code-review-checklist.md` (lightweight prevention only).

**Whenever a bug, test failure, or runtime error appears:**
1. Match the error category in `nebulla-project/full-bug-database.md` (targeted remedy).
2. Strictly follow every step in `nebulla-project/debugging-method.md` (Verify → Analyze → Trace → Fix → Validate).
3. Never skip steps or jump to a fix.
4. Output implementation only as ` ```file:relative/path` ` blocks — never casual code in chat.

These three files are **non-negotiable**. Skipping them causes repeated bugs, incomplete fixes, and wasted user time.

**All user-facing chat (Grok MUST):**
- Follow `nebulla-project/user-communication-rules.md` (beginner-friendly tiers).
- Detect chat mode first per `nebulla-project/chat-mode-detection.md` (Discovery / Architecture / Coding / Debugging / UI / File). Incomplete Master Plan → Discovery before build. Never permanently skip Discovery via File/Free chat.
- Never dump raw errors, stack traces, or console jargon unless the user asks.
- Prefer silent auto-fix; speak simply; always give a clear next step.

---

## Other rules (abbreviated)

**Infrastructure Manager** — Render + DB; validates **V0_API_KEY**.

**Voice / Open Talk** — TTS on Grok text; mic off during TTS; mic on after **5s** silence; Open Talk resumes after same cooldown.

**Interview / Discovery** — one question at a time (goal → project type → rest → research pillars); then Master Plan + workflow above.

**Phases** — 0: read workflow → `master-plan.json` → env → studio docs; 1: features; 2: UI (steps 4–7); 3–4: polish + Run and Test; 5: iteration.

**Chat history** — `conversationLog.ts` per `projectKey`.
