/**
 * Layout catalog by screen job; industry is palette only.
 * Run: npm run test:layout-catalog
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "url";
import { classifyPage } from "../lib/uiGenerationEngine/v2/classifyPage.ts";
import { resolveProbeKeys } from "../lib/uiGenerationEngine/v2/figmaReferences.ts";
import {
  jobFromRoutePurpose,
  layoutJobFromClassification,
  loadCatalogIndex,
  pickLayoutForJob,
  type CatalogIndexFile,
} from "../lib/uiGenerationEngine/v2/layoutCatalogIndex.ts";
import { applyProductPalettePass, writeProductPaletteTokens } from "../lib/productPalettePass.ts";
import { figmaPickActivityLine } from "../src/lib/uiGenStatusLabels.ts";
import { sanitizeUserFacingCopy } from "../lib/assistantChatSanitize.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTH = "MaFREMBRF3vQ8BhtqA2ZpK";
const DASH = "TgYmEqMwrWFHBxF2kAVOaF";
const LAND = "P6lA9sHTHVbnmUfoYbV9Ir";
const HOME = "ZEbJpC67UQyeeynt1UR8gT";

process.chdir(REPO);

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("catalog-index tags every committed structure key");
{
  const index = loadCatalogIndex(REPO);
  assert.ok(index);
  const byKey = new Map(index!.structures.map((r) => [r.file_key, r]));
  assert.deepEqual(byKey.get(AUTH)?.jobs, ["auth"]);
  assert.deepEqual(byKey.get(DASH)?.jobs, ["list_manage"]);
  assert.ok(!byKey.get(DASH)?.jobs.includes("catalog_grid"));
  assert.deepEqual(byKey.get(LAND)?.jobs, ["landing_hero"]);
  assert.deepEqual(byKey.get(HOME)?.jobs, ["home_task"]);
  assert.ok(byKey.get(HOME)?.not_for?.includes("auth"));
  assert.ok(byKey.get(HOME)?.not_for?.includes("catalog_grid"));
  assert.deepEqual(index!.by_job?.catalog_grid, []);
  assert.deepEqual(index!.by_job?.detail, []);
  assert.deepEqual(index!.by_job?.form_checkout, []);
  assert.deepEqual(index!.by_job?.home_task, [HOME]);
}

section("bakery home → catalog_grid miss (coded + palette), not auth/dashboard");
{
  const bakery = classifyPage({
    projectType: "Web App Next.js",
    goal: "Neighborhood bakery marketplace: browse breads and place pickup orders",
    features: "catalog order baker queue",
    uiux: "warm bakery",
    pageName: "Home",
    pagePurpose: "Today's breads browse catalog",
    filePaths: ["app/page.tsx"],
    fileRoutes: ["/"],
  });
  assert.equal(layoutJobFromClassification(bakery), "catalog_grid");
  const probe = resolveProbeKeys(bakery);
  assert.equal(probe.selection_mode, "job_miss:catalog_grid");
  assert.equal(probe.keys.length, 0);
  assert.equal(probe.keys.includes(AUTH), false);
  assert.equal(probe.keys.includes(DASH), false);
  assert.equal(jobFromRoutePurpose("/", "Today's breads"), "catalog_grid");
  assert.equal(jobFromRoutePurpose("/order", "Place pickup order"), "form_checkout");
  assert.equal(jobFromRoutePurpose("/baker", "Order queue"), "list_manage");
}

section("kids practice home → home_task, not catalog_grid-only");
{
  assert.equal(jobFromRoutePurpose("/", "Home = next practice (the job)"), "home_task");
  const kids = classifyPage({
    projectType: "Mobile App Expo",
    goal: "Kids education tutor: practice reading at home",
    features: "lessons practice progress",
    uiux: "playful",
    pageName: "Child Home",
    pagePurpose: "today practice home",
    filePaths: ["app/(tabs)/index.tsx"],
    fileRoutes: ["/"],
    hasBottomNav: true,
  });
  assert.equal(layoutJobFromClassification(kids), "home_task");
  const probe = resolveProbeKeys(kids);
  assert.equal(probe.selection_mode, "job:home_task");
  assert.deepEqual(probe.keys, [HOME]);
  assert.equal(probe.keys.includes(DASH), false);
}

section("same job: richer structure wins, not index 0");
{
  const fixture: CatalogIndexFile = {
    version: 1,
    jobs: ["catalog_grid"],
    structures: [
      {
        file_key: "AAAAFIRST0000000000001",
        device: "web",
        jobs: ["catalog_grid"],
        not_for: [],
        richness: 2,
      },
      {
        file_key: "ZZZZRICH0000000000002",
        device: "web",
        jobs: ["catalog_grid"],
        not_for: [],
        richness: 40,
      },
    ],
  };
  const pick = pickLayoutForJob({
    job: "catalog_grid",
    device: "web",
    index: fixture,
  });
  assert.equal(pick.keys[0], "ZZZZRICH0000000000002");
  assert.notEqual(pick.keys[0], fixture.structures[0].file_key);
}

section("palette isolated from prior education project");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-palette-"));
  writeProductPaletteTokens({
    workspaceRoot: tmp,
    goal: "Kids ADHD tutor: calm practice at home",
  });
  const bakery = writeProductPaletteTokens({
    workspaceRoot: tmp,
    goal: "Neighborhood bakery: browse breads and pickup orders",
  });
  assert.equal(bakery.packId, "retail");
  assert.notEqual(bakery.tokens.primary.toLowerCase(), "#4f46e5");
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app/globals.css"), "@tailwind base;\n:root { --x: 1; }\n", "utf8");
  const pass = applyProductPalettePass({
    workspaceRoot: tmp,
    goal: "Neighborhood bakery: browse breads and pickup orders",
    jobHint: "catalog_grid",
  });
  assert.equal(pass.packId, "retail");
  assert.equal(bakery.tokens.primary.toUpperCase(), "#8B4513");
  const css = fs.readFileSync(path.join(tmp, "app/globals.css"), "utf8");
  assert.match(css, /--primary:/);
  assert.match(css, /#8B4513/);
  assert.match(css, /#FDF6E3/);
  assert.equal(/#3F6F5B/i.test(css), false);
  assert.match(css, /--nebulla-font-heading:/);
  assert.match(css, /screen-job: catalog_grid/);
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("activity strings never include a file key");
{
  const line = figmaPickActivityLine({
    ui_pass: "final",
    figma_status: "offline",
    file_key: HOME,
    preferred_bucket: "mobile",
    selection_mode: `job:home_task key=${HOME}`,
  });
  assert.equal(line.includes(HOME), false);
  assert.equal(/\bfigma\b/i.test(line), false);
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(
    chat,
    /fastPrototypeTurn \|\| willCode[\s\S]*Screens will be styled after the app is coded[\s\S]*triggerUiStudioBetaAfterPlanReady/,
  );
  const refs = fs.readFileSync(
    path.join(REPO, "lib/uiGenerationEngine/v2/figmaReferences.ts"),
    "utf8",
  );
  assert.match(refs, /job_miss:\$\{job\}/);
  assert.equal(/selection_mode: `bucket:\$\{preferred\}`/.test(refs), false);
  assert.equal(/tagged\.length/.test(refs), false);
  const bucketsIgnored = resolveProbeKeys(
    classifyPage({
      projectType: "Landing Page",
      goal: "marketing waitlist landing",
      features: "hero",
      uiux: "bold",
      pageName: "Home",
      pagePurpose: "landing hero",
      filePaths: ["app/page.tsx"],
      fileRoutes: ["/"],
    }),
    [DASH, AUTH],
    new Map([["landing", [DASH]]]),
  );
  assert.equal(bucketsIgnored.keys.includes(DASH), false);
  assert.equal(bucketsIgnored.selection_mode, "job_miss:landing_hero");
  const clean = sanitizeUserFacingCopy(`Layout ${HOME} bucket=dashboard`);
  assert.equal(clean.includes(HOME), false);
}

console.log("\n✓ layout catalog index tests passed\n");
