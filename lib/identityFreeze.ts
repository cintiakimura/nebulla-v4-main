/**
 * After the first successful Master Plan save, lock productName + workspace id.
 * Later turns (yes / build / classify / Go) must not invent a new brand or mint
 * a second workspace. Header ≠ plan name is drift: keep the plan name.
 */

export const IDENTITY_FREEZE_STORAGE_KEY = "nebula_identity_freeze_v1";

export type IdentityFreezeRecord = {
  projectKey: string;
  projectName: string;
};

export function parseIdentityFreezeRecord(raw: unknown): IdentityFreezeRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const projectKey = typeof o.projectKey === "string" ? o.projectKey.trim() : "";
  const projectName = typeof o.projectName === "string" ? o.projectName.trim() : "";
  if (!projectKey || !projectName) return null;
  return { projectKey, projectName };
}

/** First successful Master Plan save wins. Later names or keys are ignored. */
export function mergeIdentityFreeze(
  existing: IdentityFreezeRecord | null,
  next: IdentityFreezeRecord,
): IdentityFreezeRecord {
  const key = String(next.projectKey || "").trim();
  const name = String(next.projectName || "").trim();
  if (!key || !name) return existing || next;
  if (existing?.projectKey && existing?.projectName) return existing;
  return { projectKey: key, projectName: name };
}

/** yes / build / go / classify — never re-run the brand generator after freeze. */
export function isPostPlanIdentityLockTurn(text: string): boolean {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (
    /^(yes|yeah|yep|ok|okay|sure|go|continue|build|build it|that's it|thats it|looks good)[\s.!?]*$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(classify|classification|go code|start coding|foundation)\b/i.test(t) && t.length < 80) {
    return true;
  }
  return false;
}

export function shouldRunBrandGenerator(opts: {
  frozen: boolean;
  fromHomeNewProject?: boolean;
}): boolean {
  if (opts.fromHomeNewProject) return true;
  return !opts.frozen;
}

export function isHeaderPlanNameDrift(headerName: string, planName: string): boolean {
  const header = String(headerName || "").replace(/\s+/g, " ").trim();
  const plan = String(planName || "").replace(/\s+/g, " ").trim();
  if (!header || !plan) return false;
  return header.toLowerCase() !== plan.toLowerCase();
}

/**
 * Header ≠ plan after freeze: keep the plan name and frozen workspace.
 * Never mint a stub project to match the drifted header.
 */
export function resolveFrozenWorkspaceTarget(opts: {
  freeze: IdentityFreezeRecord | null;
  headerName?: string | null;
  headerKey?: string | null;
}): { projectKey: string; projectName: string; drifted: boolean } {
  if (opts.freeze?.projectKey && opts.freeze.projectName) {
    const header = String(opts.headerName || "").trim();
    const drifted = isHeaderPlanNameDrift(header, opts.freeze.projectName);
    return {
      projectKey: opts.freeze.projectKey,
      projectName: opts.freeze.projectName,
      drifted,
    };
  }
  return {
    projectKey: String(opts.headerKey || "").trim() || "default",
    projectName: String(opts.headerName || "").trim(),
    drifted: false,
  };
}

export function shouldPersistPlanFromChatBeforeRename(opts: {
  planEmpty: boolean;
  chatHasUsableGoal: boolean;
}): boolean {
  return Boolean(opts.planEmpty && opts.chatHasUsableGoal);
}

export function masterPlanRecordLooksEmpty(plan: Record<string, unknown> | null | undefined): boolean {
  if (!plan || typeof plan !== "object") return true;
  const keys = [
    "1. Goal of the app",
    "2. Tech and Research",
    "3. Features and KPIs",
    "4. Pages and navigation",
    "5. UI/UX design",
  ];
  return keys.every((k) => !String(plan[k] ?? "").trim());
}

export function shouldMintWorkspaceAfterPlanFreeze(opts: {
  frozen: boolean;
  fromHomeNewProject?: boolean;
}): boolean {
  if (opts.fromHomeNewProject) return true;
  return !opts.frozen;
}

/** Recover / fillMissing / Go apply: frozen key only. */
export function resolveFrozenProjectKey(opts: {
  freezeKey?: string | null;
  browserKey?: string | null;
}): string {
  const frozen = String(opts.freezeKey || "").trim();
  if (frozen) return frozen;
  return String(opts.browserKey || "").trim() || "default";
}

/**
 * Prefer the name already on the plan. Invented 2-word chips (Helio Studio)
 * after save are drift — do not promote them.
 */
export function lockNameAfterPlanSave(opts: {
  fromPlan: string;
  fromSave?: string;
  headerName?: string;
  looksInvented: (name: string) => boolean;
}): string {
  const plan = String(opts.fromPlan || "").trim();
  if (plan) return plan;
  const save = String(opts.fromSave || "").trim();
  if (save && !opts.looksInvented(save)) return save;
  const header = String(opts.headerName || "").trim();
  if (header && !opts.looksInvented(header)) return header;
  return plan || save || header;
}
