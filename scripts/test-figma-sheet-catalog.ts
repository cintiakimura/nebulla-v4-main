/**
 * Sheet catalog selection (no live Figma).
 * Run: npm run test:figma-sheet-catalog
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPage } from "../lib/uiGenerationEngine/v2/classifyPage.ts";
import {
  bucketFromSheetCategory,
  capProbeKeys,
  loadSheetCatalog,
  preferredSheetBucket,
  rankKeysForBucket,
  SHEET_PROBE_CAP,
} from "../lib/uiGenerationEngine/v2/figmaSheetCatalog.ts";
import {
  isFigmaLiveOnGenerate,
  preferredBucketForClassification,
  resolveProbeKeys,
  retrieveFigmaReferences,
} from "../lib/uiGenerationEngine/v2/figmaReferences.ts";
import type { PageClassification } from "../lib/uiGenerationEngine/v2/types.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DASHBOARD_KEY = "TgYmEqMwrWFHBxF2kAVOaF";

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

process.chdir(REPO);
delete process.env.FIGMA_LIVE_ON_GENERATE;
delete process.env.FIGMA_REFERENCE_FILE_KEYS;
delete process.env.FIGMA_REFERENCE_BUCKETS;

section("sheet-catalog.json has >> 4 keys; every category mapped");
{
  const catalog = loadSheetCatalog(REPO);
  assert.ok(catalog, "sheet-catalog.json present");
  assert.ok(catalog!.rows.length > 4, `expected >> 4 keys, got ${catalog!.rows.length}`);
  const required = [
    "ZEbJpC67UQyeeynt1UR8gT",
    "P6lA9sHTHVbnmUfoYbV9Ir",
    "TgYmEqMwrWFHBxF2kAVOaF",
    "MaFREMBRF3vQ8BhtqA2ZpK",
    "cPhxRpyLYJATvVZ0lrQ9VR",
    "MvI0ZTMcbKPiX5AsZedfFZ",
    "tqmXjyHAuoM2byJMreptYS",
    "yJ7VsV0epdP0RYDGL8b48L",
    "bWgC4upW5AdbvU7UgxOaN0",
  ];
  const keys = new Set(catalog!.rows.map((r) => r.file_key));
  for (const k of required) assert.ok(keys.has(k), `missing required key ${k}`);
  for (const row of catalog!.rows) {
    const mapped = bucketFromSheetCategory(row.category);
    assert.equal(row.bucket, mapped, `unmapped/mismatch ${row.category}`);
    assert.ok(row.source === "sheet");
  }
}

section("kids mobile education home → bucket mobile (not auth/dashboard)");
{
  const c = classifyPage({
    projectType: "Mobile App Expo",
    goal: "Kids education tutor: practice reading at home with parents and teachers",
    features: "lessons practice progress",
    uiux: "playful spacious",
    pageName: "Child Home",
    pagePurpose: "today practice home",
    filePaths: ["app/(tabs)/index.tsx"],
    fileRoutes: ["/"],
    hasBottomNav: true,
  });
  assert.equal(c.device, "mobile");
  assert.notEqual(c.page_type, "auth");
  assert.equal(preferredSheetBucket(c), "mobile");
  assert.equal(preferredBucketForClassification(c), "mobile");
  const probe = resolveProbeKeys(c);
  assert.equal(probe.preferred_bucket, "mobile");
  assert.ok(probe.keys.length <= SHEET_PROBE_CAP, `probe ${probe.keys.length}`);
  assert.ok(!probe.keys.includes(DASHBOARD_KEY), "mobile probe must not include dashboard key");
}

section("teacher/parent dashboard web → bucket dashboard");
{
  const c = classifyPage({
    projectType: "Web App Next.js",
    goal: "Teacher and parent dashboard for class progress analytics",
    features: "metrics charts students",
    uiux: "sidebar compact",
    pageName: "Teacher Dashboard",
    pagePurpose: "overview metrics",
    filePaths: ["app/dashboard/page.tsx"],
    fileRoutes: ["/dashboard"],
  });
  assert.equal(preferredSheetBucket(c), "dashboard");
  const probe = resolveProbeKeys(c);
  assert.equal(probe.preferred_bucket, "dashboard");
  assert.ok(probe.keys.length <= SHEET_PROBE_CAP);
  assert.ok(probe.keys.length > 0);
}

section("login/sign-in → bucket auth");
{
  const c = classifyPage({
    projectType: "Mobile App",
    goal: "sign in to the kids tutor app",
    features: "email password",
    uiux: "simple",
    pageName: "Login",
    pagePurpose: "user sign-in",
    pageRoute: "/login",
    filePaths: ["app/login.tsx"],
    fileRoutes: ["/login"],
  });
  assert.equal(c.page_type, "auth");
  assert.equal(preferredSheetBucket(c), "auth");
  const probe = resolveProbeKeys(c);
  assert.equal(probe.preferred_bucket, "auth");
  assert.ok(!probe.keys.includes(DASHBOARD_KEY));
}

section("marketing landing → bucket landing");
{
  const c = classifyPage({
    projectType: "Landing Page",
    goal: "marketing waitlist landing for the product",
    features: "hero cta pricing",
    uiux: "bold marketing",
    pageName: "Home",
    pagePurpose: "landing hero",
    filePaths: ["app/page.tsx"],
    fileRoutes: ["/"],
  });
  assert.equal(preferredSheetBucket(c), "landing");
  const probe = resolveProbeKeys(c);
  assert.equal(probe.preferred_bucket, "landing");
  assert.ok(probe.keys.length <= SHEET_PROBE_CAP);
}

section("Generate probe list length ≤ 3");
{
  const mobile: PageClassification = {
    device: "mobile",
    page_type: "home",
    product_function: "course",
    navigation_mode: "bottom_tabs",
    industry: "education",
    density: "medium",
    confidence: "high",
    notes: "",
  };
  assert.equal(capProbeKeys(Array.from({ length: 20 }, (_, i) => `K${i}`)).length, 3);
  const probe = resolveProbeKeys(mobile);
  assert.ok(probe.keys.length <= 3);
}

section("kids retrieve: not dashboard key; live off");
{
  assert.equal(isFigmaLiveOnGenerate(), false);
  const kids: PageClassification = {
    device: "mobile",
    page_type: "home",
    product_function: "course",
    navigation_mode: "bottom_tabs",
    industry: "education",
    density: "medium",
    confidence: "high",
    notes: "kids education",
  };
  const rec = await retrieveFigmaReferences({
    classification: kids,
    templateId: "mobile_home_hero_cards",
    seedState: {
      device: "mobile",
      page_type: "home",
      function: "course",
      navigation_type: "tabs",
      industry_class: "education",
      visual_tone: "",
      density: "medium",
    },
  });
  assert.equal(rec.preferred_bucket, "mobile");
  assert.notEqual(rec.file_key, DASHBOARD_KEY);
  assert.ok(
    rec.figma_status === "offline" || rec.figma_status === "skipped" || rec.figma_status === "weak_matches",
    rec.figma_status,
  );
  if (rec.figma_status === "offline") {
    assert.ok(rec.selection_mode.includes("sheet:bucket:mobile"), rec.selection_mode);
  }
}

section("cloud-project cwd still hits platform Figma structure (kids home)");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-sheet-cwd-"));
  const prev = process.cwd();
  process.chdir(tmp);
  delete process.env.FIGMA_REFERENCE_FILE_KEYS;
  delete process.env.FIGMA_REFERENCE_BUCKETS;
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  try {
    const rec = await retrieveFigmaReferences({
      classification: {
        device: "mobile",
        page_type: "home",
        product_function: "course",
        navigation_mode: "bottom_tabs",
        industry: "education",
        density: "medium",
        confidence: "high",
        notes: "kids education",
      },
      templateId: "mobile_home_hero_cards",
      seedState: {
        device: "mobile",
        page_type: "home",
        function: "course",
        navigation_type: "tabs",
        industry_class: "education",
        visual_tone: "",
        density: "medium",
      },
    });
    assert.equal(rec.figma_status, "offline", rec.figma_error || rec.selection_mode);
    assert.notEqual(rec.file_key, DASHBOARD_KEY);
    assert.ok(rec.selection_mode.includes("sheet:bucket:mobile"), rec.selection_mode);
  } finally {
    process.chdir(prev);
  }
}

section("education ranks kids-tagged mobile ahead of crypto; not first-row");
{
  const education: PageClassification = {
    device: "mobile",
    page_type: "home",
    product_function: "course",
    navigation_mode: "bottom_tabs",
    industry: "education",
    density: "medium",
    confidence: "high",
    notes: "kids ADHD tutor",
  };
  const catalog = {
    source: "test",
    rows: [
      {
        file_key: "CRYPTOKEY1",
        category: "Treyd Crypto Trading App UI Kit",
        bucket: "mobile" as const,
        title: "Treyd Crypto Trading App UI Kit",
        source: "sheet" as const,
      },
      {
        file_key: "GENERICMOBILE",
        category: "Mobile screens",
        bucket: "mobile" as const,
        title: "Mobile screens",
        source: "sheet" as const,
      },
      {
        file_key: "KIDSLEARN1",
        category: "Mobile screens",
        bucket: "mobile" as const,
        title: "Kids Learn school tutor",
        source: "sheet" as const,
      },
    ],
  };
  const ranked = rankKeysForBucket({
    keys: ["CRYPTOKEY1", "GENERICMOBILE", "KIDSLEARN1"],
    classification: education,
    catalog,
    cwd: os.tmpdir(),
  });
  assert.equal(ranked[0], "KIDSLEARN1", `expected kids kit first, got ${ranked.join(",")}`);
  assert.ok(ranked.indexOf("CRYPTOKEY1") > ranked.indexOf("GENERICMOBILE"));
}

section("missing structure/ does not crash — catalog/seed + honest status");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-sheet-miss-"));
  const prev = process.cwd();
  process.chdir(tmp);
  process.env.FIGMA_REFERENCE_FILE_KEYS = "NoStructKeyAAAAAAA";
  process.env.FIGMA_REFERENCE_BUCKETS = "mobile=NoStructKeyAAAAAAA";
  delete process.env.FIGMA_LIVE_ON_GENERATE;
  try {
    const rec = await retrieveFigmaReferences({
      classification: {
        device: "mobile",
        page_type: "home",
        product_function: "general",
        navigation_mode: "bottom_tabs",
        industry: "general",
        density: "medium",
        confidence: "high",
        notes: "",
      },
      templateId: "mobile_home_hero_cards",
      seedState: {
        device: "mobile",
        page_type: "home",
        function: "general",
        navigation_type: "tabs",
        industry_class: "general",
        visual_tone: "",
        density: "medium",
      },
    });
    assert.notEqual(rec.figma_status, "success");
    assert.notEqual(rec.figma_status, "offline");
    assert.ok(
      rec.selection_mode.includes("catalog") ||
        rec.selection_mode.includes("seed") ||
        rec.figma_status === "skipped" ||
        rec.figma_status === "weak_matches",
      rec.selection_mode,
    );
  } finally {
    process.chdir(prev);
    delete process.env.FIGMA_REFERENCE_FILE_KEYS;
    delete process.env.FIGMA_REFERENCE_BUCKETS;
  }
}

console.log("\nfigma-sheet-catalog tests passed");
