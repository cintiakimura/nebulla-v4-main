/**
 * Goal → color/type tokens only. Isolated from layout file pick.
 * Never reuse another project's palette (fingerprint must match this goal).
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import {
  injectFinalUiCssVars,
  injectFinalUiIntoProductPreview,
} from "./uiGenerationEngine/injectFinalUiCssVars";
import {
  collapseWinningPalette,
  paletteToTokens,
  selectIndustryPalette,
} from "./uiGenerationEngine/v2/industryPalettes";
import type { DesignTokens } from "./uiGenerationEngine/v2/types";
import type { LayoutJob } from "./uiGenerationEngine/v2/layoutCatalogIndex";
import {
  applyBrandToPreviewHtml,
  ensureProductIdentity,
  looksLikeEducationKitDefaultName,
  looksLikeGoalStubName,
} from "./productIdentity";
import { listProductUiFiles } from "./workspaceCodedAppUi";
import { ensureInteractiveProductPreview } from "./interactiveProductPreview";
import { rewriteEducationKitHomeIfNeeded } from "./rewriteEducationKitHome";
import { rewriteJobScreensIfNeeded } from "./rewriteJobScreens";

export const PRODUCT_PALETTE_REL = "nebulla-ide/product-palette.json";

const BAKERY_RE = /baker|bakery|bread|pastry|cafe|grain bakery|loaflocal/i;
const EDUCATION_CALM_PRIMARY = "#3f6f5b";

export type ProductPaletteRecord = {
  goalFingerprint: string;
  packId: string;
  headingFont: string;
  tokens: DesignTokens;
};

export function goalFingerprint(goal: string): string {
  return createHash("sha1").update(String(goal || "").trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function headingFontHint(packId: string): string {
  if (packId === "retail") return "Fraunces, Georgia, serif";
  if (packId.startsWith("education")) return "Nunito, ui-rounded, system-ui, sans-serif";
  if (packId === "landing-bold") return "Outfit, system-ui, sans-serif";
  return "Inter, system-ui, sans-serif";
}

export function readGoalFromWorkspace(workspaceRoot: string, masterPlanPath?: string): string {
  const candidates = [
    masterPlanPath,
    path.join(workspaceRoot, "nebulla-ide", "master-plan.json"),
    path.join(workspaceRoot, "nebula-project", "master-plan.json"),
    path.join(workspaceRoot, "master-plan.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const plan = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
      const goal = String(plan["1. Goal of the app"] || plan.goal || "").trim();
      if (goal) return goal;
    } catch {
      /* next */
    }
  }
  return "";
}

function readPlanFromWorkspace(
  workspaceRoot: string,
  masterPlanPath?: string,
): Record<string, unknown> {
  const candidates = [
    masterPlanPath,
    path.join(workspaceRoot, "nebulla-ide", "master-plan.json"),
    path.join(workspaceRoot, "nebula-project", "master-plan.json"),
    path.join(workspaceRoot, "master-plan.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const plan = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
      if (plan && typeof plan === "object") return plan;
    } catch {
      /* next */
    }
  }
  return {};
}

function isBakeryGoal(goal: string, projectType?: string): boolean {
  return BAKERY_RE.test(`${goal} ${projectType || ""}`);
}

