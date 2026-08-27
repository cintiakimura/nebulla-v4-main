/**
 * Final UI pass (post-code restyle). No live Figma.
 * Run: npm run test:final-ui
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runUiGenerationCycleV2 } from "../lib/uiGenerationEngine/index.ts";
import { readCyclePolicy, writeCyclePolicy } from "../lib/uiGenerationEngine/cyclePolicy.ts";
import { injectFinalUiCssVars, injectFinalUiIntoProductPreview, FINAL_UI_CSS_START } from "../lib/uiGenerationEngine/injectFinalUiCssVars.ts";
import { isFigmaLiveOnGenerate } from "../lib/uiGenerationEngine/v2/figmaReferences.ts";
import {
  MAX_FINAL_UI_AUTOPILOT_RUNS,
  resolvePostCodeUiAction,
} from "../src/lib/postCodeUiRefresh.ts";

const DASHBOARD_KEY = "TgYmEqMwrWFHBxF2kAVOaF";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

delete process.env.FIGMA_LIVE_ON_GENERATE;
delete process.env.FIGMA_REFERENCE_FILE_KEYS;
delete process.env.FIGMA_REFERENCE_BUCKETS;

section("Live Figma still off");
assert.equal(isFigmaLiveOnGenerate(), false);
assert.equal(MAX_FINAL_UI_AUTOPILOT_RUNS, 2);

section("No app/ files → Final UI must NOT run");
{
  assert.equal(
    resolvePostCodeUiAction({
      writtenPaths: ["nebula-project/ui-brief.md", "master-plan.json"],
      alreadyRanPostCode: false,
      finalUiCount: 0,
    }),
    "skip_no_ui_paths",
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-final-none-"));
  const plan = path.join(tmp, "master-plan.json");
  fs.writeFileSync(
    plan,
    JSON.stringify({ "1. Goal of the app": "Kids tutor mobile", "4. Pages and navigation": "- Home (`/`)" }, null, 2),
    "utf8",
  );
  const result = await runUiGenerationCycleV2({
    workspaceRoot: tmp,
    masterPlanPath: plan,
    projectName: "Kids",
    pageName: "Home",
    autoTriggered: true,
    uiPhase: "post_code",
    writtenPaths: [],
  });
  assert.equal(result.skipped, true);
  assert.match(String(result.user_visible_stage), /no product files/i);
}

section("After kids app/ apply → Final UI once; mobile not dashboard kit");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-final-kids-"));
  fs.mkdirSync(path.join(tmp, "app", "practice"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "app", "page.tsx"),
    `export default function Home() {
  return (<main><h1>Child Home</h1><button>Start practice</button></main>);
}
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "app", "practice", "page.tsx"),
    `export default function Practice() { return (<main><h1>Practice</h1></main>); }\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "app", "globals.css"),
    `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
    "utf8",
  );
  const plan = path.join(tmp, "master-plan.json");
  fs.writeFileSync(
    plan,
    JSON.stringify(
      {
        "1. Goal of the app":
          "Kids education tutor mobile app for child home and practice. Project type: mobile app Expo.",
        "2. Tech and Research": "Expo React Native web. Bottom tabs.",
        "3. Features and KPIs": "- Practice lessons\n- Capture worksheet",
        "4. Pages and navigation":
          "- **Child Home** (`/`)\n- **Child Practice** (`/practice`)\n- **Teacher Dashboard** (`/teacher/dashboard`)",
        "5. UI/UX design":
          "Playful teal primary (#0F766E), light bg, medium density, bottom tabs, spacious cards.",
      },
      null,
      2,
    ),
    "utf8",
  );
  const result = await runUiGenerationCycleV2({
    workspaceRoot: tmp,
    masterPlanPath: plan,
    projectName: "Kids Read",
    pageName: "Child Home",
    autoTriggered: true,
    uiPhase: "post_code",
    writtenPaths: ["app/page.tsx", "app/practice/page.tsx", "app/globals.css"],
  });
  assert.notEqual(result.skipped, true);
  const policy = readCyclePolicy(tmp);
  assert.equal(policy.ui_pass, "final");
  assert.ok(policy.final_ui_ran_at);
  assert.equal(policy.final_ui_session_count, 1);
  const meta = JSON.parse(
    fs.readFileSync(path.join(tmp, "nebulla-project", "ui-generation-v2-meta.json"), "utf8"),
  ) as {
    ui_pass?: string;
    figma?: { preferred_bucket?: string; file_key?: string | null };
  };
  assert.equal(meta.ui_pass, "final");
  assert.equal(meta.figma?.preferred_bucket, "mobile");
  assert.notEqual(meta.figma?.file_key, DASHBOARD_KEY);
  const css = fs.readFileSync(path.join(tmp, "app", "globals.css"), "utf8");
  assert.ok(css.includes(FINAL_UI_CSS_START));
  assert.ok(css.includes("--nebulla-primary"));
  assert.ok(!fs.existsSync(path.join(tmp, "app", "page.tsx")) || fs.readFileSync(path.join(tmp, "app", "page.tsx"), "utf8").includes("Child Home"));
}

section("Second Foundation apply → Final UI does not run again");
{
  assert.equal(
    resolvePostCodeUiAction({
      writtenPaths: ["app/page.tsx", "app/practice/page.tsx"],
      alreadyRanPostCode: true,
      finalUiCount: 1,
      sliceLabel: "Foundation",
    }),
    "sync_preview_only",
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-final-cap-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app", "page.tsx"), "export default function P(){return null}\n", "utf8");
  writeCyclePolicy(tmp, {
    ...readCyclePolicy(tmp),
    final_ui_session_count: 1,
    final_ui_ran_at: new Date().toISOString(),
    ui_pass: "final",
  });
  const plan = path.join(tmp, "master-plan.json");
  fs.writeFileSync(plan, JSON.stringify({ "1. Goal of the app": "x" }, null, 2), "utf8");
  const result = await runUiGenerationCycleV2({
    workspaceRoot: tmp,
    masterPlanPath: plan,
    projectName: "Kids",
    autoTriggered: true,
    uiPhase: "post_code",
    sliceLabel: "Foundation",
    writtenPaths: ["app/page.tsx"],
  });
  assert.equal(result.skipped, true);
  assert.match(String(result.user_visible_stage), /already ran/i);
}

section("injectFinalUiCssVars is idempotent");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-css-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app", "globals.css"), "@tailwind base;\n", "utf8");
  const tokens = {
    bg: "#fff",
    surface: "#f8f8f8",
    primary: "#0F766E",
    accent: "#0D9488",
    text: "#111",
    mutedText: "#666",
    border: "#ddd",
    radius: 12,
    gap: 12,
    pad: 16,
    shadow: "none",
    tone: "clean",
  };
  assert.equal(injectFinalUiCssVars(tmp, tokens), "app/globals.css");
  assert.equal(injectFinalUiCssVars(tmp, { ...tokens, primary: "#111111" }), "app/globals.css");
  const css = fs.readFileSync(path.join(tmp, "app", "globals.css"), "utf8");
  assert.equal(css.split(FINAL_UI_CSS_START).length - 1, 1);
  assert.ok(css.includes("#111111"));
}

section("interactive product preview receives catalog tokens");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-pp-"));
  fs.mkdirSync(path.join(tmp, "public", "product-preview"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "public", "product-preview", "index.html"),
    `<html><head><meta name="nebulla-preview" content="interactive-product-preview"/><style>:root { --bg:#F8FAFC; --accent:#0F766E; }</style></head><body></body></html>`,
    "utf8",
  );
  assert.equal(
    injectFinalUiIntoProductPreview(tmp, {
      bg: "#0B1220",
      surface: "#111827",
      primary: "#14B8A6",
      accent: "#5EEAD4",
      text: "#F8FAFC",
      mutedText: "#94A3B8",
      border: "#334155",
      radius: 14,
      gap: 12,
      pad: 16,
      shadow: "none",
      tone: "clean",
    }),
    true,
  );
  const html = fs.readFileSync(path.join(tmp, "public", "product-preview", "index.html"), "utf8");
  assert.match(html, /--bg:#0B1220/);
}

section("Cloud-project cwd still resolves platform structure (sheet catalog)");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-final-cwd-"));
  const prev = process.cwd();
  process.chdir(tmp);
  try {
    assert.ok(
      fs.existsSync(path.join(REPO, "nebulla-project", "figma-library", "structure", "ZEbJpC67UQyeeynt1UR8gT", "document.json")),
    );
  } finally {
    process.chdir(prev);
  }
}

console.log("\nfinal-ui-pass tests passed\n");
