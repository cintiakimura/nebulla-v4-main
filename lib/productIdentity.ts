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

export type ProductDomain =
  | "education"
  | "tasks"
  | "landing"
  | "commerce"
  | "delivery"
  | "marketplace"
  | "finance"
  | "general";

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
  commerce: ["Crumb", "Oven", "Loaf", "Hearth", "Grain"],
  delivery: ["Harbor", "Relay", "Mesa", "North", "Pulse"],
  marketplace: ["Harbor", "Relay", "Bridge", "North", "Pulse"],
  finance: ["Ledger", "Till", "Vault", "Tally", "Mint"],
  general: ["Nova", "Aether", "Helio", "Kite", "Mesa"],
};

const DESCRIPTORS: Record<ProductDomain, readonly string[]> = {
  education: ["Learn", "Path", "Tutor"],
  tasks: ["Flow", "Desk", "Focus"],
  landing: ["Studio", "Site"],
  commerce: ["Bakery", "Market", "Shop"],
  delivery: ["Courier", "Drop", "Run"],
  marketplace: ["Link", "Cast", "Desk"],
  finance: ["Bills", "Books", "Totals"],
  general: ["Studio", "Hub"],
};

const HINTS: Record<ProductDomain, string> = {
  education: "book + spark",
  tasks: "check + spark",
  landing: "mark + wave",
  commerce: "loaf + spark",
  delivery: "pin + spark",
  marketplace: "link + spark",
  finance: "receipt + spark",
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
  const raw = String(name || "").replace(/\s+/g, " ").trim();
  if (/^loaflocal$/i.test(raw)) return "LoafLocal";
  if (/^grain\s+bakery$/i.test(raw)) return "Grain Bakery";
  if (/^quill\s+path$/i.test(raw)) return "Quill Path";
  if (/^quill\s+learn\s+kids$/i.test(raw)) return "Quill Learn Kids";
  if (/^bridgen$/i.test(raw)) return "Bridgen";
  if (/^spoke\s*&\s*co$/i.test(raw) || /^spoke\s+and\s+co$/i.test(raw)) return "Spoke & Co";
  if (/^motodrop$/i.test(raw)) return "Motodrop";
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ")
    .trim();
}

export function extractNamedBrand(goal: string): string | null {
  const g = String(goal || "");
  if (/\btaskwise\b/i.test(g)) return "Taskwise";
  if (/\bbridgen\b/i.test(g)) return "Bridgen";
  if (/\bgrain\s+bakery\b/i.test(g)) return "Grain Bakery";
  if (/\bloaflocal\b/i.test(g)) return "LoafLocal";
  if (/\bquill\s+learn\s+kids\b/i.test(g) && !/\b(bridgen|taskwise)\b/i.test(g)) return "Quill Learn Kids";
  if (/\bquill\s+path\b/i.test(g) && !/\b(bridgen|taskwise|quill\s+learn)\b/i.test(g)) return "Quill Path";
  if (/\bspoke\s*&\s*co\b/i.test(g) || /\bspoke\s+and\s+co\b/i.test(g)) return "Spoke & Co";
  if (/\bmotodrop\b/i.test(g)) return "Motodrop";
  if (/\bmydossier\b/i.test(g)) return "MyDossier";
  const labeled = g.match(/(?:\*\*)?Product name(?:\*\*)?:\s*([^\n*]+)/i)?.[1]?.trim();
  if (labeled && !looksLikeGoalStubName(labeled, g) && labeled.split(/\s+/).length <= 4) {
    return singleProductName(toTitleCase(labeled));
  }
  return extractStatedProductName(g);
}

const NOT_A_PRODUCT_NAME =
  /^(hello|hellos|hi|hey|yes|yeah|yep|ok|okay|go|continue|please|thanks|thankyou|build|create|make)$/i;

/** §1 product name is one string — replace leftover brands, never concatenate. */
export function replaceProductNameInGoal(goal: string, productName: string): string {
  const name = singleProductName(productName);
  let g = String(goal || "").trim();
  if (!name) return g;
  if (/\*\*Product name:\*\*/i.test(g)) {
    g = g.replace(/^(\s*[-*]\s*)?\*\*Product name:\*\*\s*[^\n*]+/im, `**Product name:** ${name}`);
  } else {
    g = `**Product name:** ${name}\n${g}`;
  }
  g = g.replace(/\bquill\s+learn\s+kids\s+bridgen\b/gi, name);
  g = g.replace(/\bquill\s+path\s+taskwise\b/gi, name);
  g = g.replace(/\bquill\s+learn\s+kids\s+/gi, "");
  if (name.toLowerCase() !== "quill learn kids") {
    g = g.replace(/\bquill\s+learn\s+kids\b/gi, name);
  }
  return g.replace(/\n{3,}/g, "\n\n").trim();
}

