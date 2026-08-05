/**
 * scripts/generate-figma-profile-drafts.mjs
 *
 * Reads figma-library/raw/{fileKey}/document.json (+ meta.json)
 * Writes draft UiResourceProfile JSON for catalog review.
 *
 * Usage:
 *   node scripts/generate-figma-profile-drafts.mjs
 *
 * Optional:
 *   RAW_DIR=… OUT_DIR=…
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const RAW_DIR = process.env.RAW_DIR
  ? path.resolve(process.env.RAW_DIR)
  : path.join(REPO_ROOT, "nebulla-project", "figma-library", "raw");
const OUT_DIR = process.env.OUT_DIR
  ? path.resolve(process.env.OUT_DIR)
  : path.join(REPO_ROOT, "nebulla-project", "figma-library", "profile-drafts");

const PAGE_TYPE_RULES = [
  { re: /\b(login|sign[\s_-]?in|sign[\s_-]?up|auth|register)\b/i, type: "auth" },
  { re: /\b(setting|preferences|account settings)\b/i, type: "settings" },
  { re: /\b(profile|account)\b/i, type: "profile" },
  { re: /\b(checkout|cart|payment|pricing)\b/i, type: "checkout" },
  { re: /\b(dashboard|overview|analytics|metrics|kpi)\b/i, type: "dashboard" },
  { re: /\b(list|table|feed|inbox|tasks|catalog|browse)\b/i, type: "list" },
  { re: /\b(detail|lesson|item|show|product page)\b/i, type: "detail" },
  { re: /\b(landing|marketing|hero|waitlist)\b/i, type: "landing" },
  { re: /\b(home|main)\b/i, type: "home" },
  { re: /\b(empty|zero state|no results)\b/i, type: "empty" },
];

const PERSONALITY_RULES = [
  { re: /\b(minimal|clean|simple)\b/i, tag: "clean" },
  { re: /\b(saas|admin|enterprise|professional)\b/i, tag: "professional" },
  { re: /\b(bold|vibrant|colorful)\b/i, tag: "bold" },
  { re: /\b(playful|fun|friendly)\b/i, tag: "friendly" },
  { re: /\b(dark|night|cosmic)\b/i, tag: "dark" },
  { re: /\b(luxury|premium|elegant)\b/i, tag: "premium" },
];

/** Suggest nearest v2 template so publish can drive layout override. */
function suggestTemplateId(platform, pageTypes) {
  const pts = new Set(pageTypes);
  if (platform === "landing" || pts.has("landing")) {
    return pts.has("checkout") ? "landing_pricing_sections" : "landing_hero_features_cta";
  }
  if (platform === "mobile") {
    if (pts.has("auth")) return "mobile_auth_form";
    if (pts.has("settings")) return "mobile_settings_groups";
    if (pts.has("dashboard")) return "mobile_dashboard_metrics";
    if (pts.has("list")) return "mobile_list_actions";
    if (pts.has("detail")) return "mobile_detail_sections";
    if (pts.has("empty")) return "mobile_empty_state";
    return "mobile_home_hero_cards";
  }
  // web
  if (pts.has("auth")) return "web_auth_center_card";
  if (pts.has("settings")) return "web_settings_two_column";
  if (pts.has("dashboard")) return "web_dashboard_sidebar";
  if (pts.has("list")) return "web_list_table";
  if (pts.has("detail")) return "web_detail_header_content";
  return "web_dashboard_sidebar";
}

function walkNames(node, acc = [], depth = 0) {
  if (!node || depth > 8) return acc;
  if (node.name) acc.push(String(node.name));
  for (const c of node.children || []) walkNames(c, acc, depth + 1);
  return acc;
}

function collectFrames(node, acc = [], depth = 0) {
  if (!node || depth > 10) return acc;
  const t = node.type;
  if (t === "FRAME" || t === "COMPONENT" || t === "COMPONENT_SET" || t === "SECTION") {
    acc.push({
      name: node.name || "",
      type: t,
      w: node.absoluteBoundingBox?.width || node.width || 0,
      h: node.absoluteBoundingBox?.height || node.height || 0,
    });
  }
  for (const c of node.children || []) collectFrames(c, acc, depth + 1);
  return acc;
}

function detectPlatform(bucket, namesBlob, frames) {
  const b = (bucket || "").toLowerCase();
  if (b === "mobile") return "mobile";
  if (b === "landing") return "landing";
  if (b === "dashboard" || b === "web" || b === "auth") return "web";

  const mobileHits = frames.filter((f) => f.w > 0 && f.w <= 500).length;
  const desktopHits = frames.filter((f) => f.w >= 1000).length;
  if (/mobile|ios|android|iphone/i.test(namesBlob)) return "mobile";
  if (/landing|marketing|hero/i.test(namesBlob)) return "landing";
  if (mobileHits > desktopHits && mobileHits >= 3) return "mobile";
  if (desktopHits >= 2) return "web";
  return "web";
}

function detectPageTypes(namesBlob, bucket) {
  const found = new Set();
  for (const rule of PAGE_TYPE_RULES) {
    if (rule.re.test(namesBlob)) found.add(rule.type);
  }
  const b = (bucket || "").toLowerCase();
  if (b === "landing") found.add("landing");
  if (b === "dashboard") found.add("dashboard");
  if (b === "auth") found.add("auth");
  if (b === "mobile" && found.size === 0) found.add("home");
  if (found.size === 0) found.add("other");
  return [...found].slice(0, 4);
}

