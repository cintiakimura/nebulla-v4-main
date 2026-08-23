/**
 * Preview authority: coded app detection + mockup must not own live Preview post-code.
 * Run: npx tsx scripts/test-preview-authority.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyUiGenerationToPreviewShell,
  buildUiGenerationPreviewHtml,
} from "../lib/uiGenerationEngine/applyPreviewShell.ts";
import {
  buildCodedAppPreviewBridgeHtml,
  inferRoutesFromProductFiles,
  isNebulaUiGenMockupHtml,
  resolveAppPreviewAuthority,
  toHttpHeaderSafe,
  workspaceHasCodedAppUi,
  htmlLooksLikeShowablePreview,
  previewMetaHasProductRoutes,
} from "../lib/workspaceCodedAppUi.ts";
import {
  ensureInteractiveProductPreview,
  inferPreviewScreensFromPaths,
  previewHtmlNeedsProductHeal,
  PRODUCT_PREVIEW_MARKER,
  PRODUCT_PREVIEW_REL,
} from "../lib/interactiveProductPreview.ts";

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
  assert.match(auth.statusLabel, /Code exists|Post-code|product/i);
  fs.rmSync(root, { recursive: true, force: true });
}

section("inferRoutesFromProductFiles from app/ pages");
{
  const routes = inferRoutesFromProductFiles([
    "app/page.tsx",
    "app/login/page.tsx",
    "app/kid/page.tsx",
    "components/TutorSession.tsx",
  ]);
  assert.deepEqual(routes, ["/", "/kid", "/login"]);
  const srcApp = inferRoutesFromProductFiles(["src/app/page.tsx", "src/app/teacher/page.tsx"]);
  assert.deepEqual(srcApp, ["/", "/teacher"]);
  const screens = inferRoutesFromProductFiles([
    "app/layout.tsx",
    "src/components/ErrorBoundary.tsx",
    "src/screens/KidHomeScreen.tsx",
    "src/screens/TeacherDashboardScreen.tsx",
    "src/screens/LoginScreen.tsx",
  ]);
  assert.ok(screens.includes("/kid-home"));
  assert.ok(screens.includes("/teacher-dashboard"));
  assert.ok(screens.includes("/login"));
}

section("workspace-routes scaffold yields to UI Gen mockup");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-scaffold-"));
  fs.writeFileSync(
    path.join(root, "index.html"),
    `<!DOCTYPE html><html><head><meta name="nebulla-preview" content="workspace-routes"/><title>App</title></head><body><p class="sub">Workspace routes on disk.</p></body></html>`,
    "utf8",
  );
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "public", "nebula-ui-gen-preview.html"),
    `<!DOCTYPE html><html><head><meta name="nebulla-ui-gen-preview" content="1"/></head><body><div class="shell--phone" data-screen="home">Mockup</div></body></html>`,
    "utf8",
  );
  const auth = resolveAppPreviewAuthority(root);
  assert.equal(auth.mode, "pre_code_mockup");
  assert.equal(auth.entryRel, "public/nebula-ui-gen-preview.html");
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
  assert.match(bridge, /Code exists|Post-code/);
  assert.ok(!/Who are you today/i.test(bridge));
  assert.match(bridge, /Open Code/);
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

section("coded app files beat interactive mock — honest bridge");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-interactive-"));
  fs.mkdirSync(path.join(root, "app", "kid"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "app", "page.tsx"),
    "export default function Home(){ return <main>Home</main>; }\n",
  );
  fs.writeFileSync(
    path.join(root, "app", "kid", "page.tsx"),
    "export default function Kid(){ return <main>Kid</main>; }\n",
  );
  const screens = inferPreviewScreensFromPaths([
    "app/page.tsx",
    "app/kid/page.tsx",
    "app/teacher/page.tsx",
    "components/TutorSession.tsx",
    "components/UploadLesson.tsx",
  ]);
  assert.ok(screens.some((s) => s.id === "role-kid"));
  assert.ok(screens.some((s) => s.id === "role-teacher"));
  assert.ok(screens.some((s) => s.id === "tutor"));
  assert.ok(screens.some((s) => s.id === "upload"));

  const ensured = ensureInteractiveProductPreview(root, {
    projectName: "Tutor Demo",
    productFiles: [
      "app/page.tsx",
      "app/kid/page.tsx",
      "app/teacher/page.tsx",
      "components/TutorSession.tsx",
      "components/UploadLesson.tsx",
    ],
  });
  assert.equal(ensured.path, PRODUCT_PREVIEW_REL);
  const html = fs.readFileSync(path.join(root, PRODUCT_PREVIEW_REL), "utf8");
  assert.match(html, new RegExp(PRODUCT_PREVIEW_MARKER, "i"));
  assert.match(html, /Kid Practice Home|Start practice/);
  assert.match(html, /Reading practice|Start practice/);
  assert.equal(/Source of truth remains your coded files/i.test(html), false);
  assert.equal(/Signed in as parent \(mock session\)/i.test(html), false);
  assert.equal(previewHtmlNeedsProductHeal(html), false);
  assert.equal(
    previewHtmlNeedsProductHeal('Source of truth remains your coded files: app/page.tsx'),
    true,
  );
  const auth = resolveAppPreviewAuthority(root);
  assert.equal(auth.mode, "interactive_product_preview");
  assert.equal(auth.codedApp, true);
  assert.equal(auth.entryRel, PRODUCT_PREVIEW_REL);
  assert.match(auth.statusLabel, /Interactive preview/i);
  const bridge = buildCodedAppPreviewBridgeHtml({
    projectName: "Tutor Demo",
    productFiles: auth.productFiles,
    mockupRel: auth.mockupRel,
    limitation: auth.limitation,
  });
  assert.match(bridge, /coded-app-bridge/);
  assert.match(bridge, /Code exists/);
  assert.match(bridge, /Open Code/);
  assert.ok(!/Who are you today/i.test(bridge));
  fs.rmSync(root, { recursive: true, force: true });
}

section("status labels / headers must not crash Node setHeader");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-hdr-"));
  const mockup = buildUiGenerationPreviewHtml({
    projectName: "Hdr",
    templateId: "mobile_list_actions",
    tokens,
    slots: { hero_title: "Home", primary_cta: "Go" },
  });
  fs.writeFileSync(path.join(root, "index.html"), mockup, "utf8");
  const auth = resolveAppPreviewAuthority(root);
  assert.equal(auth.mode, "pre_code_mockup");
  const unsafe = "Pre-code mockup only — not live app";
  const safe = toHttpHeaderSafe(unsafe);
  assert.equal(/[^\x20-\x7E]/.test(safe), false);
  assert.equal(/—/.test(safe), false);
  assert.equal(/[^\x20-\x7E]/.test(toHttpHeaderSafe(auth.statusLabel)), false);
  assert.equal(/—/.test(auth.statusLabel), false);
  fs.rmSync(root, { recursive: true, force: true });
}

section("Vite App+main is thin shell not Code exists success");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-preview-thin-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "App.tsx"), "export default function App(){return null}\n");
  fs.writeFileSync(path.join(root, "src", "main.tsx"), "import App from './App'\n");
  const auth = resolveAppPreviewAuthority(root);
  assert.equal(auth.mode, "thin_code_shell");
  assert.equal(auth.codedApp, false);
  assert.equal(auth.honesty, "thin_code_shell");
  assert.match(auth.statusLabel, /Code shell/i);
  assert.equal(/App looks OK/i.test(auth.statusLabel), false);
  fs.rmSync(root, { recursive: true, force: true });
}

section("canvas honesty — product preview / coded bridge is showable (not Figma HTML)");
{
  assert.equal(htmlLooksLikeShowablePreview("<html><body>No preview</body></html>"), false);
  const mockup = `<!doctype html><html><head><meta name="nebulla-preview" content="ui-gen-mockup"></head><body><div class="shell--phone" data-screen="home">Home</div></body></html>`;
  assert.equal(htmlLooksLikeShowablePreview(mockup), true);
  const coded = `<!doctype html><html><body><div class="coded-app-bridge"><p>Code exists</p></div></body></html>`;
  assert.equal(htmlLooksLikeShowablePreview(coded), true);
  const interactive = `<!doctype html><html><body><main data-preview="interactive-product-preview">Who are you today</main></body></html>`;
  assert.equal(htmlLooksLikeShowablePreview(interactive), true);
  assert.equal(
    previewMetaHasProductRoutes({ previewHonesty: "real_routes", previewMode: "interactive_product_preview" }),
    true,
  );
  assert.equal(
    previewMetaHasProductRoutes({ previewHonesty: "mockup_waiting", previewMode: "pre_code_mockup" }),
    false,
  );
  const canvas = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/components/ide/shell/previewTools/BuildPreviewCanvas.tsx"),
    "utf8",
  );
  assert.match(canvas, /keepMockupRef/);
  assert.match(canvas, /keepMockupRef\.current = true/);
}

console.log("\n✓ preview authority tests passed\n");
