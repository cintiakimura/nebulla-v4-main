# Nebulla UI Generation Sequence

See also `ui-generation-engine-manual.md` for strict subtask order.

Chain (do not reorder):

**Master Plan → classification → brief → reference criteria → reference retrieval → adaptation → constrained generation → UI Studio Beta delivery → human refinement → metadata capture**

Hard rules:
1. Master Plan truth before decorative creativity.
2. Classification before reference selection.
3. Brief before generation.
4. References guide structure; they do not replace the Master Plan.
5. If Figma fails, use seed fallback patterns.
6. One controlled repair pass only.
7. UI Studio Beta is delivery + Properties refinement only.
8. Original UI Studio / V0 path must not be modified.

Executable entry: `POST /api/ui-studio-beta/generate` → `lib/uiGenerationEngine/runUiGenerationCycle.ts`
Context notebook: `nebulla-project/ui-generation-context.md` (per project workspace).
