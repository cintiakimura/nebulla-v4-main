/**
 * Senior-engineer private interview — Grok fills Master Plan from this, not a kit.
 * Answers live in §1–§5 + nebula-project/job-brief.md. No extra user questions mid-build.
 */

import fs from "fs";
import path from "path";

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

export type ApiNeed = "maps" | "payments" | "push" | "sms";

export function inferApiNeeds(goal: string, pages = ""): ApiNeed[] {
  const blob = `${goal} ${pages}`.toLowerCase();
  const needs: ApiNeed[] = [];
  if (/\b(map|track|gps|live location|pickup|dropoff|courier|delivery|moto)\b/.test(blob)) {
    needs.push("maps");
  }
  if (/\b(pay|wallet|card|checkout|stripe|apple pay|google pay|fare|price)\b/.test(blob)) {
    needs.push("payments");
  }
  if (/\b(push|notify|notification|alert)\b/.test(blob) || /\b(courier|delivery|moto|request)\b/.test(blob)) {
    needs.push("push");
  }
  if (/\b(sms|text message|otp|twilio)\b/.test(blob)) needs.push("sms");
  return [...new Set(needs)];
}

const API_LABEL: Record<ApiNeed, string> = {
  maps: "Maps (live track)",
  payments: "Payments (card / Apple Pay / Google Pay)",
  push: "Push notifications",
  sms: "SMS",
};

/** One follow-up after Live exists. Never before apply. */
export function buildPostApplyApiAsk(opts: { goal?: string; pages?: string }): string {
  const needs = inferApiNeeds(opts.goal || "", opts.pages || "");
  const list = (needs.length ? needs : (["maps", "payments", "push"] as ApiNeed[]))
    .map((n) => API_LABEL[n])
    .join(", ");
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
  const delivery = /\b(moto|motodrop|courier|delivery|dropoff|pickup)\b/i.test(`${goal} ${pages}`);
  const shop = /\b(shop|store|bike|spoke|baker|catalog|book)\b/i.test(`${goal} ${pages}`);
  const education = /\b(lesson|practice|teacher|student|reading|tutor)\b/i.test(`${goal} ${pages}`);
  const loop = delivery
    ? "request → accept → track → pay (mock)"
    : shop
      ? "browse → book/order → mark ready"
      : education
        ? "start practice → score on Teacher/Progress"
        : "primary action → list updates";
  const vendors = inferApiNeeds(goal, pages)
    .map((n) => `- ${API_LABEL[n]}: mock`)
    .join("\n");
  return [
    "# Job brief",
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
    vendors || "- maps / payments / push: mock",
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
    if (/\/practice|breads\.json|\/catalog/.test(joined)) return false;
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
