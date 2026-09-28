/**
 * Identity lock after first Master Plan save.
 * Run: npx tsx scripts/test-identity-freeze.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  isPostPlanIdentityLockTurn,
  lockNameAfterPlanSave,
  mergeIdentityFreeze,
  resolveFrozenProjectKey,
  resolveFrozenWorkspaceTarget,
  shouldMintWorkspaceAfterPlanFreeze,
  shouldRunBrandGenerator,
} from "../lib/identityFreeze.ts";
import {
  applyPlanIdentityAndWinningPalette,
  fillMissingMasterPlanSectionsLocal,
  readMasterPlanFile,
} from "../lib/nebulaIdeWorkspaceArtifacts.ts";
import { inferProductName, looksLikeInventedChipName, productNameFromPlan, readStoredProductIdentity } from "../lib/productIdentity.ts";
import { resolveNewProductWorkspaceAction } from "../lib/newProductWorkspace.ts";
import { isNewProductSeedAgainstCurrent } from "../lib/productGoalFingerprint.ts";
import { shortNameFromIdea } from "../src/lib/projectNameFromIdea.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
void REPO;

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

const QUILL_PLAN = {
  "1. Goal of the app":
    "**Product name:** Quill Learn\nA kids reading tutor with practice and a teacher view.",
  "2. Tech and Research":
    "- **Stack:** Next.js App Router, TypeScript, Tailwind.\n- **Research:** kids reading apps, parent dashboards.",
  "3. Features and KPIs":
    "- Kid practices daily reading.\n- Teacher assigns passages.\n- **KPI:** completed sessions.",
  "4. Pages and navigation":
    "### Home `/`\nPurpose: land.\nPrimary action: Start practice.\nEntry: first open.\nExit: /practice.\n\n### Practice `/practice`\nPurpose: kid reads.\nPrimary action: Mark done.\nEntry: Home.\nExit: Home.\n\n### Teacher `/teacher`\nPurpose: assign work.\nPrimary action: Assign.\nEntry: Home.\nExit: Home.",
  "5. UI/UX design": "- **Product name:** Quill Learn\nPalette: education-calm. Large type for kids.",
};

section("plan product name is Quill Learn (not an invented Helio Studio chip)");
{
  assert.equal(productNameFromPlan(QUILL_PLAN), "Quill Learn");
  assert.equal(looksLikeInventedChipName("Helio Studio"), true);
  assert.equal(
    lockNameAfterPlanSave({
      fromPlan: "Quill Learn",
      fromSave: "Helio Studio",
      headerName: "Helio Studio",
      looksInvented: looksLikeInventedChipName,
    }),
    "Quill Learn",
  );
}

section("first Master Plan save freezes name + workspace id on disk");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-identity-freeze-"));
  const mp = path.join(tmp, "nebulla-ide", "master-plan.json");
  fs.mkdirSync(path.dirname(mp), { recursive: true });
  fs.writeFileSync(mp, JSON.stringify(QUILL_PLAN, null, 2), "utf8");
  const pass = applyPlanIdentityAndWinningPalette(tmp, { ...QUILL_PLAN }, { workspaceId: "cfproj_quill_learn" });
  assert.equal(pass.productName, "Quill Learn");
  const stored = readStoredProductIdentity(tmp);
  assert.equal(stored?.projectName, "Quill Learn");
  assert.equal(stored?.frozen, true);
  assert.equal(stored?.workspaceId, "cfproj_quill_learn");

  section("yes / classify / Go do not re-run brand generator or mint a second workspace");
  assert.equal(isPostPlanIdentityLockTurn("yes"), true);
  assert.equal(isPostPlanIdentityLockTurn("build"), true);
  assert.equal(shouldRunBrandGenerator({ frozen: true }), false);
  assert.equal(shouldMintWorkspaceAfterPlanFreeze({ frozen: true }), false);
  assert.equal(
    resolveNewProductWorkspaceAction({
      userText: "yes",
      chipName: "Helio Studio",
      diskGoal: QUILL_PLAN["1. Goal of the app"],
      identityFrozen: true,
    }).mintNewProject,
    false,
  );
  assert.equal(isNewProductSeedAgainstCurrent({ userText: "yes", chipName: "Quill Learn" }), false);
  const inferredOnYes = inferProductName("yes");
  assert.equal(inferredOnYes, "");
  assert.notEqual(shortNameFromIdea("kids reading tutor for teachers"), "Quill Learn");

  const freeze = mergeIdentityFreeze(null, {
    projectKey: "cfproj_quill_learn",
    projectName: "Quill Learn",
  });
  const afterYes = mergeIdentityFreeze(freeze, {
    projectKey: "cfproj_helio_studio",
    projectName: "Helio Studio",
  });
  assert.equal(afterYes.projectKey, "cfproj_quill_learn");
  assert.equal(afterYes.projectName, "Quill Learn");

  const drifted = resolveFrozenWorkspaceTarget({
    freeze,
    headerName: "Helio Studio",
    headerKey: "cfproj_helio_studio",
  });
  assert.equal(drifted.drifted, true);
  assert.equal(drifted.projectName, "Quill Learn");
  assert.equal(drifted.projectKey, "cfproj_quill_learn");
  assert.equal(
    resolveFrozenProjectKey({ freezeKey: freeze.projectKey, browserKey: "cfproj_helio_studio" }),
    "cfproj_quill_learn",
  );

  section("recover / fillMissing writes the frozen workspace, not a Helio stub");
  const stub = {
    "1. Goal of the app": "App shell / Foundation ready",
    "2. Tech and Research": "partial",
    "3. Features and KPIs": "partial",
  };
  fs.writeFileSync(mp, JSON.stringify(stub, null, 2), "utf8");
  fillMissingMasterPlanSectionsLocal({
    workspaceRoot: tmp,
    masterPlanPath: mp,
    projectName: "Helio Studio",
    userNote: "recover master plan from chat",
  });
  const afterFill = readStoredProductIdentity(tmp);
  assert.equal(afterFill?.projectName, "Quill Learn");
  assert.equal(afterFill?.frozen, true);
  assert.equal(afterFill?.workspaceId, "cfproj_quill_learn");
  const filledPlan = readMasterPlanFile(mp);
  assert.equal(/Helio Studio/i.test(JSON.stringify(filledPlan)), false);

  const secondPass = applyPlanIdentityAndWinningPalette(tmp, filledPlan, {
    workspaceId: "cfproj_helio_studio",
  });
  assert.equal(secondPass.productName, "Quill Learn");
  assert.equal(readStoredProductIdentity(tmp)?.workspaceId, "cfproj_quill_learn");

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("\nidentity freeze tests passed");
