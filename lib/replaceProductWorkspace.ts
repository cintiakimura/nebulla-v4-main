/**
 * On a new product brief: replace Master Plan §1–§5 and drop leftover app routes.
 */

import fs from "fs";
import path from "path";
import {
  extractNamedRoutesFromPagesText,
  formatPageContractsMarkdown,
  seedPagesFromGoal,
} from "./nebulaUiBrief";
import {
  MASTER_PLAN_SECTION_KEYS,
  MASTER_PLAN_INTERNAL_KEY,
  CODING_SKELETON_KEY,
  PRE_CODING_SUMMARY_KEY,
} from "./masterPlanSections";
import {
  EDUCATION_LEFTOVER_SLUGS,
  leftoverRoutesConflictWithGoal,
} from "./productGoalFingerprint";
import { ensureProductIdentity } from "./productIdentity";
import { distillBriefToGoalSection } from "./spineSequenceClient";

const MEMORY_RELS = [
  "nebula-project/fast-prototype-memory.md",
  "nebula-project/category-classification.md",
  "nebula-project/industry-standards.md",
  "nebula-project/competitor-research.md",
];

const APP_ROOTS = ["app", "src/app"];

const PRODUCT_CODE_DIRS = ["lib", "data", "hooks", "stores", "utils", "components", "src/lib", "src/components"];

const LEFTOVER_PRODUCT_FILE_RE =
  /breads\.json$|bakery-|bikeStore|lessonStore|tutorStore|loafLocal|quillPath/i;

export function wipePreviousProductCode(workspaceRoot: string): { removed: string[] } {
  const removed: string[] = [];
  for (const rel of PRODUCT_CODE_DIRS) {
    const full = path.join(workspaceRoot, rel);
    if (!fs.existsSync(full)) continue;
    try {
      fs.rmSync(full, { recursive: true, force: true });
      removed.push(rel);
    } catch {
      /* ignore */
    }
  }
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(workspaceRoot, full).replace(/\\/g, "/");
      if (/^nebula-project(\/|$)/i.test(rel) || /^nebulla-ide(\/|$)/i.test(rel)) continue;
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (LEFTOVER_PRODUCT_FILE_RE.test(rel) || LEFTOVER_PRODUCT_FILE_RE.test(ent.name)) {
        try {
          fs.unlinkSync(full);
          removed.push(rel);
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(workspaceRoot);
  return { removed };
}

function normalizeRoute(route: string): string {
  const s = String(route || "").trim();
  if (!s || s === "/") return "/";
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

function keepSetFromSection4(section4: string, goal: string): Set<string> {
  const named = extractNamedRoutesFromPagesText(section4);
  const pages = named.length > 0 ? named : seedPagesFromGoal(goal);
  const keep = new Set<string>(["/"]);
  for (const p of pages) keep.add(normalizeRoute(p.route));
  return keep;
}

function rmEmptyDirs(dir: string, stopAt: string) {
  let cur = dir;
  while (cur.startsWith(stopAt) && cur !== stopAt) {
    try {
      if (fs.existsSync(cur) && fs.readdirSync(cur).length === 0) {
        fs.rmdirSync(cur);
        cur = path.dirname(cur);
        continue;
      }
    } catch {
      /* ignore */
    }
    break;
  }
}

/** Delete app/<slug>/page files whose routes are not in the new §4 (or conflict with the new goal). */
export function pruneAppRoutesNotInSection4(opts: {
  workspaceRoot: string;
  section4?: string;
  goal: string;
}): { removed: string[] } {
  const removed: string[] = [];
  const keep = keepSetFromSection4(opts.section4 || "", opts.goal);
  const conflictOnly = leftoverRoutesConflictWithGoal;

  for (const rootRel of APP_ROOTS) {
    const appRoot = path.join(opts.workspaceRoot, rootRel);
    if (!fs.existsSync(appRoot)) continue;
    const walk = (dir: string, segments: string[]) => {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith(".") || ent.name === "api") continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name.startsWith("(") && ent.name.endsWith(")")) {
            walk(full, segments);
          } else {
            walk(full, [...segments, ent.name]);
          }
          continue;
        }
        if (!/^page\.(tsx|jsx|js|ts)$/.test(ent.name)) continue;
        if (segments.length === 0) continue;
        const route = `/${segments.join("/")}`.replace(/\/+/g, "/");
        const slug = segments[0]?.toLowerCase() || "";
        const notKept = !keep.has(normalizeRoute(route));
        const leftoverEdu = EDUCATION_LEFTOVER_SLUGS.has(slug);
        if (notKept && (leftoverEdu || conflictOnly(opts.goal, [route]) || !opts.section4?.trim())) {
          try {
            fs.unlinkSync(full);
            removed.push(path.relative(opts.workspaceRoot, full).replace(/\\/g, "/"));
            rmEmptyDirs(dir, appRoot);
          } catch {
            /* ignore */
          }
        } else if (notKept && opts.section4?.trim()) {
          try {
            fs.unlinkSync(full);
            removed.push(path.relative(opts.workspaceRoot, full).replace(/\\/g, "/"));
            rmEmptyDirs(dir, appRoot);
          } catch {
            /* ignore */
          }
        }
      }
    };
    walk(appRoot, []);
  }
  return { removed };
}

