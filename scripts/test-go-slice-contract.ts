import assert from "node:assert/strict";
import os from "node:os";
import {
  assessOversizedGoApply,
  buildLocalPreCodingSummary,
  inferGoSliceFromWorkspace,
  isBareGoNote,
  parseGoSliceLabel,
  shouldSkipPhaseALlm,
} from "../lib/goSliceContract.ts";
import fs from "node:fs";
import path from "node:path";
import {
  buildSecurityBaselineProposal,
  mergeSecurityBaselineIntoSection2,
  planNeedsSecurityBaseline,
} from "../lib/securityBaselinePropose.ts";
import { draftSection4AmendmentsForRoutes } from "../lib/mindMapAmendmentPropose.ts";

assert.equal(parseGoSliceLabel("SLICE: Foundation\n- setup"), "Foundation");
assert.equal(parseGoSliceLabel("working on Auth next"), "Auth");
assert.equal(parseGoSliceLabel("Data+API layer"), "Data+API");

const over = assessOversizedGoApply({
  sliceLabel: "Primary",
  writtenPaths: Array.from({ length: 20 }, (_, i) => `app/page-${i}.tsx`),
});
assert.equal(over.oversized, true);

const thin = {
  "1. Goal of the app": "Client portal with login and invoices",
  "2. Tech and Research": "Competitors: X Y Z",
};
assert.equal(planNeedsSecurityBaseline(thin), true);
assert.ok(buildSecurityBaselineProposal(thin));
const merged = mergeSecurityBaselineIntoSection2(thin["2. Tech and Research"]);
assert.ok(merged && /Security baseline/i.test(merged));
assert.equal(mergeSecurityBaselineIntoSection2(merged!), null);

// Markers without sign-in model must still merge (strict Go SEC_AUTH_MISSING).
const partialSec = {
  "1. Goal of the app": "Kids tutoring with teachers and parents dashboards",
  "2. Tech and Research":
    "Security baseline: use workspace_id / classroom_id with row-level security and deny by default.",
};
assert.equal(planNeedsSecurityBaseline(partialSec), true);
const authFilled = mergeSecurityBaselineIntoSection2(partialSec["2. Tech and Research"]);
assert.ok(authFilled && /sign-?in required|Auth model/i.test(authFilled));
assert.equal(planNeedsSecurityBaseline({ ...partialSec, "2. Tech and Research": authFilled! }), false);

// "no PII" in goals must NOT permanently block Accept / keep SEC gaps.
const noPiiGoal = {
  "1. Goal of the app": "Kids app. Out of scope: no PII marketplace, no social.",
  "2. Tech and Research":
    "### Security baseline\n- **Auth model:** Sign-in required for private routes.\n- classroom_id + row-level security / deny-by-default.",
};
assert.equal(planNeedsSecurityBaseline(noPiiGoal), false);

// Bare "Auth model TBD" is not a real sign-in model — still needs merge.
const tbdAuth = {
  "1. Goal of the app": "Kids reading with teachers",
  "2. Tech and Research": "Security baseline: classroom_id. Auth model TBD.",
};
assert.equal(planNeedsSecurityBaseline(tbdAuth), true);

const draft = draftSection4AmendmentsForRoutes(["/2fa", "/_secret"]);
assert.match(draft, /`\/2fa`/);
assert.match(draft, /`\/_secret`/);

assert.equal(isBareGoNote("go"), true);
assert.equal(isBareGoNote("START_CODING"), true);
assert.equal(isBareGoNote("continue building"), true);
assert.equal(isBareGoNote("SLICE: Primary — kid practice"), false);
assert.equal(shouldSkipPhaseALlm({ userNote: "go" }), true);
assert.equal(
  shouldSkipPhaseALlm({
    userNote: "focus on auth screens carefully",
    existingSummary: "SLICE: Auth\n- login only",
  }),
  false,
);
const localSum = buildLocalPreCodingSummary({
  workspaceRoot: os.tmpdir(),
  userNote: "go",
  projectName: "tutor kids with ADHD",
});
assert.match(localSum, /^SLICE:/);
assert.match(localSum, /ADHD|tutor|slice/i);

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-slice-thin-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "App.tsx"), "export default function App(){return null}\n");
  fs.writeFileSync(path.join(root, "src", "main.tsx"), "import App from './App'\n");
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><html><body></body></html>");
  assert.equal(inferGoSliceFromWorkspace(root), "Foundation");
  fs.rmSync(root, { recursive: true, force: true });
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-slice-routes-"));
  fs.mkdirSync(path.join(root, "app", "practice"), { recursive: true });
  fs.writeFileSync(path.join(root, "app", "page.tsx"), "export default function Home(){return null}\n");
  fs.writeFileSync(
    path.join(root, "app", "practice", "page.tsx"),
    "export default function Practice(){return null}\n",
  );
  const next = inferGoSliceFromWorkspace(root);
  assert.ok(next === "Auth" || next === "Primary" || next === "Secondary");
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("\n✓ go-slice + security propose + mind-map amend tests passed\n");
