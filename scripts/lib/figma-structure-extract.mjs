/**
 * Shared lean structure extract from a full Figma raw document.json.
 * Used by extract-figma-structure.mjs and figma-ingest-daily.
 */
import fs from "fs";
import path from "path";

export function pruneNode(n, depth, maxDepth) {
  if (!n || depth > maxDepth) return null;
  const type = String(n.type || "").toUpperCase();
  const keepType =
    type === "DOCUMENT" ||
    type === "CANVAS" ||
    type === "FRAME" ||
    type === "COMPONENT" ||
    type === "INSTANCE" ||
    type === "SECTION" ||
    type === "GROUP";
  if (!keepType && depth > 0) return null;
  const out = {
    name: n.name || type || "node",
    type: type || "FRAME",
  };
  if (n.layoutMode) out.layoutMode = n.layoutMode;
  if (typeof n.itemSpacing === "number") out.itemSpacing = n.itemSpacing;
  if (typeof n.cornerRadius === "number") out.cornerRadius = n.cornerRadius;
  const kids = [];
  for (const c of n.children || []) {
    const p = pruneNode(c, depth + 1, maxDepth);
    if (p) kids.push(p);
    if (kids.length >= 24) break;
  }
  if (kids.length) out.children = kids;
  return out;
}

/**
 * Write structure/<fileKey>/document.json from raw/<fileKey>/document.json.
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
export function extractStructureForKey(libraryRoot, fileKey, opts = {}) {
  const maxDepth = opts.maxDepth ?? 5;
  const rawPath = path.join(libraryRoot, "raw", fileKey, "document.json");
  const outDir = path.join(libraryRoot, "structure", fileKey);
  const outPath = path.join(outDir, "document.json");
  if (!fs.existsSync(rawPath)) {
    return { ok: false, error: `missing raw ${rawPath}` };
  }
  let full;
  try {
    full = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!full?.document) {
    return { ok: false, error: "raw document.json missing .document" };
  }
  const pruned = {
    name: full.name || fileKey,
    document: pruneNode(full.document, 0, maxDepth),
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(pruned, null, 2)}\n`, "utf8");
  return { ok: true, path: outPath };
}
