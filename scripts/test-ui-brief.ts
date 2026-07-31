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

console.log("\nAll ui-brief tests passed.\n");
