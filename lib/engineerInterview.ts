/**
 * Senior-engineer private interview — Grok fills Master Plan from this, not a kit.
 * Answers live in §1–§5 + nebula-project/job-brief.md. No extra user questions mid-build.
 */

import fs from "fs";
import path from "path";
import { extractNamedBrand, inferProductName } from "./productIdentity";

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
Do not ask for API keys before the mock product exists.`;

export type ApiNeed = "maps" | "payments" | "push" | "sms" | "messaging";

const API_LABEL: Record<ApiNeed, string> = {
  maps: "Maps (live track)",
  payments: "Payments (card / Apple Pay / Google Pay)",
  push: "Push notifications",
  sms: "SMS",
  messaging: "Messaging",
};

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

/** One follow-up after Live exists. Never before apply. From job-brief vendors — no hardcoded Maps kit. */
export function buildPostApplyApiAsk(opts: { goal?: string; pages?: string; brief?: string }): string {
  const goal = sanitizeBriefForApiAsk(opts.goal || "");
  const needs = inferApiNeeds(goal, opts.pages || "", opts.brief || "");
  const list = (needs.length ? needs : (["messaging"] as ApiNeed[])).map((n) => API_LABEL[n]).join(", ");
  return [
    "These APIs would make the mocks real: " + list + ".",
    "Paste keys or say keep mock.",
  ].join(" ");
}

export function userNoteHasVendorKey(text: string): boolean {
  const t = String(text || "");
  return (
    /\b(sk_live_|sk_test_|pk_live_|pk_test_)/.test(t) ||
    /\b(AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|pk\.[a-zA-Z0-9]{20,})/.test(t) ||
    /\b(MAPBOX|STRIPE_SECRET|GOOGLE_MAPS_API_KEY|TWILIO_AUTH)\b/.test(t)
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
