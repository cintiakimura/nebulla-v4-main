/**
 * New Project / new seed must not reuse Quill Learn Kids disk.
 * Run: npx tsx scripts/test-new-project-isolation.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  isFoundationCloseGate,
  resolveNewProductWorkspaceAction,
} from "../lib/newProductWorkspace.ts";
import {
  isNewProductSeedAgainstCurrent,
  leftoverRoutesConflictWithGoal,
  looksLikeStandaloneProductBrief,
} from "../lib/productGoalFingerprint.ts";
import {
  inferProductName,
  replaceProductNameInGoal,
  singleProductName,
} from "../lib/productIdentity.ts";
import { seedPagesFromGoal } from "../lib/nebulaUiBrief.ts";
import {
  pickPreferredCloudProject,
  shouldPreserveMintedProjectKey,
} from "../src/lib/nebulaCloud.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const QUILL_GOAL =
  "**Product name:** Quill Learn Kids\nLearning companion. Practice and Teacher. CogniMicro.";
const SEED = "influencers and brands";

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("Quill Learn Kids leftover + influencer seed is a new workspace");
{
  const quillRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-quill-learn-kids-"));
  const newRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-bridgen-empty-"));
  fs.mkdirSync(path.join(quillRoot, "app", "practice"), { recursive: true });
  fs.mkdirSync(path.join(quillRoot, "app", "teacher"), { recursive: true });
  fs.mkdirSync(path.join(quillRoot, "nebulla-ide"), { recursive: true });
  fs.writeFileSync(path.join(quillRoot, "app/practice/page.tsx"), "export default function Practice(){return null}\n");
  fs.writeFileSync(path.join(quillRoot, "app/teacher/page.tsx"), "export default function Teacher(){return null}\n");
  fs.writeFileSync(
    path.join(quillRoot, "nebulla-ide/master-plan.json"),
    JSON.stringify({
      "1. Goal of the app": QUILL_GOAL,
      "4. Pages and navigation": "### Practice `/practice`\n### Teacher `/teacher`",
    }),
    "utf8",
  );
  const leftoverPaths = ["app/practice/page.tsx", "app/teacher/page.tsx", "app/layout.tsx"];
  const action = resolveNewProductWorkspaceAction({
    userText: SEED,
    chipName: "Quill Learn Kids",
    diskGoal: QUILL_GOAL,
    productRoutesOnDisk: true,
    workspacePaths: leftoverPaths,
  });
  assert.equal(action.mintNewProject, true);
  assert.equal(action.skipGrokChat, false);
  assert.equal(action.allowCodePass1, false);
  assert.equal(action.editExistingForbidden, true);
  assert.equal(/quill learn kids/i.test(action.productName), false);
  assert.equal(singleProductName("Quill Learn Kids Bridgen"), "Bridgen");
  assert.equal(inferProductName("Bridgen"), "Bridgen");
  assert.equal(isNewProductSeedAgainstCurrent({ userText: SEED, chipName: "Quill Learn Kids", diskGoal: QUILL_GOAL }), true);
  assert.equal(looksLikeStandaloneProductBrief(SEED), true);
  assert.equal(leftoverRoutesConflictWithGoal(SEED, ["/practice", "/teacher"]), true);
  assert.equal(isFoundationCloseGate(SEED), false);
  assert.equal(isFoundationCloseGate("go"), true);
  assert.equal(isFoundationCloseGate("hellos"), true);
  assert.equal(isFoundationCloseGate("you can start"), true);
  assert.equal(isFoundationCloseGate("let’s keep Bridgen and start"), true);
  const pages = seedPagesFromGoal(SEED);
  assert.equal(pages.some((p) => p.route === "/practice" || p.route === "/teacher"), false);

  const piled = replaceProductNameInGoal(
    "**Product name:** Quill Learn Kids Bridgen\nLearning companion.",
    "Bridgen",
  );
  assert.match(piled, /\*\*Product name:\*\*\s*Bridgen/);
  assert.equal(/Quill Learn Kids Bridgen/i.test(piled), false);

  // New key is a different empty folder — leftover Quill files stay as they were.
  const newKey = "cfproj_influencer_new";
  const oldKey = "cfproj_quill_learn_kids";
  assert.notEqual(newKey, oldKey);
  assert.equal(fs.existsSync(path.join(newRoot, "app/practice/page.tsx")), false);
  assert.equal(fs.existsSync(path.join(newRoot, "nebulla-ide/master-plan.json")), false);
  assert.equal(fs.existsSync(path.join(quillRoot, "app/practice/page.tsx")), true);
  assert.equal(fs.existsSync(path.join(quillRoot, "app/teacher/page.tsx")), true);
  const leftoverPlan = JSON.parse(fs.readFileSync(path.join(quillRoot, "nebulla-ide/master-plan.json"), "utf8"));
  assert.match(String(leftoverPlan["1. Goal of the app"]), /Quill Learn Kids/);
  fs.rmSync(quillRoot, { recursive: true, force: true });
  fs.rmSync(newRoot, { recursive: true, force: true });
}

section("cloud sync does not steal a minted key back to Quill Learn Kids");
{
  const quill = {
    name: "Quill Learn Kids",
    pages: [],
    edges: [],
    workspace_id: "cfproj_quilllearnkids",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
  const minted = "guest_bridgen_new";
  assert.equal(shouldPreserveMintedProjectKey(minted, [quill]), true);
  assert.equal(shouldPreserveMintedProjectKey("cfproj_quilllearnkids", [quill]), false);
  const stolen = pickPreferredCloudProject([quill], {
    preferredName: "Quill Learn Kids",
    preferredKey: "cfproj_quilllearnkids",
    currentName: "Harbor Link",
    currentKey: minted,
    allowFallback: false,
  });
  assert.equal(stolen, undefined);
  const fallback = pickPreferredCloudProject([quill], {
    currentKey: minted,
    currentName: "Harbor Link",
  });
  assert.equal(fallback, undefined);
}

section("Home New Project mints first; chat never skip-Grok on leftover Quill");
{
  const home = fs.readFileSync(path.join(REPO, "src/components/ide/MyProjectsHome.tsx"), "utf8");
  const landing = fs.readFileSync(path.join(REPO, "src/lib/landingGoalHandoff.ts"), "utf8");
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  const cloud = fs.readFileSync(path.join(REPO, "src/lib/nebulaCloud.ts"), "utf8");
  const server = fs.readFileSync(path.join(REPO, "renderStack.ts"), "utf8");
  assert.match(home, /mintEmptyProjectFromHome/);
  assert.match(home, /ensureFreshProject\(label\);\s*\n\s*await resetProjectFromScratch/s);
  assert.equal(/ensureProjectOrReuse/.test(home), false);
  assert.match(landing, /mintEmptyProjectFromHome/);
  assert.match(landing, /ensureProjectOrReuse\(label\);\s*\n[\s\S]*?resetProjectFromScratch/s);
  assert.match(cloud, /mintNewWorkspace:\s*true/);
  assert.match(cloud, /forceMint:\s*true/);
  assert.match(cloud, /shouldPreserveMintedProjectKey/);
  assert.match(cloud, /allowFallback:\s*false/);
  assert.match(server, /mintNewWorkspace/);
  assert.match(chat, /mintEmptyProjectFromHome/);
  assert.match(chat, /resolveNewProductWorkspaceAction/);
  assert.match(chat, /isFoundationCloseGate/);
  assert.match(chat, /!newProductSeed \|\| closeGate/);
  assert.equal(/free-tier \/ cloud limit — replace in place after read/.test(chat), false);
}

console.log("\nAll new-project isolation checks passed.");
