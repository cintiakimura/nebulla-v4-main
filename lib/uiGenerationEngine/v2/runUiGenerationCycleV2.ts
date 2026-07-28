/**
 * UI Studio Beta — Generation Logic v2 cycle runner.
 * Authority: nebulla-project/ui-generation-logic-v2.md
 * Doctrine: Template first. Figma forced. Tokens mandatory. Content mapped into slots. No freeform chaos.
 */

import fs from "fs";
import path from "path";
import { hydrateAndPersistMasterPlan, mindMapPagesFromMasterPlan } from "../../nebulaIdeWorkspaceArtifacts";
import { MASTER_PLAN_SECTION_KEYS } from "../../masterPlanSections";
import { writePreviewModel } from "../../visualUiEditorPreview";
import { appendStepLog, writeContextFile } from "../contextIO";
import { readCyclePolicy, setUserVisibleStage, writeCyclePolicy } from "../cyclePolicy";
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
import { retrieveFigmaReferences } from "./figmaReferences";
import { mapSlots } from "./mapSlots";
import { repairSlots, validateV2Quality } from "./qualityGate";
import { renderTemplateCode, renderTemplateModel } from "./renderTemplateModel";
import { selectTemplate } from "./selectTemplate";
import type { V2TemplateId } from "./types";
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