/** One brand string — never “Quill Path Taskwise”. */
export function singleProductName(raw: string): string {
  const n = String(raw || "").replace(/\s+/g, " ").trim();
  if (!n) return "";
  if (/\btaskwise\b/i.test(n)) return "Taskwise";
  if (/\bmydossier\b/i.test(n)) return "MyDossier";
  if (/\bbridgen\b/i.test(n)) return "Bridgen";
  if (/\bquill\s+learn\s+kids\b/i.test(n) && !/\b(bridgen|taskwise)\b/i.test(n)) return "Quill Learn Kids";
  if (/\bquill\s+path\b/i.test(n) && !/\b(bridgen|taskwise|quill\s+learn)\b/i.test(n)) return "Quill Path";
  if (/\bcity\s+courier\b/i.test(n) && !/\b(bridgen|taskwise)\b/i.test(n)) return "City Courier";
  const labeled = n.match(/(?:\*\*)?Product name(?:\*\*)?:\s*([^\n*]+)/i)?.[1]?.trim();
  if (labeled) return toTitleCase(labeled.split(/\s+/).slice(0, 3).join(" "));
  const first = n.split(/[\n|,]/)[0].trim();
  const words = first.split(/\s+/).filter(Boolean);
  if (words.length > 3) return toTitleCase(words.slice(0, 2).join(" "));
  return toTitleCase(first);
}

/** User named an app (Taskwise) without a Product-name label. */
export function extractStatedProductName(text: string): string | null {
  const t = String(text || "").trim();
  if (!t) return null;
  if (NOT_A_PRODUCT_NAME.test(t.replace(/[.!?]+$/g, ""))) return null;
  if (/^taskwise\b/i.test(t)) return "Taskwise";
  if (/^mydossier\b/i.test(t)) return "MyDossier";
  if (/^bridgen\b/i.test(t)) return "Bridgen";
  const called = t.match(
    /\b(?:called|named|name(?:d)?)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})\b/,
  );
  if (called?.[1] && !NOT_A_PRODUCT_NAME.test(called[1])) {
    return singleProductName(called[1]);
  }
  const lone = t.replace(/[.!?]+$/g, "").trim();
  if (/^[A-Z][a-zA-Z0-9]{2,23}$/.test(lone) && !NOT_A_PRODUCT_NAME.test(lone)) {
    return lone;
  }
  const first = t.split(/[\n.!?]/)[0].trim();
  if (/^[A-Z][a-zA-Z0-9]{2,23}$/.test(first) && !NOT_A_PRODUCT_NAME.test(first)) {
    return first;
  }
  return null;
}

/** Education kit leftovers — never keep when §1 already named a different product. */
export function looksLikeEducationKitDefaultName(name: string, goal?: string): boolean {
  const n = String(name || "").replace(/\s+/g, " ").trim();
  const g = String(goal || "");
  if (!n) return false;
  if (/^practice app$/i.test(n)) return true;
  if (/\bsparrow(\s+tutor)?\b/i.test(n) && !/\bsparrow\b/i.test(g)) return true;
  return false;
}

/** Chip / workspace label leftovers — replace when §1 has a real product name. */
export function isWorkspaceLabelStub(name: string): boolean {
  const n = String(name || "").replace(/\s+/g, " ").trim();
  if (!n) return true;
  if (/^Project type /i.test(n)) return true;
  if (/^(untitled project|untitled|new project)$/i.test(n)) return true;
  return looksLikeGoalStubName(n);
}

/** Prefer labeled / named brand from Master Plan §1 only — do not invent here. */
export function productNameFromPlan(plan: Record<string, unknown> | null | undefined): string {
  const rec = plan && typeof plan === "object" ? plan : {};
  const goal = String(rec["1. Goal of the app"] || rec.goal || "").trim();
  return extractNamedBrand(goal) || "";
}

export function looksLikeShopKitBrand(name: string): boolean {
  const n = String(name || "").replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (/^(grain bakery|crumb market|loaflocal|hearth (bakery|market|shop)|oven (bakery|market|shop))$/i.test(n)) {
    return true;
  }
  return /^(crumb|oven|loaf|hearth|grain)\s+(bakery|market|shop)\b/i.test(n);
}

