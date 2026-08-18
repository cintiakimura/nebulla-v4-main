/**
 * UI brief builder — full §4 (no 8-route distill).
 * Run: npm run test:ui-brief
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildUiBriefMarkdown,
  parsePagesFromUiBrief,
  writeUiBriefMarkdown,
} from "../lib/nebulaUiBrief.ts";
import { hydrateMasterPlanDerivedSections } from "../lib/nebulaIdeWorkspaceArtifacts.ts";
import { uiBriefUsable } from "../lib/spineSequenceGates.ts";
import { buildV0PromptMarkdown } from "../lib/nebulaUiStudioPipeline.ts";
import { V0_PROMPT_MAX_CHARS } from "../lib/nebulaUiStudioPipeline.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(
  __dirname,
  "../nebula-project/fixtures/master-plan/good-crud-auth.json",
);

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

const plan = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as Record<string, string>;

section("ui-brief includes full §4 routes (not capped at 8)");
{
  const brief = buildUiBriefMarkdown(plan);
  assert.match(brief, /Nebula UI Brief \(primary\)/);
  assert.match(brief, /Pages and navigation/);
  assert.match(brief, /Design tokens/);
  assert.match(brief, /Stitch-minimum chrome/);
  assert.match(brief, /\/app\/projects\/:id/);
  assert.match(brief, /\/app\/settings/);
  assert.match(brief, /authz/i);
  assert.match(brief, /Security & authz/);
  assert.ok(brief.length > 1500, `brief too short: ${brief.length}`);
  const pages = parsePagesFromUiBrief(brief);
  assert.ok(pages.length >= 5, `expected ≥5 pages, got ${pages.length}`);
}

section("v0-prompt remains short distill; ui-brief is longer");
{
  const brief = buildUiBriefMarkdown(plan);
  const v0 = buildV0PromptMarkdown(plan);
  assert.ok(v0.length <= V0_PROMPT_MAX_CHARS, `v0 over cap: ${v0.length}`);
  assert.ok(brief.length > v0.length, "ui-brief should be richer than v0-prompt");
}

section("writeUiBriefMarkdown persists file");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-ui-brief-"));
  const { content, path: rel } = writeUiBriefMarkdown(tmp, plan);
  const abs = path.join(tmp, rel);
  assert.ok(fs.existsSync(abs));
  assert.equal(fs.readFileSync(abs, "utf8"), content);
}

section("parsePagesFromUiBrief skips empty routes; recovers route from body");
{
  const brief = [
    "## Pages and navigation",
    "",
    "### Dashboard",
    "No route on heading and none in body — drop.",
    "",
    "### Settings",
    "Primary route is `/settings` in the body.",
    "Purpose: account prefs",
    "",
    "### Login `/login`",
    "Purpose: sign in",
  ].join("\n");
  const pages = parsePagesFromUiBrief(brief);
  assert.ok(!pages.some((p) => !p.route.startsWith("/")), "no empty routes");
  assert.ok(!pages.some((p) => p.name === "Dashboard"), "heading-only page dropped");
  assert.ok(
    pages.some((p) => p.name === "Settings" && p.route === "/settings"),
    "route recovered from body",
  );
  assert.ok(pages.some((p) => p.name === "Login" && p.route === "/login"));
}

section("parsePagesFromUiBrief reads backtick-inside-parens bullets");
{
  const brief = [
    "## Pages and navigation",
    "",
    "- **Home** (`/`)",
    "- **Dashboard** (`/dashboard`)",
    "- Practice (`/practice`)",
  ].join("\n");
  const pages = parsePagesFromUiBrief(brief);
  assert.ok(pages.some((p) => p.route === "/"), "Home `/` from (`/`)");
  assert.ok(pages.some((p) => p.name === "Dashboard" && p.route === "/dashboard"));
  assert.ok(pages.some((p) => p.name === "Practice" && p.route === "/practice"));
}

section("research-ok + unparseable §4 seeds pages so brief is usable");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-ui-brief-seed-"));
  const thin: Record<string, string> = {
    "1. Goal of the app": "tutor kids with ADHD — short practice sessions for students and teachers",
    "2. Tech and Research": "Education web app. Research complete; competitors confirmed.",
    "3. Features and KPIs": "Practice, teacher view, progress. KPI: sessions completed.",
    "4. Pages and navigation": "Pages will be filled after research. Typical education screens TBD.",
    "5. UI/UX design": "Calm, low-noise UI. Large type. Short sessions. High contrast CTAs.",
  };
  const { plan, changed } = hydrateMasterPlanDerivedSections(tmp, thin);
  assert.equal(changed, true);
  assert.match(String(plan["4. Pages and navigation"]), /###\s+Home\s+`\/`/);
  assert.match(String(plan["4. Pages and navigation"]), /`\/practice`/);
  const brief = buildUiBriefMarkdown(plan, tmp);
  const pages = parsePagesFromUiBrief(brief);
  assert.ok(pages.length >= 3, `expected seeded pages, got ${pages.length}`);
  assert.ok(uiBriefUsable(brief), "seeded brief must pass Gate A");
}

section("empty §1 hydrates from project name + other tabs");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-ui-brief-goal-"));
  const rest: Record<string, string> = {
    "1. Goal of the app": "",
    "2. Tech and Research": "Education web app. Research complete; competitors confirmed. Next.js App Router.",
    "3. Features and KPIs": "Practice, teacher view, progress. KPI: sessions completed.",
    "4. Pages and navigation": "### Kid Home `/`\nShort ADHD practice sessions for kids, teachers, and parents.\n",
    "5. UI/UX design": "Calm, low-noise UI. Large type. Short sessions. High contrast CTAs.",
  };
  const { plan, changed } = hydrateMasterPlanDerivedSections(tmp, rest);
  assert.equal(changed, true);
  assert.ok(String(plan["1. Goal of the app"] || "").trim().length >= 48);
  assert.match(String(plan["1. Goal of the app"]), /Kid Home|ADHD|Web App/i);
}

section("generic dashboard/settings on disk do not replace ADHD §4 pages");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-ui-brief-generic-disk-"));
  fs.mkdirSync(path.join(tmp, "app", "dashboard"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "app", "settings"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app", "page.tsx"), "export default function Home(){return null}\n");
  fs.writeFileSync(path.join(tmp, "app", "dashboard", "page.tsx"), "export default function Dash(){return null}\n");
  fs.writeFileSync(path.join(tmp, "app", "settings", "page.tsx"), "export default function Settings(){return null}\n");
  const thin: Record<string, string> = {
    "1. Goal of the app": "tutor kids with ADHD — short practice sessions for students and teachers",
    "2. Tech and Research": "Education web app. Research complete; competitors confirmed.",
    "3. Features and KPIs": "Practice, teacher view, progress. KPI: sessions completed.",
    "4. Pages and navigation": "Pages TBD after coding.",
    "5. UI/UX design": "Calm, low-noise UI. Large type. Short sessions. High contrast CTAs.",
  };
  const { plan } = hydrateMasterPlanDerivedSections(tmp, thin);
  assert.match(String(plan["4. Pages and navigation"]), /`\/practice`/);
  assert.match(String(plan["4. Pages and navigation"]), /`\/teacher`/);
  assert.equal(/`\/dashboard`/.test(String(plan["4. Pages and navigation"])), false);
}

console.log("\nAll ui-brief tests passed.\n");
