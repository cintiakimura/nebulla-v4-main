# Nebula UI Studio

**Nebula UI Studio** = IDE **UI Studio** tab: first **automatic v0** UI → visual edit → **Apply Changes to All Pages** → Grok writes repo code.

| Document | Role |
|----------|------|
| **`project-execution-rules.md`** | **MUST / MUST NOT** — Grok’s law |
| **`project-workflow.md`** | When each step runs in the project lifecycle |
| **This file** | Paths, studio UI, step-by-step contracts |

---

## Workflow diagram (strict sequence)

**Grok and the product MUST follow this exact order. No reordering or skipping is allowed.**

```
Interview done
    → Master Plan (exactly 5 sections with ### headers; §5 ≤ 15–25 lines concise summary)
    → Mind Map sync (from §4 Pages and navigation ONLY)   ← MUST NOT wait for §5 or v0
    → nebula-ui-studio/v0-prompt.md (detailed, §4 + §5 combined) ← IMMEDIATELY after Master Plan
    → V0 API triggered automatically (using v0-prompt.md as sole input)
    → v0-original/<timestamp>/ saved (immutable restore copy)
    → Nebula UI Studio loads (§5 + v0-prompt.md + generated UI) for manual editing
    → User edits visually → "Apply Changes to All Pages" (warning + explicit confirmation)
    → Grok implements via file: blocks → App Preview updated
```

**This is the only valid sequence.** Any deviation (especially skipping v0-prompt.md creation or the automatic V0 trigger) is a violation.

---

## Mandatory 6-Step UI/UX Generation Process (Grok MUST)

1. **Master Plan complete** — Grok emits the five sections. §5 is a short visual summary only (15–25 lines max).
2. **Create `v0-prompt.md`** — Grok **immediately** writes a concise but detailed prompt (800–1200 chars) combining §4 + §5 and saves it to `nebula-ui-studio/v0-prompt.md`.
3. **Trigger V0 API** — Grok **immediately** calls the V0 API using the saved prompt file as the **only** source.
4. **Save original output** — Product writes the first v0 result to the immutable folder `nebula-ui-studio/v0-original/<timestamp>/`.
5. **Open in UI Studio** — Product loads §5 + `v0-prompt.md` + the generated UI into the visual editor. User performs manual edits.
6. **Apply Changes** — On user confirmation of "Apply Changes to All Pages", Grok writes the approved changes into the actual source files using proper `file:` blocks and updates the live preview.

**Grok MUST NOT** write large code blocks in chat at any point. All implementation goes through the file apply mechanism.

---

## Rule 1 — Master Plan: UI/UX Design (Grok MUST)

**Section key:** `"5. UI/UX design"` (shown in UI as **UI/UX Design**).

| | |
|-|-|
| **Grok MUST** | Keep this section **short and concise** |
| **Maximum** | **15–25 lines** total |
| **Grok MUST** | Cover: mood, palette, typography, spacing/density, radius, motion, component style |
| **Grok MUST NOT** | Exceed 25 lines (unless user explicitly requests more) |
| **Grok MUST NOT** | Dump **long text** into UI/UX Design |
| **Grok MUST NOT** | Put **code** (JSX, HTML, CSS, fences) in UI/UX Design |
| **Grok MUST NOT** | **Copy** content from **Pages and navigation** (§4) or other sections into UI/UX Design |

All page structure, routes, and flows **MUST** stay in **§4 Pages and navigation** only.

---

## Rule 2 — Backend v0 prompt (Grok MUST — immediately after Master Plan)

**Trigger:** The instant the Master Plan is saved (§1–§5 complete, §5 within line limit).

| Step | Grok MUST |
|------|-----------|
| 1 | Read **full** **"4. Pages and navigation"** |
| 2 | Read **full** **"5. UI/UX design"** (short summary) |
| 3 | Merge into one **detailed** v0-ready prompt (all pages, stack: React + Tailwind + shadcn/ui + Lucide) |
| 4 | Save to **`nebula-ui-studio/v0-prompt.md`** |

| Grok MUST NOT |
|---------------|
| Delay this step until chat ends without writing the file |
| Put the detailed prompt only in §5 or only in chat |
| Skip §4 or §5 when building the prompt |

**File path (exact):** `nebula-ui-studio/v0-prompt.md`  
**Create via:** `\`\`\`file:nebula-ui-studio/v0-prompt.md\` … \`\`\`` or server hook after Master Plan persist.

**Legacy mirror (optional):** `NEBULA_UI_STUDIO_PROMPT` comment block at the bottom of this document.

---

## Rule 3 — v0 trigger (Grok MUST — immediately after `v0-prompt.md`)

**Trigger:** The instant `nebula-ui-studio/v0-prompt.md` exists on disk.

