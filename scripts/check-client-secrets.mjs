#!/usr/bin/env node
/**
 * Fail CI if obvious secret patterns appear under src/ (client bundle surface).
 * Does not replace a full secret scanner — Phase 1 hygiene only.
 */
import fs from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "src");
const PATTERNS = [
  { name: "OpenAI-style key", re: /sk-[a-zA-Z0-9]{20,}/ },
  { name: "xAI-style key", re: /xai-[a-zA-Z0-9_]{20,}/ },
  { name: "GitHub PAT", re: /ghp_[a-zA-Z0-9]{20,}/ },
  { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/ },
];

const SKIP_DIR = new Set(["node_modules", "dist", ".git"]);
const ALLOW_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".md"]);

/** Paths that may mention patterns in docs/examples without being live secrets. */
const ALLOW_PATH_SUBSTR = ["bugDatabaseSnippet", "previewRuntimeBridgeScript"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (ALLOW_EXT.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const hits = [];

for (const file of files) {
  if (ALLOW_PATH_SUBSTR.some((s) => file.includes(s))) continue;
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) {
      hits.push({ file: path.relative(process.cwd(), file), name });
    }
  }
}

if (hits.length) {
  console.error("[check-client-secrets] Possible secrets in src/:");
  for (const h of hits) console.error(`  ${h.name}: ${h.file}`);
  process.exit(1);
}

console.log(`[check-client-secrets] OK — scanned ${files.length} files under src/`);
