/**
 * MVP soft-continue: SEC_* demoted so Go is not paused for security docs alone.
 */
import assert from "node:assert/strict";
import { assessMasterPlanCompleteness } from "../lib/masterPlanCompleteness.ts";
import {
  onlySecurityBlockGaps,
  softenSecurityBlocksForMvpGo,
} from "../lib/mvpDeliveryGates.ts";

const secOnly = {
  ok: false,
  mode: "strict" as const,
  shape: "incomplete" as const,
  allowGo: false,
  sectionLengths: {},
  gaps: [
    {
      code: "SEC_RLS_MISSING",
      section: "2. Tech and Research",
      severity: "block" as const,
      message: "security missing",
      remediation: "add baseline",
    },
    {
      code: "SEC_AUTH_MISSING",
      section: "2. Tech and Research",
      severity: "block" as const,
      message: "auth missing",
      remediation: "add auth",
    },
  ],
};

assert.equal(onlySecurityBlockGaps(secOnly), true);
const softened = softenSecurityBlocksForMvpGo(secOnly);
assert.equal(softened.allowGo, true);
assert.ok(softened.gaps.every((g) => g.severity === "warn"));

const withPagesGap = softenSecurityBlocksForMvpGo({
  ...secOnly,
  gaps: [
    ...secOnly.gaps,
    {
      code: "PAGES_EMPTY",
      section: "4",
      severity: "block",
      message: "pages",
      remediation: "add pages",
    },
  ],
});
assert.equal(withPagesGap.allowGo, false, "non-SEC blocks still pause Go");
assert.ok(withPagesGap.gaps.some((g) => g.code === "PAGES_EMPTY" && g.severity === "block"));
assert.ok(withPagesGap.gaps.every((g) => !/^SEC_/.test(g.code) || g.severity === "warn"));

// Real kids-ish plan: after soften, SEC never remains block.
const kidsThin = assessMasterPlanCompleteness({
  plan: {
    "1. Goal of the app":
      "A mobile education app for kids to practice reading; teachers track progress.",
    "2. Tech and Research": "Competitors: Epic.",
    "3. Features and success measures": "Practice; KPI TBD",
    "4. Pages and navigation": "TBD",
    "5. UI/UX design": "Mood calm #111111 font sans density comfortable",
  },
  mode: "strict",
  checkUiBrief: false,
});
const softKids = softenSecurityBlocksForMvpGo(kidsThin);
assert.ok(
  softKids.gaps.every((g) => !/^SEC_/.test(g.code) || g.severity === "warn"),
  "SEC gaps always demoted",
);

console.log("\n✓ mvp delivery gates (security soft-continue) passed\n");
