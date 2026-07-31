/**
 * Methodology pilots (fixtures + e2e gates) — stand-in for manual CRUD/auth / insecure / multi-page apps.
 * Run: npm run test:methodology-pilots
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessMasterPlanCompleteness,
  type MasterPlanStrictMode,
} from "../lib/masterPlanCompleteness.ts";
import {
  assessMindMapSubsetOfSection4,
  section4RoutesFromPlan,
} from "../lib/mindMapFidelity.ts";
import {
  buildMindMapGraphFromPageSpecs,
  mindMapPagesFromMasterPlan,
} from "../lib/nebulaIdeWorkspaceArtifacts.ts";
import {
  buildUiBriefMarkdown,
  parsePagesFromUiBrief,
  writeUiBriefMarkdown,
} from "../lib/nebulaUiBrief.ts";
import {
  summarizeMasterPlanStatus,
  formatGoBlockedByPlanMessage,
} from "../src/lib/masterPlanStatus.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../nebula-project/fixtures/master-plan");

function load(name: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8")) as Record<
    string,
    string
  >;
}

function section(name: string) {
  console.log(`\n✓ Pilot: ${name}`);
}

function assess(plan: Record<string, string>, mode: MasterPlanStrictMode, checkUiBrief = false) {
  return assessMasterPlanCompleteness({ plan, mode, checkUiBrief });
}

// --- Pilot 1: good CRUD + auth (multi-page complete plan) ---
section("good-crud-auth — multi-page complete plan");
{
  const plan = load("good-crud-auth.json");
  for (const mode of ["off", "warn", "strict"] as MasterPlanStrictMode[]) {
    const r = assess(plan, mode);
    assert.equal(r.allowGo, true, `allowGo false in ${mode}`);
    assert.ok(r.gaps.filter((g) => g.severity === "block").length === 0);
  }
  const routes = section4RoutesFromPlan(plan);
  assert.ok(routes.length >= 5, `expected multi-page (≥5), got ${routes.length}`);
  const specs = mindMapPagesFromMasterPlan(plan, "PilotCRUD");
  const graph = buildMindMapGraphFromPageSpecs(specs, "PilotCRUD");
  const fidelity = assessMindMapSubsetOfSection4({
    plan,
    mindMapPages: graph.pages,
    mode: "strict",
  });
  assert.equal(fidelity.extraRoutes.length, 0);
  assert.equal(fidelity.allowWrite, true);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-pilot-"));
  writeUiBriefMarkdown(tmp, plan);
  const brief = buildUiBriefMarkdown(plan);
  const pages = parsePagesFromUiBrief(brief);
  assert.ok(pages.length >= 5);
  assert.ok(pages.every((p) => p.route.startsWith("/")));

  const withBrief = assessMasterPlanCompleteness({
    plan,
    mode: "strict",
    workspaceRoot: tmp,
    checkUiBrief: true,
  });
  assert.equal(withBrief.allowGo, true);

  const banner = summarizeMasterPlanStatus({
    mode: "warn",
    ok: true,
    allowGo: true,
    shape: "complete",
    gaps: [],
  });
  assert.equal(banner.tone, "ok");
}

// --- Pilot 2: thin legacy (should warn, block only in strict) ---
section("thin-legacy — warn allows Go; strict blocks");
{
  const plan = load("thin-legacy.json");
  assert.equal(assess(plan, "warn").allowGo, true);
  assert.equal(assess(plan, "strict").allowGo, false);
  const banner = summarizeMasterPlanStatus({
    ...assess(plan, "strict"),
  });
  assert.ok(banner.tone === "block" || banner.tone === "warn");
  const msg = formatGoBlockedByPlanMessage({
    masterPlanCompleteness: assess(plan, "strict"),
  });
  assert.ok(!msg.includes("PAGES_EMPTY"), "user message must not dump gap codes");
  assert.match(msg, /paused|planning|Master Plan/i);
}

// --- Pilot 3: naïve insecure (security gaps) ---
section("naive-insecure — security baseline gaps; strict blocks");
{
  const plan = load("naive-insecure.json");
  const warn = assess(plan, "warn");
  assert.equal(warn.allowGo, true);
  assert.ok(warn.gaps.some((g) => g.code.startsWith("SEC_")));
  const strict = assess(plan, "strict");
  assert.equal(strict.allowGo, false);
  assert.ok(strict.gaps.some((g) => g.severity === "block" && g.code.startsWith("SEC_")));
}

// --- Pilot 4: multi-page digit/underscore routes (regression) ---
section("multi-page /2fa /_secret fidelity");
{
  const plan = {
    "4. Pages and navigation": [
      "### Home `/`",
      "### Two-factor `/2fa`",
      "### Secret `/_secret`",
      "### Dashboard `/app/dashboard`",
    ].join("\n"),
  };
  const routes = section4RoutesFromPlan(plan);
  assert.ok(routes.includes("/2fa"));
  assert.ok(routes.includes("/_secret"));
  const fidelity = assessMindMapSubsetOfSection4({
    plan,
    mindMapPages: [
      { data: { label: "2FA", description: "Route: /2fa" } },
      { data: { label: "Secret", description: "Route: /_secret" } },
      { data: { label: "Dash", description: "Route: /app/dashboard" } },
    ],
    mode: "strict",
  });
  assert.equal(fidelity.extraRoutes.length, 0, fidelity.extraRoutes.join(","));
}

console.log("\nAll methodology pilots passed.\n");
