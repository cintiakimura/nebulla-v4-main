/**
 * Preview authority: coded app detection + mockup must not own live Preview post-code.
 * Run: npx tsx scripts/test-preview-authority.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyUiGenerationToPreviewShell,
  buildUiGenerationPreviewHtml,
} from "../lib/uiGenerationEngine/applyPreviewShell.ts";
import {
  buildCodedAppPreviewBridgeHtml,
  isNebulaUiGenMockupHtml,
  resolveAppPreviewAuthority,
  workspaceHasCodedAppUi,
} from "../lib/workspaceCodedAppUi.ts";

const tokens = {
  bg: "#FAFAF9",
  surface: "#FFFFFF",
  primary: "#0F766E",
  accent: "#14B8A6",
  text: "#1C1917",
  mutedText: "#78716C",
  border: "#E7E5E4",
  radius: 12,
  gap: 12,
  pad: 16,
  shadow: "none" as const,
  tone: "clean" as const,
};

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("workspaceHasCodedAppUi false without product UI");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-empty-"));
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><html><body>hi</body></html>");
  assert.equal(workspaceHasCodedAppUi(root), false);
  const auth = resolveAppPreviewAuthority(root);
  assert.equal(auth.mode === "pre_code_mockup" || auth.mode === "live_app_static", true);
  fs.rmSync(root, { recursive: true, force: true });
}

section("workspaceHasCodedAppUi true with src/pages");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-coded-"));
  fs.mkdirSync(path.join(root, "src", "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "pages", "ChildSession.tsx"),
    "export default function ChildSession(){ return <div>Practice</div>; }\n",
  );
  assert.equal(workspaceHasCodedAppUi(root), true);
  const auth = resolveAppPreviewAuthority(root);
  assert.equal(auth.mode, "post_code_bridge");
  assert.equal(auth.codedApp, true);
  assert.match(auth.statusLabel, /Post-code|product/i);
  fs.rmSync(root, { recursive: true, force: true });
}

section("pre-code apply writes index.html + dedicated mockup");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-pre-"));
  const written = applyUiGenerationToPreviewShell({
    workspaceRoot: root,
    projectName: "Demo",
    templateId: "mobile_list_actions",
    tokens,
    slots: { hero_title: "My Tasks", primary_cta: "Start" },
  });
  assert.ok(written.includes("index.html"));
  assert.ok(written.includes("public/nebula-ui-gen-preview.html"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal(isNebulaUiGenMockupHtml(html), true);
  assert.equal(resolveAppPreviewAuthority(root).mode, "pre_code_mockup");
  fs.rmSync(root, { recursive: true, force: true });
}

section("post-code apply does not overwrite live index with mockup");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-post-"));
  fs.mkdirSync(path.join(root, "src", "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "pages", "Home.tsx"),
    "export default function Home(){ return <main>Home</main>; }\n",
  );
  // Stale mockup left as index from pre-code
  const mockup = buildUiGenerationPreviewHtml({
    projectName: "Stale",
    templateId: "mobile_list_actions",
    tokens,
    slots: { hero_title: "Fake", primary_cta: "Tap" },
  });
  fs.writeFileSync(path.join(root, "index.html"), mockup, "utf8");

  const written = applyUiGenerationToPreviewShell({
    workspaceRoot: root,
    projectName: "Demo",
    templateId: "mobile_list_actions",
    tokens,
    slots: { hero_title: "New mockup", primary_cta: "Go" },
  });
  assert.deepEqual(written, ["public/nebula-ui-gen-preview.html"]);
  assert.ok(!written.includes("index.html"));
  // Stale mockup file may still be on disk, but authority must not treat it as live product
  const auth = resolveAppPreviewAuthority(root);
  assert.equal(auth.mode, "post_code_bridge");
  assert.equal(auth.indexIsMockup, true);
  const bridge = buildCodedAppPreviewBridgeHtml({
    projectName: "Demo",
    productFiles: auth.productFiles,
    mockupRel: auth.mockupRel,
    limitation: auth.limitation,
  });
  assert.match(bridge, /coded-app-bridge/);
  assert.match(bridge, /Post-code/);
  assert.ok(!/Fake buttons|class="btn"/.test(bridge) || /not mockup/i.test(bridge));
  fs.rmSync(root, { recursive: true, force: true });
}

section("built dist/index.html preferred as live entry");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-dist-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "App.tsx"), "export default function App(){return null}\n");
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "dist", "index.html"),
    "<!doctype html><html><body><div id='root'>built</div></body></html>",
  );
  const auth = resolveAppPreviewAuthority(root);
  assert.equal(auth.mode, "live_app_static");
  assert.equal(auth.entryRel, "dist/index.html");
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("\n✓ preview authority tests passed\n");
