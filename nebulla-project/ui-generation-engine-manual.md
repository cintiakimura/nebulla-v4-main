# Nebulla UI Generation Engine — Absolute-Control Task Manual

Executable implementation lives in `lib/uiGenerationEngine/runUiGenerationCycle.ts`.
It runs Phases 1–14 in ascending order and writes `nebulla-project/ui-generation-context.md` after each phase.

Source of process definition: `ui-generation-sequence.md`.
Working memory: `ui-generation-context.md`.

Rules:
- One phase at a time; write context before the next phase.
- Do not invent missing Master Plan truth.
- If Figma fails, continue with seed fallbacks.
- Do not modify the original UI Studio / V0 page.
- UI Studio Beta only for delivery and Properties refinement.

Entry: `POST /api/ui-studio-beta/generate`
