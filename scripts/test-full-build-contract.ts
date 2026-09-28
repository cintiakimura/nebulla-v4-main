/**
 * Full Build contract — complete Plan then one thick Go of every §4 route.
 * Run: npx tsx scripts/test-full-build-contract.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessFullBuildCompleteness,
  detectQuickDraftIntent,
  formatFullBuildApplyLine,
  inferFullBuildRoutes,
  normalizeBuildMode,
  shouldClampToFastPrototypeSlice,
} from "../lib/fullBuildContract.ts";
import { ensureCodingSkeletonOnPlan } from "../lib/codingSkeleton.ts";
import { inferFirstSliceRoutes } from "../lib/nebulaUiBrief.ts";
import { buildCompactGoCodeUserPrompt, buildLocalPreCodingSummary } from "../lib/goSliceContract.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIDS_GOAL =
  "A mobile education app for kids to practice reading; teachers track progress.";

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

section("mode defaults and quick-draft detect");
{
  assert.equal(normalizeBuildMode(undefined), "full_build");
  assert.equal(normalizeBuildMode("fast_prototype"), "fast_prototype");
  assert.equal(shouldClampToFastPrototypeSlice("full_build"), false);
  assert.equal(shouldClampToFastPrototypeSlice("fast_prototype"), true);
  assert.equal(detectQuickDraftIntent("fast prototype please"), true);
  assert.equal(detectQuickDraftIntent(KIDS_GOAL), false);
}

section("kids-reading §4 routes are not a single Home");
{
  const routes = inferFullBuildRoutes(KIDS_GOAL, "");
  const paths = routes.map((r) => r.route);
  assert.ok(paths.includes("/"), paths.join(","));
  assert.ok(paths.includes("/practice"), paths.join(","));
  assert.ok(paths.includes("/teacher"), paths.join(","));
  assert.ok(paths.includes("/login"), paths.join(","));
  const apply = formatFullBuildApplyLine(routes);
  assert.match(apply, /FULL BUILD APPLY/);
  assert.match(apply, /\/practice/);
  assert.match(apply, /\/teacher/);
}

section("completeness fails when empty/error/loading and auth are missing");
{
  const thin = {
    "1. Goal of the app": KIDS_GOAL,
    "2. Tech and Research": "Mobile Next.js app. Inferred defaults; no live competitor search.",
    "3. Features and KPIs": "Practice reading daily. Teachers track progress. KPI: sessions completed per week.",
    "4. Pages and navigation": "Home `/`\nPractice `/practice`\nTeacher `/teacher`\nLogin `/login`",
    "5. UI/UX design": "Mood calm. Palette #1A365D #F6E05E. Typography rounded sans. Density comfortable.",
  };
  const r = assessFullBuildCompleteness({ plan: thin });
  assert.equal(r.allowGo, false);
  assert.ok(
    r.gaps.some((g) => /PAGE_STATES|AUTH|PAGE_FIELDS|SKELETON/.test(g.code)),
    r.gaps.map((g) => g.code).join(","),
  );
  assert.ok(r.ask && !/Foundation/i.test(r.ask) && !/\bcoding\b/i.test(r.ask));
}

section("completeness PASS with page contracts + auth + skeleton");
{
  const pages = `
### Home \`/\`
- purpose: kid starts the next reading practice
- roles: kid
- primary_actions: Start practice
- empty_state: No lesson yet
- error_state: Could not load lesson
- loading_state: Loading next story
### Practice \`/practice\`
- purpose: kid reads and answers
- roles: kid
- primary_actions: Complete step
- empty_state: assumption: wait for assigned story
- error_state: Try again
- loading_state: Loading
### Teacher \`/teacher\`
- purpose: teacher tracks progress
- roles: teacher
- primary_actions: Open class progress
- empty_state: No students yet
- error_state: Could not load class
- loading_state: Loading class
### Login \`/login\`
- purpose: teacher or parent signs in
- roles: teacher
- primary_actions: Sign in
- empty_state: Enter email
- error_state: Wrong code
- loading_state: Signing in
`;
  const raw = {
    "1. Goal of the app": KIDS_GOAL,
    "2. Tech and Research":
      "Mobile Next.js. Auth model: mock role switch (kid vs teacher). Local mock auth. No hosted BaaS.",
    "3. Features and KPIs": "Practice reading. Teachers track progress. KPI: 3 completed sessions / week.",
    "4. Pages and navigation": pages,
    "5. UI/UX design": "Mood calm. Palette #1A365D #F6E05E. Typography rounded sans. Density comfortable.",
  };
  const { plan } = ensureCodingSkeletonOnPlan(raw, { goal: KIDS_GOAL, projectType: "Mobile App" });
  const r = assessFullBuildCompleteness({ plan });
  assert.equal(r.allowGo, true, r.gaps.map((g) => `${g.code}: ${g.message}`).join(" | "));
  const paths = r.routes.map((x) => x.route);
  assert.ok(paths.includes("/practice"));
  assert.ok(paths.includes("/teacher"));
}

section("Go prompt lists every §4 route in full_build; Fast Prototype still clamps");
{
  const pages = "Home `/`\nPractice `/practice`\nTeacher `/teacher`\nLogin `/login`";
  const compactFull = buildCompactGoCodeUserPrompt({
    sliceLine: "SLICE: Foundation",
    goal: KIDS_GOAL,
    pagesSection: pages,
    constraints: "",
    uiBriefPageList: pages,
    sessionFocus: "Full Build",
    buildMode: "full_build",
  });
  assert.match(compactFull, /FULL BUILD APPLY/);
  assert.match(compactFull, /\/practice/);
  assert.match(compactFull, /\/teacher/);
  assert.match(compactFull, /\/login/);
  assert.match(compactFull, /every §4 route/);
  assert.doesNotMatch(compactFull, /Foundation AND Primary in this Go/);

  const compactFp = buildCompactGoCodeUserPrompt({
    sliceLine: "SLICE: Foundation",
    goal: KIDS_GOAL,
    pagesSection: pages,
    constraints: "",
    uiBriefPageList: pages,
    sessionFocus: "Foundation",
    buildMode: "fast_prototype",
  });
  assert.match(compactFp, /FIRST-SLICE APPLY/);
  const summaryFp = buildLocalPreCodingSummary({
    workspaceRoot: "/tmp",
    projectName: "Read",
    buildMode: "fast_prototype",
  });
  assert.match(summaryFp, /do not dump every §4 route/);
  const summaryFb = buildLocalPreCodingSummary({
    workspaceRoot: "/tmp",
    projectName: "Read",
    buildMode: "full_build",
  });
  assert.match(summaryFb, /every Master Plan §4 route/);

  const capped = inferFirstSliceRoutes(KIDS_GOAL, pages);
  assert.ok(capped.length <= 6);
}

section("Studio blocked during Go + Live wins + autopilot still false");
{
  const studio = fs.readFileSync(path.join(REPO, "src/components/ide/IdeUiStudioBeta.tsx"), "utf8");
  const toolbar = fs.readFileSync(
    path.join(REPO, "src/components/ide/shell/previewTools/PreviewEditToolbar.tsx"),
    "utf8",
  );
  const engine = fs.readFileSync(path.join(REPO, "src/lib/uiStudioBetaEngine.ts"), "utf8");
  const server = fs.readFileSync(path.join(REPO, "server.ts"), "utf8");
  const slice = fs.readFileSync(path.join(REPO, "src/lib/fastPrototypeNextSlice.ts"), "utf8");
  const canvas = fs.readFileSync(
    path.join(REPO, "src/components/ide/shell/previewTools/BuildPreviewCanvas.tsx"),
    "utf8",
  );
  assert.match(studio, /generateDisabled = busy \|\| grokCodingActive/);
  assert.match(toolbar, /codingBusy \|\| !onGenerateUi/);
  assert.match(engine, /options\.uiPhase !== 'post_code'/);
  assert.match(server, /FOUNDATION_GO_IN_FLIGHT/);
  assert.match(server, /fullBuildGoBlockedMessage/);
  assert.match(server, /coding: false/);
  assert.match(slice, /FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT = false/);
  assert.match(canvas, /if \(live && !userPickedDraftRef\.current\)/);
  assert.match(canvas, /setShowMockup\(false\)/);
}

console.log("\n✓ full-build contract tests passed\n");
