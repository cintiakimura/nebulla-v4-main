# Nebula UI Studio

**Nebula UI Studio** = IDE **UI Studio** tab: generate UI → visual edit → **Apply Changes to All Pages** → Grok writes repo code.

| Document | Role |
|----------|------|
| **`project-execution-rules.md`** | **MUST / MUST NOT** — Grok’s law (wins on conflict) |
| **`project-workflow.md`** | Lifecycle pointer |
| **`nebulla-project/ui-generation-logic-v2.md`** | UI Gen Beta (primary engine) |
| **This file** | Paths, studio load list, Apply contract |

---

## Workflow diagram (aligned with execution-rules)

```
Interview done
    → Master Plan (5 sections; §5 ≤ 15–25 lines tokens)
    → Mind Map sync (from §4 ONLY)   ← MUST NOT wait for UI
    → nebula-ui-studio/ui-brief.md   ← §4 page contracts + §5 tokens (PRIMARY)
    → UI Gen v2 (Beta) when ready
    → [optional legacy] v0-prompt.md distill → V0 API → v0-original/<timestamp>/
    → UI Studio loads (§5 + ui-brief + generated UI)
    → User edits → Apply Changes (warning + confirm)
    → Grok file: blocks → App Preview updated
```

Full MUST/MUST NOT: **`project-execution-rules.md`** (Rules UI-1…UI-4, MM-1).

---

## Rule 1 — §5 UI/UX Design (tokens only)

**Section key:** `"5. UI/UX design"`.

| | |
|-|-|
| **Maximum** | **15–25 lines** |
| **MUST** | Mood, palette, typography, density, radius, motion, component style, nav pattern |
| **MUST NOT** | Long prose; code; copy of §4; the UI brief |

Page structure stays in **§4** and **`ui-brief.md`**.

---

## Rule 2 — UI brief (primary — immediately after Master Plan)

**Path:** `nebula-ui-studio/ui-brief.md`  
**Create via:** ` ```file:nebula-ui-studio/ui-brief.md` ` or server hook after Master Plan persist.

**MUST include:** every §4 page (required page fields) + §5 tokens + authz/UI security notes.  
**MUST NOT:** put the full brief only in §5 or only in chat.

Legacy mirror (optional): `NEBULA_UI_STUDIO_PROMPT` comment block at the bottom of this document (prefer mirroring **ui-brief**, or v0 distill if legacy path).

---

## Rule 3 — V0 optional legacy

Only when `V0_API_KEY` is set and the V0 path is opted in:

1. Distill ui-brief → `nebula-ui-studio/v0-prompt.md` (800–1200 chars, max 1500).  
2. Trigger V0; save `nebula-ui-studio/v0-original/<timestamp>/` (immutable).  
3. **MUST NOT** paste v0 output in chat.  

If V0 is not configured, skip this rule — UI Gen v2 + ui-brief is success.

---

## Rule 4 — What the studio MUST load

| Priority | Source | Required |
|----------|--------|----------|
| 1 | Master Plan §5 | YES |
| 2 | **`nebula-ui-studio/ui-brief.md`** | YES (primary) |
| 3 | Generated UI (v2 and/or legacy v0) + preview model | When present |
| 4 | `v0-prompt.md` | Only if legacy V0 path ran |

### Manual editing (product MUST support)

- Drag / resize; edit text, colors, spacing, typography  
- Optional per-page regen  

### Apply Changes to All Pages (product MUST)

1. User clicks Apply (or **Save Changes & Update Code**).  
2. **Clear warning** (workspace may change; may archive under `generated-ui/versions/<timestamp>/`).  
3. User **confirms** — Cancel = no writes.  
4. Then Grok/server apply via `file:` / `START_CODING`.  

---

## Rule 5 — Grok implements code (after Apply confirm)

1. Emit ` ```file:relative/path` ` or `START_CODING`.  
2. **MUST NOT** dump large code in chat.  
3. App Preview refreshes.  
4. Update `NEBULA_UI_STUDIO_CODE` below after successful apply if used.

---

## Rule 6 — Mind Map (exclusive §4)

| MUST | MUST NOT |
|------|----------|
| Generate only from §4 | Wait for §5 / ui-brief / v0 |
| Sync when §4 is saved | Invent pages absent from §4 |
| Parse `` `/path` `` routes | Use §5 or UI output as primary source |

---

## Canonical paths

| Path | Required | Role |
|------|----------|------|
| `nebula-ui-studio/ui-brief.md` | **YES** (after complete plan) | Primary UI input (§4 + §5) |
| `nebula-ui-studio/v0-prompt.md` | Optional legacy | Distill for V0 only |
| `nebula-ui-studio/v0-original/<timestamp>/` | If V0 ran | Immutable first v0 snapshot |
| `generated-ui/visual-editor/preview-model.json` | product | Mutable editor |
| `generated-ui/versions/<timestamp>/` | product | Pre-apply backup |

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

- `NEBULA_UI_STUDIO_PROMPT` — **SHOULD** mirror `ui-brief.md` (or `v0-prompt.md` on legacy path)  
- `NEBULA_UI_STUDIO_CODE` — last applied UI; updated after Apply + Grok apply

---

## Grok quick reference

1. Five Master Plan sections (see execution-rules contract).  
2. §5 = **15–25 lines** tokens only.  
3. **Immediately** write **`ui-brief.md`**.  
4. UI Gen v2 primary; V0 only if optional.  
5. Mind Map = §4 only.  
6. Studio Apply = warning → confirm → file apply.  
7. Never dump code or Master Plan in chat.
