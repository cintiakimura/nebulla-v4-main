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
  isNewProductSeedAgainstCurrent,
  isReplacementProductBrief,
  leftoverPlanConflictsWithGoal,
  leftoverRoutesConflictWithGoal,
  looksLikeStandaloneProductBrief,
  isBillsWorkflowGoal,
  isCuePlannerGoal,
  isRepeatedChipAsProductGoal,
} from "../lib/productGoalFingerprint.ts";
import {
  applyNewProductBriefToWorkspace,
  pruneAppRoutesNotInSection4,
} from "../lib/replaceProductWorkspace.ts";
import {
  inferFirstSliceRoutes,
  pagesForPlanFromGoalAndDisk,
  productRoutesMatchGoal,
  seedPagesFromGoal,
} from "../lib/nebulaUiBrief.ts";
import { hydrateMasterPlanDerivedSections } from "../lib/nebulaIdeWorkspaceArtifacts.ts";
import {
  extractNamedBrand,
  extractStatedProductName,
  identityFitsGoal,
  inferProductName,
  singleProductName,
} from "../lib/productIdentity.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

const SPOKE =
  "Spoke & Co neighborhood bike shop — ready bikes on the floor, book a pickup or mechanic slot.";
const QUILL =
  "**Product name:** Quill Path\nLearning companion for daily reading. Helper, Session, and Practice. CogniMicro. Palette: education-calm.";

