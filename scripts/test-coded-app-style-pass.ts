/**
 * Generate UI after routes = coded CSS + product name, not an empty draft.
 * Run: npm run test:coded-app-style-pass
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "url";
import { applyProductPalettePass } from "../lib/productPalettePass.ts";
import { looksLikeGoalStubName, inferProductName } from "../lib/productIdentity.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("stub names and Grain Bakery brand");
{
  assert.equal(looksLikeGoalStubName("Project type Mobile App primary"), true);
  assert.equal(inferProductName("Grain Bakery — neighborhood breads and pickup orders"), "Grain Bakery");
}

section("style pass writes globals + preview without a draft file");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-style-pass-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "app/page.tsx"),
    "export default function Home(){ return <main>Today's breads</main>; }\n",
  );
  fs.writeFileSync(
    path.join(tmp, "app/layout.tsx"),
    `export default function RootLayout({ children }) {
  return (
    <html><body>
      <header data-nebula-brand>
        <span style={{ background: "#0F766E" }}>XX</span>
        <strong>Project type Mobile App primary</strong>
      </header>
      {children}
    </body></html>
  );
}
`,
  );
  fs.mkdirSync(path.join(tmp, "nebula-ui-studio"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "nebula-ui-studio/ui-brief.md"),
    "- **Palette:** family=education-calm bg `#FFF8F1` primary `#3F6F5B`\n",
    "utf8",
  );
  const pass = applyProductPalettePass({
    workspaceRoot: tmp,
    goal: "Grain Bakery marketplace: browse breads and place pickup orders",
  });
  assert.equal(pass.ok, true);
  assert.equal(pass.packId, "retail");
  assert.equal(pass.productName, "Grain Bakery");
  assert.ok(pass.applied.includes("app/globals.css"));
  const css = fs.readFileSync(path.join(tmp, "app/globals.css"), "utf8");
  assert.match(css, /#8B4513/);
  assert.match(css, /#FDF6E3/);
  assert.equal(/#3F6F5B/i.test(css), false);
  const layout = fs.readFileSync(path.join(tmp, "app/layout.tsx"), "utf8");
  assert.match(layout, /Grain Bakery/);
  assert.equal(/Project type Mobile App primary/.test(layout), false);
  const preview = fs.readFileSync(path.join(tmp, "public/product-preview/index.html"), "utf8");
  assert.match(preview, /#8B4513|#8b4513/);
  assert.match(preview, /Grain Bakery/);
  assert.equal(fs.existsSync(path.join(tmp, "public/nebula-ui-gen-preview.html")), false);
  const brief = fs.readFileSync(path.join(tmp, "nebula-ui-studio/ui-brief.md"), "utf8");
  assert.equal(/education-calm/i.test(brief), false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("Generate UI after routes is a style pass, not a draft remount");
{
  const generate = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  const genFn = generate.slice(generate.indexOf('app.post("/api/ui-studio-beta/generate"'));
  assert.match(genFn, /workspaceHasCodedAppUi/);
  assert.match(genFn, /applyProductPalettePass/);
  assert.match(genFn, /coded_style_pass/);
  const canvas = fs.readFileSync(
    path.join(REPO, "src/components/ide/shell/previewTools/BuildPreviewCanvas.tsx"),
    "utf8",
  );
  assert.match(canvas, /\/api\/coded-app\/style-pass/);
  assert.match(canvas, /liveAvailable[\s\S]*style-pass/);
}

console.log("\n✓ coded app style pass tests passed\n");
