# UI Resource Selection Rubric (v1)

Authority for scored matching in `lib/uiGenerationEngine/resources/`.  
Aligns with Design Brief fields and Resource Profile schema.

## Hard filters (must pass)

| Criterion | Question | Fail → |
|-----------|----------|--------|
| Platform | Does profile `platform` match brief/classification device (`mobile` \| `web` \| `landing`)? | Reject |
| Page type | Does any `page_types[]` include classification `page_type` (or `home`/`dashboard` aliases)? | Reject |

## Scored criteria (0–2 each)

| # | Criterion | Profile field | Brief field | 0 | 1 | 2 |
|---|-----------|---------------|-------------|---|---|---|
| 1 | Intent / page fit | `page_types`, `best_for` | overview + page type | No overlap | Partial / adjacent | Exact page_type + best_for hit |
| 2 | Density | `density` | overview.density | Opposite (spacious↔compact) | Adjacent (↔medium) | Exact match |
| 3 | Personality | `personality[]` | overview.personality[] | No overlap | 1 shared tag | ≥2 shared tags |
| 4 | Accessibility | `tags` incl. `a11y` / `wcag` or weaknesses empty of a11y debt | a11y_minimums | Profile marks a11y weak | Neutral | Profile claims a11y-ready |
| 5 | Technical | `template_id` / `figma_file_key` / `kind` | component_rules / constraints | Missing both template & figma when needed | Has template XOR figma | Has usable template_id (and figma if claimed) |
| 6 | Industry (optional) | `tags` / `best_for` | overview.industry | Conflict | Neutral | Tag matches industry |

**Weights (v1):** intent×3, density×2, personality×2, a11y×1, technical×2, industry×1.

**Minimum to accept match:** hard filters pass **and** weighted score ≥ **8** (max 22). Below that → fall back to `selectTemplate` + seed/Figma (no random pick).

## Conflict resolution

1. Beautiful kit / high personality but **wrong density** → score density 0; if weighted &lt; 8, **reject** (do not use).
2. Landing page + mobile-only profile → **hard filter reject**.
3. Tie scores → prefer `kind: template` with `template_id`, then higher intent score, then stable `id` sort.
4. Low confidence classification → require score ≥ **10** or fall back.

## Guidelines checklist (gate — Phase F)

Enforce when Design Brief present:

1. **Hierarchy** — hero title + primary CTA present when template needs CTA.
2. **Color roles** — primary color used on ≥1 button; not every text node.
3. **Density** — gap/pad roughly match brief density band.
4. **Grouping** — ≥2 content regions (cards/list/metrics).
5. **A11y minimums** — text/bg contrast not obviously inverted (luma check).
6. **Don’ts** — no route-like titles; no prose dumps in CTA slots.

## Failure routing

| Failure class | Next action |
|---------------|-------------|
| Structural | Alternate template / next ranked profile |
| Content/style | Adjust tokens/slots / recompile brief |
| Preference | Existing preference recovery UX |

## Phase G — Controlled Grok (optional)

| Assist | Allowed | Forbidden |
|--------|---------|-----------|
| Brief refine | personality, density, dos/donts, a11y, primary usage/hex | templates, regions, node trees, absolute layout |
| Rematch | Pick `profile_id` from pre-scored shortlist only | Invent profiles / freeform layout |
| Slots | Existing locale polish only | Architecture changes |

Env: `UI_RESOURCE_GROK_ASSIST=0` disables. Default on when generate has API key.
