/**
 * UI Studio Beta — Generation Logic v2 cycle runner.
 * Authority: nebulla-project/ui-generation-logic-v2.md
 * Doctrine: Template first. Figma forced. Tokens mandatory. Content mapped into slots. No freeform chaos.
 */

import fs from "fs";
import path from "path";
import {
  hydrateAndPersistMasterPlan,
  mindMapPagesFromMasterPlan,
  syncUiBriefFromMasterPlan,
} from "../../nebulaIdeWorkspaceArtifacts";
import {
  extractDesignTokensFromUiBrief,
  parsePagesFromUiBrief,
  readUiBriefMarkdown,
} from "../../nebulaUiBrief";
import { MASTER_PLAN_SECTION_KEYS } from "../../masterPlanSections";
import { writePreviewModel } from "../../visualUiEditorPreview";
import { appendStepLog, writeContextFile } from "../contextIO";
import {
  clearFalseRegenBudgetIfEmptyMockup,
  setUserVisibleStage,
  workspaceHasLoadableMockup,
  writeCyclePolicy,
} from "../cyclePolicy";
import { writeEnginePreviewModel } from "../previewModelIO";
import { cleanHumanTitle } from "../buildPreviewEditorModel";
import {
  collectWorkspaceFileFacts,
  hasMeaningfulUiFileGrounding,
  type WorkspaceFileFacts,
} from "../workspaceFileFacts";
import { emptyContextState, type UiGenContextState } from "../types";
import { classifyPage } from "./classifyPage";
import { buildDesignTokens } from "./designTokens";
import {
  applyPlanToTokens,
  ensureSlotsForStructurePlan,
  parseStructureLayoutPlan,
  structureRegionsSatisfied,
} from "./applyStructureHints";
import { retrieveFigmaReferences } from "./figmaReferences";
import { mapSlots, sanitizeSlotsForPageType } from "./mapSlots";
import { repairSlots, validateV2Quality } from "./qualityGate";
import { renderTemplateCode, renderTemplateModel } from "./renderTemplateModel";
import { getTemplateById, selectTemplate } from "./selectTemplate";
import type { V2TemplateId } from "./types";
import { compileDesignBrief } from "../resources/compileDesignBrief";
import { matchResources } from "../resources/matchResources";
import { refineDesignBriefWithGrok } from "../resources/refineDesignBrief";
import { suggestResourceRematchWithGrok } from "../resources/suggestResourceRematch";
import { listProfiles, listProfilesFs } from "../resources/catalogStore";
import type { DesignBrief, ResourceMatchResult } from "../resources/types";
import {
  applyUiGenerationToPreviewShell,
  shouldApplyUiToPreview,
} from "../applyPreviewShell";
import { polishSlotsForContentLocale } from "../polishSlotsLocale";
import { readWorkspaceContentLocale } from "../../contentLocaleWorkspace";

const PREFERENCE_RECOVERY_QUESTION =
  "I can see this still isn’t right. What bothers you most — layout, colors, spacing, missing sections, or overall style?";

export type UiPreferenceHints = {
  denser?: boolean;
  looser?: boolean;
  moreSections?: boolean;
  strongerCta?: boolean;
  moreContrast?: boolean;
};

export type UiGenerationPhase = "pre_code" | "post_code" | "manual";

export type RunUiGenerationInput = {
  workspaceRoot: string;
  masterPlanPath: string;
  projectName?: string;
  pageName?: string;
  apiKeyOverride?: string;
  autoTriggered?: boolean;
  regenerate?: boolean;
  preferenceFeedback?: string;
  guidedImprovement?: boolean;
  writtenPaths?: string[];
  /** pre_code mockup vs post_code refresh after Foundation/Go apply. */
  uiPhase?: UiGenerationPhase;
  /** Structured preference recovery (WP7). */
  preferenceHints?: UiPreferenceHints;
};

export type RunUiGenerationResult = {
  ok: boolean;
  status: UiGenContextState["status"];
  contextPath: string;
  context: UiGenContextState;
  editorModel?: unknown;
  generatedCode?: string;
  error?: string;
  preference_recovery?: boolean;
  preference_recovery_question?: string;
  regeneration_count?: number;
  max_regenerations?: number;
  user_visible_stage?: string;
  /** Workspace App Preview files written (pass/repair only). */
  previewApplied?: boolean;
  previewWritten?: string[];
  /** Seed vs figma pattern mode for UI chrome. */
  patternMode?: "seed" | "figma";
  quality_gate_result?: string;
  figma_fallback_used?: boolean;
  env_guidance?: string;
};

type PageDef = { name: string; route: string; body: string };

function nowIso(): string {
  return new Date().toISOString();
}

function newContextId(): string {
  return `uig-v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function section(plan: Record<string, string>, index: 1 | 2 | 3 | 4 | 5): string {
  return (plan[MASTER_PLAN_SECTION_KEYS[index - 1]] || "").trim();
}

function firstLines(text: string, n: number): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, n)
    .join(" ");
}

function extractBullets(text: string, limit = 8): string[] {
  const out: string[] = [];
  for (const l of text.split("\n").map((x) => x.trim())) {
    const m = l.match(/^[-*•]\s+(.+)/) || l.match(/^\d+[.)]\s+(.+)/);
    if (m) out.push(m[1].trim());
    if (out.length >= limit) break;
  }
  return out;
}

function pagesFromMasterPlan(plan: Record<string, string>, projectName: string, pagesText: string): PageDef[] {
  const fromMind = mindMapPagesFromMasterPlan(plan, projectName).map((s) => ({
    name: s.label,
    route: s.route || "",
    body: `${s.label}${s.route ? ` (${s.route})` : ""}`,
  }));
  if (fromMind.length) return fromMind;
  const pages: PageDef[] = [];
  for (const b of extractBullets(pagesText, 12)) {
    const name = b.replace(/\s*\(`[^`]+`\)\s*$/, "").replace(/\*\*/g, "").trim();
    if (name) pages.push({ name, route: "", body: b });
  }
  return pages;
}

function pagesFromFileFacts(facts: WorkspaceFileFacts): PageDef[] {
  const out: PageDef[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < facts.page_names.length; i++) {
    const name = facts.page_names[i];
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      route: facts.routes[i] || `/${name.toLowerCase().replace(/\s+/g, "-")}`,
      body: [`- **${name}**`, ...facts.button_labels.slice(0, 3).map((b) => `- ${b}`)].join("\n"),
    });
  }
  return out;
}

