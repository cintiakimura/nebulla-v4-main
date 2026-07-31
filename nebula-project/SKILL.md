# Nebula project UI skill (user apps)

Design guidance for **the user's app** (Master Plan, UI Gen, Grok Code) — not for Nebula IDE chrome.

**Law:** `project-execution-rules.md` (Master Plan contract, §4 page fields, UI brief, security baseline).

## Source of truth (strict order)

1. **Master Plan §4 Pages and navigation** — page contracts (routes, actions, authz, empty/error, nav)
2. **`nebula-ui-studio/ui-brief.md`** — §4 + §5 tokens combined (primary UI input)
3. **Master Plan §2 Tech and Research** — competitor/industry UX research + security baseline
4. **Master Plan §5 UI/UX design** — palette, typography, density, nav pattern (≤ 15–25 lines; tokens only)
5. **User uploads** — `nebulla-ide/design-references.json` (logo, brand guide)

## Do not copy

- **Nebulla IDE / nebulla.dev product UI** (Cosmic Night `#080A14`, accent `#00D4D4`, builder sidebar)
- Generic SaaS dark theme unless §2/§5 call for it
- Placeholder lorem unless the plan requires it

## Visual language (when §5 is thin)

- Derive palette and nav from the product category and §2 competitors
- Honor §4 empty/error/authz in every screen
- Mobile-first responsive layouts; touch targets ~44px where applicable
- One primary CTA per view; clear hierarchy

## Stack

- React + Tailwind + shadcn/ui + Lucide (unless Master Plan specifies otherwise)

## UI generation path

- **Primary:** UI Gen Beta v2 (`nebulla-project/ui-generation-logic-v2.md`) consuming **ui-brief** + §5 tokens
- **Optional legacy:** V0 via distilled `v0-prompt.md` only when configured

For legacy Pencil CLI skill, install `@pencil.dev/cli` and use upstream `SKILL.md` from the package.
