/**
 * Engineer interview → job-brief → plan loop → post-apply API ask.
 * Run: npx tsx scripts/test-engineer-interview.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildJobBriefMarkdown,
  buildPostApplyApiAsk,
  ENGINEER_INTERVIEW_PROMPT,
  inferApiNeeds,
  jobBriefFitsRoutes,
  looksLikeVendorSdkPath,
  userNamedVendor,
  userNoteHasVendorKey,
  writeJobBriefFromPlan,
  JOB_BRIEF_REL,
} from "../lib/engineerInterview.ts";
import { applyProductPalettePass } from "../lib/productPalettePass.ts";
import { seedPagesFromGoal } from "../lib/nebulaUiBrief.ts";
import { shouldSkipUnsolicitedBaaSFile } from "../lib/mvpStackContract.ts";
import { buildFastPrototypeBootstrap } from "../src/lib/ideChatBootstrap.ts";
import { FOUNDATION_MIN_UI_CHECKLIST } from "../lib/codingSkeleton.ts";
import { buildCompactGoCodeUserPrompt } from "../lib/goSliceContract.ts";

assert.match(ENGINEER_INTERVIEW_PROMPT, /ENGINEER INTERVIEW/);
assert.match(ENGINEER_INTERVIEW_PROMPT, /job-brief/);
assert.match(ENGINEER_INTERVIEW_PROMPT, /Do not ask for API keys before/);

const boot = buildFastPrototypeBootstrap("Motodrop moto delivery pickup dropoff", "Web App");
assert.match(boot, /ENGINEER INTERVIEW/);
assert.match(boot, /job-brief\.md/);

assert.match(FOUNDATION_MIN_UI_CHECKLIST, /Foundation\+Primary/);
assert.match(
  buildCompactGoCodeUserPrompt({
    sliceLine: "SLICE: Foundation",
    goal: "Motodrop moto delivery",
    pagesSection: "### Request `/request`",
    constraints: "",
    uiBriefPageList: "- Request",
    sessionFocus: "Foundation",
  }),
  /ENGINEER INTERVIEW/,
);

const motoGoal = "**Product name:** Motodrop\nMoto delivery: pickup, dropoff, accept, track, pay.";
const motoPages = seedPagesFromGoal(motoGoal);
assert.ok(motoPages.some((p) => p.route === "/request"));
assert.ok(motoPages.some((p) => p.route === "/track"));
assert.ok(motoPages.some((p) => p.route === "/driver"));
assert.ok(motoPages.some((p) => p.route === "/account"));
assert.equal(motoPages.some((p) => p.route === "/pay" || p.route === "/wallet"), false);
assert.equal(motoPages.some((p) => /practice|catalog/i.test(p.route)), false);

const shopPages = seedPagesFromGoal("Spoke & Co neighborhood bike shop book a slot");
assert.ok(shopPages.some((p) => p.route === "/book"));
assert.equal(shopPages.some((p) => p.route === "/request"), false);

const catalogPages = seedPagesFromGoal("Neighborhood store catalog checkout");
assert.ok(catalogPages.some((p) => p.route === "/catalog"));
assert.equal(catalogPages.some((p) => p.route === "/request"), false);

const motoBrief = buildJobBriefMarkdown({
  goal: motoGoal,
  pages: "### Request `/request`\n### Track `/track`\n### Driver `/driver`\n### Account `/account`",
});
assert.match(motoBrief, /request → accept → track/i);
assert.equal(jobBriefFitsRoutes(motoBrief, ["/", "/request", "/track", "/driver", "/account"]), true);
assert.equal(jobBriefFitsRoutes(motoBrief, ["/", "/practice"]), false);

const shopBrief = buildJobBriefMarkdown({
  goal: "Spoke & Co neighborhood bike shop",
  pages: "### Book `/book`",
});
assert.match(shopBrief, /browse → book/i);
assert.equal(jobBriefFitsRoutes(shopBrief, ["/", "/book", "/mechanic"]), true);

const ask = buildPostApplyApiAsk({ goal: motoGoal });
assert.match(ask, /Paste keys or say keep mock/);
assert.match(ask, /Maps|Payments|Push/);
assert.equal(/Continue/i.test(ask), false);
assert.ok(inferApiNeeds(motoGoal).includes("maps"));

assert.equal(userNoteHasVendorKey("sk_test_abc"), true);
assert.equal(userNamedVendor("please use Stripe"), true);
assert.equal(looksLikeVendorSdkPath("lib/stripe.ts"), true);
assert.equal(
  shouldSkipUnsolicitedBaaSFile("lib/stripe.ts", "import Stripe from 'stripe'", motoGoal),
  true,
);
assert.equal(
  shouldSkipUnsolicitedBaaSFile("lib/stripe.ts", "import Stripe from 'stripe'", "use Stripe pk_test_x"),
  false,
);

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-job-brief-"));
  fs.mkdirSync(path.join(tmp, "app", "request"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app/page.tsx"), "export default function Home(){return <main>Continue</main>;}\n");
  fs.writeFileSync(
    path.join(tmp, "app/request/page.tsx"),
    "export default function R(){return <main>Continue</main>;}\n",
  );
  fs.mkdirSync(path.join(tmp, "nebulla-ide"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/master-plan.json"),
    JSON.stringify({
      "1. Goal of the app": motoGoal,
      "4. Pages and navigation": "### Home `/`\n### Request `/request`\n### Track `/track`\n### Driver `/driver`\n### Account `/account`",
    }),
    "utf8",
  );
  applyProductPalettePass({
    workspaceRoot: tmp,
    goal: motoGoal,
    masterPlanPath: path.join(tmp, "nebulla-ide/master-plan.json"),
  });
  const brief = fs.readFileSync(path.join(tmp, JOB_BRIEF_REL), "utf8");
  assert.match(brief, /Motodrop|delivery|request/i);
  assert.equal(/baker|practice lesson/i.test(brief), false);
  assert.equal(fs.existsSync(path.join(tmp, "app/request/page.tsx")), true);
  assert.equal(fs.existsSync(path.join(tmp, "app/track/page.tsx")), true);
  assert.equal(fs.existsSync(path.join(tmp, "app/driver/page.tsx")), true);
  assert.equal(fs.existsSync(path.join(tmp, "app/account/page.tsx")), true);
  assert.equal(fs.existsSync(path.join(tmp, "app/pay/page.tsx")), false);
  assert.equal(fs.existsSync(path.join(tmp, "app/wallet/page.tsx")), false);
  const request = fs.readFileSync(path.join(tmp, "app/request/page.tsx"), "utf8");
  assert.match(request, /pickup/);
  assert.match(request, /Pay|Quote|card/i);
  assert.equal(/breads\.json|Start practice/i.test(request), false);
  const home = fs.readFileSync(path.join(tmp, "app/page.tsx"), "utf8");
  assert.match(home, /Open requests|listItems/);
  assert.equal(writeJobBriefFromPlan(tmp, { "1. Goal of the app": motoGoal }).rel, JOB_BRIEF_REL);
  fs.rmSync(tmp, { recursive: true, force: true });
}

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-shop-catalog-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app/page.tsx"), "export default function Home(){return <main>Continue</main>;}\n");
  fs.mkdirSync(path.join(tmp, "nebulla-ide"), { recursive: true });
  const shopGoal = "Neighborhood store — browse catalog and book.";
  fs.writeFileSync(
    path.join(tmp, "nebulla-ide/master-plan.json"),
    JSON.stringify({
      "1. Goal of the app": shopGoal,
      "4. Pages and navigation": "### Home `/`\n### Catalog `/catalog`\n### Book `/book`",
    }),
    "utf8",
  );
  applyProductPalettePass({
    workspaceRoot: tmp,
    goal: shopGoal,
    masterPlanPath: path.join(tmp, "nebulla-ide/master-plan.json"),
  });
  const home = fs.readFileSync(path.join(tmp, "app/page.tsx"), "utf8");
  assert.match(home, /Catalog|Book|catalog/i);
  assert.equal(/Open requests|Start practice/i.test(home), false);
  assert.equal(fs.existsSync(path.join(tmp, "app/catalog/page.tsx")), true);
  assert.match(fs.readFileSync(path.join(tmp, "app/catalog/page.tsx"), "utf8"), /Catalog|Book/);
  fs.rmSync(tmp, { recursive: true, force: true });
}

{
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const chat = fs.readFileSync(path.join(root, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /buildPostApplyApiAsk/);
  assert.match(chat, /pushReadyAndApiAsk/);
  assert.equal(/Continue — launching/.test(chat), false);
  const prompt = fs.readFileSync(path.join(root, "src/lib/nebulaAssistantSystemPrompt.ts"), "utf8");
  assert.match(prompt, /ENGINEER_INTERVIEW_PROMPT/);
}

console.log("✓ engineer interview + job-brief + API ask");
