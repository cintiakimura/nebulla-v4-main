# Nebulla UI Generation Logic v2
## Stitch-like Constrained Generator Spec

This replaces the weak freeform node-generation approach.
UI Studio Beta must generate screens using constrained layout grammar, forced Figma reference access, Master Plan guidelines as hard tokens, and content mapping into slots.

Authority order:
1. This v2 logic
2. `nebulla-project/ui-generation-engine-manual.md` for cycle discipline
3. `nebulla-project/ui-generation-context.md` as cycle memory
4. Master Plan product truth
5. Generated workspace files for concrete labels/routes/actions

If old freeform behavior conflicts with this spec, this spec wins.

---

## 0. Goal

Produce usable, structured, visually coherent UI for UI Studio Beta.

Not acceptable:
- floating disconnected boxes
- raw Master Plan prose as titles
- route slugs as subtitles
- one generic button only
- style corruption errors
- ignoring §5 design direction
- pretending Figma was used when it was not

Acceptable:
- constrained screen templates
- real hierarchy
- real sections
- real actions
- applied design tokens
- honest Figma status
- polished fallback when Figma fails

---

## 1. Core principle

Generate in this exact order only:

1. Classify page
2. Choose layout template family
3. Force Figma reference retrieval
4. Adapt references into template slots
5. Build design tokens from Master Plan §5
6. Map content into slots from Master Plan + generated files
7. Render constrained editor model + code
8. Validate with hard quality gate
9. Deliver to UI Studio Beta

Never jump from Master Plan text directly to freeform boxes.

---

## 2–16. Executable modules

Implementation lives in `lib/uiGenerationEngine/v2/`:

| Phase | Module |
|-------|--------|
| A Classify | `classifyPage.ts` |
| B Template | `selectTemplate.ts` |
| C Figma | `figmaReferences.ts` |
| D Tokens | `designTokens.ts` |
| E Slots | `mapSlots.ts` |
| F Render | `renderTemplateModel.ts` |
| G Gate | `qualityGate.ts` |
| H Cycle | `runUiGenerationCycleV2.ts` |

Beta entry: `runUiGenerationCycle` delegates to `runUiGenerationCycleV2`.

### Figma status values
`success | failed | missing_key | unauthorized | rate_limited | weak_matches | skipped`

### Approved templates
Mobile: `mobile_home_hero_cards`, `mobile_list_actions`, `mobile_dashboard_metrics`, `mobile_settings_groups`, `mobile_auth_form`, `mobile_detail_sections`, `mobile_empty_state`

Web: `web_dashboard_sidebar`, `web_list_table`, `web_settings_two_column`, `web_detail_header_content`, `web_auth_center_card`

Landing: `landing_hero_features_cta`, `landing_pricing_sections`

### Token object shape
```json
{
  "bg": "#0A0B14",
  "surface": "#11131F",
  "primary": "#3B82F6",
  "accent": "#7C3AED",
  "text": "#FFFFFF",
  "mutedText": "#A1A1AA",
  "border": "#1F2937",
  "radius": 12,
  "gap": 16,
  "pad": 16
}
```

Style safety: never assign a hex string where a style object is required. Always `node.style.backgroundColor = tokens.bg`.

### User-visible stages
- Classifying page
- Choosing layout
- Fetching Figma references
- Applying design tokens
- Mapping content
- Rendering UI
- Validating
- Ready in preview

### Doctrine

**Template first. Figma forced. Tokens mandatory. Content mapped into slots. No freeform chaos.**
