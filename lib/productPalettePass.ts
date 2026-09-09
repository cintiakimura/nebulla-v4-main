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
import { paletteToTokens, selectIndustryPalette } from "./uiGenerationEngine/v2/industryPalettes";
import type { DesignTokens } from "./uiGenerationEngine/v2/types";
import type { LayoutJob } from "./uiGenerationEngine/v2/layoutCatalogIndex";

export const PRODUCT_PALETTE_REL = "nebulla-ide/product-palette.json";

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

export function writeProductPaletteTokens(input: {
  workspaceRoot: string;
  goal: string;
  projectType?: string;
}): ProductPaletteRecord {
  const fp = goalFingerprint(input.goal);
  const storeAbs = path.join(input.workspaceRoot, PRODUCT_PALETTE_REL);
  if (fs.existsSync(storeAbs)) {
    try {
      const prev = JSON.parse(fs.readFileSync(storeAbs, "utf8")) as ProductPaletteRecord;
      if (prev.goalFingerprint === fp && prev.tokens?.primary) return prev;
    } catch {
      /* rewrite */
    }
  }
  const pack = selectIndustryPalette({
    text: `${input.goal} ${input.projectType || ""}`,
    device: /landing/i.test(input.projectType || "") ? "landing" : undefined,
  });
  const tokens = paletteToTokens(pack, "medium");
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

export function applyProductPalettePass(input: {
  workspaceRoot: string;
  goal?: string;
  masterPlanPath?: string;
  projectType?: string;
  jobHint?: LayoutJob | null;
}): { ok: boolean; applied: string[]; packId: string } {
  const goal =
    (input.goal || "").trim() || readGoalFromWorkspace(input.workspaceRoot, input.masterPlanPath);
  const rec = writeProductPaletteTokens({
    workspaceRoot: input.workspaceRoot,
    goal,
    projectType: input.projectType,
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
  return { ok: true, applied, packId: rec.packId };
}
