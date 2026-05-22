# Nebula UI Studio

**Nebula UI Studio** is part of the **Nebula Product**: the in-app experience where you open the studio, review mockups, approve direction, and **manually refine the UI** after the first automatic **v0** generation. It is implemented in the IDE codebase (`src/`, `lib/`, server routes, and related assets).

This markdown file lives in the project workspace so the **Nebula Product** can **read and write** the persisted prompt and UI artifacts below. For phases, read order, and implementer obligations, use **`project-execution-rules.md`** and **`project-workflow.md`**.

## After automatic v0

The first UI pass is generated **automatically** using **v0** (using the user’s v0 API key and Master Plan context). That happens through Nebula Product automation, not through this page.

## What this studio is for

- **Manual refinement** of the UI once the initial v0 output exists.
- **Iterative edits**: you describe changes in natural language; **Grok 4** carries out updates through Nebula UI Studio (analysis, adaptation, approval, and the product’s wiring into the repo).
- **Avoid full v0 re-runs** unless you want a broad redesign; routine polish should stay in the studio.

## Best practices in the studio

- Keep changes incremental so the product stays visually and structurally consistent with the first v0 baseline unless you intentionally change course.
- Target the same stack the product implements toward: **shadcn/ui**, **Tailwind**, and **Lucide**.

## Persisted data (IDE-managed)

The HTML comment blocks at the end of this file hold **`NEBULA_UI_STUDIO_PROMPT`** and **`NEBULA_UI_STUDIO_CODE`**: the canonical prompt and approved/generated UI material the Nebula Product loads and updates. Do not delete those markers.

## Generated UI file layout (Visual UI Editor / Nebula Product)

This is implemented in the IDE server and `lib/visualUiEditorWorkspace.ts` (not in this markdown file).

- **Immutable first v0 output:** `generated-ui/v0-original-<project>-<timestamp>/` — full copy of the first automatic v0 generation. Never edited by applies or the editor.
- **Pointer / legacy unlock:** `generated-ui/v0-base/manifest.json` may hold `v0FirstGenerationComplete` and `originalV0FolderRel` for eligibility.
- **Editor-only preview model:** `generated-ui/visual-editor/preview-model.json` — structured Wix-like model (mutable).
- **On “Save Changes & Update Code”:** for each path Grok returns, the server copies the **current** workspace file (if it exists) into `generated-ui/versions/<timestamp>/`, then writes Grok’s contents into `src/`, `app/`, `pages/`, `components/`, or `public/`.
- **Restore original v0:** copies allowed paths from the immutable `v0-original-…` folder back into the live workspace (UI action + API).

---

<!--
NEBULA_UI_STUDIO_PROMPT
No prompt generated yet.
-->

<!--
NEBULA_UI_STUDIO_CODE
No approved UI code yet.
-->
