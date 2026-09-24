/**
 * Senior-engineer private interview — Grok fills Master Plan from this, not a kit.
 * Answers live in §1–§5 + nebula-project/job-brief.md. No extra user questions mid-build.
 */

import fs from "fs";
import path from "path";
import { extractNamedBrand, inferProductName } from "./productIdentity";
import { isDocumentWorkflowGoal, lockRequiresSignedInRoles } from "./nebulaUiBrief";
import { isPokerWorkflowGoal } from "./productGoalFingerprint";

export const JOB_BRIEF_REL = "nebula-project/job-brief.md";
export const JOB_BRIEF_REL_ALT = "nebulla-project/job-brief.md";

/** Injected into Fast Prototype bootstrap, system prompt, and Go appendix. */
export const ENGINEER_INTERVIEW_PROMPT = `ENGINEER INTERVIEW (private — do not ask the user these mid-build):
You are a senior product engineer who just received a client brief. Run this interview yourself, then write the answers into Master Plan tags + \`\`\`file:nebula-project/job-brief.md\`\`\`.
1. Thesis: this product in one sentence. If they said "like Uber/Uber Eats", change the noun (courier / kitchen / shop) — copy the operating loop, not 40 extras.
2. Actors + the one loop that makes it that product (request→accept→track, browse→book, start practice→score).
3. Must-have now vs later. Later stays out of §4 this Go.
4. Screens (about 5–7): name, what's on each, primary action, route \`/…\`.
5. Vendors (maps live track, card/Apple/Google Pay, push, SMS): each = mock | needs key. Default = honest mock this build.
6. Ready = that loop works in local data (lib/mockStore.ts) even if pin/pay/push is fake.
Optional tool/web lookup only when a fact is missing (typical IA, how fares are quoted, which vendors exist). Stop when the interview is answered. Not a competitor dossier.
Map answers: §1 thesis/actors/loop · §2–3 must-have, later, vendors as mock|needs key + what you'll ask after Live · §4 screens/fields/buttons only · §5 visual tokens.
Do not hard-code another industry's kit. Do not emit Stripe/Firebase/Supabase/Mapbox/Twilio SDKs unless the user named that vendor or pasted a key.
Do not ask for API keys before the mock product exists.
If Slot 4 classified extract as client-side / Tesseract / on-device, do NOT ask for an OCR API key. Super Admin env panel is optional after the loop exists.`;

export type ApiNeed = "maps" | "payments" | "push" | "sms" | "messaging";

const API_LABEL: Record<ApiNeed, string> = {
  maps: "Maps (live track)",
  payments: "Payments (card / Apple Pay / Google Pay)",
  push: "Push notifications",
  sms: "SMS",
  messaging: "Messaging",
};

/** Slot 4 catalog row — only emit when the lock actually classified it. */
export type Slot4CatalogNeed =
  | "extract"
  | "files"
  | "auth"
  | "email"
  | "payments"
  | "maps"
  | "push"
  | "sms"
  | "messaging";

export type Slot4CatalogRow = {
  need: Slot4CatalogNeed;
  label: string;
  weShip: string;
  envNames: string[];
  where: string;
  requiresPaidKey: boolean;
};

export const SUPER_ADMIN_ENV_REL = "nebulla-ide/super-admin-env.json";
export const WORKSPACE_ENV_LOCAL_REL = ".env.local";

const CATALOG_ENV_NAMES = [
  "OCR_PROVIDER",
  "GOOGLE_VISION_KEY",
  "S3_BUCKET",
  "S3_KEY",
  "S3_SECRET",
  "AUTH_SECRET",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "MAPBOX_TOKEN",
  "ONESIGNAL_REST_API_KEY",
  "TWILIO_AUTH_TOKEN",
] as const;

/** Strip interview/bootstrap laundry lists so “maps / SMS” examples are not the ask. */
export function sanitizeBriefForApiAsk(text: string): string {
  let t = String(text || "");
  const quoted = t.match(/User goal \/ brief:\s*"""([\s\S]*?)"""/i)?.[1];
  if (quoted?.trim()) return quoted.trim();
  t = t.replace(
    /ENGINEER INTERVIEW[\s\S]*?Do not ask for API keys before the mock product exists\.?/gi,
    " ",
  );
  t = t.replace(/FAST PROTOTYPE MODE\./gi, " ");
  t = t.replace(/Vendors \([^)]{0,120}SMS[^)]*\)[^\n]*/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}