function pickPage(pages: PageDef[], want?: string): PageDef | undefined {
  if (!pages.length) return undefined;
  if (!want) return pages[0];
  const w = want.toLowerCase();
  return (
    pages.find((p) => p.name.toLowerCase() === w) ||
    pages.find((p) => p.name.toLowerCase().includes(w) || p.route.toLowerCase().includes(w)) ||
    pages[0]
  );
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
  const prevPolicy = readCyclePolicy(workspaceRoot);
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
    const next = (prevPolicy.regeneration_count || 0) + 1;
    if (next > 3) {
      state.context_id = newContextId();
      state.project_name = (input.projectName || "").trim() || "Untitled project";
      state.created_at = nowIso();
      state.regeneration_count = prevPolicy.regeneration_count;
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
  } else if (input.autoTriggered) {
    if (prevPolicy.regeneration_count >= 3 && prevPolicy.final_status !== "pending") {
      state.context_id = newContextId();
      state.project_name = (input.projectName || "").trim() || "Untitled project";
      state.created_at = nowIso();
      state.status = "failed";
      state.regeneration_count = prevPolicy.regeneration_count;
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
    state.regeneration_count = 1;
  } else {
    state.regeneration_count = Math.max(1, prevPolicy.regeneration_count || 1);
  }

  state.context_id = newContextId();
  state.project_name = (input.projectName || "").trim() || "Untitled project";
  state.page_name = (input.pageName || "").trim();
  state.created_at = nowIso();
  state.status = "in_progress";
  state.current_step = 1;
  appendStepLog(state, `v2 Phase start — regen=${state.regeneration_count}/${state.max_regenerations}`);
  stage("Classifying page");
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
  const uiux = section(plan, 5);

  const fileFacts = collectWorkspaceFileFacts(workspaceRoot, input.writtenPaths);
  state.file_scanned = fileFacts.scanned_files;
  state.file_routes = fileFacts.routes;
  state.file_button_labels = [...fileFacts.button_labels, ...fileFacts.link_labels];
  state.file_headings = fileFacts.headings;

  const pages = mergePages(
    pagesFromMasterPlan(plan, state.project_name, pagesText),
    pagesFromFileFacts(fileFacts),
  );
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
  state.primary_actions = extractBullets(chosen.body, 6)
    .filter((a) => a.length <= 40 && !a.includes("/"))
    .slice(0, 2);
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
  const template = selectTemplate(classification, {
    preferAlternate,
    previousTemplate,
  });
  state.template_id = template.id;
  appendStepLog(state, `Phase B template — ${template.id} regions=${template.regions.join(",")}`);
  state.current_step = 3;
  persist(workspaceRoot, state);

  // -------- Phase C — Figma --------
  stage("Fetching Figma references");
  const figma = await retrieveFigmaReferences({
    classification,
    templateId: template.id,
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
  state.figma_used = figma.figma_used;
  state.figma_status = figma.figma_status;
  state.figma_error = figma.figma_error;
  state.fallback_used = figma.fallback_used;
  state.reference_source =
    figma.figma_used === "yes" ? "figma" : figma.fallback_used === "yes" ? "seed" : "mixed";
  state.candidates = figma.candidates;
  state.selected_refs = figma.selected_refs;
  if (figma.figma_error) {
    state.generation_warnings.push(`Figma: ${figma.figma_status} — ${figma.figma_error}`);
  }
  state.adapt_kept = [...figma.selected_refs.map((r) => r.why), ...figma.structure_hints.slice(0, 6)]
    .filter(Boolean)
    .join(" | ");
  state.adapt_discarded =
    "Decorative Figma chrome, unrelated marketing blobs, absolute-position noise.";
  state.adapt_replaced = `Template ${template.id} + structure hints (${figma.structure_hints.length}) mapped into slots from Master Plan + files.`;
  appendStepLog(
    state,
    `Phase C figma — used=${figma.figma_used} status=${figma.figma_status} fallback=${figma.fallback_used} hints=${figma.structure_hints.length}`,
  );
  state.current_step = 4;
  persist(workspaceRoot, state);

  // -------- Phase D — Tokens --------
  stage("Applying design tokens");
  const tokens = buildDesignTokens(uiux, state.palette, classification.density);
  // Soft-apply spacing/radius hints from Figma/seed when present
  for (const h of figma.structure_hints) {
    const sp = h.match(/spacing rhythm ≈ (\d+)/i);
    if (sp) {
      const n = Math.min(24, Math.max(8, Number(sp[1])));
      tokens.gap = n;
      tokens.pad = Math.max(tokens.pad, n);
    }
    const rad = h.match(/corner radius ≈ (\d+)/i);
    if (rad) tokens.radius = Math.min(24, Math.max(4, Number(rad[1])));
  }
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
    tokens.text = "#0C0A09";
    tokens.mutedText = "#57534E";
    tokens.primary = tokens.primary === "#0F766E" ? "#0D9488" : tokens.primary;
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
  appendStepLog(state, `Phase E slots — title="${slots.hero_title}" cta="${slots.primary_cta}"`);
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
  let gate = validateV2Quality({
    model,
    template,
    tokens,
    slots,
    figmaStatus: figma.figma_status,
    pageType: classification.page_type,
  });
  state.repair_pass_used = "no";
  if (gate.gate !== "pass") {
    state.repair_pass_used = "yes";
    slots = repairSlots(slots, classification.page_type);
    state.slot_content_json = JSON.stringify(slots);
    model = renderTemplateModel({
      template,
      classification,
      tokens,
      slots,
      figmaStatus: figma.figma_status,
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
    });
    appendStepLog(state, `Phase G repair — gate=${gate.gate}; issues=${gate.issues.join("; ") || "none"}`);
  }
  state.quality_gate_result = gate.gate;
  state.missing_required_sections = gate.issues;
  appendStepLog(state, `Phase G gate — ${gate.gate}`);
  state.current_step = 8;
  persist(workspaceRoot, state);

  // -------- Phase H — Deliver --------
  const deliveredStage =
    gate.gate === "pass"
      ? "Ready in preview"
      : gate.gate === "repair"
        ? "Preview ready — quality repair applied"
        : "Weak quality — try Generate again";
  stage(deliveredStage);

  const editorModel = {
    pages: model.pages,
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

  const patternMode: "seed" | "figma" =
    figma.figma_used === "yes" && figma.figma_status === "success" ? "figma" : "seed";
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
        template_id: template.id,
        classification,
        tokens,
        slots,
        pattern_mode: patternMode,
        preview_applied: previewApplied,
        preview_written: previewWritten,
        figma: {
          figma_used: figma.figma_used,
          figma_status: figma.figma_status,
          figma_error: figma.figma_error,
          fallback_used: figma.fallback_used,
          reference_file_keys_configured: figma.reference_file_keys_configured,
          env_guidance: figma.env_guidance,
          selected_refs: figma.selected_refs,
          candidates: figma.candidates.slice(0, 6),
          structure_hints: figma.structure_hints.slice(0, 10),
        },
        quality_gate_result: gate.gate,
        regeneration_count: state.regeneration_count,
        how_to_recheck:
          "Generate UI → open nebulla-project/ui-generation-v2-meta.json → read pattern_mode / figma.fallback_used / preview_applied",
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
  };
}