function mergePages(a: PageDef[], b: PageDef[]): PageDef[] {
  const seen = new Set<string>();
  const out: PageDef[] = [];
  for (const p of [...a, ...b]) {
    const key = (p.route || p.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function isAuthishPage(p: PageDef): boolean {
  return /sign[\s_-]?in|sign[\s_-]?up|login|auth|register/i.test(`${p.name} ${p.route}`);
}

/** Prefer product home/practice over Login for first mockup (Phase 7.4 — avoid cyan auth-only shell). */
function pickPage(pages: PageDef[], want?: string): PageDef | undefined {
  if (!pages.length) return undefined;
  if (want) {
    const w = want.toLowerCase();
    return (
      pages.find((p) => p.name.toLowerCase() === w) ||
      pages.find((p) => p.name.toLowerCase().includes(w) || p.route.toLowerCase().includes(w)) ||
      pages[0]
    );
  }
  const homeish = pages.find((p) =>
    /home|practice|lesson|today|dashboard|feed|tasks|overview/i.test(`${p.name} ${p.route}`),
  );
  if (homeish) return homeish;
  const nonAuth = pages.find((p) => !isAuthishPage(p));
  return nonAuth || pages[0];
}

/** Up to 3 distinct plan pages for Studio + App Preview (Phase 8 early mockup). */
function selectMockupPages(pages: PageDef[], want?: string, max = 3): PageDef[] {
  if (!pages.length) return [];
  const primary = pickPage(pages, want);
  if (!primary) return [];
  const out: PageDef[] = [primary];
  const score = (p: PageDef): number => {
    const blob = `${p.name} ${p.route}`.toLowerCase();
    if (isAuthishPage(p)) return 10;
    if (/practice|lesson|exercise|task/i.test(blob)) return 90;
    if (/progress|dashboard|teacher|parent|stats/i.test(blob)) return 80;
    if (/home|today|feed|overview/i.test(blob)) return 70;
    if (/setting|profile|account/i.test(blob)) return 40;
    return 50;
  };
  const rest = pages
    .filter((p) => p !== primary)
    .sort((a, b) => score(b) - score(a));
  for (const p of rest) {
    if (out.length >= max) break;
    const key = (p.route || p.name).toLowerCase();
    if (out.some((o) => (o.route || o.name).toLowerCase() === key)) continue;
    // Keep at most one auth screen, and only if we still have room after product pages.
    if (isAuthishPage(p) && out.some(isAuthishPage)) continue;
    out.push(p);
  }
  // Prefer product screens: if we have < max and skipped auth, that's fine.
  return out.slice(0, max);
}

function uniquePageKey(name: string, used: Set<string>): string {
  let base = cleanHumanTitle(name, "Home").replace(/\s+/g, " ").trim() || "Home";
  if (base.length > 28) base = base.slice(0, 28).trim();
  let key = base;
  let n = 2;
  while (used.has(key.toLowerCase())) {
    key = `${base} ${n}`;
    n += 1;
  }
  used.add(key.toLowerCase());
  return key;
}

function hasUsableGoal(
  goal: string,
  tech: string,
  features: string,
  projectName: string,
  fileFacts: WorkspaceFileFacts,
): boolean {
  if (goal.trim().length >= 16) return true;
  const blob = `${goal}\n${tech}\n${features}`.trim();
  if (blob.length >= 40) return true;
  const named = projectName.trim() && !/^untitled/i.test(projectName.trim());
  if (named && (fileFacts.page_names.length >= 1 || fileFacts.routes.length >= 1)) return true;
  return hasMeaningfulUiFileGrounding(fileFacts);
}

function persist(workspaceRoot: string, state: UiGenContextState): string {
  return writeContextFile(workspaceRoot, state);
}

function mapNavToLegacy(nav: string): UiGenContextState["navigation_type"] {
  if (nav === "bottom_tabs") return "tabs";
  if (nav === "top_nav") return "topnav";
  if (nav === "sidebar") return "sidebar";
  return "none";
}

function mapPageTypeToLegacy(pt: string): UiGenContextState["page_type"] {
  if (pt === "home" || pt === "empty") return "other";
  if (
    pt === "dashboard" ||
    pt === "auth" ||
    pt === "settings" ||
    pt === "list" ||
    pt === "detail" ||
    pt === "landing" ||
    pt === "checkout" ||
    pt === "profile"
  ) {
    return pt;
  }
  return "other";
}

function mapFnToLegacy(fn: string): UiGenContextState["function"] {
  if (fn === "tasks") return "general";
  if (
    fn === "saas_admin" ||
    fn === "course" ||
    fn === "ecommerce" ||
    fn === "booking" ||
    fn === "community" ||
    fn === "marketing" ||
    fn === "general"
  ) {
    return fn;
  }
  return "general";
}

function fail(
  workspaceRoot: string,
  state: UiGenContextState,
  error: string,
  status: UiGenContextState["status"] = "failed",
): RunUiGenerationResult {
  state.status = status;
  state.failure_reason = error;
  state.user_visible_stage = status === "pending_discovery" ? "Needs discovery" : "Failed";
  appendStepLog(state, `FAIL — ${error}`);
  const contextPath = persist(workspaceRoot, state);
  writeCyclePolicy(workspaceRoot, {
    auto_triggered: state.auto_triggered === "yes" ? "yes" : "no",
    regeneration_count: state.regeneration_count,
    max_regenerations: state.max_regenerations,
    preference_feedback: state.preference_feedback,
    recovery_path: (state.recovery_path || "none") as
      | "guided_improvement"
      | "manual_refinement"
      | "partial_redesign"
      | "none",
    final_status: "failed",
    user_visible_stage: state.user_visible_stage,
    page_key: state.page_name,
    updated_at: nowIso(),
  });
  return {
    ok: false,
    status,
    contextPath,
    context: state,
    error,
    regeneration_count: state.regeneration_count,
    max_regenerations: state.max_regenerations,
    user_visible_stage: state.user_visible_stage,
  };
}

/**
 * Run v2 phases A–H in order. Freeform builder is not the success path.
 */
export async function runUiGenerationCycleV2(
  input: RunUiGenerationInput,
): Promise<RunUiGenerationResult> {
  const workspaceRoot = input.workspaceRoot;
  const state = emptyContextState();
  // Phase 7.4: do not keep a false regen-limit / preference-recovery lock when no model landed.
  const prevPolicy = clearFalseRegenBudgetIfEmptyMockup(workspaceRoot);
  const hasLoadable = workspaceHasLoadableMockup(workspaceRoot);
  const pageKey = (input.pageName || prevPolicy.page_key || "").trim();
  const preferenceFeedback = (input.preferenceFeedback || "").trim();
  const guidedImprovement = Boolean(input.guidedImprovement && preferenceFeedback);

  const stage = (label: string) => {
    state.user_visible_stage = label;
    setUserVisibleStage(workspaceRoot, label, {
      page_key: state.page_name || pageKey,
      regeneration_count: state.regeneration_count,
      max_regenerations: state.max_regenerations,
      auto_triggered: state.auto_triggered === "yes" ? "yes" : "no",
      preference_feedback: state.preference_feedback,
      recovery_path: (state.recovery_path || "none") as
        | "guided_improvement"
        | "manual_refinement"
        | "partial_redesign"
        | "none",
    });
  };

  state.max_regenerations = 3;
  state.preference_feedback = preferenceFeedback;
  state.auto_triggered = input.autoTriggered ? "yes" : "no";
  state.engine_version = "v2";

  if (guidedImprovement) {
    state.recovery_path = "guided_improvement";
    state.regeneration_count = Math.min(3, Math.max(1, prevPolicy.regeneration_count || 1));
  } else if (input.regenerate) {
    // Empty mockup repair must not burn the regen budget into preference recovery.
    if (!hasLoadable) {
      state.regeneration_count = 1;
      appendStepLog(state, "Empty mockup repair — regenerate treated as first seed cycle");
    } else if (input.uiPhase === "manual") {
      // User asked to Generate UI after coding — always run; do not trap in preference recovery.
      state.regeneration_count = Math.min(3, Math.max(1, (prevPolicy.regeneration_count || 0) + 1));
      appendStepLog(state, "Manual Generate UI — regen allowed after coding");
    } else {
      const next = (prevPolicy.regeneration_count || 0) + 1;
      if (next > 3) {
        state.context_id = newContextId();
        state.project_name = (input.projectName || "").trim() || "Untitled project";
        state.created_at = nowIso();
        state.regeneration_count = prevPolicy.regeneration_count;
        state.recovery_path = "guided_improvement";
        state.failure_reason = "Regeneration limit reached — preference recovery";
        stage("Preference recovery needed");
        const contextPath = persist(workspaceRoot, state);
        return {
          ok: false,
          status: "failed",
          contextPath,
          context: state,
          error: state.failure_reason,
          preference_recovery: true,
          preference_recovery_question: PREFERENCE_RECOVERY_QUESTION,
          regeneration_count: prevPolicy.regeneration_count,
          max_regenerations: 3,
          user_visible_stage: "Preference recovery needed",
        };
      }
      state.regeneration_count = next;
    }
  } else if (input.autoTriggered) {
    // Post-code one-shot refresh must not be blocked by the user Generate-again budget.
    const isPostCode = (input.uiPhase || "") === "post_code";
    if (
      !isPostCode &&
      hasLoadable &&
      prevPolicy.regeneration_count >= 3 &&
      prevPolicy.final_status !== "pending"
    ) {
      state.context_id = newContextId();
      state.project_name = (input.projectName || "").trim() || "Untitled project";
      state.created_at = nowIso();
      state.status = "failed";
      state.regeneration_count = prevPolicy.regeneration_count;
      state.recovery_path = "guided_improvement";
      state.failure_reason =
        "UI generation already reached the regeneration limit for this cycle — not auto-starting.";
      stage("Blocked — regeneration limit");
      const contextPath = persist(workspaceRoot, state);
      return {
        ok: false,
        status: "failed",
        contextPath,
        context: state,
        error: state.failure_reason,
        preference_recovery: true,
        preference_recovery_question: PREFERENCE_RECOVERY_QUESTION,
        regeneration_count: prevPolicy.regeneration_count,
        max_regenerations: 3,
        user_visible_stage: "Blocked — regeneration limit",
      };
    }
    state.regeneration_count = isPostCode
      ? Math.max(1, prevPolicy.regeneration_count || 1)
      : 1;
  } else {
    state.regeneration_count = Math.max(1, prevPolicy.regeneration_count || 1);
  }

  const resolvedUiPhase: UiGenerationPhase =
    input.uiPhase ||
    (input.writtenPaths && input.writtenPaths.length > 0
      ? "post_code"
      : input.autoTriggered
        ? "pre_code"
        : "manual");

  state.context_id = newContextId();
  state.project_name = (input.projectName || "").trim() || "Untitled project";
  state.page_name = (input.pageName || "").trim();
  state.created_at = nowIso();
  state.status = "in_progress";
  state.current_step = 1;
  appendStepLog(
    state,
    `v2 Phase start — phase=${resolvedUiPhase} regen=${state.regeneration_count}/${state.max_regenerations}`,
  );
  stage(
    resolvedUiPhase === "post_code"
      ? "Post-code UI refresh — classifying page"
      : resolvedUiPhase === "pre_code"
        ? "Pre-code mockup — classifying page"
        : "Classifying page",
  );
  persist(workspaceRoot, state);

  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    return fail(workspaceRoot || process.cwd(), state, "No active project workspace");
  }

  const planExists = Boolean(input.masterPlanPath && fs.existsSync(input.masterPlanPath));
  const plan = planExists
    ? hydrateAndPersistMasterPlan(workspaceRoot, input.masterPlanPath)
    : ({} as Record<string, string>);
  const goal = section(plan, 1);
  const tech = section(plan, 2);
  const features = section(plan, 3);
  const pagesText = section(plan, 4);
  let uiux = section(plan, 5);

  /** Ensure primary ui-brief exists, then prefer its page contracts + design tokens. */
  let uiBrief = "";
  if (planExists && input.masterPlanPath) {
    try {
      const synced = syncUiBriefFromMasterPlan(workspaceRoot, input.masterPlanPath);
      uiBrief = synced.content;
    } catch {
      uiBrief = readUiBriefMarkdown(workspaceRoot);
    }
  } else {
    uiBrief = readUiBriefMarkdown(workspaceRoot);
  }
  const briefTokens = extractDesignTokensFromUiBrief(uiBrief);
  if (briefTokens.trim().length > 40) {
    uiux = briefTokens;
  }
  const briefPages = parsePagesFromUiBrief(uiBrief).map((p) => ({
    name: p.name,
    route: p.route,
    body: p.body,
  }));

  const fileFacts = collectWorkspaceFileFacts(workspaceRoot, input.writtenPaths);
  state.file_scanned = fileFacts.scanned_files;
  state.file_routes = fileFacts.routes;
  state.file_button_labels = [...fileFacts.button_labels, ...fileFacts.link_labels];
  state.file_headings = fileFacts.headings;

  const pages = mergePages(
    briefPages.length > 0 ? briefPages : pagesFromMasterPlan(plan, state.project_name, pagesText),
    pagesFromFileFacts(fileFacts),
  );
  if (uiBrief) {
    appendStepLog(state, `Using ui-brief.md (${uiBrief.length} chars) as primary UI input`);
  }
  const section4RouteHints = (pagesText.match(/`(\/[^`]+)`/g) || []).length;
  if (
    uiBrief.trim().length < 80 &&
    briefPages.length < 1 &&
    section4RouteHints >= 2 &&
    !hasMeaningfulUiFileGrounding(fileFacts)
  ) {
    return fail(
      workspaceRoot,
      state,
      "Finish page contracts first — save the Master Plan so ui-brief.md is generated, then Generate UI.",
      "pending_discovery",
    );
  }
  const hasGoal = hasUsableGoal(goal, tech, features, state.project_name, fileFacts);
  const hasPage = pages.length >= 1;
  const fileGrounded = hasMeaningfulUiFileGrounding(fileFacts);
  if (!(hasGoal && hasPage) && !(fileGrounded && hasPage)) {
    return fail(
      workspaceRoot,
      state,
      "Needs more product truth: add Master Plan pages or generate UI app files first",
      "pending_discovery",
    );
  }

  const chosen = pickPage(pages, input.pageName || undefined) || pages[0];
  if (!chosen) {
    return fail(workspaceRoot, state, "No page found", "pending_discovery");
  }

  const filePageFallback =
    fileFacts.page_names.find((n) => n.trim().length >= 2 && n.trim().length <= 28 && !n.includes("/")) ||
    fileFacts.page_names[0] ||
    "Home";
  const chosenLooksLikeProse =
    chosen.name.trim().split(/\s+/).length > 5 || chosen.name.trim().length > 36;
  state.page_name =
    chosenLooksLikeProse && filePageFallback !== "Home"
      ? cleanHumanTitle(filePageFallback, "Home")
      : cleanHumanTitle(chosen.name, filePageFallback);
  state.page_purpose =
    firstLines(chosen.body.replace(chosen.name, ""), 4) ||
    fileFacts.headings.find((h) => h.length <= 48 && !h.includes("/")) ||
    `Help users use ${state.page_name}`;
  state.product_goal = firstLines(goal, 6) || `Build ${state.project_name}`;
  state.project_type = /mobile|expo|react native/i.test(`${goal}\n${tech}`)
    ? "Mobile App"
    : /landing/i.test(`${goal}\n${tech}`)
      ? "Landing Page"
      : "Web App";
  if (
    /BottomNav|tab bar|expo/i.test(fileFacts.scanned_files.join(" ")) ||
    fileFacts.scanned_files.some((p) => /app\//i.test(p))
  ) {
    state.project_type = "Mobile App";
  }
  state.priority_features = extractBullets(features, 8);
  const primaryFromBrief = chosen.body.match(/primary[_ ]?actions?\s*:\s*(.+)/i);
  if (primaryFromBrief?.[1]) {
    state.primary_actions = primaryFromBrief[1]
      .split(/[,;]/)
      .map((s) => s.replace(/\*\*/g, "").trim())
      .filter((s) => s.length >= 2 && s.length <= 48 && !s.includes("/"))
      .slice(0, 3);
  } else {
    state.primary_actions = extractBullets(chosen.body, 6)
      .filter((a) => a.length <= 40 && !a.includes("/"))
      .slice(0, 2);
  }
  if (fileFacts.button_labels[0] && !state.primary_actions.length) {
    state.primary_actions = [fileFacts.button_labels[0]];
  }
  state.secondary_actions = fileFacts.button_labels.slice(1, 4);
  state.visual_tone = firstLines(uiux, 3) || "(not found)";
  state.palette = uiux.match(/#[0-9a-fA-F]{3,8}/)
    ? [...uiux.matchAll(/#[0-9a-fA-F]{3,8}/g)].slice(0, 6).map((m) => m[0]).join(" ")
    : "(not found)";
  state.style_constraints = uiux ? firstLines(uiux, 10) : "(not found)";
  state.color_direction = state.palette !== "(not found)" ? state.palette : state.visual_tone;

  // -------- Phase A — Classify --------
  stage("Classifying page");
  const classification = classifyPage({
    projectType: state.project_type,
    goal: goal || state.product_goal,
    features: features || state.priority_features.join("\n"),
    uiux,
    pageName: state.page_name,
    pagePurpose: state.page_purpose,
    pageRoute: chosen.route || "",
    filePaths: fileFacts.scanned_files,
    fileRoutes: fileFacts.routes,
    hasBottomNav: /BottomNav|tab bar/i.test(fileFacts.scanned_files.join(" ")),
  });
  state.device = classification.device;
  state.page_type = mapPageTypeToLegacy(classification.page_type);
  state.function = mapFnToLegacy(classification.product_function);
  state.product_function = classification.product_function;
  state.navigation_type = mapNavToLegacy(classification.navigation_mode);
  state.density = classification.density;
  state.industry = classification.industry;
  state.industry_class =
    classification.industry === "education" ||
    classification.industry === "finance" ||
    classification.industry === "health" ||
    classification.industry === "retail" ||
    classification.industry === "general"
      ? classification.industry
      : "other";
  state.confidence = classification.confidence;
  state.classification_notes = classification.notes;
  state.v2_page_type = classification.page_type;
  state.v2_navigation_mode = classification.navigation_mode;
  appendStepLog(state, `Phase A classify — ${classification.notes}`);
  state.current_step = 2;
  persist(workspaceRoot, state);

  // -------- Design Brief + resource match (intelligence layer) --------
  stage("Compiling design brief");
  let designBrief: DesignBrief = compileDesignBrief({
    uiuxSection: uiux,
    uiBriefMarkdown: uiBrief,
    classification,
    projectName: state.project_name,
  });
  let briefGrokRefined = false;
  if (input.apiKeyOverride?.trim()) {
    const refined = await refineDesignBriefWithGrok({
      brief: designBrief,
      uiuxSection: uiux,
      uiBriefMarkdown: uiBrief,
      projectName: state.project_name,
      apiKey: input.apiKeyOverride,
    });
    designBrief = refined.brief;
    briefGrokRefined = refined.refined;
    if (refined.refined) {
      appendStepLog(state, "Design brief — Grok refine applied (roles only, no layout invent)");
    } else if (refined.skippedReason && refined.skippedReason !== "disabled") {
      state.generation_warnings.push(`Brief Grok refine skipped: ${refined.skippedReason}`);
    }
  }
  let designBriefPath: string | undefined;
  try {
    const briefPath = path.join(workspaceRoot, "nebulla-project", "ui-design-brief.json");
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.writeFileSync(briefPath, `${JSON.stringify(designBrief, null, 2)}\n`, "utf8");
    designBriefPath = "nebulla-project/ui-design-brief.json";
  } catch (e) {
    state.generation_warnings.push(
      `ui-design-brief.json write failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  appendStepLog(
    state,
    `Design brief — density=${designBrief.overview.density} personality=${designBrief.overview.personality.join(",")}`,
  );

  let resourceMatch: ResourceMatchResult = {
    id: "",
    score: 0,
    max_score: 0,
    reasons: [],
    selection_mode: "disabled",
  };
  let rematchGrokApplied = false;
  let catalogProfiles: Awaited<ReturnType<typeof listProfilesFs>> = [];
  try {
    const workspaceCatalog = path.join(workspaceRoot, "nebulla-project", "ui-resource-catalog");
    const local = await listProfilesFs(workspaceCatalog);
    // Prefer workspace FS → configured catalog mode (r2|fs via listProfiles) → never empty silently.
    catalogProfiles = local.length > 0 ? local : await listProfiles(process.cwd());
    resourceMatch = matchResources({
      profiles: catalogProfiles,
      brief: designBrief,
      classification,
    });
    if (input.apiKeyOverride?.trim() && catalogProfiles.length > 0) {
      const rematch = await suggestResourceRematchWithGrok({
        profiles: catalogProfiles,
        brief: designBrief,
        classification,
        currentMatch: resourceMatch,
        apiKey: input.apiKeyOverride,
      });
      if (rematch.rematched) {
        resourceMatch = rematch.match;
        rematchGrokApplied = true;
        appendStepLog(
          state,
          `Resource rematch — Grok shortlist pick id=${resourceMatch.id} score=${resourceMatch.score}`,
        );
      }
    }
  } catch (e) {
    appendStepLog(
      state,
      `Resource match skipped — ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // -------- Phase B — Template --------
  stage("Choosing layout");
  const preferAlternate =
    (Boolean(input.regenerate) &&
      prevPolicy.final_status === "rejected" &&
      state.regeneration_count > 1) ||
    Boolean(input.preferenceHints?.moreSections);
  const previousTemplate = (prevPolicy as { template_id?: string }).template_id as
    | V2TemplateId
    | undefined;
  let template = selectTemplate(classification, {
    preferAlternate,
    previousTemplate,
  });
  // Regen / moreSections: re-match excluding the previous template so intelligence still applies.
  if (preferAlternate && catalogProfiles.length > 0) {
    const altMatch = matchResources({
      profiles: catalogProfiles,
      brief: designBrief,
      classification,
      excludeTemplateIds: previousTemplate ? [previousTemplate, template.id] : [template.id],
    });
    if (altMatch.selection_mode === "scored_match" && altMatch.template_id) {
      resourceMatch = altMatch;
    }
  }
  if (resourceMatch.selection_mode === "scored_match" && resourceMatch.template_id) {
    const matched = getTemplateById(resourceMatch.template_id);
    if (matched) {
      template = matched;
      appendStepLog(
        state,
        `Resource match — id=${resourceMatch.id} score=${resourceMatch.score}/${resourceMatch.max_score} → template ${template.id}${preferAlternate ? " (alternate)" : ""}`,
      );
    }
  } else if (resourceMatch.id) {
    appendStepLog(
      state,
      `Resource match — mode=${resourceMatch.selection_mode} score=${resourceMatch.score} (using selectTemplate fallback)`,
    );
  }
  state.template_id = template.id;
  appendStepLog(state, `Phase B template — ${template.id} regions=${template.regions.join(",")}`);
  state.current_step = 3;
  persist(workspaceRoot, state);

  // -------- Phase C — Figma --------
  stage("Fetching Figma references");
  const catalogHints = [
    ...(resourceMatch.profile?.strengths || []),
    ...(resourceMatch.profile?.best_for || []).map((b) => `best_for:${b}`),
    ...(resourceMatch.reasons || []).map((r) => r.detail),
    ...(designBrief.component_rules || []),
    ...(designBrief.dos || []),
    `density=${designBrief.overview.density}`,
    `personality=${designBrief.overview.personality.join(",")}`,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 14);
  const figma = await retrieveFigmaReferences({
    classification,
    templateId: template.id,
    preferredFileKey: resourceMatch.figma_file_key,
    catalogProfileId: resourceMatch.id || undefined,
    catalogHints,
    catalogScoredMatch: resourceMatch.selection_mode === "scored_match",
    seedState: {
      device: classification.device,
      page_type: mapPageTypeToLegacy(classification.page_type),
      function: mapFnToLegacy(classification.product_function),
      navigation_type: mapNavToLegacy(classification.navigation_mode),
      industry_class: state.industry_class,
      visual_tone: state.visual_tone,
      density: classification.density,
    },
  });
  const structurePlan = parseStructureLayoutPlan(
    figma.structure_hints,
    classification.page_type,
    template.id,
  );
  state.figma_used = figma.figma_used;
  state.figma_status = figma.figma_status;
  state.figma_error = figma.figma_error;
  state.fallback_used = figma.fallback_used;
  state.reference_source =
    figma.figma_used === "yes"
      ? "figma"
      : figma.selection_mode.includes(":catalog:")
        ? "catalog"
        : figma.selection_mode.includes(":brief:")
          ? "brief"
          : figma.fallback_used === "yes"
            ? "seed"
            : "mixed";
  state.candidates = figma.candidates;
  state.selected_refs = figma.selected_refs;
  if (figma.figma_error) {
    state.generation_warnings.push(`Figma: ${figma.figma_status} — ${figma.figma_error}`);
  }
  if (
    figma.figma_status !== "offline" &&
    figma.figma_status !== "success" &&
    figma.reference_file_keys_configured === 0
  ) {
    state.generation_warnings.push(
      "Offline shortlist empty — run npm run figma:download && npm run figma:extract-structure (or deploy structure/).",
    );
  }
  state.adapt_kept = [...figma.selected_refs.map((r) => r.why), ...figma.structure_hints.slice(0, 6)]
    .filter(Boolean)
    .join(" | ");
  state.adapt_discarded =
    "Decorative Figma chrome, unrelated marketing blobs, absolute-position noise.";
  state.adapt_replaced = `Template ${template.id} + structure plan (${structurePlan.summary}) mapped into slots/regions.`;
  appendStepLog(
    state,
    `Phase C figma — used=${figma.figma_used} status=${figma.figma_status} mode=${figma.selection_mode} plan=${structurePlan.summary} hints=${figma.structure_hints.length}`,
  );
  state.current_step = 4;
  persist(workspaceRoot, state);

  // -------- Phase D — Tokens --------
  stage("Applying design tokens");
  let tokens = buildDesignTokens(uiux, state.palette, classification.density);
  // Align spacing with compiled Design Brief roles (before preference nudges).
  tokens.gap = designBrief.spacing_radius.gap;
  tokens.pad = designBrief.spacing_radius.pad;
  tokens.radius = designBrief.spacing_radius.radius;
  tokens.primary = designBrief.color_roles.primary.hex;
  tokens.bg = designBrief.color_roles.background.hex;
  tokens.surface = designBrief.color_roles.surface.hex;
  tokens.text = designBrief.color_roles.on_surface.hex;
  tokens.mutedText = designBrief.color_roles.muted.hex;
  tokens.border = designBrief.color_roles.border.hex;
  if (designBrief.color_roles.accent) tokens.accent = designBrief.color_roles.accent.hex;
  // Apply offline/catalog spacing rhythm within a bounded window of the brief.
  tokens = applyPlanToTokens(tokens, structurePlan);
  const hints = input.preferenceHints || {};
  if (hints.denser) {
    tokens.gap = Math.max(6, tokens.gap - 4);
    tokens.pad = Math.max(8, tokens.pad - 4);
  }
  if (hints.looser) {
    tokens.gap = Math.min(28, tokens.gap + 4);
    tokens.pad = Math.min(28, tokens.pad + 4);
  }
  if (hints.moreContrast) {
    // Nudge text contrast only — never replace Design Brief primary role.
    tokens.text = designBrief.color_roles.on_surface.hex;
    tokens.mutedText = designBrief.color_roles.muted.hex;
    const bgL =
      parseInt(tokens.bg.replace("#", "").slice(0, 2), 16) / 255;
    if (bgL > 0.5) {
      tokens.text = "#0C0A09";
      tokens.mutedText = "#57534E";
    } else {
      tokens.text = "#FAFAF9";
      tokens.mutedText = "#A1A1AA";
    }
  }
  state.design_tokens_json = JSON.stringify(tokens);
  state.design_system_rules_applied = "yes";
  appendStepLog(
    state,
    `Phase D tokens — bg=${tokens.bg} primary=${tokens.primary} radius=${tokens.radius}`,
  );
  state.current_step = 5;
  persist(workspaceRoot, state);

  // -------- Phase E — Slots --------
  stage("Mapping content");
  let slots = mapSlots({
    template,
    classification,
    pageName: state.page_name,
    pagePurpose: state.page_purpose,
    projectName: state.project_name,
    primaryActions: state.primary_actions,
    secondaryActions: state.secondary_actions,
    headings: state.file_headings,
    buttonLabels: state.file_button_labels,
    features: state.priority_features,
    preferenceFeedback,
  });
  if (hints.strongerCta && slots.primary_cta) {
    const c = slots.primary_cta.trim();
    if (c && !/[!]$/.test(c) && c.length < 24) slots.primary_cta = `${c}`;
    if (/^(continue|next|ok|submit)$/i.test(c)) {
      slots.primary_cta =
        classification.product_function === "ecommerce"
          ? "Shop now"
          : classification.product_function === "booking"
            ? "Book now"
            : "Get started free";
    }
  }
  // Apply offline/catalog structure plan into slots (cards/fields/CTAs) before render.
  slots = ensureSlotsForStructurePlan(
    slots,
    structurePlan,
    classification.page_type,
    state.project_name,
    state.priority_features,
  );
  slots = sanitizeSlotsForPageType(slots, classification.page_type);
  // CONTENT_LOCALE microcopy (optional Grok) — layout unchanged
  const contentLocale = readWorkspaceContentLocale(workspaceRoot) || "en";
  if (input.apiKeyOverride?.trim()) {
    stage("Polishing labels");
    const polished = await polishSlotsForContentLocale({
      slots,
      contentLocale,
      apiKey: input.apiKeyOverride,
    });
    slots = polished.slots;
    if (polished.polished) {
      appendStepLog(state, `Phase E locale polish — CONTENT_LOCALE=${contentLocale}`);
    } else if (polished.skippedReason && polished.skippedReason !== "locale_en") {
      state.generation_warnings.push(`Locale polish skipped: ${polished.skippedReason}`);
    }
  }
  state.primary_cta = slots.primary_cta || "";
  state.secondary_ctas = slots.secondary_cta ? [slots.secondary_cta] : [];
  state.slot_content_json = JSON.stringify(slots);
  state.page_name = slots.hero_title || slots.nav_title || state.page_name;
  appendStepLog(
    state,
    `Phase E slots — title="${slots.hero_title}" cta="${slots.primary_cta}" plan=${structurePlan.summary}`,
  );
  state.current_step = 6;
  persist(workspaceRoot, state);

  // -------- Phase F — Render --------
  stage("Rendering UI");
  let model = renderTemplateModel({
    template,
    classification,
    tokens,
    slots,
    figmaStatus: figma.figma_status,
    structureHints: figma.structure_hints,
  });
  let code = renderTemplateCode({ template, tokens, slots });
  state.model_used = "ui-generation-logic-v2";
  state.quality_rules_applied = "yes";
  state.generated_code = code;
  state.editor_model_json = JSON.stringify(model);
  appendStepLog(state, `Phase F render — template=${template.id} nodes=${Object.keys(Object.values(model.pages)[0]?.nodes || {}).length}`);
  state.current_step = 7;
  persist(workspaceRoot, state);

  // -------- Phase G — Quality gate + one repair --------
  stage("Validating");
  const nodeRolesFrom = (m: typeof model): string[] => {
    const page = Object.values(m.pages)[0];
    return Object.values(page?.nodes || {}).map((n) => n.role || "");
  };
  const regionsOk = (m: typeof model, s: typeof slots) =>
    structureRegionsSatisfied({
      slots: s,
      pageType: classification.page_type,
      needsPrimaryCta: template.needsPrimaryCta,
      nodeRoles: nodeRolesFrom(m),
    });
  const structureRequired =
    structurePlan.enforceRegions &&
    (figma.figma_status === "offline" || figma.figma_status === "success");

  let gate = validateV2Quality({
    model,
    template,
    tokens,
    slots,
    figmaStatus: figma.figma_status,
    pageType: classification.page_type,
    designBrief,
    selectionMode: figma.selection_mode,
    navigationMode: classification.navigation_mode,
  });
  state.repair_pass_used = "no";
  const needsRepair =
    gate.gate !== "pass" || (structureRequired && !regionsOk(model, slots));
  if (needsRepair) {
    state.repair_pass_used = "yes";
    const beforeKeys = Object.keys(slots).sort().join(",");
    slots = repairSlots(slots, classification.page_type);
    slots = ensureSlotsForStructurePlan(
      slots,
      structurePlan,
      classification.page_type,
      state.project_name,
      state.priority_features,
    );
    slots = sanitizeSlotsForPageType(slots, classification.page_type);
    const afterKeys = Object.keys(slots).sort().join(",");
    state.slot_content_json = JSON.stringify(slots);
    model = renderTemplateModel({
      template,
      classification,
      tokens,
      slots,
      figmaStatus: figma.figma_status,
      structureHints: figma.structure_hints,
    });
    code = renderTemplateCode({ template, tokens, slots });
    state.generated_code = code;
    state.editor_model_json = JSON.stringify(model);
    gate = validateV2Quality({
      model,
      template,
      tokens,
      slots,
      figmaStatus: figma.figma_status,
      pageType: classification.page_type,
      designBrief,
      selectionMode: figma.selection_mode,
      navigationMode: classification.navigation_mode,
    });
    if (structureRequired && !regionsOk(model, slots)) {
      gate = {
        gate: "weak",
        issues: [
          ...gate.issues,
          "Offline structure regions unbound after repair — not Ready",
        ],
      };
    } else if (gate.gate === "repair") {
      // One repair already used — remaining stitch/library issues fail Ready.
      gate = { gate: "weak", issues: gate.issues };
    }
    appendStepLog(
      state,
      `Phase G repair — gate=${gate.gate}; slots ${beforeKeys === afterKeys ? "unchanged" : "rebound"}; issues=${gate.issues.join("; ") || "none"}`,
    );
  }
  state.quality_gate_result = gate.gate;
  state.missing_required_sections = gate.issues;
  appendStepLog(state, `Phase G gate — ${gate.gate}`);
  state.current_step = 8;
  persist(workspaceRoot, state);

  // -------- Phase G.2 — Extra plan screens (up to 3) for Studio + App Preview --------
  type ScreenPreview = {
    pageKey: string;
    templateId: string;
    slots: typeof slots;
    classification: {
      device: string;
      page_type: string;
      navigation_mode: string;
      product_function: string;
      industry: string;
    };
  };
  const usedPageKeys = new Set<string>();
  const primaryPageKey = uniquePageKey(state.page_name || "Home", usedPageKeys);
  // Rename primary page key in model if needed
  const primaryPageNodes = Object.values(model.pages)[0];
  const mergedPages: typeof model.pages = primaryPageNodes
    ? { [primaryPageKey]: primaryPageNodes }
    : { ...model.pages };
  const screens: ScreenPreview[] = [
    {
      pageKey: primaryPageKey,
      templateId: template.id,
      slots: { ...slots },
      classification: {
        device: classification.device,
        page_type: classification.page_type,
        navigation_mode: classification.navigation_mode,
        product_function: classification.product_function,
        industry: classification.industry,
      },
    },
  ];

  if (shouldApplyUiToPreview(gate.gate)) {
    stage("Rendering extra screens");
    const mockupPages = selectMockupPages(pages, input.pageName || undefined, 3);
    for (const extra of mockupPages.slice(1)) {
      try {
        const pageName = cleanHumanTitle(extra.name, "Screen");
        const pagePurpose =
          firstLines(extra.body.replace(extra.name, ""), 4) || `Help users use ${pageName}`;
        const pageClass = classifyPage({
          projectType: state.project_type,
          goal: goal || state.product_goal,
          features: features || state.priority_features.join("\n"),
          uiux,
          pageName,
          pagePurpose,
          pageRoute: extra.route || "",
          filePaths: fileFacts.scanned_files,
          fileRoutes: fileFacts.routes,
          hasBottomNav: /BottomNav|tab bar/i.test(fileFacts.scanned_files.join(" ")),
        });
        const pageTemplate = selectTemplate(pageClass);
        let pageSlots = mapSlots({
          template: pageTemplate,
          classification: pageClass,
          pageName,
          pagePurpose,
          projectName: state.project_name,
          primaryActions: extractBullets(extra.body, 4).slice(0, 2),
          secondaryActions: state.secondary_actions,
          headings: state.file_headings,
          buttonLabels: state.file_button_labels,
          features: state.priority_features,
          preferenceFeedback,
        });
        const extraHints =
          pageClass.page_type === "auth" ? [] : figma.structure_hints;
        pageSlots = ensureSlotsForStructurePlan(
          pageSlots,
          parseStructureLayoutPlan(extraHints, pageClass.page_type, pageTemplate.id),
          pageClass.page_type,
          state.project_name,
          state.priority_features,
        );
        pageSlots = sanitizeSlotsForPageType(pageSlots, pageClass.page_type);
        const pageModel = renderTemplateModel({
          template: pageTemplate,
          classification: pageClass,
          tokens,
          slots: pageSlots,
          figmaStatus: figma.figma_status,
          structureHints: extraHints,
        });
        const pageKey = uniquePageKey(
          pageSlots.hero_title || pageSlots.nav_title || pageName,
          usedPageKeys,
        );
        const pageData = Object.values(pageModel.pages)[0];
        if (pageData) mergedPages[pageKey] = pageData;
        screens.push({
          pageKey,
          templateId: pageTemplate.id,
          slots: pageSlots,
          classification: {
            device: pageClass.device,
            page_type: pageClass.page_type,
            navigation_mode: pageClass.navigation_mode,
            product_function: pageClass.product_function,
            industry: pageClass.industry,
          },
        });
      } catch (e) {
        state.generation_warnings.push(
          `Extra screen soft-failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    appendStepLog(
      state,
      `Phase G.2 screens — ${screens.map((s) => s.pageKey).join(", ")} (${screens.length})`,
    );
  }

  // -------- Phase H — Deliver --------
  const deliveredStage =
    gate.gate === "pass"
      ? resolvedUiPhase === "post_code"
        ? "Post-code UI refresh — Ready in preview"
        : resolvedUiPhase === "pre_code"
          ? "Pre-code mockup — Ready in preview"
          : "Ready in preview"
      : gate.gate === "repair"
        ? "Needs one more repair — Preview not updated yet"
        : "Weak quality — try Generate again";
  stage(deliveredStage);

  const editorModel = {
    pages: mergedPages,
    meta: {
      engine: "v2" as const,
      template_id: template.id,
      tokens,
      slots,
      figma_status: figma.figma_status,
    },
  };
  try {
    writeEnginePreviewModel(workspaceRoot, editorModel);
    writePreviewModel(workspaceRoot, editorModel);
  } catch (e) {
    state.generation_warnings.push(
      `preview-model write soft-failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const outDir = path.join(workspaceRoot, "nebulla-project");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "ui-generation-output.tsx"), code, "utf8");

  const libraryHit =
    figma.figma_status === "success" ||
    figma.figma_status === "offline" ||
    figma.selection_mode.includes(":catalog:");
  const structureAppliedToSlots =
    libraryHit &&
    regionsOk(model, slots) &&
    (structurePlan.enforceRegions || figma.selection_mode.includes(":catalog:"));
  const patternMode: "seed" | "figma" = structureAppliedToSlots ? "figma" : "seed";
  let previewWritten: string[] = [];
  let previewApplied = false;
  if (shouldApplyUiToPreview(gate.gate)) {
    try {
      previewWritten = applyUiGenerationToPreviewShell({
        workspaceRoot,
        projectName: state.project_name,
        templateId: template.id,
        tokens,
        slots,
        patternMode,
        classification: {
          device: classification.device,
          page_type: classification.page_type,
          navigation_mode: classification.navigation_mode,
          product_function: classification.product_function,
          industry: classification.industry,
        },
        screens,
      });
      previewApplied = previewWritten.length > 0;
      appendStepLog(state, `Phase H preview sync — wrote ${previewWritten.join(", ")}`);
    } catch (e) {
      state.generation_warnings.push(
        `preview shell write soft-failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    appendStepLog(state, "Phase H preview sync — skipped (weak gate)");
  }

  // Extra cycle memory for tokens/slots/template
  fs.writeFileSync(
    path.join(outDir, "ui-generation-v2-meta.json"),
    JSON.stringify(
      {
        engine: "v2",
        phase: resolvedUiPhase,
        template_id: template.id,
        classification,
        tokens,
        slots,
        pattern_mode: patternMode,
        preview_applied: previewApplied,
        preview_written: previewWritten,
        screens: screens.map((s) => ({
          page_key: s.pageKey,
          template_id: s.templateId,
          classification: s.classification,
          slots: s.slots,
        })),
        design_brief_path: designBriefPath || null,
        design_brief_summary: {
          density: designBrief.overview.density,
          personality: designBrief.overview.personality,
          gaps: designBrief.gaps,
          primary: designBrief.color_roles.primary.hex,
          grok_refined: briefGrokRefined,
        },
        resource_match: {
          id: resourceMatch.id,
          score: resourceMatch.score,
          max_score: resourceMatch.max_score,
          selection_mode: resourceMatch.selection_mode,
          reasons: resourceMatch.reasons,
          template_id: resourceMatch.template_id,
          figma_file_key: resourceMatch.figma_file_key,
          grok_rematch: rematchGrokApplied,
        },
        figma: {
          figma_used: figma.figma_used,
          figma_status: figma.figma_status,
          figma_error: figma.figma_error,
          fallback_used: figma.fallback_used,
          reference_file_keys_configured: figma.reference_file_keys_configured,
          env_guidance: figma.env_guidance,
          selection_mode: figma.selection_mode,
          preferred_bucket: figma.preferred_bucket,
          key_diagnostics: figma.key_diagnostics.slice(0, 8),
          selected_refs: figma.selected_refs,
          candidates: figma.candidates.slice(0, 6),
          structure_hints: figma.structure_hints.slice(0, 10),
        },
        quality_gate_result: gate.gate,
        gate_issues: gate.issues,
        regeneration_count: state.regeneration_count,
        how_to_recheck:
          "Generate UI → open nebulla-project/ui-generation-v2-meta.json → read design_brief_path / resource_match / pattern_mode / figma.figma_status / preview_applied / gate_issues",
      },
      null,
      2,
    ),
    "utf8",
  );

  state.preview_delivered = shouldApplyUiToPreview(gate.gate) ? "yes" : "no";
  state.export_available = gate.gate === "weak" ? "no" : "yes";
  state.output_type = "react_tailwind_page";
  state.status = gate.gate === "weak" ? "failed" : "generated";
  state.final_status = gate.gate === "weak" ? "rejected" : "pending";
  appendStepLog(state, `Phase H deliver — stage=${deliveredStage} status=${state.status}`);
  state.current_step = 9;
  persist(workspaceRoot, state);

  writeCyclePolicy(workspaceRoot, {
    auto_triggered: state.auto_triggered === "yes" ? "yes" : "no",
    regeneration_count: state.regeneration_count,
    max_regenerations: state.max_regenerations,
    preference_feedback: state.preference_feedback,
    recovery_path: (state.recovery_path || "none") as
      | "guided_improvement"
      | "manual_refinement"
      | "partial_redesign"
      | "none",
    final_status: gate.gate === "weak" ? "rejected" : "generated",
    user_visible_stage: deliveredStage,
    page_key: state.page_name,
    updated_at: nowIso(),
    template_id: template.id,
  });

  const contextPath = writeContextFile(workspaceRoot, state);
  const deliverOk = gate.gate !== "weak";
  return {
    ok: deliverOk,
    status: state.status,
    contextPath,
    context: state,
    editorModel,
    generatedCode: code,
    error: deliverOk ? undefined : "Quality gate: weak — try Generate again",
    regeneration_count: state.regeneration_count,
    max_regenerations: state.max_regenerations,
    user_visible_stage: deliveredStage,
    previewApplied,
    previewWritten,
    patternMode,
    quality_gate_result: gate.gate,
    figma_fallback_used: figma.fallback_used === "yes",
    env_guidance: figma.env_guidance,
  };
}