export function parseVendorsFromJobBrief(brief: string): ApiNeed[] {
  const text = String(brief || "");
  const section = text.match(/##\s*Vendors\s*([\s\S]*?)(?:\n##\s|$)/i)?.[1] || text;
  const needs: ApiNeed[] = [];
  const add = (n: ApiNeed) => {
    if (!needs.includes(n)) needs.push(n);
  };
  for (const line of section.split("\n")) {
    const l = line.toLowerCase();
    if (!/mock|needs key|needs-key/.test(l)) continue;
    if (/\bmaps?\b|live track|gps/.test(l)) add("maps");
    if (/\bpayments?\b|stripe|apple pay|google pay|card\b/.test(l)) add("payments");
    if (/\bpush\b/.test(l)) add("push");
    if (/\bsms\b|twilio/.test(l)) add("sms");
    if (/\bmessag/.test(l) && !/\bsms\b/.test(l)) add("messaging");
  }
  return needs;
}

export function inferApiNeeds(goal: string, pages = "", brief = ""): ApiNeed[] {
  const fromBrief = parseVendorsFromJobBrief(brief);
  if (fromBrief.length) return fromBrief;
  const blob = sanitizeBriefForApiAsk(`${goal} ${pages}`).toLowerCase();
  const needs: ApiNeed[] = [];
  const creator = /\b(creator|influencer|outreach|portfolio)\b/.test(blob) || /\bbrands?\b.*\bmarketplace\b/.test(blob);
  const delivery = /\b(moto|motodrop|courier|delivery|dropoff|parcel)\b/.test(blob);
  if (/\b(map|gps|live location|live track)\b/.test(blob) || delivery) needs.push("maps");
  if (/\b(wallet|checkout|stripe|apple pay|google pay|fare)\b/.test(blob) || (delivery && /\bpay\b/.test(blob))) {
    needs.push("payments");
  }
  if (creator && /\b(prices?|pricing|rates?|budget)\b/.test(blob)) needs.push("payments");
  if (/\b(push|onesignal)\b/.test(blob) || delivery) needs.push("push");
  if (/\b(sms|twilio)\b/.test(blob)) needs.push("sms");
  if (creator || /\b(message|inbox|outreach|dm)\b/.test(blob)) needs.push("messaging");
  return [...new Set(needs)];
}

export function isClientSideExtractClassified(text?: string | null): boolean {
  return /\b(tesseract|client[- ]?side extract|on[- ]?device extract|local extract|we[- ]?build.{0,40}extract)\b/i.test(
    String(text || ""),
  );
}

function lockBlob(opts: { goal?: string; pages?: string; brief?: string; tech?: string }): string {
  return sanitizeBriefForApiAsk(`${opts.goal || ""} ${opts.pages || ""} ${opts.brief || ""} ${opts.tech || ""}`);
}

function askedEmail(blob: string): boolean {
  return /\b(resend|transactional email|status email|send email|email status)\b/i.test(blob);
}

function askedPayments(blob: string, vendorNeeds: ApiNeed[]): boolean {
  return vendorNeeds.includes("payments") || /\b(stripe|checkout|apple pay|google pay|wallet)\b/i.test(blob);
}

function productMessages(blob: string, vendorNeeds: ApiNeed[]): boolean {
  if (vendorNeeds.includes("messaging") || vendorNeeds.includes("sms")) return true;
  return /\b(creator|influencer|outreach|inbox|dm\b|messages?\b)\b/i.test(blob);
}

/** Slot 4 → catalog rows. Never invent Messaging on a product that does not message. */
export function inferSlot4Catalog(opts: { goal?: string; pages?: string; brief?: string; tech?: string }): Slot4CatalogRow[] {
  const goal = sanitizeBriefForApiAsk(opts.goal || "");
  const pages = opts.pages || "";
  const brief = opts.brief || "";
  const tech = opts.tech || "";
  const blob = lockBlob({ goal, pages, brief, tech });
  const vendorNeeds = inferApiNeeds(goal, pages, brief);
  if (isPokerWorkflowGoal(goal) && !/\b(upload|ocr|tesseract|s3|scans?)\b/i.test(goal)) {
    return [];
  }
  const extractLocked =
    isDocumentWorkflowGoal(goal) ||
    (isDocumentWorkflowGoal(`${goal} ${pages}`) &&
      /\b(ocr|tesseract|extract text|client[- ]?side extract|dossiers?|scans?)\b/i.test(goal));
  const filesLocked =
    extractLocked ||
    (/\b(s3|r2|storage|keep documents?|files?\b|uploads?)\b/i.test(blob) && !isPokerWorkflowGoal(goal));
  const authLocked =
    extractLocked ||
    lockRequiresSignedInRoles(goal, pages) ||
    /\b(mock roles?|signed-?in roles?|auth)\b/i.test(blob);
  const tesseract = isClientSideExtractClassified(blob);
  const visionAsked = /\b(google vision|vision api|cloud ocr)\b/i.test(blob);
  const rows: Slot4CatalogRow[] = [];

  if (extractLocked) {
    rows.push({
      need: "extract",
      label: "Extract text",
      weShip: tesseract
        ? "Tesseract in-browser (no key)"
        : visionAsked
          ? "Vision OCR (optional) or Tesseract in-browser (no key)"
          : "Tesseract in-browser (no key) or Vision",
      envNames: ["OCR_PROVIDER", "GOOGLE_VISION_KEY"],
      where: "console.cloud.google.com",
      requiresPaidKey: false,
    });
  }
  if (filesLocked) {
    rows.push({
      need: "files",
      label: "Files",
      weShip: "local now; S3 / R2 later",
      envNames: ["S3_BUCKET", "S3_KEY", "S3_SECRET"],
      where: "AWS / Cloudflare",
      requiresPaidKey: false,
    });
  }
  if (authLocked) {
    rows.push({
      need: "auth",
      label: "Auth",
      weShip: "mock roles now; real later",
      envNames: ["AUTH_SECRET"],
      where: "generated",
      requiresPaidKey: false,
    });
  }
  if (askedEmail(blob)) {
    rows.push({
      need: "email",
      label: "Email / status",
      weShip: "optional",
      envNames: ["RESEND_API_KEY"],
      where: "resend.com",
      requiresPaidKey: false,
    });
  }
  if (askedPayments(blob, vendorNeeds)) {
    rows.push({
      need: "payments",
      label: "Payments",
      weShip: "mock now; Stripe only if they asked",
      envNames: ["STRIPE_SECRET_KEY"],
      where: "dashboard.stripe.com",
      requiresPaidKey: true,
    });
  }
  if (vendorNeeds.includes("maps")) {
    rows.push({
      need: "maps",
      label: "Maps (live track)",
      weShip: "mock pin now; live track later",
      envNames: ["MAPBOX_TOKEN"],
      where: "account.mapbox.com",
      requiresPaidKey: true,
    });
  }
  if (vendorNeeds.includes("push")) {
    rows.push({
      need: "push",
      label: "Push notifications",
      weShip: "mock now",
      envNames: ["ONESIGNAL_REST_API_KEY"],
      where: "onesignal.com",
      requiresPaidKey: true,
    });
  }
  if (vendorNeeds.includes("sms")) {
    rows.push({
      need: "sms",
      label: "SMS",
      weShip: "mock now",
      envNames: ["TWILIO_AUTH_TOKEN"],
      where: "twilio.com",
      requiresPaidKey: true,
    });
  }
  if (productMessages(blob, vendorNeeds) && !vendorNeeds.includes("sms")) {
    rows.push({
      need: "messaging",
      label: "Messaging",
      weShip: "mock inbox now",
      envNames: [],
      where: "in-app thread (no vendor until they ask)",
      requiresPaidKey: false,
    });
  }
  return rows;
}

export function formatSlot4CatalogAskLine(row: Slot4CatalogRow): string {
  const env = row.envNames.length ? row.envNames.join(", ") : "none";
  return `${row.label} — ${row.weShip} — ${env} — ${row.where}`;
}

export function buildSuperAdminEnvPanel(rows: Slot4CatalogRow[]): {
  title: string;
  note: string;
  fields: Slot4CatalogRow[];
} {
  return {
    title: "Super Admin — env wiring (optional after the loop)",
    note: "Fields are for later paste. They do not replace extract/save. Filled values go to workspace .env.local only — never the Master Plan, never client JS.",
    fields: rows,
  };
}

export function writeSuperAdminEnvPanel(
  workspaceRoot: string,
  rows: Slot4CatalogRow[],
): { rel: string; written: boolean } {
  const rel = SUPER_ADMIN_ENV_REL;
  const abs = path.join(workspaceRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const body = JSON.stringify(buildSuperAdminEnvPanel(rows), null, 2);
  const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  if (prev === body) return { rel, written: false };
  fs.writeFileSync(abs, body, "utf8");
  return { rel, written: true };
}

export function parsePastedEnvAssignments(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const src = String(text || "");
  const named = new RegExp(
    `\\b(${CATALOG_ENV_NAMES.join("|")})\\s*[=:]\\s*["']?([^\\s"'\\n]+)["']?`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = named.exec(src))) {
    out[m[1].toUpperCase()] = m[2].trim();
  }
  const stripe = src.match(/\b(sk_(?:test|live)_[A-Za-z0-9]+)/);
  if (stripe && !out.STRIPE_SECRET_KEY) out.STRIPE_SECRET_KEY = stripe[1];
  return out;
}

function parseEnvLocalFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function serializeEnvLocal(values: Record<string, string>): string {
  return (
    Object.keys(values)
      .sort()
      .map((k) => `${k}=${values[k]}`)
      .join("\n") + (Object.keys(values).length ? "\n" : "")
  );
}

/** Merge filled keys into workspace `.env.local` only. */
export function writeWorkspaceEnvLocal(
  workspaceRoot: string,
  values: Record<string, string>,
): { rel: string; wrote: string[] } {
  const wrote: string[] = [];
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(values || {})) {
    const key = String(k || "").trim();
    const val = String(v || "").trim();
    if (!key || !val) continue;
    if (/master-plan/i.test(key) || /master-plan/i.test(val)) continue;
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    clean[key] = val;
    wrote.push(key);
  }
  if (!wrote.length) return { rel: WORKSPACE_ENV_LOCAL_REL, wrote: [] };
  const abs = path.join(workspaceRoot, WORKSPACE_ENV_LOCAL_REL);
  if (path.basename(abs) !== ".env.local") {
    return { rel: WORKSPACE_ENV_LOCAL_REL, wrote: [] };
  }
  const prev = fs.existsSync(abs) ? parseEnvLocalFile(fs.readFileSync(abs, "utf8")) : {};
  const next = { ...prev, ...clean };
  fs.writeFileSync(abs, serializeEnvLocal(next), "utf8");
  return { rel: WORKSPACE_ENV_LOCAL_REL, wrote };
}

