/**
 * Industry palettes + research palette parse (no live Figma).
 * Run: npm run test:industry-palettes
 */
import assert from "node:assert/strict";
import { compileDesignBrief } from "../lib/uiGenerationEngine/resources/compileDesignBrief.ts";
import {
  parseResearchPalette,
  patchUiuxPalette,
  researchPaletteToPack,
  selectIndustryPalette,
} from "../lib/uiGenerationEngine/v2/industryPalettes.ts";
import type { PageClassification } from "../lib/uiGenerationEngine/v2/types.ts";

const mobileHome: PageClassification = {
  device: "mobile",
  page_type: "home",
  product_function: "course",
  navigation_mode: "bottom_tabs",
  industry: "education",
  density: "medium",
  confidence: "high",
  notes: "kids",
};

{
  const edu = selectIndustryPalette({
    industry: "education",
    text: "ADHD calm tutor kids",
    device: "mobile",
  });
  const health = selectIndustryPalette({ industry: "health", text: "clinic wellness", device: "mobile" });
  const finance = selectIndustryPalette({ industry: "finance", text: "fintech wallet", device: "web" });
  const bakery = selectIndustryPalette({ text: "Neighborhood bakery browse breads pickup", device: "web" });
  assert.equal(edu.id, "education-calm");
  assert.equal(health.id, "health");
  assert.equal(finance.id, "finance");
  assert.equal(bakery.id, "retail");
  assert.equal(bakery.primary.toUpperCase(), "#8B4513");
  assert.notEqual(bakery.primary, edu.primary);
  const both = selectIndustryPalette({
    text: "Grain Bakery neighborhood breads family=education-calm kids",
  });
  assert.equal(both.id, "retail");
  assert.equal(both.primary.toUpperCase(), "#8B4513");
  assert.notEqual(edu.primary, health.primary);
  assert.notEqual(edu.primary, finance.primary);
  assert.notEqual(edu.primary.toLowerCase(), "#0f766e");
  assert.notEqual(edu.primary.toLowerCase(), "#0d9488");
}

{
  const parsed = parseResearchPalette(`
## UI/UX patterns
- Bottom tabs, spacious cards
- Palette: family=health bg=#F4F9F7 primary=#2A6F97 accent=#5B8A72 text=#1A2E35 muted=#5C6B70
`);
  assert.ok(parsed);
  assert.equal(parsed!.family, "health");
  assert.equal(parsed!.primary, "#2A6F97");
  const pack = researchPaletteToPack(parsed!);
  const section = patchUiuxPalette("- **Mood:** calm\n- **Palette:** bg `#F8FAFC`, primary `#0D9488`", pack);
  assert.match(section, /#2A6F97/);
  assert.equal(/#0D9488/.test(section), false);
}

{
  const eduBrief = compileDesignBrief({
    uiuxSection: "Calm education, spacious cards, bottom tabs.",
    classification: mobileHome,
    projectName: "FocusNest",
  });
  const healthBrief = compileDesignBrief({
    uiuxSection: "Clinical wellness dashboard, medium density.",
    classification: { ...mobileHome, industry: "health", product_function: "general", device: "web" },
    projectName: "Clinic",
  });
  assert.notEqual(eduBrief.color_roles.primary.hex, healthBrief.color_roles.primary.hex);
  assert.notEqual(eduBrief.color_roles.primary.hex.toLowerCase(), "#0f766e");
}

console.log("test-industry-palettes: ok");