export function detectProductDomain(goal: string, projectType?: string): ProductDomain {
  const blob = `${goal}\n${projectType || ""}`.toLowerCase();
  if (/\b(influencer|influencers|bridgen|creators?\s+and\s+brands|brands?\s+and\s+influencers)\b/.test(blob)) {
    return "marketplace";
  }
  if (/\blanding\b|\bmarketing\b|\bwaitlist\b/.test(blob) && !/\bmobile\b|\bexpo\b/.test(blob)) {
    return "landing";
  }
  if (
    /\b(moto|motodrop|courier|delivery|dropoff|parcel)\b/.test(blob) &&
    !/\b(baker|bakery|bread|pastry)\b/.test(blob)
  ) {
    return "delivery";
  }
  if (
    /baker|bakery|bread|pastry|cafe|café|restaurant|pickup order|\bshop\b|\bstore\b|checkout|bike|bicycle|mechanic|spoke/.test(
      blob,
    )
  ) {
    return "commerce";
  }
  if (
    /learn|lesson|tutor|read|reading|kid|kids|child|children|school|homework|teacher|student|educat|adhd|classroom/.test(
      blob,
    )
  ) {
    return "education";
  }
  if (/\btask|\btodo|\bhabit|\bfocus|\bchecklist|\bproductiv/.test(blob)) return "tasks";
  if (/\b(bills?|receipts?|running totals?|month(?:ly)?[- ]?(?:list|bills|spend|total))\b/.test(blob)) {
    return "finance";
  }
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
function distillDeliveryName(goal: string): string | null {
  const g = String(goal || "");
  if (/\bmotodrop\b/i.test(g)) return "Motodrop";
  if (/\bmoto\b/i.test(g) && /\bparcel\b/i.test(g)) return "Moto Parcel";
  if (/\bcity\b/i.test(g) && /\b(courier|moto|parcel)\b/i.test(g)) return "City Courier";
  if (/\bparcel\b/i.test(g) && /\bcourier\b/i.test(g)) return "Parcel Courier";
  if (/\bparcel\b/i.test(g)) return "Parcel Run";
  if (/\bcourier\b/i.test(g)) return "City Courier";
  if (/\bmoto\b/i.test(g)) return "Moto Courier";
  return null;
}

/** Header / chip / BottomNav — job-brief or §1 title only (never leftover bakery). */
export function brandFromJobBriefMarkdown(md: string): string {
  const text = String(md || "");
  const labeled = text.match(/(?:\*\*)?Product name(?:\*\*)?:\s*([^\n*]+)/i)?.[1]?.trim();
  if (labeled && !looksLikeGoalStubName(labeled) && labeled.split(/\s+/).length <= 4) {
    return toTitleCase(labeled);
  }
  const heading = text.match(/^##\s*Product name\s*\n+([^\n#]+)/im)?.[1]?.trim();
  if (heading && heading.split(/\s+/).length <= 4 && !looksLikeGoalStubName(heading)) {
    return toTitleCase(heading);
  }
  return "";
}

export function inferProductName(goal: string, projectType?: string): string {
  const g = String(goal || "").replace(/\s+/g, " ").trim();
  const type = String(projectType || "").trim();
  const named = extractNamedBrand(g);
  if (named) return singleProductName(named);
  const domain = detectProductDomain(g, type);
  if (domain === "marketplace") {
    if (/\bbridgen\b/i.test(g)) return "Bridgen";
  }
  if (domain === "delivery") {
    const distilled = distillDeliveryName(g);
    if (distilled) return distilled;
  }
  const key = (g || type).toLowerCase();
  const h = stableHash(key || domain);
  const stems = STEMS[domain].filter((s) => s !== "Sparrow" || /\bsparrow\b/i.test(g));
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
  return HINTS[detectProductDomain(goal, projectType)];
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
  if (/^id$/i.test(n)) return true;
  if (/^Project type /i.test(n) || /\bproject type\b/i.test(n) || /\b(mobile|web) app primary\b/i.test(n)) {
    return true;
  }
  if (looksLikeEducationKitDefaultName(n, goal)) return true;
  if (/\?/.test(n)) return true;
  if (/^(who|what|where|when|why|how|do|does|should|can|is|are)\b/i.test(n)) return true;
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

/** Invented chip from an empty/general brief (Kite Studio, Nova Hub, …). */
export function looksLikeInventedChipName(name: string): boolean {
  const n = String(name || "").replace(/\s+/g, " ").trim();
  if (!n) return false;
  return /^(Lumen|Quill|Beacon|Sparrow|Nest|Forge|Pulse|Harbor|North|Relay|Vista|Peak|Bloom|Crumb|Oven|Loaf|Hearth|Grain|Nova|Aether|Helio|Kite|Mesa)\s+(Learn|Path|Tutor|Kids|Flow|Desk|Focus|Studio|Site|Bakery|Market|Shop|Hub|Courier|Drop|Run)\b/i.test(
    n,
  );
}

function inventedChipDomain(name: string): ProductDomain | null {
  if (!looksLikeInventedChipName(name)) return null;
  const stem = String(name || "").trim().split(/\s+/)[0] || "";
  if (!stem) return null;
  for (const domain of Object.keys(STEMS) as ProductDomain[]) {
    if (STEMS[domain].some((s) => s.toLowerCase() === stem.toLowerCase())) return domain;
  }
  return null;
}

/** Drop last workspace brand when this goal is a different product. */
export function identityFitsGoal(name: string, goal: string, projectType?: string): boolean {
  const domain = detectProductDomain(goal, projectType);
  const n = String(name || "").toLowerCase();
  if (!n) return false;
  const named = extractNamedBrand(goal);
  if (named && n !== named.toLowerCase()) return false;
  if (domain === "delivery" && looksLikeShopKitBrand(name)) return false;
  if (domain === "delivery" && /\b(bakery|crumb|loaf|breads?|wallet)\b/i.test(n)) return false;
  const inv = inventedChipDomain(name);
  if (inv) {
    if (named) return n === named.toLowerCase();
    if (inv === domain) return true;
    if (inv === "general" && domain === "general") return true;
    return false;
  }
  if (looksLikeEducationKitDefaultName(name, goal)) return false;
  if (domain !== "education" && /\b(tutor|sparrow)\b/.test(n) && !/\bsparrow\b/i.test(goal)) {
    return false;
  }
  return true;
}

export function buildProductIdentity(
  goal: string,
  projectType?: string,
  existingName?: string,
  userSet?: boolean,
): ProductIdentity {
  const named = extractNamedBrand(goal);
  let keepUserSet = Boolean(userSet);
  let prior = existingName?.trim() || "";
  if (named && prior.toLowerCase() !== named.toLowerCase()) {
    keepUserSet = false;
    prior = named;
  }
  const existingOk =
    Boolean(prior) &&
    !looksLikeGoalStubName(prior, goal) &&
    identityFitsGoal(prior, goal, projectType);
  const keep =
    keepUserSet && prior
      ? prior
      : existingOk
        ? prior
        : inferProductName(goal, projectType);
  const name = singleProductName(toTitleCase(keep));
  return {
    projectName: name,
    logoInitials: logoInitials(name),
    logoHint: logoHintFor(goal, projectType),
    userSet: keepUserSet,
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

function readSection1Goal(workspaceRoot: string): string {
  const root = String(workspaceRoot || "").trim();
  if (!root) return "";
  for (const rel of [
    path.join("nebulla-ide", "master-plan.json"),
    "master-plan.json",
    path.join("nebula-project", "master-plan.json"),
  ]) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
      const goal = String(rec["1. Goal of the app"] || rec.goal || "").trim();
      if (goal) return goal;
    } catch {
      /* next */
    }
  }
  return "";
}

export function readStoredProductIdentity(workspaceRoot: string): ProductIdentity | null {
  const abs = path.join(workspaceRoot, PRODUCT_IDENTITY_REL);
  if (!fs.existsSync(abs)) return null;
  try {
    return parseProductIdentity(JSON.parse(fs.readFileSync(abs, "utf8")));
  } catch {
    return null;
  }
}

export function readProductIdentity(workspaceRoot: string): ProductIdentity | null {
  const stored = readStoredProductIdentity(workspaceRoot);
  const goal = readSection1Goal(workspaceRoot);
  const locked = extractNamedBrand(goal);
  if (
    stored?.userSet &&
    stored.projectName &&
    !looksLikeGoalStubName(stored.projectName, goal) &&
    (!goal || identityFitsGoal(stored.projectName, goal))
  ) {
    return stored;
  }
  if (locked && (!stored || looksLikeGoalStubName(stored.projectName, goal) || !identityFitsGoal(stored.projectName, goal))) {
    return {
      projectName: locked,
      logoInitials: logoInitials(locked),
      logoHint: stored?.logoHint,
      userSet: false,
    };
  }
  return stored;
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
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${name} — Interactive preview</title>`);
  out = out.replace(
    /(<div style="font-weight:700;margin-top:4px">)([\s\S]*?)(<\/div>)/i,
    `$1${name}$3`,
  );
  if (/class="mark"/.test(out)) {
    out = out.replace(/(<span class="mark"[^>]*>)([\s\S]*?)(<\/span>)/i, `$1${initials}$3`);
  }
  return out;
}

function writeMasterPlanIfPresent(workspaceRoot: string, identity: ProductIdentity): void {
  const paths = [
    path.join(workspaceRoot, "nebulla-ide", "master-plan.json"),
    path.join(workspaceRoot, "master-plan.json"),
  ];
  for (const mp of paths) {
    if (!fs.existsSync(mp)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(mp, "utf8")) as Record<string, unknown>;
      const plan: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") plan[k] = v;
      }
      let changed = false;
      const { plan: next, changed: uxChanged } = patchMasterPlanProductName(plan, identity);
      Object.assign(plan, next);
      if (uxChanged) changed = true;
      const goal = String(plan["1. Goal of the app"] || "");
      if (goal.trim() && identity.projectName.trim()) {
        const nextGoal = replaceProductNameInGoal(goal, identity.projectName);
        if (nextGoal !== goal) {
          plan["1. Goal of the app"] = nextGoal;
          changed = true;
        }
      }
      if (!changed) continue;
      const merged = { ...raw, ...plan };
      fs.writeFileSync(mp, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    } catch {
      /* ignore */
    }
  }
}

function patchKnownPreviewFiles(workspaceRoot: string, identity: ProductIdentity): void {
  const codedRoot = [
    "app/page.tsx",
    "app/page.jsx",
    "src/app/page.tsx",
    "src/app/page.jsx",
  ].some((rel) => fs.existsSync(path.join(workspaceRoot, rel)));
  const rels = [
    "public/nebula-ui-gen-preview.html",
    ...(codedRoot ? [] : ["public/product-preview.html", "public/product-preview/index.html"]),
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
    /** New Project / new goal — ignore leftover userSet chip. */
    force?: boolean;
  },
): ProductIdentity {
  const storedOnDisk = readStoredProductIdentity(workspaceRoot);
  const existing = readProductIdentity(workspaceRoot);
  const goal = opts?.goal || "";
  const type = opts?.projectType;
  let briefBrand = "";
  try {
    const briefAbs = path.join(workspaceRoot, "nebula-project", "job-brief.md");
    if (fs.existsSync(briefAbs)) briefBrand = brandFromJobBriefMarkdown(fs.readFileSync(briefAbs, "utf8"));
  } catch {
    briefBrand = "";
  }
  const named = extractNamedBrand(goal) || briefBrand || "";
  const existingFits =
    Boolean(existing?.projectName) &&
    !looksLikeGoalStubName(existing.projectName, goal) &&
    identityFitsGoal(existing.projectName, goal, type);
  if (
    existing?.userSet &&
    existing.projectName &&
    opts?.userSet !== true &&
    opts?.force !== true &&
    existingFits
  ) {
    return existing;
  }
  if (opts?.userSet && opts.projectName?.trim()) {
    const built = buildProductIdentity(goal, type, opts.projectName, true);
    if (opts.persist !== false && workspaceRoot) return writeProductIdentity(workspaceRoot, built);
    return built;
  }
  const offered = opts?.projectName?.trim() || "";
  const offeredFits = Boolean(offered) && identityFitsGoal(offered, goal, type);
  const candidate =
    named ||
    (existingFits ? existing!.projectName : "") ||
    (offeredFits ? offered : "") ||
    "";
  const built = buildProductIdentity(
    goal,
    type,
    candidate,
    opts?.force ? false : existing?.userSet,
  );
  const diskName = String(storedOnDisk?.projectName || "").trim();
  const needsWrite =
    opts?.force === true ||
    !existing ||
    looksLikeGoalStubName(existing.projectName, goal) ||
    !identityFitsGoal(existing.projectName, goal, type) ||
    existing.projectName !== built.projectName ||
    existing.logoInitials !== built.logoInitials ||
    (Boolean(diskName) && diskName.toLowerCase() !== built.projectName.toLowerCase());
  if (needsWrite && opts?.persist !== false && workspaceRoot) {
    const keepUserSet =
      Boolean(storedOnDisk?.userSet) &&
      diskName.toLowerCase() === built.projectName.toLowerCase();
    return writeProductIdentity(workspaceRoot, {
      ...built,
      userSet: opts?.force ? false : keepUserSet || Boolean(opts?.userSet),
    });
  }
  return existing && !needsWrite ? existing : built;
}
