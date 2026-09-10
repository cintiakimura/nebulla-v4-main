/**
 * Coding skeleton contract — classify, persist on plan, clamp extra pages.
 * Run: npx tsx scripts/test-coding-skeleton.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyCodingSkeleton,
  ensureCodingSkeletonOnPlan,
  filterBlocksOutsideCodingSkeleton,
  formatCodingSkeletonForGo,
  isCodingSkeletonReady,
  mergeCodingSkeletonOntoPlan,
  parseCodingSkeleton,
  primaryVerbFromSkeleton,
  readCodingSkeletonFromPlan,
  shouldSkipApplyPathForSkeleton,
  skeletonFitsCurrentGoal,
} from "../lib/codingSkeleton.ts";
import { CODING_SKELETON_KEY, PRE_CODING_SUMMARY_KEY } from "../lib/masterPlanSections.ts";

const GOLDEN =
  "A mobile education app for kids to practice reading; teachers track progress.";

{
  const kids = classifyCodingSkeleton(GOLDEN);
  assert.equal(kids.skeleton, "mobile_home");
  assert.equal(kids.auth, "mock");
  assert.ok(kids.roles.includes("kid"));
  assert.ok(kids.roles.includes("teacher"));
  assert.ok(kids.verbs.includes("practice"));
  assert.equal(primaryVerbFromSkeleton(kids), "practice");
  assert.ok(kids.routes.some((r) => r.path === "/"));
  assert.ok(kids.routes.some((r) => r.path === "/practice"));
  assert.ok(kids.routes.some((r) => r.path === "/teacher" || r.path === "/progress"));
  assert.equal(
    kids.routes.some((r) => r.path === "/dashboard"),
    false,
    "kids Home is not /dashboard",
  );
  assert.ok(kids.out_of_scope.includes("supabase"));
  assert.match(formatCodingSkeletonForGo(kids), /MUST NOT: \/dashboard/);
  assert.match(formatCodingSkeletonForGo(kids), /FOUNDATION MIN UI/);
  assert.match(formatCodingSkeletonForGo(kids), /1\. Header:/);
  assert.match(formatCodingSkeletonForGo(kids), /5\. Action screen/);
  assert.ok(kids.routes.some((r) => r.path === "/teacher" || r.path === "/progress"));
  assert.equal(isCodingSkeletonReady(kids), true);
}

{
  const saas = classifyCodingSkeleton("SaaS analytics admin for internal metrics");
  assert.equal(saas.skeleton, "web_dashboard");
  assert.ok(saas.routes.some((r) => r.path === "/dashboard"));
  assert.ok(saas.routes.some((r) => r.path === "/settings"));
}

{
  const landing = classifyCodingSkeleton("Photography one-pager portfolio landing page");
  assert.equal(landing.skeleton, "landing");
  assert.equal(landing.auth, "none");
  assert.equal(
    landing.routes.some((r) => r.path === "/dashboard"),
    false,
  );
}

{
  const emptyResearch = classifyCodingSkeleton(GOLDEN, "Mobile App", {
    "1. Goal of the app": GOLDEN,
    "2. Tech and Research": "",
  });
  assert.equal(emptyResearch.skeleton, "mobile_home");
  assert.equal(isCodingSkeletonReady(emptyResearch), true);
}

{
  const kids = classifyCodingSkeleton(GOLDEN);
  const plan = mergeCodingSkeletonOntoPlan({}, kids);
  assert.ok(String(plan[CODING_SKELETON_KEY] || "").includes("mobile_home"));
  const round = readCodingSkeletonFromPlan(plan);
  assert.ok(round);
  assert.equal(round?.skeleton, "mobile_home");
  const parsed = parseCodingSkeleton(plan[CODING_SKELETON_KEY]);
  assert.equal(parsed?.auth, "mock");
  assert.match(String(plan["4. Pages and navigation"] || ""), /\/practice/);
  assert.match(String(plan[PRE_CODING_SUMMARY_KEY] || ""), /CODING_SKELETON:/);
}

{
  const kids = classifyCodingSkeleton(GOLDEN);
  assert.equal(shouldSkipApplyPathForSkeleton("app/layout.tsx", kids), false);
  assert.equal(shouldSkipApplyPathForSkeleton("app/page.tsx", kids), false);
  assert.equal(shouldSkipApplyPathForSkeleton("app/practice/page.tsx", kids), false);
  assert.equal(shouldSkipApplyPathForSkeleton("app/settings/page.tsx", kids), true);
  assert.equal(shouldSkipApplyPathForSkeleton("app/analytics/page.tsx", kids), true);
  assert.equal(shouldSkipApplyPathForSkeleton("app/dashboard/page.tsx", kids), true);
  const saas = classifyCodingSkeleton("SaaS analytics admin dashboard");
  assert.equal(shouldSkipApplyPathForSkeleton("app/dashboard/page.tsx", saas), false);
  assert.equal(shouldSkipApplyPathForSkeleton("app/settings/page.tsx", saas), false);
  const { skipped } = filterBlocksOutsideCodingSkeleton(
    [
      { relativePath: "app/page.tsx" },
      { relativePath: "app/settings/page.tsx" },
      { relativePath: "lib/store.ts" },
    ],
    kids,
  );
  assert.deepEqual(skipped, ["app/settings/page.tsx"]);
}

{
  const ensured = ensureCodingSkeletonOnPlan({
    "1. Goal of the app": GOLDEN,
  });
  assert.equal(ensured.skeleton.skeleton, "mobile_home");
  assert.ok(String(ensured.plan[CODING_SKELETON_KEY] || "").length > 20);
}

{
  const bakery =
    "A web app for a neighborhood bakery. Customers browse today’s breads and place a pickup order. The baker sees the list of orders and marks them ready.";
  const shop = classifyCodingSkeleton(bakery, "Web App");
  assert.equal(shop.skeleton, "marketplace");
  assert.ok(shop.routes.some((r) => r.path === "/order"));
  assert.ok(shop.routes.some((r) => r.path === "/baker"));
  assert.equal(isCodingSkeletonReady(shop), true);
  const kids = classifyCodingSkeleton(GOLDEN);
  assert.equal(skeletonFitsCurrentGoal(kids, bakery), false);
  const reused = ensureCodingSkeletonOnPlan(
    mergeCodingSkeletonOntoPlan({ "1. Goal of the app": bakery }, kids),
    { goal: bakery },
  );
  assert.equal(reused.skeleton.skeleton, "marketplace");
}

{
  const motoGoal = "**Product name:** Motodrop\nMoto delivery: pickup and dropoff, accept request.";
  const moto = classifyCodingSkeleton(motoGoal, "Web App");
  assert.equal(moto.skeleton, "marketplace");
  assert.ok(moto.routes.some((r) => r.path === "/request"));
  assert.ok(moto.entities.some((e) => e.name === "Request"));
  const bakerySkel = classifyCodingSkeleton(
    "A web app for a neighborhood bakery. Customers browse today’s breads and place a pickup order.",
    "Web App",
  );
  assert.equal(skeletonFitsCurrentGoal(bakerySkel, motoGoal), false);
}

{
  const root = path.dirname(fileURLToPath(import.meta.url));
  const repo = path.join(root, "..");
  assert.equal(fs.existsSync(path.join(repo, "nebula-project", "coding-skeleton.json")), false);
  const server = fs.readFileSync(path.join(repo, "server.ts"), "utf8");
  assert.match(server, /codingSkeletonOk/);
  assert.match(server, /ensureCodingSkeletonOnPlan/);
  assert.match(server, /filterBlocksOutsideCodingSkeleton/);
  assert.equal(/bypass RESEARCH_INCOMPLETE/.test(server), false);
  const chat = fs.readFileSync(path.join(repo, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /codingSkeletonAllowsFoundation/);
  const pipeline = fs.readFileSync(path.join(repo, "src/lib/nebulaGrokCodingPipeline.ts"), "utf8");
  assert.match(pipeline, /blockGoIfResearchIncomplete/);
  const exec = fs.readFileSync(path.join(repo, "nebula-project/project-execution-rules.md"), "utf8");
  assert.match(exec, /Coding skeleton/);
}

console.log("✓ coding skeleton contract passed");