function detectDensity(frames, bucket) {
  const b = (bucket || "").toLowerCase();
  if (b === "landing") return "spacious";
  if (b === "dashboard") return "compact";
  const namedCompact = frames.some((f) => /compact|dense|tight/i.test(f.name));
  const namedSpacious = frames.some((f) => /spacious|airy|marketing|hero/i.test(f.name));
  if (namedCompact) return "compact";
  if (namedSpacious) return "spacious";
  const count = frames.length;
  if (count >= 40) return "compact";
  if (count <= 12) return "spacious";
  return "medium";
}

function detectPersonality(namesBlob) {
  const tags = [];
  for (const rule of PERSONALITY_RULES) {
    if (rule.re.test(namesBlob) && !tags.includes(rule.tag)) tags.push(rule.tag);
  }
  if (tags.length === 0) tags.push("clean", "professional");
  return tags.slice(0, 5);
}

function buildBestFor(pageTypes, platform, personality) {
  const out = [...pageTypes, platform, ...personality.slice(0, 2)];
  return [...new Set(out)].slice(0, 8);
}

function buildStrengths(frames, pageTypes) {
  const s = [];
  if (frames.length >= 15) s.push("Broad screen coverage");
  if (pageTypes.includes("dashboard")) s.push("Useful for metrics / overview layouts");
  if (pageTypes.includes("list")) s.push("Good list / table patterns");
  if (pageTypes.includes("auth")) s.push("Auth form patterns available");
  if (pageTypes.includes("landing")) s.push("Marketing / hero section patterns");
  if (s.length === 0) s.push("Reusable UI structure reference");
  return s.slice(0, 5);
}

function buildWeaknesses(statusMeta, frames) {
  const w = [];
  if (frames.length < 5) w.push("Thin frame set — limited structural variety");
  if (statusMeta?.status && statusMeta.status !== "ok") w.push("Source download was not clean");
  w.push("Draft profile — needs human review before production matching");
  w.push("Confirm template_id maps to a real v2 template before relying on layout override");
  return w.slice(0, 5);
}

function slugId(fileKey, name) {
  const base = (name || fileKey)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `figma_${base}_${fileKey.slice(0, 8)}`;
}

function profileFromDocument(fileKey, doc, meta) {
  const bucket = meta?.bucket || "";
  const frames = collectFrames(doc.document || doc);
  const names = walkNames(doc.document || doc);
  const namesBlob = `${meta?.name || ""} ${doc.name || ""} ${names.slice(0, 200).join(" ")} ${bucket}`;

  const platform = detectPlatform(bucket, namesBlob, frames);
  const page_types = detectPageTypes(namesBlob, bucket);
  const density = detectDensity(frames, bucket);
  const personality = detectPersonality(namesBlob);
  const template_id = suggestTemplateId(platform, page_types);

  const description = [
    doc.name || meta?.name || fileKey,
    `Platform: ${platform}.`,
    `Likely page types: ${page_types.join(", ")}.`,
    `Density guess: ${density}.`,
    `Suggested template_id: ${template_id}.`,
    `Frames/components sampled: ${frames.length}.`,
    "Draft auto-profile from Figma document structure — review before publish.",
  ].join(" ");

  return {
    id: slugId(fileKey, doc.name || meta?.name),
    kind: "figma_kit",
    platform,
    page_types,
    density,
    personality,
    best_for: buildBestFor(page_types, platform, personality),
    strengths: buildStrengths(frames, page_types),
    weaknesses: buildWeaknesses(meta, frames),
    tags: [...new Set([bucket, platform, ...page_types, ...personality].filter(Boolean))],
    description,
    suitability: `Best as structural inspiration for ${page_types.join("/")} on ${platform}.`,
    limitations: "Auto-draft from node names/structure only; not vision-reviewed yet.",
    template_id,
    figma_file_key: fileKey,
    preview_local: null,
    license: "check-original-kit-license",
    source: "figma-api-download",
    version: "draft-1",
    industry: [],
    _draft_meta: {
      file_key: fileKey,
      figma_name: doc.name || null,
      bucket,
      frame_count: frames.length,
      sample_frame_names: frames.slice(0, 12).map((f) => f.name),
      suggested_template_id: template_id,
      generated_at: new Date().toISOString(),
      needs_review: true,
    },
  };
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`RAW_DIR not found: ${RAW_DIR}`);
    console.error("Run npm run figma:download first.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const keys = fs
    .readdirSync(RAW_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let ok = 0;
  let skipped = 0;

  for (const fileKey of keys) {
    const docPath = path.join(RAW_DIR, fileKey, "document.json");
    const metaPath = path.join(RAW_DIR, fileKey, "meta.json");
    if (!fs.existsSync(docPath)) {
      console.log(`SKIP  ${fileKey} (no document.json)`);
      skipped++;
      continue;
    }

    const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));
    const meta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
      : { file_key: fileKey, bucket: "" };

    if (meta.status && meta.status !== "ok") {
      console.log(`SKIP  ${fileKey} (download status=${meta.status})`);
      skipped++;
      continue;
    }

    const profile = profileFromDocument(fileKey, doc, meta);
    const outPath = path.join(OUT_DIR, `${profile.id}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    console.log(
      `DRAFT ${profile.id}  platform=${profile.platform} pages=${profile.page_types.join("|")} template=${profile.template_id}`,
    );
    ok++;
  }

  console.log(`\nDone. drafts=${ok} skipped=${skipped}`);
  console.log(`Output: ${OUT_DIR}/`);
  console.log("Next: review template_id / page_types, then npm run figma:publish-drafts -- --only=…");
}

main();