export function writeProductPaletteTokens(input: {
  workspaceRoot: string;
  goal: string;
  projectType?: string;
}): ProductPaletteRecord {
  const fp = goalFingerprint(input.goal);
  const storeAbs = path.join(input.workspaceRoot, PRODUCT_PALETTE_REL);
  const pack = selectIndustryPalette({
    text: `${input.goal} ${input.projectType || ""}`,
    device: /landing/i.test(input.projectType || "") ? "landing" : undefined,
  });
  const tokens = paletteToTokens(pack, "medium");
  if (fs.existsSync(storeAbs)) {
    try {
      const prev = JSON.parse(fs.readFileSync(storeAbs, "utf8")) as ProductPaletteRecord;
      const staleEduOnBakery =
        isBakeryGoal(input.goal, input.projectType) &&
        (String(prev.packId || "").startsWith("education") ||
          (prev.tokens?.primary || "").toLowerCase() === EDUCATION_CALM_PRIMARY);
      if (
        prev.goalFingerprint === fp &&
        prev.tokens?.primary &&
        !staleEduOnBakery &&
        prev.packId === pack.id
      ) {
        return prev;
      }
    } catch {
      /* rewrite */
    }
  }
  const rec: ProductPaletteRecord = {
    goalFingerprint: fp,
    packId: pack.id,
    headingFont: headingFontHint(pack.id),
    tokens,
  };
  fs.mkdirSync(path.dirname(storeAbs), { recursive: true });
  fs.writeFileSync(storeAbs, JSON.stringify(rec, null, 2), "utf8");
  return rec;
}

function collapsePalettesOnDisk(workspaceRoot: string, goal: string): string[] {
  const rels = [
    "nebula-ui-studio/ui-brief.md",
    "nebulla-project/ui-brief.md",
    "nebula-project/ui-brief.md",
  ];
  const touched: string[] = [];
  for (const rel of rels) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const prev = fs.readFileSync(abs, "utf8");
      const next = collapseWinningPalette(prev, goal);
      if (next !== prev) {
        fs.writeFileSync(abs, next, "utf8");
        touched.push(rel);
      }
    } catch {
      /* skip */
    }
  }
  const plans = [
    path.join(workspaceRoot, "nebulla-ide", "master-plan.json"),
    path.join(workspaceRoot, "nebula-project", "master-plan.json"),
    path.join(workspaceRoot, "master-plan.json"),
  ];
  for (const abs of plans) {
    if (!fs.existsSync(abs)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
      const section = String(raw["5. UI/UX design"] || "");
      if (!section.trim()) continue;
      const next = collapseWinningPalette(section, goal);
      if (next !== section) {
        raw["5. UI/UX design"] = next;
        fs.writeFileSync(abs, JSON.stringify(raw, null, 2), "utf8");
        touched.push(path.relative(workspaceRoot, abs));
      }
    } catch {
      /* skip */
    }
  }
  return touched;
}

const KIT_LIVE_TITLE_RE = /Sparrow Tutor|Practice app/gi;

function rewriteKitProductTitles(text: string, productName: string, goal?: string): string {
  let out = String(text || "");
  if (!productName.trim() || looksLikeGoalStubName(productName, goal)) return out;
  out = out.replace(KIT_LIVE_TITLE_RE, productName);
  out = out.replace(/<title>([\s\S]*?)<\/title>/gi, (full, inner: string) => {
    if (looksLikeEducationKitDefaultName(String(inner), goal) || KIT_LIVE_TITLE_RE.test(String(inner))) {
      return `<title>${productName}</title>`;
    }
    return full;
  });
  out = out.replace(
    /(title:\s*["'`])([^"'`]+)(["'`])/g,
    (full, a: string, title: string, c: string) =>
      looksLikeEducationKitDefaultName(title, goal) || /sparrow tutor|practice app/i.test(title)
        ? `${a}${productName}${c}`
        : full,
  );
  out = out.replace(/<strong>([\s\S]*?)<\/strong>/, (full, inner: string) =>
    looksLikeEducationKitDefaultName(String(inner), goal) || /sparrow tutor|practice app/i.test(String(inner))
      ? `<strong>${productName}</strong>`
      : full,
  );
  return out;
}

function applyBrandToCodedLayout(
  workspaceRoot: string,
  productName: string,
  initials: string,
  primary: string,
  goal?: string,
): string | null {
  const rels = ["app/layout.tsx", "src/app/layout.tsx", "app/page.tsx", "src/app/page.tsx"];
  let first: string | null = null;
  for (const rel of rels) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      let text = fs.readFileSync(abs, "utf8");
      const prev = text;
      text = rewriteKitProductTitles(text, productName, goal);
      text = text.replace(/<strong>([\s\S]*?)<\/strong>/, `<strong>${productName}</strong>`);
      text = text.replace(/<title>([\s\S]*?)<\/title>/i, `<title>${productName}</title>`);
      text = text.replace(/background:\s*["']#[0-9A-Fa-f]{3,8}["']/, `background: "${primary}"`);
      if (looksLikeGoalStubName(productName) === false) {
        text = text.replace(/Project type[^<"'`]{0,48}/gi, productName);
      }
      if (text !== prev) {
        fs.writeFileSync(abs, text, "utf8");
        if (!first) first = rel;
      } else if (!first) {
        first = rel;
      }
    } catch {
      /* next */
    }
  }
  return first;
}

