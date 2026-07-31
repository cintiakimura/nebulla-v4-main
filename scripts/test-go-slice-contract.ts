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

const draft = draftSection4AmendmentsForRoutes(["/2fa", "/_secret"]);
assert.match(draft, /`\/2fa`/);
assert.match(draft, /`\/_secret`/);

console.log("\n✓ go-slice + security propose + mind-map amend tests passed\n");
