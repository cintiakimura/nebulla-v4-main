/**
 * New Fast Prototype goal replaces leftover plan + routes.
 * Run: npx tsx scripts/test-product-goal-replace.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isReplacementProductBrief,
  leftoverPlanConflictsWithGoal,
  leftoverRoutesConflictWithGoal,
  looksLikeStandaloneProductBrief,
} from "../lib/productGoalFingerprint.ts";
import {
  applyNewProductBriefToWorkspace,
  pruneAppRoutesNotInSection4,
} from "../lib/replaceProductWorkspace.ts";
import { pagesForPlanFromGoalAndDisk, seedPagesFromGoal } from "../lib/nebulaUiBrief.ts";
import { hydrateMasterPlanDerivedSections } from "../lib/nebulaIdeWorkspaceArtifacts.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

const SPOKE =
  "Spoke & Co neighborhood bike shop — ready bikes on the floor, book a pickup or mechanic slot.";
const QUILL =
  "**Product name:** Quill Path\nLearning companion for daily reading. Helper, Session, and Practice. CogniMicro. Palette: education-calm.";

section("Spoke after Quill is a replacement, Continue is not");
{
  assert.equal(isReplacementProductBrief(SPOKE, QUILL), true);
  assert.equal(isReplacementProductBrief(QUILL, QUILL), false);
  assert.equal(looksLikeStandaloneProductBrief(SPOKE), true);
  assert.equal(looksLikeStandaloneProductBrief("continue"), false);
  assert.equal(looksLikeStandaloneProductBrief("Continue"), false);
}

section("leftover education routes conflict with bike shop goal");
{
  assert.equal(leftoverRoutesConflictWithGoal(SPOKE, ["/", "/practice", "/session", "/helper"]), true);
  assert.equal(leftoverRoutesConflictWithGoal(QUILL, ["/", "/practice"]), false);
}

section("§4 seeds Home/Book/Mechanic — disk Practice is ignored");
{
  const seeded = seedPagesFromGoal(SPOKE);
  assert.deepEqual(
    seeded.map((p) => p.route),
    ["/", "/book", "/mechanic"],
  );
  const fromDisk = pagesForPlanFromGoalAndDisk(SPOKE, ["/", "/practice", "/session", "/helper"]);
  assert.equal(fromDisk.some((p) => p.route === "/practice"), false);
  assert.ok(fromDisk.some((p) => p.route === "/book"));
  assert.ok(fromDisk.some((p) => p.route === "/mechanic"));
}

section("hydrate discards Quill §2–§5 when §1 is Spoke");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-replace-hydrate-"));
  const mixed = {
    "1. Goal of the app": SPOKE,
    "2. Tech and Research": "CogniMicro education kit. Helper/Session/Practice.",
    "3. Features and KPIs": "Daily reading streak. Start practice.",
    "4. Pages and navigation": "### Home `/`\n### Helper `/helper`\n### Session `/session`\n### Practice `/practice`",
    "5. UI/UX design": "Palette: education-calm. Learning companion chrome.",
  };
  assert.equal(leftoverPlanConflictsWithGoal(mixed), true);
  const { plan, changed } = hydrateMasterPlanDerivedSections(tmp, mixed);
  assert.equal(changed, true);
  assert.match(String(plan["1. Goal of the app"]), /bike shop|Spoke/i);
  assert.equal(/Practice|Helper|CogniMicro|education-calm/i.test(String(plan["4. Pages and navigation"])), false);
  assert.match(String(plan["4. Pages and navigation"]), /`\/book`/);
  assert.match(String(plan["4. Pages and navigation"]), /`\/mechanic`/);
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("new brief clears leftover /practice and memory files");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-replace-ws-"));
  fs.mkdirSync(path.join(tmp, "app", "practice"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "app", "session"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "app", "helper"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "nebulla-ide"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "nebula-project"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app/page.tsx"), "export default function Home(){return <main>Practice</main>}\n");
  fs.writeFileSync(path.join(tmp, "app/practice/page.tsx"), "export default function Practice(){return null}\n");
  fs.writeFileSync(path.join(tmp, "app/session/page.tsx"), "export default function Session(){return null}\n");
  fs.writeFileSync(path.join(tmp, "app/helper/page.tsx"), "export default function Helper(){return null}\n");
  fs.writeFileSync(
    path.join(tmp, "app/layout.tsx"),
    `export default function RootLayout({ children }) {
  return (
    <html><body>
      <nav>
        <a href="/">Home</a>
        <a href="/helper">Helper</a>
        <a href="/session">Session</a>
        <a href="/practice">Practice</a>
      </nav>
      {children}
    </body></html>
  );
}
`,
  );
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/master-plan.json"),
    JSON.stringify({
      "1. Goal of the app": QUILL,
      "4. Pages and navigation": "### Practice `/practice`\n### Session `/session`\n### Helper `/helper`",
      "5. UI/UX design": "education-calm",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "nebula-project/fast-prototype-memory.md"),
    "# Goal\nQuill Path learning companion\n",
    "utf8",
  );
  const result = applyNewProductBriefToWorkspace({
    workspaceRoot: tmp,
    masterPlanPath: path.join(tmp, "nebulla-ide/master-plan.json"),
    incomingGoal: SPOKE,
  });
  assert.ok(result.removedRoutes.some((p) => /practice/.test(p)));
  assert.equal(fs.existsSync(path.join(tmp, "app/practice/page.tsx")), false);
  assert.equal(fs.existsSync(path.join(tmp, "app/session/page.tsx")), false);
  const plan = JSON.parse(fs.readFileSync(path.join(tmp, "nebulla-ide/master-plan.json"), "utf8"));
  assert.match(String(plan["1. Goal of the app"]), /Spoke|bike/i);
  assert.equal(String(plan["4. Pages and navigation"] || "").trim(), "");
  assert.equal(fs.existsSync(path.join(tmp, "nebula-project/fast-prototype-memory.md")), false);
  const layout = fs.readFileSync(path.join(tmp, "app/layout.tsx"), "utf8");
  assert.equal(/\/practice/i.test(layout), false);
  assert.match(layout, /\/book|Book/);
  assert.equal(/Practice/.test(layout), false);
  pruneAppRoutesNotInSection4({
    workspaceRoot: tmp,
    section4: "### Home `/`\n### Book `/book`\n### Mechanic `/mechanic`",
    goal: SPOKE,
  });
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("New Project wipes breads.json; Motodrop request is not a stub");
{
  const moto =
    "**Product name:** Motodrop\nMoto delivery — pickup, dropoff, accept request.";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-wipe-moto-"));
  fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "lib"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "nebulla-ide"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "nebula-project"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "data/breads.json"), "{\"loaves\":[]}\n");
  fs.writeFileSync(path.join(tmp, "lib/bikeStore.ts"), "export const bikes = [];\n");
  fs.writeFileSync(path.join(tmp, "lib/lessonStore.ts"), "export const lessons = [];\n");
  fs.writeFileSync(path.join(tmp, "nebula-project/project-execution-rules.md"), "# keep\n");
  applyNewProductBriefToWorkspace({
    workspaceRoot: tmp,
    masterPlanPath: path.join(tmp, "nebulla-ide/master-plan.json"),
    incomingGoal: moto,
  });
  assert.equal(fs.existsSync(path.join(tmp, "data/breads.json")), false);
  assert.equal(fs.existsSync(path.join(tmp, "lib/bikeStore.ts")), false);
  assert.equal(fs.existsSync(path.join(tmp, "nebula-project/project-execution-rules.md")), true);
  const identity = JSON.parse(fs.readFileSync(path.join(tmp, "nebulla-ide/product-identity.json"), "utf8"));
  assert.equal(identity.projectName, "Motodrop");
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("AIChat + persist replace leftover plan instead of skip-Grok merge");
{
  const chat = fs.readFileSync(path.join(REPO, "src/components/ide/AIChat.tsx"), "utf8");
  const persist = fs.readFileSync(path.join(REPO, "src/lib/grokChatArtifacts.ts"), "utf8");
  const server = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  assert.match(chat, /replace-product-brief/);
  assert.match(chat, /isReplacementProductBrief/);
  assert.match(chat, /previous plan and leftover routes cleared/);
  assert.match(persist, /\/api\/master-plan\/replace/);
  assert.match(server, /app.post\("\/api\/master-plan\/replace"/);
  assert.match(server, /app.post\("\/api\/ide\/replace-product-brief"/);
}

console.log("\nAll product-goal replace checks passed.");
