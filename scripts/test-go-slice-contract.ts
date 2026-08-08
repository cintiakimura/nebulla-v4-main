import assert from "node:assert/strict";
import {
  assessOversizedGoApply,
  parseGoSliceLabel,
} from "../lib/goSliceContract.ts";
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

const draft = draftSection4AmendmentsForRoutes(["/2fa", "/_secret"]);
assert.match(draft, /`\/2fa`/);
assert.match(draft, /`\/_secret`/);

console.log("\n✓ go-slice + security propose + mind-map amend tests passed\n");
