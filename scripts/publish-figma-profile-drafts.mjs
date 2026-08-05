/**
 * scripts/publish-figma-profile-drafts.mjs
 *
 * Copies draft profiles → nebulla-project/ui-resource-catalog/profiles/
 * Strips _draft_meta and enforces catalog-required fields.
 *
 * Usage:
 *   node scripts/publish-figma-profile-drafts.mjs
 *   node scripts/publish-figma-profile-drafts.mjs --only=id1,id2
 *   node scripts/publish-figma-profile-drafts.mjs --require-review-false
 *
 * Env:
 *   DRAFT_DIR=… CATALOG_ROOT=…
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const DRAFT_DIR = process.env.DRAFT_DIR
  ? path.resolve(process.env.DRAFT_DIR)
  : path.join(REPO_ROOT, "nebulla-project", "figma-library", "profile-drafts");
const CATALOG_ROOT = process.env.CATALOG_ROOT
  ? path.resolve(process.env.CATALOG_ROOT)
  : path.join(REPO_ROOT, "nebulla-project", "ui-resource-catalog");
const PROFILES_DIR = path.join(CATALOG_ROOT, "profiles");

const KNOWN_TEMPLATES = new Set([
  "mobile_home_hero_cards",
  "mobile_list_actions",
  "mobile_dashboard_metrics",
  "mobile_settings_groups",
  "mobile_auth_form",
  "mobile_detail_sections",
  "mobile_empty_state",
  "web_dashboard_sidebar",
  "web_list_table",
  "web_settings_two_column",
  "web_detail_header_content",
  "web_auth_center_card",
  "landing_hero_features_cta",
  "landing_pricing_sections",
]);

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const onlyIds = onlyArg
  ? onlyArg
      .replace("--only=", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;
const requireReviewFalse = args.includes("--require-review-false");

function isPublishable(p) {
  return (
    p &&
    typeof p.id === "string" &&
    typeof p.kind === "string" &&
    typeof p.platform === "string" &&
    Array.isArray(p.page_types) &&
    p.page_types.length > 0 &&
    typeof p.density === "string" &&
    Array.isArray(p.personality) &&
    p.personality.length > 0 &&
    typeof p.description === "string" &&
    p.description.length >= 20
  );
}

function toCatalogProfile(raw) {
  const {
    id,
    kind,
    platform,
    page_types,
    density,
    personality,
    best_for = [],
    strengths = [],
    weaknesses = [],
    tags = [],
    description,
    suitability,
    limitations,
    template_id,
    figma_file_key,
    preview_r2_key,
    preview_local,
    license = "check-original-kit-license",
    source = "figma-api-download",
    version = "1",
    industry = [],
  } = raw;

  let tid = typeof template_id === "string" ? template_id.trim() : "";
  if (tid && !KNOWN_TEMPLATES.has(tid)) {
    console.warn(`WARN  ${id}: unknown template_id=${tid} — clearing (layout override disabled)`);
    tid = "";
  }

  return {
    id,
    kind: kind || "figma_kit",
    platform,
    page_types,
    density,
    personality,
    best_for,
    strengths,
    weaknesses: weaknesses.filter((w) => !/_draft_meta|needs human review before production/i.test(w)),
    tags,
    description,
    suitability,
    limitations,
    ...(tid ? { template_id: tid } : {}),
    ...(figma_file_key ? { figma_file_key } : {}),
    ...(preview_r2_key ? { preview_r2_key } : {}),
    ...(preview_local ? { preview_local } : {}),
    license,
    source,
    version: String(version).startsWith("draft") ? "1" : String(version),
    industry: Array.isArray(industry) ? industry : [],
  };
}

function main() {
  if (!fs.existsSync(DRAFT_DIR)) {
    console.error(`No drafts dir: ${DRAFT_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(PROFILES_DIR, { recursive: true });

  const files = fs.readdirSync(DRAFT_DIR).filter((f) => f.endsWith(".json"));
  let published = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(DRAFT_DIR, file), "utf8"));
    if (onlyIds && !onlyIds.includes(raw.id)) {
      skipped++;
      continue;
    }
    if (requireReviewFalse && raw._draft_meta?.needs_review !== false) {
      console.log(`SKIP  ${raw.id || file} (still needs_review)`);
      skipped++;
      continue;
    }
    if (!isPublishable(raw)) {
      console.log(`SKIP  ${file} (missing required fields)`);
      skipped++;
      continue;
    }

    const profile = toCatalogProfile(raw);
    const out = path.join(PROFILES_DIR, `${profile.id}.json`);
    fs.writeFileSync(out, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    console.log(
      `PUBLISH ${profile.id} → profiles/  template=${profile.template_id || "—"} figma=${profile.figma_file_key || "—"}`,
    );
    published++;
  }

  console.log(`\nDone. published=${published} skipped=${skipped}`);
  console.log(`Catalog: ${PROFILES_DIR}`);
  console.log("Smoke: Generate UI → ui-generation-v2-meta.json → resource_match");
}

main();
