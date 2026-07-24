
**Project Workflow**

End-to-end timeline for a new Nebula project. **Strict MUST / MUST NOT rules:** **`project-execution-rules.md`**. **Paths & studio:** **`nebula-ui-studio.md`**.

---

## UI/UX rules summary (Grok)

| # | Rule | Grok / product |
|---|------|----------------|
| 1 | **UI/UX Design** (§5) **≤ 15–25 lines**; no long text, no code, no copy from other sections | Grok **MUST** |
| 2 | **Immediately** after Master Plan → **`nebula-ui-studio/v0-prompt.md`** (§4 + §5) | Grok **MUST** |
| 3 | **Immediately** after prompt file → **auto V0 API** → **`v0-original/<timestamp>/`** | Grok **MUST** trigger; product **MUST** save |
| 4 | **UI Studio** loads §5 + `v0-prompt.md`; **Apply Changes to All Pages** with **clear warning** + confirm | Product **MUST** |
| 5 | **Mind Map** from **Pages and navigation** (§4) **only** — **MUST NOT** wait for UI/UX or v0 | Product **MUST** |

---

## Strict 6-Step UI/UX Generation Sequence (Grok MUST — NON-NEGOTIABLE)

**Grok MUST execute these steps in exact order after the Master Plan interview is complete:**

1. **Emit the five-section Master Plan** using the exact headers:
   - `### 1. Goal of the app`
   - `### 2. Tech and Research`
   - `### 3. Features and KPIs`
   - `### 4. Pages and navigation`
   - `### 5. UI/UX design`
   
   **§5 MUST be a quick, concise visual summary (15–25 lines maximum).** No long prose, no code, no copying from §4.

2. **Immediately create `nebula-ui-studio/v0-prompt.md`** — A detailed but concise prompt (800–1200 characters) that combines the key content from **§4 Pages and navigation** and **§5 UI/UX design**. This file is the **sole input** for the first v0 pass.

3. **Immediately trigger the V0 API** — Call the V0 endpoint using the newly saved `v0-prompt.md` as the prompt. Do not wait for user action.

4. **Ensure original v0 output is saved** — The product writes the first generated UI to the immutable folder `nebula-ui-studio/v0-original/<timestamp>/` for future restore.

5. **Open Nebula UI Studio** — The studio loads **§5 + `v0-prompt.md` + the generated v0 UI**. The user can now manually edit elements (select, move, resize, change text/color, etc.).

6. **Implement "Apply Changes to All Pages"** — When the user clicks this button, the product shows a **clear warning dialog**. Only after explicit confirmation does Grok write the approved visual changes into the actual source files (via `file:` blocks) and refresh the App Preview.

**Mind Map MUST be generated from §4 only and MUST NOT be delayed until after §5 or v0.**

**Grok MUST NOT** output large code blocks in the chat. All code changes happen through the proper file application pipeline.

---

## High-level project creation flow

### 1. Login
User logs in (GitHub or Email).

### 2. Create new project
User names the project.

### 3. Connect services (onboarding)
- **V0_API_KEY** — **required** for automatic UI generation.
- Infrastructure Manager: Render, database, workspace IDs (silent).
- Grok: server **`MAIN_API_KEY_GROK`** only.

### 4. Master Plan interview
- Grok: **one question at a time** (voice/TTS per execution rules).
- Collects purpose, users, features, data, security, brand (optional).

### 5. Master Plan generation

**Grok MUST:**

1. Emit `<START_MASTERPLAN>…</END_MASTERPLAN>` with **five separated sections** and exact headers (`### 1.` … `### 5.`).
2. Keep **UI/UX Design** (`### 5. UI/UX design`) to **15–25 lines maximum** — concise visual summary only.
3. **MUST NOT** put code, long prose, or **Pages and navigation** copy into UI/UX Design.

**Product MUST:**

4. Persist to **`master-plan.json`** and Master Plan IDE tab.
5. **Immediately** sync **Mind Map exclusively from §4 Pages and navigation**.
6. **MUST NOT** wait for UI/UX Design, `v0-prompt.md`, v0, or UI Studio before Mind Map.

### 6. UI/UX generation (7 numbered steps)

| Step | When | Who | Action |
|------|------|-----|--------|
| **1** | Master Plan done | Grok | Five sections saved; **UI/UX Design ≤ 15–25 lines** |
| **2** | §4 saved (same window OK) | Product | **Mind Map** from **Pages and navigation** only |
| **3** | **Immediately** after step 1 | Grok | Write **`nebula-ui-studio/v0-prompt.md`** = §4 + §5 |
| **4** | **Immediately** after step 3 | Grok + product | **Auto-trigger V0 API**; save **`v0-original/<timestamp>/`** |
| **5** | After step 4 | User + product | **UI Studio**: load **UI/UX Design** + **`v0-prompt.md`** + v0 UI; manual edit |
| **6** | User ready | User + product | **Apply Changes to All Pages** → **clear warning** → **confirm** |
| **7** | After step 6 confirm | Grok | File apply / `START_CODING` → **Preview** updates |

**Critical timing**

- Step **2** **MUST NOT** depend on steps 3–5.  
- Steps **3 → 4** **MUST** run **immediately** after Master Plan — no chat-only v0.  
- Step **5** **MUST** read both **UI/UX Design** and **`v0-prompt.md`**.

Full contracts: **`nebula-ui-studio.md`**.

### 7. Foundation (Phase 0)
Grok reads: `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `nebula-ui-studio.md` + `nebula-ui-studio/v0-prompt.md` → `project-execution-rules.md`.  
Database + auth from Master Plan. UI baseline from steps 3–4 if present.

### 8. Core development (Phase 1)
Features from Master Plan via **Incremental Development** (`project-execution-rules.md`: Build → Debug → Next). Each **Go** / `START_CODING` = **one slice** + `\`\`\`file:…\`\`\`` — **MUST NOT** dump the full app or code in chat. Validate (NDM) before the next slice.

### 9. UI development (Phase 2)
First UI: steps 3–7. Later UI: UI Studio → Apply (warning) → Grok; **MUST NOT** full v0 unless redesign.

### 10. Polish & production (Phases 3–4)
States, responsive, a11y; manual **Run and Test**.

### 11. Normal iteration (Phase 5)
Chat + **Run and Test**; history via `conversationLog.ts`.

---

## Key principles (final — MUST / MUST NOT)

**Grok MUST**
- Separate five Master Plan sections.  
- Limit **UI/UX Design** to **15–25 lines**; no code; no copied long text from §4.  
- Create **`nebula-ui-studio/v0-prompt.md`** **immediately** after Master Plan (§4 + §5).  
- **Automatically trigger V0** **immediately** after that file is saved.  
- Rely on file apply after UI Studio Apply confirm.  

**Grok MUST NOT**
- Dump sections into Goal of the app.  
- Put the detailed v0 prompt in §5 or chat instead of `v0-prompt.md`.  
- Delay Mind Map until UI/UX or v0 completes.  
- Paste v0 or application code in chat.  

**Product MUST**
- Mind Map **exclusively** from **Pages and navigation**.  
- Save v0 originals under **`nebula-ui-studio/v0-original/<timestamp>/`**.  
- UI Studio: **UI/UX Design** + **`v0-prompt.md`**.  
- **Apply Changes to All Pages**: **clear warning** + user **confirm**.  

**Authority:** `project-execution-rules.md` · **Studio detail:** `nebula-ui-studio.md`
