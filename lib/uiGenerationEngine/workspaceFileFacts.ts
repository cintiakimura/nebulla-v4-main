/**
 * Extract concrete UI facts from workspace files after coding apply.
 * Master Plan = product truth; files = labels, routes, actions, sections.
 */

import fs from "fs";
import path from "path";

export type WorkspaceFileFacts = {
  scanned_files: string[];
  routes: string[];
  page_names: string[];
  button_labels: string[];
  link_labels: string[];
  headings: string[];
  form_fields: string[];
  sections: string[];
  notes: string[];
};

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".cursor",
  "dist",
  "build",
  ".next",
  "coverage",
  "nebula-ui-studio",
  "0vgenerated-v2",
]);

const SOURCE_EXT = /\.(tsx|jsx|ts|js|vue|html|mdx)$/i;

function walkSourceFiles(root: string, limit = 80): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIR.has(ent.name)) continue;
        stack.push(abs);
        continue;
      }
      if (!SOURCE_EXT.test(ent.name)) continue;
      const rel = path.relative(root, abs).replace(/\\/g, "/");
      if (rel.startsWith("nebulla-project/")) continue;
      out.push(rel);
    }
  }
  return out;
}

function uniq(items: string[], max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || t.length > 80) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function extractFromText(text: string, facts: WorkspaceFileFacts): void {
  for (const m of text.matchAll(/path\s*[:=]\s*['"`]([^'"`]+)['"`]/gi)) {
    facts.routes.push(m[1]);
  }
  for (const m of text.matchAll(/<Route[^>]*\spath\s*=\s*['"`]([^'"`]+)['"`]/gi)) {
    facts.routes.push(m[1]);
  }
  for (const m of text.matchAll(/to\s*=\s*['"`](\/[^'"`]+)['"`]/gi)) {
    facts.routes.push(m[1]);
  }
  for (const m of text.matchAll(/href\s*=\s*['"`](\/[^'"`]+)['"`]/gi)) {
    facts.routes.push(m[1]);
  }

  for (const m of text.matchAll(/<(?:button|Button)[^>]*>([^<{]+)</gi)) {
    facts.button_labels.push(m[1]);
  }
  for (const m of text.matchAll(/(?:aria-label|title)\s*=\s*['"`]([^'"`]+)['"`]/gi)) {
    facts.button_labels.push(m[1]);
  }
  for (const m of text.matchAll(/>\s*([A-Z][A-Za-z0-9 ]{1,40})\s*<\/(?:button|Button|a|Link)>/g)) {
    facts.link_labels.push(m[1]);
  }

  for (const m of text.matchAll(/<(?:h1|h2|h3|H1|H2|H3)[^>]*>\s*([^<{]+)\s*</gi)) {
    facts.headings.push(m[1]);
  }
  for (const m of text.matchAll(/(?:placeholder|label)\s*=\s*['"`]([^'"`]+)['"`]/gi)) {
    facts.form_fields.push(m[1]);
  }
  for (const m of text.matchAll(/<(?:section|nav|header|footer|aside|main)\b/gi)) {
    facts.sections.push(m[0].replace(/[<>]/g, "").toLowerCase());
  }
}

/** True when applied paths look like app shell / UI slice (not plan-only). */
export function looksLikeUiRelevantPaths(writtenPaths: string[]): boolean {
  if (!writtenPaths.length) return false;
  return writtenPaths.some((p) => {
    const n = p.replace(/\\/g, "/");
    if (/\.(tsx|jsx|vue|html|css)$/i.test(n)) return true;
    if (/^(app|src|pages|components|public)\//i.test(n)) return true;
    if (/App\.(t|j)sx?$/i.test(n)) return true;
    return false;
  });
}

export function collectWorkspaceFileFacts(
  workspaceRoot: string,
  preferPaths?: string[],
): WorkspaceFileFacts {
  const facts: WorkspaceFileFacts = {
    scanned_files: [],
    routes: [],
    page_names: [],
    button_labels: [],
    link_labels: [],
    headings: [],
    form_fields: [],
    sections: [],
    notes: [],
  };

  const preferred = (preferPaths || [])
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => SOURCE_EXT.test(p) || /\.(tsx|jsx|html)$/i.test(p));

  const discovered = walkSourceFiles(workspaceRoot);
  const ordered = [
    ...preferred.filter((p) => fs.existsSync(path.join(workspaceRoot, p))),
    ...discovered.filter((p) => !preferred.includes(p)),
  ].slice(0, 60);

  for (const rel of ordered) {
    const abs = path.join(workspaceRoot, rel);
    let text = "";
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (text.length > 200_000) text = text.slice(0, 200_000);
    facts.scanned_files.push(rel);
    extractFromText(text, facts);

    const base = path.basename(rel).replace(/\.(tsx|jsx|ts|js)$/i, "");
    if (/page|screen|view|layout|app/i.test(base) || /\/page\.(t|j)sx?$/i.test(rel)) {
      facts.page_names.push(base);
    }
  }

  facts.routes = uniq(facts.routes, 24);
  facts.page_names = uniq(facts.page_names, 20);
  facts.button_labels = uniq(facts.button_labels, 30);
  facts.link_labels = uniq(facts.link_labels, 24);
  facts.headings = uniq(facts.headings, 24);
  facts.form_fields = uniq(facts.form_fields, 24);
  facts.sections = uniq(facts.sections, 16);

  if (!facts.scanned_files.length) {
    facts.notes.push("No source files found to ground UI labels — Master Plan only.");
  } else {
    facts.notes.push(
      `Grounded in ${facts.scanned_files.length} file(s); preserve real labels/actions when valid.`,
    );
  }

  return facts;
}

export function formatFileFactsForBrief(facts: WorkspaceFileFacts): string {
  return [
    "GENERATED FILE FACTS (concrete — do not invent conflicting major behavior):",
    `Scanned: ${facts.scanned_files.slice(0, 12).join(", ") || "(none)"}`,
    `Routes: ${facts.routes.join(", ") || "(none found)"}`,
    `Page-ish names: ${facts.page_names.join(", ") || "(none)"}`,
    `Button labels: ${facts.button_labels.join(", ") || "(none)"}`,
    `Link labels: ${facts.link_labels.join(", ") || "(none)"}`,
    `Headings: ${facts.headings.join(", ") || "(none)"}`,
    `Form fields: ${facts.form_fields.join(", ") || "(none)"}`,
    `Notes: ${facts.notes.join(" ")}`,
  ].join("\n");
}
