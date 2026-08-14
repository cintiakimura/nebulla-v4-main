import assert from "node:assert/strict";
import os from "node:os";
import {
  assessFoundationGoExit,
  assessOversizedGoApply,
  buildLocalPreCodingSummary,
  inferGoSliceFromWorkspace,
  clampClaimedSliceToWorkspace,
  isBareGoNote,
  lockedUserConstraintsFromPlan,
  parseGoSliceLabel,
  shouldSkipPhaseALlm,
} from "../lib/goSliceContract.ts";
import { classifyGoFailure } from "../lib/goBlockedReason.ts";
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
  assert.equal(next, "Auth");
  fs.mkdirSync(path.join(root, "app", "login"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "app", "login", "page.tsx"),
    "export default function Login(){return null}\n",
  );
  assert.equal(inferGoSliceFromWorkspace(root), "Primary");
  assert.equal(clampClaimedSliceToWorkspace("SLICE: Secondary", root), "Primary");
  fs.rmSync(root, { recursive: true, force: true });
}

{
  const model400 = classifyGoFailure({
    httpStatus: 400,
    error: '{"code":"invalid-argument","error":"Model grok-code-fast-1 does not support parameter reasoningEffort."}',
  });
  assert.equal(model400.code, "GO_MODEL_REJECTED");
  const research = classifyGoFailure({ code: "RESEARCH_INCOMPLETE" });
  assert.equal(research.code, "RESEARCH_INCOMPLETE");
  const key = classifyGoFailure({ httpStatus: 401, error: "Main AI API key is missing" });
  assert.equal(key.code, "KEY_AUTH");
  const timeout = classifyGoFailure({ error: "Grok Code timed out after 3 minutes. Try Go again with a narrower slice." });
  assert.equal(timeout.code, "GO_TIMEOUT");
}

{
  const empty = assessFoundationGoExit({ totalWritten: 0, writtenPaths: [], sliceLabel: "Foundation" });
  assert.equal(empty.ok, false);
  assert.equal(empty.blockedReason?.code, "GO_EMPTY_OUTPUT");

  const publicOnly = assessFoundationGoExit({
    totalWritten: 1,
    writtenPaths: ["public/nebula-ui-gen-preview.html"],
    sliceLabel: "Foundation",
  });
  assert.equal(publicOnly.ok, false);
  assert.equal(publicOnly.blockedReason?.code, "APPLY_EMPTY_PRODUCT");

  const thinShell = assessFoundationGoExit({
    totalWritten: 2,
    writtenPaths: ["src/App.tsx", "src/main.tsx"],
    sliceLabel: "Foundation",
  });
  assert.equal(thinShell.ok, false);
  assert.equal(thinShell.blockedReason?.code, "APPLY_EMPTY_PRODUCT");

  const routes = assessFoundationGoExit({
    totalWritten: 2,
    writtenPaths: ["app/page.tsx", "app/practice/page.tsx"],
    sliceLabel: "Foundation",
    runnableRoot: false,
  });
  assert.equal(routes.ok, true);
  assert.equal(routes.warnRunnable, true);
}

{
  const lock = lockedUserConstraintsFromPlan({
    "1. Goal of the app": "tutor kids with ADHD. Roles: student, teacher, parent. Privacy: no public profiles.",
    "2. Tech and Research": "Calm coach tone. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1/",
  });
  assert.match(lock, /Roles/);
  assert.match(lock, /Privacy/);
}

console.log("\n✓ go-slice + security propose + mind-map amend tests passed\n");
