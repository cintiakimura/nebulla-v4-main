# Nebula project UI skill (user apps)

Design guidance for **the user's app** (Master Plan, v0, Grok Code) — not for Nebula IDE chrome.

## Source of truth (strict order)

1. **Master Plan §2 Tech and Research** — competitor/industry UX research from discovery
2. **Master Plan §5 UI/UX design** — palette, typography, density, nav pattern
3. **User uploads** — `nebulla-ide/design-references.json` (logo, brand guide)

## Do not copy

- **Nebulla IDE / nebulla.dev product UI** (Cosmic Night `#080A14`, accent `#00D4D4`, builder sidebar)
- Generic SaaS dark theme unless §2/§5 call for it
- Placeholder lorem unless the plan requires it

## Visual language (when §5 is thin)

- Derive palette and nav from the product category and §2 competitors
- Mobile-first responsive layouts; touch targets ~44px where applicable
- One primary CTA per view; clear hierarchy and empty/loading states

## Stack

- React + Tailwind + shadcn/ui + Lucide (unless Master Plan specifies otherwise)

For legacy Pencil CLI skill, install `@pencil.dev/cli` and use upstream `SKILL.md` from the package.
