# Nebula design system (SKILL)

Short conventions fed to **Nebula UI Studio** / Pencil mockup generation when a full Pencil CLI `SKILL.md` is not present in the workspace.

## Visual language

- Prefer **Cosmic Night**: deep navy/slate backgrounds, soft borders (`white/5`–`white/10`), cyan or violet accents sparingly for primary actions.
- **Typography**: clear hierarchy — one strong headline, supportive body, muted helper text. Use system UI stacks or project-chosen fonts from the Master Plan.
- **Spacing**: consistent 4px grid; comfortable padding in cards and forms; avoid cramped controls.

## Layout

- Mobile-first responsive layouts; touch targets at least ~44px where applicable.
- Use cards, sections, and clear separation between primary workflow vs. secondary metadata.

## Components

- Prefer accessible patterns: visible focus, semantic structure, loading and empty states.
- Buttons: one primary CTA per view; secondary actions are visually quieter.

## Export / handoff

- Generated UI should read as production-minded: named layers or logical grouping where relevant, no placeholder lorem unless the plan calls for it.

For the full Pencil CLI skill, install `@pencil.dev/cli` and use the upstream `SKILL.md` from the package or [unpkg](https://unpkg.com/@pencil.dev/cli@latest/SKILL.md).