export function generateAuthSecret(): string {
  return `auth_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** One follow-up after Live exists. Catalog rows from the Slot 4 lock — never a Messaging shrug. */
export function buildPostApplyApiAsk(opts: {
  goal?: string;
  pages?: string;
  brief?: string;
  tech?: string;
}): string {
  const rows = inferSlot4Catalog(opts);
  const tesseract = isClientSideExtractClassified(lockBlob(opts));
  const lines = rows.map((r) => formatSlot4CatalogAskLine(r));
  const extract = rows.find((r) => r.need === "extract");
  const header = "First version is on Live, mock only.";
  const closer =
    "Ask once per lock: keep the default we ship, or paste a value for Super Admin env (workspace .env.local). Super Admin does not replace extract/save.";
  const tessNote = tesseract
    ? "Tesseract is the locked we-build — no Vision key required to ship the first extract loop."
    : "";
  if (!lines.length) {
    return [header, "No unclassified vendor keys for this lock. Keep mock.", closer].join(" ");
  }
  return [header, tessNote, lines.join(". "), closer].filter(Boolean).join(" ");
}

export function userNoteHasVendorKey(text: string): boolean {
  const t = String(text || "");
  return (
    Object.keys(parsePastedEnvAssignments(t)).length > 0 ||
    /\b(sk_live_|sk_test_|pk_live_|pk_test_)/.test(t) ||
    /\b(AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|pk\.[a-zA-Z0-9]{20,})/.test(t) ||
    /\b(MAPBOX|STRIPE_SECRET|GOOGLE_MAPS_API_KEY|TWILIO_AUTH|GOOGLE_VISION_KEY|RESEND_API_KEY)\b/.test(t)
  );
}

export function userNamedVendor(text: string): boolean {
  return /\b(stripe|mapbox|google maps|firebase|supabase|twilio|onesignal|apple pay|google pay)\b/i.test(
    String(text || ""),
  );
}

export function buildJobBriefMarkdown(opts: {
  goal: string;
  pages?: string;
  features?: string;
  tech?: string;
}): string {
  const goal = String(opts.goal || "").trim();
  const pages = String(opts.pages || "").trim();
  const features = String(opts.features || "").trim();
  const tech = String(opts.tech || "").trim();
  const thesis = goal.split(/\n/).find((l) => l.trim() && !/^#|^\*\*Product name/i.test(l)) || goal.slice(0, 240);
  const productName = extractNamedBrand(goal) || inferProductName(goal);
  const delivery = /\b(moto|motodrop|courier|delivery|dropoff|pickup|parcel)\b/i.test(`${goal} ${pages}`);
  const creator = /\b(creator|influencer|outreach|portfolio)\b/i.test(`${goal} ${pages}`);
  const shop = /\b(shop|store|bike|spoke|baker|catalog|book)\b/i.test(`${goal} ${pages}`) && !creator;
  const education = /\b(lesson|practice|teacher|student|reading|tutor)\b/i.test(`${goal} ${pages}`);
  const loop = delivery
    ? "request → accept → track → pay (mock)"
    : creator
      ? "discover → outreach → message (decline on the thread)"
      : shop
        ? "browse → book/order → mark ready"
        : education
          ? "start practice → score on Teacher/Progress"
          : "primary action → list updates";
  const vendorLines = inferApiNeeds(goal, pages)
    .map((n) => `- ${API_LABEL[n]}: mock`)
    .join("\n");
  const vendors =
    vendorLines ||
    (creator ? "- Messaging: mock\n- Payments (card / Apple Pay / Google Pay): mock" : "- payments: mock");
  return [
    "# Job brief",
    "",
    "## Product name",
    productName,
    "",
    "## Thesis",
    thesis.replace(/\s+/g, " ").trim().slice(0, 400),
    "",
    "## Loop",
    loop,
    "",
    "## Must-have now",
    features ? features.slice(0, 800) : "The loop above on §4 screens with lib/mockStore.ts.",
    "",
    "## Later",
    "Live vendor SDKs after keys.",
    "",
    "## Screens",
    pages ? pages.slice(0, 1600) : "(from §4)",
    "",
    "## Vendors",
    vendors,
    "",
    "## Tech notes",
    tech ? tech.slice(0, 600) : "Default honest mock this build.",
    "",
  ].join("\n");
}

export function writeJobBriefFromPlan(
  workspaceRoot: string,
  plan: Record<string, unknown>,
): { rel: string; written: boolean } {
  const goal = String(plan["1. Goal of the app"] || plan.goal || "").trim();
  if (!goal) return { rel: JOB_BRIEF_REL, written: false };
  const body = buildJobBriefMarkdown({
    goal,
    pages: String(plan["4. Pages and navigation"] || ""),
    features: String(plan["3. Features and KPIs"] || ""),
    tech: String(plan["2. Tech and Research"] || ""),
  });
  const abs = path.join(workspaceRoot, JOB_BRIEF_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  const catalog = inferSlot4Catalog({
    goal,
    pages: String(plan["4. Pages and navigation"] || ""),
    brief: body,
    tech: String(plan["2. Tech and Research"] || ""),
  });
  writeSuperAdminEnvPanel(workspaceRoot, catalog);
  if (catalog.some((r) => r.need === "auth")) {
    const existing = path.join(workspaceRoot, WORKSPACE_ENV_LOCAL_REL);
    const already = fs.existsSync(existing)
      ? parseEnvLocalFile(fs.readFileSync(existing, "utf8"))
      : {};
    if (!already.AUTH_SECRET) {
      writeWorkspaceEnvLocal(workspaceRoot, { AUTH_SECRET: generateAuthSecret() });
    }
  }
  if (prev === body) return { rel: JOB_BRIEF_REL, written: false };
  fs.writeFileSync(abs, body, "utf8");
  return { rel: JOB_BRIEF_REL, written: true };
}

export function readJobBrief(workspaceRoot: string): string {
  for (const rel of [JOB_BRIEF_REL, JOB_BRIEF_REL_ALT]) {
    const abs = path.join(workspaceRoot, rel);
    if (fs.existsSync(abs)) {
      try {
        return fs.readFileSync(abs, "utf8");
      } catch {
        /* skip */
      }
    }
  }
  return "";
}

/** Thesis/loop in the brief must match generated routes (courier ≠ bakery/practice). */
export function jobBriefFitsRoutes(brief: string, routes: string[]): boolean {
  const b = String(brief || "").toLowerCase();
  const joined = routes.join(" ").toLowerCase();
  if (/request → accept|courier|delivery|pickup/.test(b)) {
    if (/\/practice|breads\.json|\/catalog|\/wallet/.test(joined)) return false;
    return routes.some((r) => /request/i.test(r));
  }
  if (/browse → book|catalog|ready bikes|loaves/.test(b)) {
    if (/\/request|\/practice/.test(joined)) return false;
    return routes.some((r) => /book|order|catalog|mechanic/i.test(r));
  }
  if (/start practice|teacher/.test(b)) {
    return routes.some((r) => /practice|teacher|progress/i.test(r));
  }
  return true;
}

export function looksLikeVendorSdkPath(rel: string): boolean {
  return /(?:^|\/)(?:lib\/)?(?:stripe|mapbox|twilio|firebase|supabase)(?:\/|\.(ts|tsx|js|jsx))?$/i.test(
    String(rel || "").replace(/\\/g, "/"),
  );
}
