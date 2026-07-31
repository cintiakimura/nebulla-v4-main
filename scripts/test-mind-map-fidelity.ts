/**
 * Mind Map ⊆ §4 fidelity.
 * Run: npm run test:mind-map
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessMindMapSubsetOfSection4,
  section4RoutesFromPlan,
} from "../lib/mindMapFidelity.ts";
import { mindMapPagesFromMasterPlan, buildMindMapGraphFromPageSpecs } from "../lib/nebulaIdeWorkspaceArtifacts.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(
  __dirname,
  "../nebula-project/fixtures/master-plan/good-crud-auth.json",
);

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

const plan = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as Record<string, string>;

section("§4 routes parsed from good fixture");
{
  const routes = section4RoutesFromPlan(plan);
  assert.ok(routes.includes("/login") || routes.some((r) => r.includes("login")));
  assert.ok(routes.some((r) => r.includes("/app")));
}

section("mindMapPagesFromMasterPlan reads ### Name `/route` headings");
{
  const specs = mindMapPagesFromMasterPlan(plan, "TaskApp");
  assert.ok(specs.length >= 5, `expected ≥5 pages, got ${specs.length}`);
  assert.ok(specs.some((s) => s.route.includes("/login")));
}

section("synced graph from §4 has no extra routes");
{
  const specs = mindMapPagesFromMasterPlan(plan, "TaskApp");
  const graph = buildMindMapGraphFromPageSpecs(specs, "TaskApp");
  const fidelity = assessMindMapSubsetOfSection4({
    plan,
    mindMapPages: graph.pages,
    mode: "strict",
  });
  assert.equal(fidelity.extraRoutes.length, 0, fidelity.extraRoutes.join(","));
  assert.equal(fidelity.allowWrite, true);
}

section("invented mind-map route blocked in strict");
{
  const fidelity = assessMindMapSubsetOfSection4({
    plan,
    mindMapPages: [
      { data: { label: "Secret", description: "Route: /admin/secret-panel" } },
    ],
    mode: "strict",
  });
  assert.ok(fidelity.extraRoutes.some((r) => r.includes("secret")));
  assert.equal(fidelity.allowWrite, false);
  assert.ok(fidelity.gaps.some((g) => g.code === "MINDMAP_EXTRA_ROUTES"));
}

section("warn mode allows write with extras");
{
  const fidelity = assessMindMapSubsetOfSection4({
    plan,
    mindMapPages: [
      { data: { label: "X", description: "Route: /not-in-plan" } },
    ],
    mode: "warn",
  });
  assert.equal(fidelity.allowWrite, true);
  assert.ok(fidelity.extraRoutes.length > 0);
}

section("plain and backticked /2fa /_secret are §4 routes (not extras)");
{
  const digitPlan = {
    "4. Pages and navigation": [
      "### Two-factor `/2fa`",
      "Purpose: MFA challenge",
      "",
      "### Internal /_secret",
      "Purpose: ops only",
    ].join("\n"),
  };
  const routes = section4RoutesFromPlan(digitPlan);
  assert.ok(routes.includes("/2fa"), `expected /2fa in ${routes.join(",")}`);
  assert.ok(routes.includes("/_secret"), `expected /_secret in ${routes.join(",")}`);

  const fidelity = assessMindMapSubsetOfSection4({
    plan: digitPlan,
    mindMapPages: [
      { data: { label: "Two-factor", description: "Route: /2fa" } },
      { data: { label: "Internal", description: "Route: /_secret" } },
    ],
    mode: "strict",
  });
  assert.equal(fidelity.extraRoutes.length, 0, fidelity.extraRoutes.join(","));
  assert.equal(fidelity.allowWrite, true);
}

console.log("\nAll mind-map fidelity tests passed.\n");
