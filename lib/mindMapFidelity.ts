/**
 * Mind Map must be a subset of Master Plan §4 (Rule MM-1).
 * Authority: nebula-project/project-execution-rules.md
 */
import {
  readMasterPlanStrictMode,
  type MasterPlanGap,
  type MasterPlanStrictMode,
} from "./masterPlanCompleteness";

function normalizeRoute(route: string): string {
  let r = route.trim().replace(/\/+/g, "/");
  if (!r.startsWith("/")) r = `/${r}`;
  if (r.length > 1 && r.endsWith("/")) r = r.slice(0, -1);
  return r.toLowerCase();
}

/** Routes declared in Master Plan §4 (backtick paths + common plain paths). */
export function section4RoutesFromPlan(plan: Record<string, string>): string[] {
  const section = String(plan["4. Pages and navigation"] ?? "").trim();
  if (!section) return [];
  const routes = new Set<string>();
  for (const m of section.matchAll(/`(\/[^`]+)`/g)) {
    routes.add(normalizeRoute(m[1]!));
  }
  // Plain paths: allow digit/underscore first segment (`/2fa`, `/_secret`), not only letters.
  for (const m of section.matchAll(/(?:^|[\s(])(\/[A-Za-z0-9_][\w\-./:{}\*]*)/g)) {
    const r = m[1]!;
    if (!r.includes(" ")) routes.add(normalizeRoute(r));
  }
  return [...routes];
}

/** Extract route from mind-map page node (description "Route: /x" or data.route). */
export function routeFromMindMapPage(page: unknown): string | null {
  if (!page || typeof page !== "object") return null;
  const p = page as {
    data?: { description?: string; route?: string; label?: string };
    route?: string;
  };
  const direct = p.route || p.data?.route;
  if (typeof direct === "string" && direct.trim().startsWith("/")) {
    return normalizeRoute(direct);
  }
  const desc = String(p.data?.description ?? "");
  const m = desc.match(/Route:\s*(`?)(\/[^`\s]+)\1/i);
  if (m?.[2]) return normalizeRoute(m[2]);
  return null;
}

export type MindMapFidelityResult = {
  ok: boolean;
  mode: MasterPlanStrictMode;
  /** Routes on the mind map that are not in §4 */
  extraRoutes: string[];
  /** §4 routes missing from the mind map (informational) */
  missingFromMap: string[];
  section4Routes: string[];
  gaps: MasterPlanGap[];
  /** Whether product should reject a PUT that invents pages */
  allowWrite: boolean;
};

export function assessMindMapSubsetOfSection4(opts: {
  plan: Record<string, string>;
  mindMapPages: unknown[];
  mode?: MasterPlanStrictMode;
}): MindMapFidelityResult {
  const mode = opts.mode ?? readMasterPlanStrictMode();
  const section4Routes = section4RoutesFromPlan(opts.plan);
  const allowed = new Set(section4Routes);
  const gaps: MasterPlanGap[] = [];

  const mapRoutes: string[] = [];
  for (const page of opts.mindMapPages) {
    const r = routeFromMindMapPage(page);
    if (r) mapRoutes.push(r);
  }

  const extraRoutes =
    allowed.size === 0 ? [] : [...new Set(mapRoutes.filter((r) => !allowed.has(r)))];

  const missingFromMap =
    allowed.size === 0 ? [] : section4Routes.filter((r) => !mapRoutes.includes(r));

  if (extraRoutes.length > 0) {
    gaps.push({
      code: "MINDMAP_EXTRA_ROUTES",
      section: "4. Pages and navigation",
      severity: "block",
      message: `Mind Map has route(s) not in §4: ${extraRoutes.slice(0, 8).join(", ")}`,
      remediation: "Re-sync Mind Map from Master Plan §4 only — do not invent pages.",
    });
  }

  const hasBlock = gaps.some((g) => g.severity === "block");
  const allowWrite = mode === "off" || mode === "warn" ? true : !hasBlock;

  return {
    ok: mode === "strict" ? !hasBlock : true,
    mode,
    extraRoutes,
    missingFromMap,
    section4Routes,
    gaps,
    allowWrite,
  };
}