| # | Actor | MUST |
|---|--------|------|
| 1 | Grok / product | **Automatically** call **V0 API** (first pass — no extra user click) |
| 2 | Product | Use **`v0-prompt.md`** as the **sole** prompt for first full generation |
| 3 | Product | Write UI files into workspace (`app/`, `src/`, `pages/`, `components/`, `public/`) |
| 4 | Product | Copy **original** v0 tree to **`nebula-ui-studio/v0-original/<timestamp>/`** |
| 5 | Everyone | **MUST NOT** edit `v0-original/<timestamp>/` later (restore-only) |

**Timestamp format (example):** `2026-05-25T14-30-00Z` → folder `nebula-ui-studio/v0-original/2026-05-25T14-30-00Z/`

**Grok MUST NOT** paste v0 output in chat. **V0_API_KEY** **MUST** be set.

---

## Rule 4 — Nebula UI Studio (product MUST)

### What the studio MUST load

| Priority | Source | Purpose |
|----------|--------|---------|
| 1 | Master Plan **"5. UI/UX design"** | Display visual direction to the user |
| 2 | **`nebula-ui-studio/v0-prompt.md`** | Full brief; per-page v0 regen context |
| 3 | First v0 + `generated-ui/visual-editor/preview-model.json` | Editable canvas |

**Product MUST NOT** open studio without (1) and (2) when files exist.  
**Product MUST NOT** require a long §5 before studio opens.

### Manual editing (product MUST support)

- Drag / resize elements  
- Edit text, colors, spacing, typography  
- **Per-page v0 regen** (optional — saves credits vs full app regen)

### Apply Changes to All Pages (product MUST)

| Step | Requirement |
|------|-------------|
| 1 | User clicks **Apply Changes to All Pages** (label may be **Save Changes & Update Code**) |
| 2 | Product **MUST** show a **clear warning**: workspace files will be overwritten; prior files may be archived under `generated-ui/versions/<timestamp>/` |
| 3 | User **MUST** confirm to proceed |
| 4 | Cancel **MUST** abort all file writes |
| 5 | After confirm → Grok/server apply (Rule 5 below) |

**Grok MUST NOT** apply to disk without this confirmation in the UI Studio flow.

---

## Rule 5 — Grok implements code (after Apply confirm)

1. Grok receives approved studio / visual model.  
2. **MUST** emit `\`\`\`file:relative/path\` … \`\`\`` or `START_CODING`.  
3. **MUST NOT** dump large code in chat.  
4. **App Preview MUST** refresh.

Update `NEBULA_UI_STUDIO_CODE` (below) after successful apply if the product uses it.

---

## Rule 6 — Mind Map (exclusive §4 — MUST NOT wait for UI/UX or v0)

| MUST | MUST NOT |
|------|----------|
| Generate **exclusively** from **"4. Pages and navigation"** | Wait for **UI/UX Design** (§5) |
| Sync when §4 is saved | Wait for `v0-prompt.md` |
| Parse routes as `` `/path` `` in §4 | Wait for v0 generation |
| | Use §5 or v0 files as primary Mind Map source |

Mind Map is **independent** of Rules 1–4 timing except it shares §4 content.

---

## Canonical paths

| Path | Required | Role |
|------|----------|------|
| `nebula-ui-studio/v0-prompt.md` | **YES** | Detailed v0 brief (§4 + §5) |
| `nebula-ui-studio/v0-original/<timestamp>/` | **YES** | Immutable first v0 snapshot |
| `generated-ui/visual-editor/preview-model.json` | product | Mutable editor |
| `generated-ui/versions/<timestamp>/` | product | Pre-apply backup |
| `nebula-project/nebula-ui-studio.md` | docs | This file |

**Restore:** Copy from `v0-original/<timestamp>/` → live workspace (UI action only).

---

## Legacy comment blocks (do not delete)

<!--
NEBULA_UI_STUDIO_PROMPT
No prompt generated yet.
-->

<!--
NEBULA_UI_STUDIO_CODE
No approved UI code yet.
-->

- `NEBULA_UI_STUDIO_PROMPT` — **SHOULD** mirror `v0-prompt.md`  
- `NEBULA_UI_STUDIO_CODE` — last applied UI; updated after Apply + Grok apply

---

## Grok quick reference (crystal clear)

1. **Separate** five Master Plan sections.  
2. **UI/UX Design** = **15–25 lines max** — **no** long text, **no** code, **no** §4 copy.  
3. **Immediately** write **`nebula-ui-studio/v0-prompt.md`** = §4 + §5.  
4. **Immediately** trigger **V0** from that file → save **`v0-original/<timestamp>/`**.  
5. **Mind Map** = **§4 only** — **never** wait for UI/UX or v0.  
6. **UI Studio** = §5 + `v0-prompt.md` → edit → **Apply** with **warning** → file apply.  
7. **Never** dump code or Master Plan in chat.
