/**
 * Build preview Live app / Layout draft tabs.
 * Run: npm run test:build-preview-tabs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildPreviewBootstrapPath } from "../src/components/ide/shell/previewTools/BuildPreviewCanvas.tsx";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("Live src is coded bootstrap; draft adds surface=mockup");
{
  assert.equal(buildPreviewBootstrapPath({ rev: 3, showDraft: false }), "/api/app-preview/bootstrap?_rev=3");
  assert.equal(
    buildPreviewBootstrapPath({ rev: 3, showDraft: true }),
    "/api/app-preview/bootstrap?_rev=3&surface=mockup",
  );
}

const toolbar = fs.readFileSync(
  path.join(REPO, "src/components/ide/shell/previewTools/PreviewEditToolbar.tsx"),
  "utf8",
);
const canvas = fs.readFileSync(
  path.join(REPO, "src/components/ide/shell/previewTools/BuildPreviewCanvas.tsx"),
  "utf8",
);
const server = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");

section("tabs are real tablist buttons, not a Live span");
{
  assert.match(toolbar, /role="tablist"/);
  assert.match(toolbar, /role="tab"/);
  assert.match(toolbar, /aria-selected=\{!showingMockup\}/);
  assert.match(toolbar, /aria-selected=\{showingMockup\}/);
  assert.match(toolbar, /aria-label="Live app"/);
  assert.match(toolbar, /aria-label="Layout draft"/);
  assert.match(toolbar, /onClick=\{\(\) => onShowLiveApp\?\.\(\)\}/);
  assert.match(toolbar, /onClick=\{\(\) => onShowCatalogMockup\?\.\(\)\}/);
  assert.equal(/<span[^>]*>\s*Live app\s*<\/span>/.test(toolbar), false);
  assert.match(toolbar, /z-30/);
  const genIdx = toolbar.indexOf('aria-label="Generate UI"');
  const liveIdx = toolbar.indexOf('aria-label="Live app"');
  assert.ok(liveIdx > 0 && genIdx > liveIdx);
}

section("Layout draft click is not a no-op when live routes exist");
{
  assert.equal(/if \(liveAvailable\) \{\s*keepMockupRef\.current = false;\s*setShowMockup\(false\)/.test(canvas), false);
  assert.match(canvas, /userPickedDraftRef\.current = true/);
  assert.match(canvas, /setShowMockup\(true\)/);
  assert.match(canvas, /userPickedDraftRef/);
  assert.match(canvas, /if \(live && !userPickedDraftRef\.current\)/);
}

section("after Foundation, Live is default; draft is optional");
{
  assert.match(canvas, /if \(!userPickedDraftRef\.current\) \{\s*keepMockupRef\.current = false;\s*setShowMockup\(false\)/);
  assert.match(canvas, /App is not running yet/);
  assert.match(canvas, /Retry/);
  assert.match(server, /Explicit Layout draft tab only/);
}

console.log("\n✓ build preview tabs tests passed\n");
