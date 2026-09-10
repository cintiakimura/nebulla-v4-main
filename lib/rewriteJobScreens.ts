/**
 * After Foundation, replace generic stub screens with this product's job fields.
 */

import fs from "fs";
import path from "path";
import { extractNamedRoutesFromPagesText, seedPagesFromGoal } from "./nebulaUiBrief";
import { extractNamedBrand, inferProductName, productNameFromPlan, readProductIdentity } from "./productIdentity";
import {
  buildNonEducationHomePage,
  isEducationProductGoal,
  looksLikeGenericContinueHome,
} from "./rewriteEducationKitHome";

const GENERIC_STUB_RE =
  /Interactive screen with mock data|Primary action works locally|Continue<\/button>/i;
const LEFTOVER_COPY_RE =
  /breads\.json|Today'?s breads|bikeStore|lessonStore|Start practice|Weekly streak/i;

function isDeliveryGoal(goal: string): boolean {
  return /\b(moto|motodrop|courier|delivery|dropoff)\b/i.test(goal);
}

function requestPageJsx(productName: string): string {
  const name = productName.replace(/`/g, "");
  return `export default function RequestPage() {
  return (
    <main>
      <h1>${name} request</h1>
      <form method="post" action="/request">
        <label>
          Pickup
          <input name="pickup" type="text" autoComplete="street-address" required />
        </label>
        <label>
          Dropoff
          <input name="dropoff" type="text" autoComplete="street-address" required />
        </label>
        <button type="submit">Accept request</button>
      </form>
    </main>
  );
}
`;
}

function deliveryHomeJsx(productName: string): string {
  const name = productName.replace(/`/g, "");
  return `export default function Home() {
  return (
    <main>
      <h1>${name}</h1>
      <p>Open requests. Set pickup and dropoff, then accept.</p>
      <ul>
        <li><strong>Harbor to Midtown</strong><span>Waiting for a rider</span></li>
        <li><strong>Depot to North side</strong><span>Ready to accept</span></li>
      </ul>
      <a href="/request">New request</a>
    </main>
  );
}
`;
}

function looksStubOrLeftover(src: string): boolean {
  const s = String(src || "");
  if (!s.trim()) return true;
  return GENERIC_STUB_RE.test(s) || LEFTOVER_COPY_RE.test(s);
}

function writeRel(workspaceRoot: string, rel: string, body: string): boolean {
  const abs = path.join(workspaceRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  if (prev === body) return false;
  fs.writeFileSync(abs, body, "utf8");
  return true;
}

/** Fill §4 screens with this job's fields (delivery request = pickup + dropoff). */
export function rewriteJobScreensIfNeeded(input: {
  workspaceRoot: string;
  goal?: string;
  plan?: Record<string, unknown>;
}): { rewritten: string[] } {
  const goal =
    (input.goal || "").trim() ||
    String(input.plan?.["1. Goal of the app"] || input.plan?.goal || "").trim();
  if (!goal) return { rewritten: [] };
  const pages = String(input.plan?.["4. Pages and navigation"] || "");
  const named = extractNamedRoutesFromPagesText(pages);
  const routes = named.length > 0 ? named : seedPagesFromGoal(goal);
  const productName =
    readProductIdentity(input.workspaceRoot)?.projectName ||
    productNameFromPlan(input.plan) ||
    extractNamedBrand(goal) ||
    inferProductName(goal) ||
    "App";
  const rewritten: string[] = [];
  const delivery = isDeliveryGoal(goal);
  const education = isEducationProductGoal(goal);
  const routeObjs = routes.map((r) => ({ path: r.route, label: r.name }));

  const pageRels = ["app/page.tsx", "src/app/page.tsx"];
  for (const rel of pageRels) {
    const abs = path.join(input.workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const prev = fs.readFileSync(abs, "utf8");
      if (education) continue;
      if (
        looksLikeGenericContinueHome(prev) ||
        looksStubOrLeftover(prev) ||
        (delivery && /Ready bikes|Today'?s breads|short lesson/i.test(prev))
      ) {
        const next = delivery
          ? deliveryHomeJsx(productName)
          : buildNonEducationHomePage({ productName, goal, routes: routeObjs });
        if (writeRel(input.workspaceRoot, rel, next)) rewritten.push(rel);
      }
    } catch {
      /* skip */
    }
  }

  if (delivery) {
    const wantsRequest = routes.some((r) => /request/i.test(`${r.route} ${r.name}`));
    const requestRels = ["app/request/page.tsx", "src/app/request/page.tsx", "app/requests/page.tsx"];
    const prefer = wantsRequest
      ? routes.find((r) => /request/i.test(`${r.route} ${r.name}`))?.route || "/request"
      : "/request";
    const rel =
      prefer === "/requests" ? "app/requests/page.tsx" : "app/request/page.tsx";
    const abs = path.join(input.workspaceRoot, rel);
    let prev = "";
    try {
      if (fs.existsSync(abs)) prev = fs.readFileSync(abs, "utf8");
    } catch {
      prev = "";
    }
    if (!prev || looksStubOrLeftover(prev) || !/name=["']pickup["']/.test(prev)) {
      if (writeRel(input.workspaceRoot, rel, requestPageJsx(productName))) rewritten.push(rel);
    }
    for (const extra of requestRels) {
      if (extra === rel) continue;
      const extraAbs = path.join(input.workspaceRoot, extra);
      if (!fs.existsSync(extraAbs)) continue;
      try {
        const src = fs.readFileSync(extraAbs, "utf8");
        if (looksStubOrLeftover(src) || !/name=["']pickup["']/.test(src)) {
          if (writeRel(input.workspaceRoot, extra, requestPageJsx(productName))) rewritten.push(extra);
        }
      } catch {
        /* skip */
      }
    }
  }

  return { rewritten };
}

export function looksLikeGenericStubScreen(src: string): boolean {
  return GENERIC_STUB_RE.test(String(src || ""));
}
