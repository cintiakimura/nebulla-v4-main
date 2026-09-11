/**
 * Detect a new product brief vs leftover Master Plan / routes.
 * Client-safe — no fs.
 */

import { detectProductDomain, extractNamedBrand } from "./productIdentity";
import { extractGoalFromUserNote, isCodingCommandNote } from "./spineSequenceClient";

export const EDUCATION_LEFTOVER_SLUGS = new Set([
  "session",
  "practice",
  "helper",
  "lessons",
  "lesson",
  "streak",
  "quiz",
  "progress",
  "teacher",
  "parent",
  "homework",
  "tutor",
]);

export const BIKE_SHOP_SLUGS = new Set(["book", "mechanic", "catalog", "cart"]);
export const BAKERY_LEFTOVER_SLUGS = new Set(["order", "baker", "confirmation", "wallet", "catalog", "cart"]);

function routeSlug(route: string): string {
  const s = String(route || "").trim();
  if (!s || s === "/") return "";
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  return withSlash.replace(/\/+$/, "").replace(/^\//, "").split("/")[0]?.toLowerCase() || "";
}

export function leftoverRoutesConflictWithGoal(goal: string, routes: string[]): boolean {
  const domain = detectProductDomain(goal);
  const slugs = (routes || []).map(routeSlug).filter(Boolean);
  const g = String(goal || "").toLowerCase();
  const delivery = /moto|motodrop|courier|delivery|dropoff|parcel/.test(g);
  if (domain !== "education" && slugs.some((s) => EDUCATION_LEFTOVER_SLUGS.has(s))) {
    return true;
  }
  if (domain === "education" && slugs.some((s) => BIKE_SHOP_SLUGS.has(s))) {
    return true;
  }
  if (delivery && slugs.some((s) => BAKERY_LEFTOVER_SLUGS.has(s) || BIKE_SHOP_SLUGS.has(s))) {
    return true;
  }
  return false;
}

/** New Fast Prototype / New Project brief — not Continue / next slice. */
export function looksLikeStandaloneProductBrief(text: string): boolean {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const goal = extractGoalFromUserNote(raw);
  if (!goal || goal.length < 20) return false;
  if (isCodingCommandNote(raw) && !goal) return false;
  if (/^(continue|continue\.|continue!|build\s+next|next\s+slice)\b/i.test(raw)) return false;
  if (extractNamedBrand(goal)) return true;
  return /\b(build|shop|marketplace|companion|bike|bakery|mechanic|moto|courier|delivery|parcel|uber|dropoff|app that|for (kids|parents|customers|readers|riders|senders))\b/i.test(
    goal,
  );
}

/** True when the incoming brief is a different product than leftover §1 (or leftover tabs). */
export function isReplacementProductBrief(incoming: string, existing: string): boolean {
  const next = String(incoming || "").replace(/\s+/g, " ").trim();
  const prev = String(existing || "").replace(/\s+/g, " ").trim();
  if (!next || !prev) return false;
  const nextBrand = extractNamedBrand(next);
  const prevBrand = extractNamedBrand(prev);
  if (nextBrand && prevBrand && nextBrand.toLowerCase() !== prevBrand.toLowerCase()) {
    return true;
  }
  const nextDomain = detectProductDomain(next);
  const prevDomain = detectProductDomain(prev);
  if (nextDomain !== "general" && prevDomain !== "general" && nextDomain !== prevDomain) {
    return true;
  }
  if (nextBrand && prevBrand) return false;
  if (leftoverRoutesConflictWithGoal(next, extractRouteTokens(prev))) return true;
  return false;
}

function extractRouteTokens(text: string): string[] {
  const out: string[] = [];
  const re = /`(\/[^`\s]+)`|href=["'](\/[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || "")))) {
    out.push(m[1] || m[2] || "");
  }
  return out;
}

export function leftoverPlanConflictsWithGoal(plan: Record<string, unknown> | null | undefined): boolean {
  const rec = plan && typeof plan === "object" ? plan : {};
  const goal = String(rec["1. Goal of the app"] || rec.goal || "").trim();
  if (!goal) return false;
  const rest = [
    String(rec["2. Tech and Research"] || rec["2. Text & Search"] || ""),
    String(rec["3. Features and KPIs"] || ""),
    String(rec["4. Pages and navigation"] || ""),
    String(rec["5. UI/UX design"] || ""),
  ]
    .join("\n")
    .trim();
  if (!rest) return false;
  if (isReplacementProductBrief(goal, rest)) return true;
  const routes = extractRouteTokens(String(rec["4. Pages and navigation"] || ""));
  return leftoverRoutesConflictWithGoal(goal, routes);
}
