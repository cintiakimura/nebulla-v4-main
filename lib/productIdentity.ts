/**
 * Product brand name + logo slot — persisted separately from the §1 goal.
 * Never chop the first N words of the brief as the app title.
 */

import fs from "fs";
import path from "path";

export const PRODUCT_IDENTITY_REL = "nebulla-ide/product-identity.json";

export type ProductIdentity = {
  projectName: string;
  logoInitials: string;
  /** Visual cue only — no image file required. */
  logoHint?: string;
  /** User renamed the project — do not auto-replace with inferProductName. */
  userSet?: boolean;
};

type ProductDomain = "education" | "tasks" | "landing" | "general";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "of",
  "on",
  "in",
  "with",
  "that",
  "this",
  "please",
  "me",
  "my",
  "build",
  "create",
  "make",
  "design",
  "scaffold",
  "app",
  "apps",
  "application",
  "applications",
  "webapp",
  "web",
  "website",
  "site",
  "mobile",
  "platform",
  "tool",
  "tools",
  "product",
  "system",
  "privacy-first",
  "privacy",
  "first",
  "companion",
  "running",
  "browser",
  "new",
  "project",
  "untitled",
]);

const STEMS: Record<ProductDomain, readonly string[]> = {
  education: ["Lumen", "Quill", "Beacon", "Sparrow", "Nest"],
  tasks: ["Forge", "Pulse", "Harbor", "North", "Relay"],
  landing: ["Harbor", "Vista", "North", "Peak", "Bloom"],
  general: ["Nova", "Aether", "Helio", "Kite", "Mesa"],
};

const DESCRIPTORS: Record<ProductDomain, readonly string[]> = {
  education: ["Learn", "Path", "Tutor"],
  tasks: ["Flow", "Desk", "Focus"],
  landing: ["Studio", "Site"],
  general: ["Studio", "Hub"],
};

const HINTS: Record<ProductDomain, string> = {
  education: "book + spark",
  tasks: "check + spark",
  landing: "mark + wave",
  general: "mark + spark",
};