export function rewriteLayoutNavFromSection4(opts: {
  workspaceRoot: string;
  section4?: string;
  goal: string;
}): { rewritten: string[] } {
  const pages = extractNamedRoutesFromPagesText(opts.section4 || "");
  const list = pages.length > 0 ? pages : seedPagesFromGoal(opts.goal);
  const links = list
    .map((p) => `<a href="${p.route}">${p.name}</a>`)
    .join("\n          ");
  const nav = `<nav>\n          ${links}\n        </nav>`;
  const leftoverHref =
    /href=["']\/(practice|session|helper|lessons|lesson|streak|quiz|progress|teacher)["']/i;
  const leftoverLabel = /\b(Helper|Practice|Session|CogniMicro)\b/;
  const rewritten: string[] = [];
  for (const rel of ["app/layout.tsx", "src/app/layout.tsx"]) {
    const abs = path.join(opts.workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const prev = fs.readFileSync(abs, "utf8");
      if (!leftoverHref.test(prev) && !leftoverLabel.test(prev)) continue;
      let next = prev;
      if (/<nav[\s\S]*?<\/nav>/.test(next)) {
        next = next.replace(/<nav[\s\S]*?<\/nav>/, nav);
      }
      next = next
        .replace(/href=["']\/practice["']/gi, 'href="/book"')
        .replace(/href=["']\/session["']/gi, 'href="/mechanic"')
        .replace(/href=["']\/helper["']/gi, 'href="/"')
        .replace(/>\s*Practice\s*</g, ">Book<")
        .replace(/>\s*Helper\s*</g, ">Home<")
        .replace(/>\s*Session\s*</g, ">Mechanic<");
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

function unlinkIfExists(abs: string) {
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

export function emptyUserMasterPlan(): Record<string, string> {
  const plan: Record<string, string> = {};
  for (const key of MASTER_PLAN_SECTION_KEYS) plan[key] = "";
  plan[MASTER_PLAN_INTERNAL_KEY] = "";
  plan[PRE_CODING_SUMMARY_KEY] = "";
  plan[CODING_SKELETON_KEY] = "";
  return plan;
}

/** Discard leftover §1–§5, memory, conflicting routes. Seed §1 from this brief only. */
export function applyNewProductBriefToWorkspace(opts: {
  workspaceRoot: string;
  masterPlanPath: string;
  incomingGoal: string;
}): { clearedTabs: string[]; removedRoutes: string[]; navRewritten: string[] } {
  const goal =
    distillBriefToGoalSection(opts.incomingGoal, opts.incomingGoal) ||
    String(opts.incomingGoal || "").trim();
  const plan = emptyUserMasterPlan();
  if (goal) plan["1. Goal of the app"] = goal;
  fs.mkdirSync(path.dirname(opts.masterPlanPath), { recursive: true });
  fs.writeFileSync(opts.masterPlanPath, JSON.stringify(plan, null, 2), "utf8");

  for (const rel of MEMORY_RELS) {
    unlinkIfExists(path.join(opts.workspaceRoot, rel));
  }
  unlinkIfExists(path.join(opts.workspaceRoot, "nebula-ui-studio", "ui-brief.md"));
  unlinkIfExists(path.join(opts.workspaceRoot, "nebula-ui-studio", "v0-prompt.md"));

  ensureProductIdentity(opts.workspaceRoot, {
    goal,
    persist: true,
    force: true,
  });

  const wiped = wipePreviousProductCode(opts.workspaceRoot);
  const { removed } = pruneAppRoutesNotInSection4({
    workspaceRoot: opts.workspaceRoot,
    section4: "",
    goal,
  });
  const { rewritten } = rewriteLayoutNavFromSection4({
    workspaceRoot: opts.workspaceRoot,
    section4: formatPageContractsMarkdown(seedPagesFromGoal(goal), goal),
    goal,
  });

  return {
    clearedTabs: [...MASTER_PLAN_SECTION_KEYS],
    removedRoutes: [...wiped.removed, ...removed],
    navRewritten: rewritten,
  };
}

export function writeReplacedMasterPlan(opts: {
  workspaceRoot: string;
  masterPlanPath: string;
  sections: Partial<Record<number, string>>;
}): Record<string, string> {
  const plan = emptyUserMasterPlan();
  MASTER_PLAN_SECTION_KEYS.forEach((key, i) => {
    const body = String(opts.sections[i + 1] ?? "").trim();
    plan[key] = body;
  });
  const env = String(opts.sections[6] ?? "").trim();
  plan[MASTER_PLAN_INTERNAL_KEY] = env;
  fs.mkdirSync(path.dirname(opts.masterPlanPath), { recursive: true });
  fs.writeFileSync(opts.masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
  const goal = plan["1. Goal of the app"];
  wipePreviousProductCode(opts.workspaceRoot);
  pruneAppRoutesNotInSection4({
    workspaceRoot: opts.workspaceRoot,
    section4: plan["4. Pages and navigation"],
    goal,
  });
  rewriteLayoutNavFromSection4({
    workspaceRoot: opts.workspaceRoot,
    section4: plan["4. Pages and navigation"],
    goal,
  });
  return plan;
}
