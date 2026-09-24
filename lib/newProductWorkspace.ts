/**
 * Isolate a newly named product from leftover chip / Master Plan / routes.
 * Client-safe — no fs.
 */

import {
  extractNamedBrand,
  extractStatedProductName,
  inferProductName,
  singleProductName,
} from "./productIdentity";
import {
  isNewProductSeedAgainstCurrent,
  isReplacementProductBrief,
  leftoverRoutesConflictWithGoal,
  looksLikeStandaloneProductBrief,
} from "./productGoalFingerprint";

/** go / hellos / you can start / let’s keep X and start — only then Code pass 1. */
export function isFoundationCloseGate(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/^(go|go\.|go!|go\s+ahead|let'?s\s+go)[\s.!?]*$/i.test(t)) return true;
  if (/^hellos[\s.!?]*$/i.test(t)) return true;
  if (/^you\s+can\s+start\b/i.test(t)) return true;
  if (/let['’]?s keep\b[\s\S]{0,80}\band start\b/i.test(t)) return true;
  return false;
}

export function isInfluencerOrBrandBrief(text: string): boolean {
  return /\b(influencers?\s+and\s+brands?|brands?\s+and\s+influencers?|bridgen|influencer|creators?\s+and\s+brands)\b/i.test(
    String(text || ""),
  );
}

export function workspacePathsToRoutes(paths: string[]): string[] {
  const out: string[] = [];
  for (const raw of paths || []) {
    const p = String(raw || "").replace(/\\/g, "/");
    const appPage = p.match(/(?:^|\/)(?:src\/)?app\/([^/]+)\/page\.(tsx|jsx|js)$/i);
    if (appPage?.[1]) out.push(`/${appPage[1]}`);
  }
  return out;
}

export type NewProductWorkspaceAction = {
  mintNewProject: boolean;
  skipGrokChat: boolean;
  allowCodePass1: boolean;
  editExistingForbidden: boolean;
  productName: string;
};

/** Home New Project or a seed that does not match leftover §1 / chip / education routes. */
export function resolveNewProductWorkspaceAction(opts: {
  userText: string;
  chipName?: string | null;
  diskGoal?: string | null;
  productRoutesOnDisk?: boolean;
  workspacePaths?: string[];
  fromHomeNewProject?: boolean;
}): NewProductWorkspaceAction {
  const userText = String(opts.userText || "").trim();
  const close = isFoundationCloseGate(userText);
  const productName = singleProductName(
    extractStatedProductName(userText) ||
      extractNamedBrand(userText) ||
      inferProductName(userText),
  );
  const routes = workspacePathsToRoutes(opts.workspacePaths || []);
  const diskGoal = String(opts.diskGoal || "").trim();
  const seedAgainstCurrent = isNewProductSeedAgainstCurrent({
    userText,
    chipName: opts.chipName,
    diskGoal: diskGoal || undefined,
  });
  const leftoverRoutes =
    Boolean(opts.productRoutesOnDisk) && leftoverRoutesConflictWithGoal(userText || diskGoal, routes);
  const goalMismatch =
    Boolean(opts.productRoutesOnDisk && diskGoal && looksLikeStandaloneProductBrief(userText)) &&
    isReplacementProductBrief(userText, diskGoal);
  const mintNewProject = Boolean(
    opts.fromHomeNewProject || seedAgainstCurrent || leftoverRoutes || goalMismatch,
  );
  return {
    mintNewProject,
    skipGrokChat: mintNewProject ? false : close,
    allowCodePass1: close,
    editExistingForbidden: mintNewProject && Boolean(opts.productRoutesOnDisk),
    productName,
  };
}