export function applyProductPalettePass(input: {
  workspaceRoot: string;
  goal?: string;
  masterPlanPath?: string;
  projectType?: string;
  jobHint?: LayoutJob | null;
}): { ok: boolean; applied: string[]; packId: string; productName: string } {
  const goal =
    (input.goal || "").trim() || readGoalFromWorkspace(input.workspaceRoot, input.masterPlanPath);
  const rec = writeProductPaletteTokens({
    workspaceRoot: input.workspaceRoot,
    goal,
    projectType: input.projectType,
  });
  const identity = ensureProductIdentity(input.workspaceRoot, {
    goal,
    projectType: input.projectType,
    persist: true,
  });
  const applied: string[] = [];
  const cssRel = injectFinalUiCssVars(input.workspaceRoot, rec.tokens, {
    headingFont: rec.headingFont,
    jobHint: input.jobHint || undefined,
  });
  if (cssRel) applied.push(cssRel);
  if (injectFinalUiIntoProductPreview(input.workspaceRoot, rec.tokens)) {
    applied.push("public/product-preview/index.html");
  }
  const previewAbs = path.join(input.workspaceRoot, "public/product-preview/index.html");
  const files = listProductUiFiles(input.workspaceRoot, 24);
  if (files.length || fs.existsSync(previewAbs)) {
    ensureInteractiveProductPreview(input.workspaceRoot, {
      projectName: identity.projectName,
      productFiles: files,
      logoInitials: identity.logoInitials,
    });
    injectFinalUiIntoProductPreview(input.workspaceRoot, rec.tokens);
    try {
      const prev = fs.readFileSync(previewAbs, "utf8");
      const branded = applyBrandToPreviewHtml(prev, identity);
      if (branded !== prev) fs.writeFileSync(previewAbs, branded, "utf8");
    } catch {
      /* ignore */
    }
    if (!applied.includes("public/product-preview/index.html")) {
      applied.push("public/product-preview/index.html");
    }
  }
  const layoutRel = applyBrandToCodedLayout(
    input.workspaceRoot,
    identity.projectName,
    identity.logoInitials,
    rec.tokens.primary,
    goal,
  );
  if (layoutRel && !applied.includes(layoutRel)) applied.push(layoutRel);
  const kitHome = rewriteEducationKitHomeIfNeeded({
    workspaceRoot: input.workspaceRoot,
    goal,
    plan: readPlanFromWorkspace(input.workspaceRoot, input.masterPlanPath),
  });
  for (const rel of kitHome.rewritten) {
    if (!applied.includes(rel)) applied.push(rel);
  }
  const jobScreens = rewriteJobScreensIfNeeded({
    workspaceRoot: input.workspaceRoot,
    goal,
    plan: readPlanFromWorkspace(input.workspaceRoot, input.masterPlanPath),
  });
  for (const rel of jobScreens.rewritten) {
    if (!applied.includes(rel)) applied.push(rel);
  }
  if (jobScreens.rewritten.length) {
    ensureInteractiveProductPreview(input.workspaceRoot, {
      projectName: identity.projectName,
      logoInitials: identity.logoInitials,
    });
    injectFinalUiIntoProductPreview(input.workspaceRoot, rec.tokens);
  }
  applied.push(...collapsePalettesOnDisk(input.workspaceRoot, goal));
  return { ok: applied.length > 0, applied, packId: rec.packId, productName: identity.projectName };
}