function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function titleCaseWord(w: string): string {
  const t = w.trim();
  if (!t) return "";
  if (t === t.toUpperCase() && t.length <= 4) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function toTitleCase(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ")
    .trim();
}

function detectDomain(goal: string, projectType?: string): ProductDomain {
  const blob = `${goal}\n${projectType || ""}`.toLowerCase();
  if (/\blanding\b|\bmarketing\b|\bwaitlist\b/.test(blob) && !/\bmobile\b|\bexpo\b/.test(blob)) {
    return "landing";
  }
  if (
    /learn|lesson|tutor|read|reading|kid|kids|child|children|school|homework|teacher|student|educat|adhd|classroom/.test(
      blob,
    )
  ) {
    return "education";
  }
  if (/\btask|\btodo|\bhabit|\bfocus|\bchecklist|\bproductiv/.test(blob)) return "tasks";
  if (/landing page/i.test(projectType || "")) return "landing";
  return "general";
}

function optionalAudienceWord(goal: string, domain: ProductDomain, desc: string): string | null {
  if (domain === "education" && /\bkids?\b|\bchildren\b/.test(goal.toLowerCase())) {
    if (desc.toLowerCase() !== "kids") return "Kids";
  }
  return null;
}

/**
 * 2–4 word Title Case brand. Never the first N words of the goal.
 * Prefers one invented stem + optional descriptor.
 */
export function inferProductName(goal: string, projectType?: string): string {
  const g = String(goal || "").replace(/\s+/g, " ").trim();
  const type = String(projectType || "").trim();
  const domain = detectDomain(g, type);
  const key = `${g}|${type}`.toLowerCase();
  const h = stableHash(key || domain);
  const stems = STEMS[domain];
  const descs = DESCRIPTORS[domain];
  const stem = stems[h % stems.length];
  const desc = descs[(h >>> 4) % descs.length];
  const extra = optionalAudienceWord(g, domain, desc);
  const parts = extra ? [stem, desc, extra] : [stem, desc];
  return toTitleCase(parts.slice(0, 4).join(" ")) || "Nova Studio";
}

/** Two letters from the product name (first two words, or first two letters of one word). */
export function logoInitials(name: string): string {
  const words = String(name || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  const fallback = String(name || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase().slice(0, 2) || "NP";
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  if (fallback.length >= 2) return fallback.slice(0, 2);
  if (fallback.length === 1) return `${fallback}P`;
  return "NP";
}

export function logoHintFor(goal: string, projectType?: string): string {
  return HINTS[detectDomain(goal, projectType)];
}

function strippedGoalLead(goal: string): string {
  return String(goal || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(please\s+)?(build|create|make|design|scaffold)\s+(me\s+)?(an?\s+|the\s+)?/i, "")
    .replace(/^(an?|the)\s+/i, "")
    .trim()
    .toLowerCase();
}

/** True when `name` is a chopped brief, not a brand. */
export function looksLikeGoalStubName(name: string, goal?: string): boolean {
  const n = String(name || "").replace(/\s+/g, " ").trim();
  if (!n) return true;
  const lc = n.toLowerCase();
  if (/^(new project|untitled project|untitled|web app|mobile app|landing page)$/i.test(n)) {
    return true;
  }
  if (/^(build|create|make|design|scaffold)\b/i.test(n)) return true;
  if (/\b(privacy-first|companion)\b/i.test(n)) return true;
  const words = lc.split(/\s+/).filter(Boolean);
  if (words.length > 4) return true;
  if (words.every((w) => STOPWORDS.has(w))) return true;
  const g = String(goal || "").replace(/\s+/g, " ").trim();
  if (!g) return false;
  const stripped = strippedGoalLead(g);
  if (!stripped) return false;
  const longPrefix = words.length >= 3;
  if (longPrefix && (stripped === lc || stripped.startsWith(`${lc} `) || g.toLowerCase().startsWith(lc))) {
    return true;
  }
  const goalWords = stripped.split(/\s+/).filter(Boolean);
  for (let k = 3; k <= Math.min(5, goalWords.length); k++) {
    if (goalWords.slice(0, k).join(" ") === lc) return true;
  }
  return false;
}

export function buildProductIdentity(
  goal: string,
  projectType?: string,
  existingName?: string,
  userSet?: boolean,
): ProductIdentity {
  const keep =
    userSet && existingName?.trim()
      ? existingName.trim()
      : existingName?.trim() && !looksLikeGoalStubName(existingName, goal)
        ? existingName.trim()
        : inferProductName(goal, projectType);
  const name = toTitleCase(keep);
  return {
    projectName: name,
    logoInitials: logoInitials(name),
    logoHint: logoHintFor(goal, projectType),
    userSet: Boolean(userSet),
  };
}

export function parseProductIdentity(raw: unknown): ProductIdentity | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const projectName = typeof o.projectName === "string" ? o.projectName.trim() : "";
  if (!projectName) return null;
  const initials =
    typeof o.logoInitials === "string" && o.logoInitials.trim()
      ? o.logoInitials.trim().slice(0, 2).toUpperCase()
      : logoInitials(projectName);
  const logoHint = typeof o.logoHint === "string" && o.logoHint.trim() ? o.logoHint.trim() : undefined;
  return {
    projectName,
    logoInitials: initials.length === 1 ? `${initials}P` : initials || "NP",
    logoHint,
    userSet: o.userSet === true,
  };
}

export function readProductIdentity(workspaceRoot: string): ProductIdentity | null {
  const abs = path.join(workspaceRoot, PRODUCT_IDENTITY_REL);
  if (!fs.existsSync(abs)) return null;
  try {
    return parseProductIdentity(JSON.parse(fs.readFileSync(abs, "utf8")));
  } catch {
    return null;
  }
}

export function patchMasterPlanProductName(
  plan: Record<string, string>,
  identity: ProductIdentity,
): { plan: Record<string, string>; changed: boolean } {
  const next = { ...plan };
  const section = String(next["5. UI/UX design"] || "");
  if (!section.trim()) return { plan: next, changed: false };
  const nameLine = `- **Product name:** ${identity.projectName}`;
  const logoLine = `- **Logo:** initials ${identity.logoInitials}${
    identity.logoHint ? ` · ${identity.logoHint}` : ""
  } (no image required)`;
  let body = section;
  if (/\*\*Product name:\*\*/i.test(body)) {
    body = body.replace(/^(\s*[-*]\s*)?\*\*Product name:\*\*.*$/im, nameLine);
  } else if (/\*\*Project:\*\*/i.test(body)) {
    body = body.replace(
      /^(\s*[-*]\s*)?\*\*Project:\*\*\s*([^\n—–-]*)/im,
      `- **Project:** ${identity.projectName}`,
    );
    if (!/\*\*Product name:\*\*/i.test(body)) {
      body = `${nameLine}\n${body}`;
    }
  } else {
    body = `${nameLine}\n${logoLine}\n${body}`;
  }
  if (!/\*\*Logo:\*\*/i.test(body)) {
    body = body.replace(nameLine, `${nameLine}\n${logoLine}`);
  } else {
    body = body.replace(/^(\s*[-*]\s*)?\*\*Logo:\*\*.*$/im, logoLine);
  }
  if (body === section) return { plan: next, changed: false };
  next["5. UI/UX design"] = body;
  return { plan: next, changed: true };
}

export function applyBrandToPreviewHtml(html: string, identity: ProductIdentity): string {
  let out = String(html || "");
  if (!out) return out;
  const name = identity.projectName;
  const initials = identity.logoInitials;
  if (/class="logo-mark"/.test(out)) {
    out = out.replace(
      /(<span class="logo-mark"[^>]*>)([\s\S]*?)(<\/span>)/i,
      `$1${initials}$3`,
    );
  }
  if (/class="brand"/.test(out)) {
    out = out.replace(
      /(<div class="brand"[^>]*>[\s\S]*?<h1[^>]*>)([\s\S]*?)(<\/h1>)/i,
      `$1${name}$3`,
    );
  }
  return out;
}

function writeMasterPlanIfPresent(workspaceRoot: string, identity: ProductIdentity): void {
  const mp = path.join(workspaceRoot, "master-plan.json");
  if (!fs.existsSync(mp)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(mp, "utf8")) as Record<string, unknown>;
    const plan: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") plan[k] = v;
    }
    const { plan: next, changed } = patchMasterPlanProductName(plan, identity);
    if (!changed) return;
    const merged = { ...raw, "5. UI/UX design": next["5. UI/UX design"] };
    fs.writeFileSync(mp, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

function patchKnownPreviewFiles(workspaceRoot: string, identity: ProductIdentity): void {
  const rels = [
    "public/nebula-ui-gen-preview.html",
    "public/product-preview.html",
    "index.html",
  ];
  for (const rel of rels) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const prev = fs.readFileSync(abs, "utf8");
      const next = applyBrandToPreviewHtml(prev, identity);
      if (next !== prev) fs.writeFileSync(abs, next, "utf8");
    } catch {
      /* ignore */
    }
  }
}

export function writeProductIdentity(
  workspaceRoot: string,
  identity: ProductIdentity,
): ProductIdentity {
  const abs = path.join(workspaceRoot, PRODUCT_IDENTITY_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const payload: ProductIdentity = {
    projectName: identity.projectName.trim(),
    logoInitials: logoInitials(identity.projectName),
    logoHint: identity.logoHint || undefined,
    userSet: Boolean(identity.userSet),
  };
  if (identity.logoInitials?.trim()) {
    payload.logoInitials = identity.logoInitials.trim().slice(0, 2).toUpperCase();
  }
  fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeMasterPlanIfPresent(workspaceRoot, payload);
  patchKnownPreviewFiles(workspaceRoot, payload);
  return payload;
}

/**
 * Read identity or infer from goal / existing label. Writes when missing or still a goal stub
 * (unless the user set the name).
 */
export function ensureProductIdentity(
  workspaceRoot: string,
  opts?: {
    goal?: string;
    projectType?: string;
    projectName?: string;
    userSet?: boolean;
    persist?: boolean;
  },
): ProductIdentity {
  const existing = readProductIdentity(workspaceRoot);
  const goal = opts?.goal || "";
  const type = opts?.projectType;
  if (existing?.userSet && existing.projectName && opts?.userSet !== true) {
    return existing;
  }
  if (opts?.userSet && opts.projectName?.trim()) {
    const built = buildProductIdentity(goal, type, opts.projectName, true);
    if (opts.persist !== false && workspaceRoot) return writeProductIdentity(workspaceRoot, built);
    return built;
  }
  const candidate = opts?.projectName?.trim() || existing?.projectName || "";
  const built = buildProductIdentity(goal, type, candidate, existing?.userSet);
  const needsWrite =
    !existing ||
    looksLikeGoalStubName(existing.projectName, goal) ||
    existing.projectName !== built.projectName ||
    existing.logoInitials !== built.logoInitials;
  if (needsWrite && opts?.persist !== false && workspaceRoot) {
    return writeProductIdentity(workspaceRoot, {
      ...built,
      userSet: existing?.userSet || Boolean(opts?.userSet),
    });
  }
  return existing && !needsWrite ? existing : built;
}
