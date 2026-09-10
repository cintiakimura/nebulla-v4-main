/**
 * After Foundation, drop education-kit Home (lesson / streak / parent role)
 * when this workspace is not an education product.
 */

import fs from "fs";
import path from "path";
import { extractNamedBrand, inferProductName, productNameFromPlan } from "./productIdentity";

const KIT_HOME_RE =
  /short lesson|Start practice|See streak|Weekly streak|Role:\s*(parent|kid|teacher)|Practice app/i;

const EDUCATION_GOAL_RE =
  /\b(learn|lesson|tutor|reading practice|adhd|classroom|homework|student|teacher|kids? education)\b/i;

const BIKE_RE = /\b(bike|bicycle|cycle|mechanic|spoke|e-?bike|tune-?up)\b/i;

export function looksLikeEducationKitHomeCopy(src: string): boolean {
  return KIT_HOME_RE.test(String(src || ""));
}

export function isEducationProductGoal(goal: string): boolean {
  const g = String(goal || "");
  if (BIKE_RE.test(g) || /baker|bakery|loaflocal|shop|store|marketplace/i.test(g)) {
    return false;
  }
  return EDUCATION_GOAL_RE.test(g);
}

function routesFromSection4(pages: string): { path: string; label: string }[] {
  const found = new Map<string, string>();
  const re = /`(\/[^`\s]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pages))) {
    const p = m[1].replace(/\/+$/, "") || "/";
    if (p === "/") {
      found.set("/", "Home");
      continue;
    }
    const slug = p.replace(/^\//, "").split("/")[0] || "";
    if (slug.length < 2) continue;
    const label = slug
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    if (!found.has(p)) found.set(p, label || p);
  }
  return [...found.entries()].map(([path, label]) => ({ path, label }));
}

function homeJsx(opts: {
  productName: string;
  goal: string;
  routes: { path: string; label: string }[];
}): string {
  const name = opts.productName.replace(/`/g, "");
  const bike = BIKE_RE.test(opts.goal) || /spoke/i.test(name);
  const bakery = /baker|bakery|bread|loaflocal|grain/i.test(`${opts.goal} ${name}`);
  const book =
    opts.routes.find((r) => /book|slot|appoint/i.test(`${r.path} ${r.label}`))?.path ||
    (bike ? "/book" : "");
  const items = bike
    ? [
        ["City commuter", "Ready now — pickup today"],
        ["Trail hardtail", "Tuned this morning"],
        ["Kids 20\"", "Ready this afternoon"],
      ]
    : bakery
      ? [
          ["Country loaf", "Still warm — pickup this afternoon"],
          ["Sourdough", "Limited bake"],
        ]
      : [
          ["Ready today", "Open a listing and book"],
          ["Pickup", "Reserve a slot"],
        ];
  const ctaHref = book || opts.routes.find((r) => r.path !== "/")?.path || "/";
  const cta = bike ? "Book slot" : bakery ? "Place pickup order" : "Continue";
  const lead = bike
    ? "Ready bikes on the floor. Book a pickup or service slot."
    : bakery
      ? "Today's breads. Place a pickup order."
      : `${name} — the job starts here.`;
  const list = items
    .map(
      ([title, sub]) =>
        `        <li><strong>${title}</strong><span>${sub}</span></li>`,
    )
    .join("\n");
  return `export default function Home() {
  return (
    <main>
      <h1>${name}</h1>
      <p>${lead}</p>
      <ul>
${list}
      </ul>
      <a href="${ctaHref}">${cta}</a>
    </main>
  );
}
`;
}

function stripEducationRole(layout: string): string {
  return String(layout || "")
    .replace(/Role:\s*(parent|kid|teacher|child|student)/gi, "")
    .replace(/\b(parent|kid|teacher)\s+mode\b/gi, "")
    .replace(/Practice app/gi, "");
}

/** Rewrite coded Home (+ header role) when education-kit copy landed on a non-education goal. */
export function rewriteEducationKitHomeIfNeeded(input: {
  workspaceRoot: string;
  goal?: string;
  plan?: Record<string, unknown>;
}): { rewritten: string[] } {
  const goal =
    (input.goal || "").trim() ||
    String(input.plan?.["1. Goal of the app"] || input.plan?.goal || "").trim();
  if (isEducationProductGoal(goal)) return { rewritten: [] };

  const pages = String(input.plan?.["4. Pages and navigation"] || "");
  const productName =
    productNameFromPlan(input.plan) ||
    extractNamedBrand(goal) ||
    inferProductName(goal) ||
    "App";
  const routes = routesFromSection4(pages);
  const rewritten: string[] = [];

  const pageRels = ["app/page.tsx", "src/app/page.tsx"];
  for (const rel of pageRels) {
    const abs = path.join(input.workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const prev = fs.readFileSync(abs, "utf8");
      if (!looksLikeEducationKitHomeCopy(prev) && !/role.*parent|Start practice/i.test(prev)) {
        continue;
      }
      const next = homeJsx({ productName, goal, routes });
      if (next !== prev) {
        fs.writeFileSync(abs, next, "utf8");
        rewritten.push(rel);
      }
    } catch {
      /* skip */
    }
  }

  const layoutRels = ["app/layout.tsx", "src/app/layout.tsx"];
  for (const rel of layoutRels) {
    const abs = path.join(input.workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const prev = fs.readFileSync(abs, "utf8");
      if (!/Role:\s*(parent|kid|teacher)|Practice app|Start practice/i.test(prev)) continue;
      const next = stripEducationRole(prev);
      if (next !== prev) {
        fs.writeFileSync(abs, next, "utf8");
        rewritten.push(rel);
      }
    } catch {
      /* skip */
    }
  }

  return { rewritten };
}
