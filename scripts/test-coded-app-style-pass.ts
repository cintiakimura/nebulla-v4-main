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
import {
  looksLikeGoalStubName,
  looksLikeEducationKitDefaultName,
  inferProductName,
  isWorkspaceLabelStub,
  productNameFromPlan,
  identityFitsGoal,
  buildProductIdentity,
} from "../lib/productIdentity.ts";
import { applyPlanIdentityAndWinningPalette } from "../lib/nebulaIdeWorkspaceArtifacts.ts";
import { writeUiBriefMarkdown } from "../lib/nebulaUiBrief.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("stub names and Grain Bakery brand");
{
  assert.equal(looksLikeGoalStubName("Project type Mobile App primary"), true);
  assert.equal(isWorkspaceLabelStub("Project type Mobile App primary"), true);
  assert.equal(isWorkspaceLabelStub("Untitled Project"), true);
  assert.equal(isWorkspaceLabelStub("LoafLocal"), false);
  assert.equal(inferProductName("Grain Bakery — neighborhood breads and pickup orders"), "Grain Bakery");
  assert.equal(
    productNameFromPlan({
      "1. Goal of the app":
        "**Product name:** LoafLocal\nNeighborhood bakery marketplace. Project type: mobile app.",
    }),
    "LoafLocal",
  );
  assert.equal(inferProductName("Quill Path learning companion for daily reading"), "Quill Path");
  assert.equal(inferProductName("Spoke & Co neighborhood bike shop"), "Spoke & Co");
  assert.equal(
    inferProductName("**Product name:** Motodrop\nMoto delivery — pickup and dropoff."),
    "Motodrop",
  );
  assert.equal(looksLikeEducationKitDefaultName("Sparrow Tutor", "Quill Path learning companion"), true);
  assert.equal(looksLikeEducationKitDefaultName("Sparrow Tutor", "Sparrow Tutor kids app"), false);
  assert.equal(looksLikeGoalStubName("Practice app", "Quill Path"), true);
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
  assert.equal((brief.match(/\*\*Palette:\*\*/g) || []).length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("plan save keeps one palette and persists LoafLocal");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-plan-identity-"));
  const plan = {
    "1. Goal of the app":
      "**Product name:** LoafLocal\nBakery marketplace for neighborhood breads and pickup.",
    "5. UI/UX design": [
      "- **Palette:** family=education-calm bg `#FFF8F1`, primary `#3F6F5B`",
      "- **Palette:** family=retail bg `#FDF6E3`, surface `#FFFFFF`, primary `#8B4513`, accent `#D2691E`",
    ].join("\n"),
  };
  const pass = applyPlanIdentityAndWinningPalette(tmp, plan);
  assert.equal(pass.productName, "LoafLocal");
  assert.equal((pass.plan["5. UI/UX design"].match(/\*\*Palette:\*\*/g) || []).length, 1);
  assert.match(pass.plan["5. UI/UX design"], /#FDF6E3|#8B4513/i);
  assert.equal(/education-calm/i.test(pass.plan["5. UI/UX design"]), false);
  const ident = JSON.parse(
    fs.readFileSync(path.join(tmp, "nebulla-ide/product-identity.json"), "utf8"),
  ) as { projectName: string };
  assert.equal(ident.projectName, "LoafLocal");
  const brief = writeUiBriefMarkdown(tmp, pass.plan);
  assert.equal((brief.content.match(/\*\*Palette:\*\*/g) || []).length, 1);
  assert.equal(/education-calm/i.test(brief.content), false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("Quill Path replaces Sparrow Tutor / Practice app on Live");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-quill-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "app/page.tsx"),
    "export default function Home(){ return <main>Read</main>; }\n",
  );
  fs.writeFileSync(
    path.join(tmp, "app/layout.tsx"),
    `export const metadata = { title: "Sparrow Tutor" };
export default function RootLayout({ children }) {
  return (
    <html><body>
      <header><strong>Practice app</strong></header>
      {children}
    </body></html>
  );
}
`,
  );
  fs.mkdirSync(path.join(tmp, "nebulla-ide"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/master-plan.json"),
    JSON.stringify({
      "1. Goal of the app": "**Product name:** Quill Path\nA learning companion for daily reading.",
    }),
    "utf8",
  );
  const pass = applyProductPalettePass({
    workspaceRoot: tmp,
    goal: "Quill Path learning companion for daily reading",
  });
  assert.equal(pass.productName, "Quill Path");
  const layout = fs.readFileSync(path.join(tmp, "app/layout.tsx"), "utf8");
  assert.match(layout, /Quill Path/);
  assert.equal(/Sparrow Tutor/i.test(layout), false);
  assert.equal(/Practice app/i.test(layout), false);
  const bakeryName = inferProductName("LoafLocal bakery pickup orders");
  assert.equal(bakeryName, "LoafLocal");
  assert.equal(/tutor/i.test(bakeryName), false);
  const slice = fs.readFileSync(path.join(REPO, "src/lib/fastPrototypeNextSlice.ts"), "utf8");
  assert.match(slice, /FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT = false/);
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("Spoke & Co Home is bikes, not the tutor card");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-spoke-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "app/page.tsx"),
    `export default function Home() {
  return (
    <main>
      <p>One short lesson. Start when you are ready.</p>
      <p>Weekly streak</p>
      <button>Start practice</button>
      <button>See streak</button>
      <span>Role: parent</span>
    </main>
  );
}
`,
  );
  fs.writeFileSync(
    path.join(tmp, "app/layout.tsx"),
    `export default function RootLayout({ children }) {
  return <html><body><header><strong>Spoke & Co</strong><span>Role: parent</span></header>{children}</body></html>;
}
`,
  );
  fs.mkdirSync(path.join(tmp, "nebulla-ide"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/master-plan.json"),
    JSON.stringify({
      "1. Goal of the app": "**Product name:** Spoke & Co\nNeighborhood bike shop — ready bikes and book a slot.",
      "4. Pages and navigation": "### Home `/`\n### Book `/book`\n### Mechanic `/mechanic`",
    }),
    "utf8",
  );
  const pass = applyProductPalettePass({
    workspaceRoot: tmp,
    goal: "Spoke & Co neighborhood bike shop ready bikes and book a slot",
    masterPlanPath: path.join(tmp, "nebulla-ide/master-plan.json"),
  });
  assert.equal(pass.productName, "Spoke & Co");
  const home = fs.readFileSync(path.join(tmp, "app/page.tsx"), "utf8");
  assert.match(home, /bike|Book slot|Ready/i);
  assert.equal(/short lesson|Start practice|Weekly streak|See streak|Role:\s*parent/i.test(home), false);
  const layout = fs.readFileSync(path.join(tmp, "app/layout.tsx"), "utf8");
  assert.equal(/Role:\s*parent/i.test(layout), false);
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  assert.equal(/Next slice starts automatically/i.test(chat), false);
  assert.equal(/send Continue for Data\+API/i.test(chat), false);
  assert.equal(/Autopilot continues until MVP ready/i.test(chat), false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("Motodrop chip beats Kite Studio; Request has pickup + dropoff");
{
  const motoGoal =
    "**Product name:** Motodrop\nMoto delivery: pickup, dropoff, accept request.";
  assert.equal(identityFitsGoal("Kite Studio", motoGoal), false);
  assert.equal(buildProductIdentity(motoGoal, "Web App", "Kite Studio", true).projectName, "Motodrop");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-motodrop-"));
  fs.mkdirSync(path.join(tmp, "app", "request"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "nebulla-ide"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/product-identity.json"),
    JSON.stringify({ projectName: "Kite Studio", logoInitials: "KS", userSet: true }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "app/page.tsx"),
    `export default function Home(){ return <main><p>Interactive screen with mock data</p><button>Continue</button></main>; }\n`,
  );
  fs.writeFileSync(
    path.join(tmp, "app/request/page.tsx"),
    `export default function Request(){ return <main><p>Interactive screen with mock data</p><button>Continue</button></main>; }\n`,
  );
  fs.writeFileSync(
    path.join(tmp, "app/layout.tsx"),
    `export default function RootLayout({ children }) {
  return (<html><body><header data-nebula-brand><strong>Kite Studio</strong></header>{children}</body></html>);
}
`,
  );
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/master-plan.json"),
    JSON.stringify({
      "1. Goal of the app": motoGoal,
      "4. Pages and navigation": "### Home `/`\n### Request `/request`",
      "5. UI/UX design": "- **Palette:** family=education-calm bg `#FFF8F1` primary `#3F6F5B`\n- **Palette:** family=professional primary `#44403C`",
    }),
    "utf8",
  );
  const pass = applyProductPalettePass({
    workspaceRoot: tmp,
    goal: motoGoal,
    masterPlanPath: path.join(tmp, "nebulla-ide/master-plan.json"),
  });
  assert.equal(pass.productName, "Motodrop");
  const request = fs.readFileSync(path.join(tmp, "app/request/page.tsx"), "utf8");
  assert.match(request, /name=["']pickup["']/);
  assert.match(request, /name=["']dropoff["']/);
  assert.match(request, /Accept request/);
  assert.equal(/Interactive screen with mock data/i.test(request), false);
  const identity = JSON.parse(fs.readFileSync(path.join(tmp, "nebulla-ide/product-identity.json"), "utf8"));
  assert.equal(identity.projectName, "Motodrop");
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("activity log is quiet after slices");
{
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  const sync = fs.readFileSync(path.join(REPO, "src/lib/ideArtifactSync.ts"), "utf8");
  const slice = fs.readFileSync(path.join(REPO, "src/lib/fastPrototypeNextSlice.ts"), "utf8");
  assert.match(chat, /App is ready on Live\./);
  assert.equal(/UI Studio Beta next/i.test(sync), false);
  assert.equal(/placeholder mockup/i.test(slice), false);
  assert.equal(/live practice app/i.test(chat), false);
  assert.match(slice, /PRODUCT_MVP_READY_MESSAGE = 'App is ready on Live\.'/);
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
