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
  formatPaletteLine,
  paletteToTokens,
  selectIndustryPalette,
} from "./uiGenerationEngine/v2/industryPalettes";
import type { DesignTokens } from "./uiGenerationEngine/v2/types";
import type { LayoutJob } from "./uiGenerationEngine/v2/layoutCatalogIndex";
import {
  applyBrandToPreviewHtml,
  ensureProductIdentity,
  looksLikeGoalStubName,
} from "./productIdentity";
import { listProductUiFiles } from "./workspaceCodedAppUi";
import { ensureInteractiveProductPreview } from "./interactiveProductPreview";

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

function stripEducationCalmFromBriefs(workspaceRoot: string, packLine: string): string[] {
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
      if (!/education-calm|#3[Ff]6[Ff]5[Bb]/.test(prev)) continue;
      const next = prev
        .replace(/family\s*=\s*education-calm/gi, "family=retail")
        .replace(/#3[Ff]6[Ff]5[Bb]/g, "#8B4513")
        .replace(/^.*\*\*Palette:\*\*.*$/im, packLine);
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
      if (!/education-calm|#3[Ff]6[Ff]5[Bb]/.test(section)) continue;
      const next = section
        .replace(/family\s*=\s*education-calm/gi, "family=retail")
        .replace(/#3[Ff]6[Ff]5[Bb]/g, "#8B4513")
        .replace(/^.*\*\*Palette:\*\*.*$/im, packLine);
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

function applyBrandToCodedLayout(
  workspaceRoot: string,
  productName: string,
  initials: string,
  primary: string,
): string | null {
  const rels = ["app/layout.tsx", "src/app/layout.tsx"];
  for (const rel of rels) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      let text = fs.readFileSync(abs, "utf8");
      const prev = text;
      text = text.replace(/<strong>([\s\S]*?)<\/strong>/, `<strong>${productName}</strong>`);
      text = text.replace(/<title>([\s\S]*?)<\/title>/i, `<title>${productName}</title>`);
      text = text.replace(/background:\s*["']#[0-9A-Fa-f]{3,8}["']/, `background: "${primary}"`);
      if (looksLikeGoalStubName(productName) === false) {
        text = text.replace(/Project type[^<"'`]{0,48}/gi, productName);
      }
      if (text !== prev) {
        fs.writeFileSync(abs, text, "utf8");
        return rel;
      }
      return rel;
    } catch {
      /* next */
    }
  }
  return null;
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
  if (fs.existsSync(previewAbs)) {
    try {
      const prev = fs.readFileSync(previewAbs, "utf8");
      const branded = applyBrandToPreviewHtml(prev, identity);
      if (branded !== prev) {
        fs.writeFileSync(previewAbs, branded, "utf8");
        if (!applied.includes("public/product-preview/index.html")) {
          applied.push("public/product-preview/index.html");
        }
      }
    } catch {
      /* ignore */
    }
  } else {
    const files = listProductUiFiles(input.workspaceRoot, 24);
    if (files.length) {
      ensureInteractiveProductPreview(input.workspaceRoot, {
        projectName: identity.projectName,
        productFiles: files,
        logoInitials: identity.logoInitials,
      });
      injectFinalUiIntoProductPreview(input.workspaceRoot, rec.tokens);
      applied.push("public/product-preview/index.html");
    }
  }
  const layoutRel = applyBrandToCodedLayout(
    input.workspaceRoot,
    identity.projectName,
    identity.logoInitials,
    rec.tokens.primary,
  );
  if (layoutRel && !applied.includes(layoutRel)) applied.push(layoutRel);
  if (isBakeryGoal(goal, input.projectType)) {
    const pack = selectIndustryPalette({ text: goal });
    applied.push(...stripEducationCalmFromBriefs(input.workspaceRoot, formatPaletteLine(pack)));
  }
  return { ok: applied.length > 0, applied, packId: rec.packId, productName: identity.projectName };
}