section("Taskwise vs Quill Path / City Courier is a new seed");
{
  assert.equal(extractStatedProductName("Taskwise"), "Taskwise");
  assert.equal(singleProductName("Quill Path Taskwise"), "Taskwise");
  assert.equal(extractNamedBrand("Quill Path Taskwise"), "Taskwise");
  assert.equal(inferProductName("Quill Path Taskwise"), "Taskwise");
  assert.equal(inferProductName("Taskwise"), "Taskwise");
  assert.equal(isNewProductSeedAgainstCurrent({ userText: "Taskwise", chipName: "Quill Path" }), true);
  assert.equal(isNewProductSeedAgainstCurrent({ userText: "Taskwise", chipName: "City Courier" }), true);
  assert.equal(isNewProductSeedAgainstCurrent({ userText: "Taskwise", chipName: "Taskwise" }), false);
  assert.equal(isNewProductSeedAgainstCurrent({ userText: "hello", chipName: "Quill Path" }), false);
  assert.equal(isReplacementProductBrief("Taskwise", QUILL), true);
  assert.equal(looksLikeStandaloneProductBrief("Taskwise"), true);
  const taskPages = seedPagesFromGoal("Taskwise — capture input, summary, tasks, dossier");
  assert.deepEqual(
    taskPages.map((p) => p.route),
    ["/", "/input", "/summary", "/tasks", "/dossier"],
  );
  assert.equal(leftoverRoutesConflictWithGoal("Taskwise", ["/", "/practice", "/teacher"]), true);
}

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
  assert.match(chat, /isNewProductSeedAgainstCurrent/);
  assert.match(chat, /createProjectForCurrentSession/);
  assert.match(chat, /isolateNewProduct/);
  assert.match(chat, /switchedProductWorkspace/);
  assert.match(chat, /!stayInBrainstormLoop/);
  assert.match(chat, /not reusing the previous workspace or Master Plan/);
  assert.match(chat, /previous plan and leftover routes cleared/);
  assert.match(chat, /productRoutesMatchGoal/);
  assert.match(chat, /brainstorm-enough-close/);
  assert.match(chat, /Live is not ready/);
  assert.match(persist, /Never ask them to return to Quill Path/);
  assert.match(persist, /\/api\/master-plan\/replace/);
  assert.match(server, /app.post\("\/api\/master-plan\/replace"/);
  assert.match(server, /app.post\("\/api\/ide\/replace-product-brief"/);
}

section("bakery workspace + new courier goal drops Grain / Crumb");
{
  const courier = "city moto parcel courier (Uber loop, package not passenger)";
  assert.equal(looksLikeStandaloneProductBrief(courier), true);
  assert.equal(isReplacementProductBrief(courier, "Grain Bakery neighborhood breads and pickup"), true);
  assert.equal(identityFitsGoal("Grain Bakery", courier), false);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-bakery-to-courier-"));
  fs.mkdirSync(path.join(tmp, "app", "wallet"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "nebulla-ide"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "nebula-project"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/product-identity.json"),
    JSON.stringify({ projectName: "Grain Bakery", logoInitials: "GB", userSet: true }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "app/layout.tsx"),
    `export default function RootLayout({ children }) {
  return (<html><body><header><strong>Crumb Market</strong></header><nav><a href="/wallet">Wallet</a></nav>{children}</body></html>);
}
`,
  );
  fs.writeFileSync(
    path.join(tmp, "app/wallet/page.tsx"),
    "export default function Wallet(){return <main>dummy list items</main>}\n",
  );
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/master-plan.json"),
    JSON.stringify({
      "1. Goal of the app": "**Product name:** Grain Bakery\nNeighborhood breads.",
      "4. Pages and navigation": "### Wallet `/wallet`",
    }),
    "utf8",
  );
  const result = applyNewProductBriefToWorkspace({
    workspaceRoot: tmp,
    masterPlanPath: path.join(tmp, "nebulla-ide/master-plan.json"),
    incomingGoal: courier,
  });
  assert.equal(/grain bakery|crumb market/i.test(result.projectName), false);
  const identity = JSON.parse(fs.readFileSync(path.join(tmp, "nebulla-ide/product-identity.json"), "utf8"));
  assert.equal(/grain bakery|crumb market/i.test(identity.projectName), false);
  const brief = fs.readFileSync(path.join(tmp, "nebula-project/job-brief.md"), "utf8");
  assert.equal(/grain bakery|crumb market/i.test(brief), false);
  assert.match(brief, /courier|parcel|moto|request/i);
  const layout = fs.readFileSync(path.join(tmp, "app/layout.tsx"), "utf8");
  assert.equal(/Crumb Market|Grain Bakery/i.test(layout), false);
  assert.equal(/\/wallet/i.test(layout), false);
  assert.equal(fs.existsSync(path.join(tmp, "app/wallet/page.tsx")), false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

section("bills seed is a new product — leftover dossiers cannot apply");
{
  const bills =
    "Household bills — month list, attach receipts, running totals. Not a dossier product.";
  assert.equal(isBillsWorkflowGoal(bills), true);
  assert.equal(isBillsWorkflowGoal("MyDossier keep scans in per-client dossiers"), false);
  assert.equal(looksLikeStandaloneProductBrief(bills), true);
  assert.equal(isReplacementProductBrief(bills, "Helio Hub document dossiers and forms"), true);
  assert.equal(isReplacementProductBrief(bills, "Aether Studio MyDossier forms dashboard"), true);
  assert.equal(
    isNewProductSeedAgainstCurrent({
      userText: bills,
      chipName: "Helio Hub",
      diskGoal: "MyDossier keep family documents. Dossiers / Forms / Dashboard.",
    }),
    true,
  );
  assert.equal(isRepeatedChipAsProductGoal("Helio Hub", "Helio Hub"), true);
  assert.equal(isNewProductSeedAgainstCurrent({ userText: "Helio Hub", chipName: "Helio Hub" }), false);
  const seeded = seedPagesFromGoal(bills);
  assert.deepEqual(
    seeded.map((p) => p.route),
    ["/bills", "/month", "/receipts", "/totals"],
  );
  assert.equal(seeded.some((p) => p.route === "/dossiers"), false);
  assert.equal(leftoverRoutesConflictWithGoal(bills, ["/", "/dossiers", "/forms", "/dashboard"]), true);
  const leftoverPlan = {
    "1. Goal of the app": bills,
    "4. Pages and navigation": "### Dossiers `/dossiers`\n### Forms `/forms`\n### Dashboard `/dashboard`",
  };
  assert.equal(leftoverPlanConflictsWithGoal(leftoverPlan), true);
  const first = inferFirstSliceRoutes(bills, leftoverPlan["4. Pages and navigation"]);
  assert.equal(first.some((p) => p.route === "/dossiers" || p.route === "/forms"), false);
  assert.ok(first.some((p) => p.route === "/bills" || p.route === "/month"));
  assert.ok(first.some((p) => p.route === "/receipts" || p.route === "/totals"));
  assert.equal(productRoutesMatchGoal(bills, ["/", "/dossiers", "/forms"]), false);
  assert.equal(productRoutesMatchGoal(bills, ["/", "/month", "/receipts", "/totals"]), true);
  assert.equal(productRoutesMatchGoal(bills, ["/"]), false);
  const fromDisk = pagesForPlanFromGoalAndDisk(bills, ["/", "/dossiers", "/forms", "/dashboard"]);
  assert.equal(fromDisk.some((p) => p.route === "/dossiers"), false);
  assert.ok(fromDisk.some((p) => p.route === "/bills" || p.route === "/month"));
}

section("Nest Path / Llama Life is not Taskwise dossiers");
{
  const nest =
    "Nest Path — calm personal daily planner inspired by Llama Life. One person. Built-in positive tones cue water and exercise all day.";
  assert.equal(extractNamedBrand(nest), "Nest Path");
  assert.equal(isCuePlannerGoal(nest), true);
  assert.equal(isCuePlannerGoal("Taskwise — capture input, summary, tasks, dossier"), false);
  const seeded = seedPagesFromGoal(nest);
  assert.deepEqual(
    seeded.map((p) => p.route),
    ["/", "/water", "/exercise", "/tones"],
  );
  assert.equal(seeded.some((p) => /dossier|input|summary|tasks/.test(p.route)), false);
  assert.equal(
    leftoverRoutesConflictWithGoal(nest, ["/", "/input", "/summary", "/tasks", "/dossier", "/dossiers"]),
    true,
  );
  const first = inferFirstSliceRoutes(
    nest,
    "### Dossiers `/dossiers`\n### Input `/input`\n### Tasks `/tasks`",
  );
  assert.equal(first.some((p) => /dossier|input|summary|tasks/.test(p.route)), false);
  assert.ok(first.some((p) => p.route === "/water" || p.route === "/exercise"));
  assert.equal(productRoutesMatchGoal(nest, ["/", "/input", "/tasks", "/dossier"]), false);
  assert.equal(productRoutesMatchGoal(nest, ["/", "/water", "/exercise", "/tones"]), true);
  assert.equal(isNewProductSeedAgainstCurrent({ userText: nest, chipName: "Harbor Focus" }), true);
  assert.equal(isReplacementProductBrief(nest, "Taskwise capture input summary tasks dossier"), true);
}

section("new courier project never invents Grain Bakery");
{
  const name = inferProductName("city moto parcel courier package not passenger");
  assert.equal(/grain bakery|crumb market/i.test(name), false);
}

console.log("\nAll product-goal replace checks passed.");
