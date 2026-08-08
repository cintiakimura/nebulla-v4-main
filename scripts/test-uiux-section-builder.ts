/**
 * Concrete §5 / boilerplate detector.
 * Run: npx tsx scripts/test-uiux-section-builder.ts
 */
import assert from "node:assert/strict";
import {
  buildConcreteUiuxSection,
  buildStitchChromeBriefSection,
  isGenericUiuxBoilerplate,
} from "../lib/uiuxSectionBuilder.ts";
import { buildUiBriefMarkdown } from "../lib/nebulaUiBrief.ts";

const filler = [
  "- **Theme:** Industry-appropriate palette from §2 competitor research — not Nebulla platform UI (#080A14 / #00D4D4)",
  "- **Typography:** Clear sans-serif hierarchy; accessible contrast; spacing matched to product type",
  "- **Components:** shadcn/ui + Tailwind; nav pattern from §4 (sidebar vs top nav per category norms)",
  "- **Mood:** Purpose-built for App workspace — mirror leading apps in this space",
].join("\n");

assert.equal(isGenericUiuxBoilerplate(filler), true);

const concrete = buildConcreteUiuxSection({
  goal: "Mobile App — tutor kids with ADHD",
  pages: "- Kid Home (`/`)\n- Practice (`/practice`)",
  tech: "Duolingo-like calm focus patterns",
  projectName: "tutor kids with ADHD",
});
assert.equal(isGenericUiuxBoilerplate(concrete), false);
assert.match(concrete, /#0F766E/);
assert.match(concrete, /ADHD|bottom tabs/i);

const brief = buildUiBriefMarkdown({
  "1. Goal of the app": "Project Type: Mobile App\nTutor kids with ADHD",
  "2. Tech and Research": "Calm education UX research",
  "3. Features and KPIs": "Practice sessions",
  "4. Pages and navigation": "- Kid Home (`/`)\n- Login (`/login`)",
  "5. UI/UX design": filler,
});
assert.match(brief, /Stitch-minimum chrome/);
assert.match(brief, /#0F766E|#FFF8F1/);
assert.ok(!/mirror leading apps in this space/i.test(brief));

assert.match(buildStitchChromeBriefSection("mobile"), /bottom tabs/i);

console.log("\n✓ uiux section builder tests passed\n");
