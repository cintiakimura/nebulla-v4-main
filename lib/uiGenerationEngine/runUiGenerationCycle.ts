/**
 * Nebulla UI Generation Engine — ordered cycle runner.
 * Authority: nebulla-project/ui-generation-engine-manual.md (execution order wins).
 * One phase completes and writes context before the next starts.
 */

import fs from "fs";
import path from "path";
import { runAiChatCompletion } from "../aiChatCompletion";
import { hydrateAndPersistMasterPlan, mindMapPagesFromMasterPlan } from "../nebulaIdeWorkspaceArtifacts";
import { MASTER_PLAN_SECTION_KEYS } from "../masterPlanSections";
import { writePreviewModel } from "../visualUiEditorPreview";
import { appendStepLog, writeContextFile } from "./contextIO";
import { readCyclePolicy, setUserVisibleStage, writeCyclePolicy } from "./cyclePolicy";
import { writeEnginePreviewModel } from "./previewModelIO";
import { rankSeedPatterns, tryFigmaCandidates } from "./seedPatterns";
import {
  buildRichEditorModelFromBrief,
  cleanHumanSubtitle,
  cleanHumanTitle,
  pickPrimaryCta,
  validateEditorModelQuality,
} from "./buildPreviewEditorModel";
import {
  collectWorkspaceFileFacts,
  formatFileFactsForBrief,
  hasMeaningfulUiFileGrounding,
  type WorkspaceFileFacts,
} from "./workspaceFileFacts";
import {
  emptyContextState,
  type Complexity,
  type Confidence,
  type Density,
  type DeviceClass,
  type Industry,
  type NavigationType,
  type PageType,
  type ProductFunction,
  type UiGenContextState,
} from "./types";

const PREFERENCE_RECOVERY_QUESTION =
  "I can see this still isn’t right. What bothers you most — layout, colors, spacing, missing sections, or overall style?";

export type RunUiGenerationInput = {
  workspaceRoot: string;
  masterPlanPath: string;
  projectName?: string;
  pageName?: string;
  apiKeyOverride?: string;
  /** First automatic post-coding generation. */
  autoTriggered?: boolean;
  /** User clicked Generate again. */
  regenerate?: boolean;
  /** Preference recovery answer after 3 attempts. */
  preferenceFeedback?: string;
  /** Guided improvement after preference recovery. */
  guidedImprovement?: boolean;
  /** Recently applied file paths for grounding. */
  writtenPaths?: string[];
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
};

function nowIso(): string {
  return new Date().toISOString();
}

function newContextId(): string {
  return `uig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function uniqMerge(a: string[], b: string[], max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...a, ...b]) {
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function extractBullets(text: string, limit = 8): string[] {
  const lines = text.split("\n").map((l) => l.trim());
  const out: string[] = [];
  for (const l of lines) {
    const m = l.match(/^[-*•]\s+(.+)/) || l.match(/^\d+[.)]\s+(.+)/);
    if (m) out.push(m[1].trim());
    if (out.length >= limit) break;
  }
  return out;
}

function detectProjectType(goal: string, tech: string): string {
  const blob = `${goal}\n${tech}`.toLowerCase();
  if (/\bmobile app\b|\bios\b|\bandroid\b/.test(blob)) return "Mobile App";
  if (/\blanding page\b|\bmarketing site\b/.test(blob)) return "Landing Page";
  if (/\bweb app\b|\bsaas\b|\bdashboard\b/.test(blob)) return "Web App";
  return "Web App";
}

function inferFunction(goal: string, features: string): ProductFunction {
  const b = `${goal}\n${features}`.toLowerCase();
  if (/course|learn|lesson|student|education/.test(b)) return "course";
  if (/shop|cart|checkout|product catalog|e-?commerce/.test(b)) return "ecommerce";
  if (/book(ing)?|appoint|reserv/.test(b)) return "booking";
  if (/marketplace|sellers?|buyers?/.test(b)) return "marketplace";
  if (/communit|forum|social|members/.test(b)) return "community";
  if (/admin|saas|dashboard|analytics|b2b/.test(b)) return "saas_admin";
  if (/landing|marketing|campaign/.test(b)) return "marketing";
  return "general";
}

function inferIndustry(goal: string, tech: string): Industry {
  const b = `${goal}\n${tech}`.toLowerCase();
  if (/educat|course|school|learn/.test(b)) return "education";
  if (/financ|bank|invest|fintech/.test(b)) return "finance";
  if (/health|clinic|medical|wellness/.test(b)) return "health";
  if (/retail|shop|store|commerce/.test(b)) return "retail";
  return "general";
}

type PageDef = { name: string; route: string; body: string };

function parsePages(pagesText: string): PageDef[] {
  const pages: PageDef[] = [];
  const chunks = pagesText.split(/\n(?=-\s+\*\*)/);
  for (const chunk of chunks) {
    const m = chunk.match(/-\s+\*\*([^*]+)\*\*\s*\(`([^`]+)`\)/);
    if (m) {
      pages.push({ name: m[1].trim(), route: m[2].trim(), body: chunk.trim() });
      continue;
    }
    const m2 = chunk.match(/-\s+\*\*([^*]+)\*\*/);
    if (m2) pages.push({ name: m2[1].trim(), route: "", body: chunk.trim() });
  }
  if (!pages.length && pagesText.trim()) {
    const bullets = extractBullets(pagesText, 12);
    for (const b of bullets) {
      const name = b.replace(/\s*\(`[^`]+`\)\s*$/, "").replace(/\*\*/g, "").trim();
      if (name) pages.push({ name, route: "", body: b });
    }
  }
  return pages;
}

/** Prefer mind-map parser (tolerant) then legacy parsePages. */
function pagesFromMasterPlan(plan: Record<string, string>, projectName: string, pagesText: string): PageDef[] {
  const fromMind = mindMapPagesFromMasterPlan(plan, projectName).map((s) => ({
    name: s.label,
    route: s.route || "",
    body: `${s.label}${s.route ? ` (${s.route})` : ""}`,
  }));
  if (fromMind.length) return fromMind;
  return parsePages(pagesText);
}

function pagesFromFileFacts(facts: WorkspaceFileFacts): PageDef[] {
  const out: PageDef[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < facts.page_names.length; i++) {
    const name = facts.page_names[i];
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const route =
      facts.routes.find((r) => r.toLowerCase().includes(name.toLowerCase().replace(/\s+/g, "-"))) ||
      facts.routes[i] ||
      `/${name.toLowerCase().replace(/\s+/g, "-")}`;
    // Body is for brief inference only — never dump routes into visible UI copy.
    out.push({
      name,
      route,
      body: [
        `- **${name}**`,
        facts.headings[0] ? `- ${facts.headings[0]}` : "",
        ...facts.button_labels.slice(0, 3).map((b) => `- ${b}`),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  if (!out.length && facts.routes.length) {
    for (const route of facts.routes.slice(0, 8)) {
      const name =
        route === "/"
          ? "Home"
          : route
              .replace(/^\//, "")
              .split("/")
              .filter(Boolean)
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
              .join(" ") || "Home";
      out.push({
        name,
        route,
        body: [`- **${name}**`, ...facts.button_labels.slice(0, 2).map((b) => `- ${b}`)].join("\n"),
      });
    }
  }
  return out;
}

function mergePageDefs(a: PageDef[], b: PageDef[]): PageDef[] {
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

/** Soft goal check — meaning over formatting. */
function hasUsableProductGoal(
  goal: string,
  tech: string,
  features: string,
  projectName: string,
  fileFacts: WorkspaceFileFacts,
): boolean {
  if (goal.trim().length >= 16) return true;
  const blob = `${goal}\n${tech}\n${features}`.trim();
  if (blob.length >= 40 && /(app|product|user|learn|practice|goal|help|for |build|create)/i.test(blob)) {
    return true;
  }
  const named = projectName.trim() && !/^untitled/i.test(projectName.trim());
  if (named && (fileFacts.page_names.length >= 1 || fileFacts.routes.length >= 1)) return true;
  if (fileFacts.headings.length >= 1 && fileFacts.page_names.length >= 1) return true;
  return false;
}

function buildBlockedWaitingModel(message: string): Record<string, unknown> {
  const root = "root-blocked";
  const title = "blocked-title";
  const sub = "blocked-sub";
  return {
    pages: {
      Home: {
        rootId: root,
        nodes: {
          [root]: {
            id: root,
            role: "page-root",
            type: "container",
            children: [title, sub],
            style: {
              backgroundColor: "#FAFAF9",
              color: "#171717",
              paddingTop: 40,
              paddingRight: 28,
              paddingBottom: 40,
              paddingLeft: 28,
              marginTop: 0,
              marginRight: 0,
              marginBottom: 0,
              marginLeft: 0,
              width: "100%",
              height: "auto",
              borderRadius: 8,
              borderWidth: 0,
              borderColor: "#E5E5E5",
              boxShadow: "none",
              opacity: 1,
            },
          },
          [title]: {
            id: title,
            role: "hero-title",
            type: "text",
            text: "UI generation blocked",
            style: {
              backgroundColor: "#FFFFFF",
              color: "#171717",
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 8,
              paddingLeft: 0,
              marginTop: 0,
              marginRight: 0,
              marginBottom: 0,
              marginLeft: 0,
              width: "100%",
              height: "auto",
              borderRadius: 0,
              borderWidth: 0,
              borderColor: "#E5E5E5",
              boxShadow: "none",
              opacity: 1,
            },
          },
          [sub]: {
            id: sub,
            role: "hero-sub",
            type: "text",
            text: message,
            style: {
              backgroundColor: "#FFFFFF",
              color: "#525252",
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              paddingLeft: 0,
              marginTop: 0,
              marginRight: 0,
              marginBottom: 0,
              marginLeft: 0,
              width: "100%",
              height: "auto",
              borderRadius: 0,
              borderWidth: 0,
              borderColor: "#E5E5E5",
              boxShadow: "none",
              opacity: 1,
            },
          },
        },
      },
    },
  };
}

function pickPage(
  pages: { name: string; route: string; body: string }[],
  preferred?: string,
): { name: string; route: string; body: string } | null {
  if (!pages.length) return null;
  if (preferred) {
    const hit = pages.find(
      (p) =>
        p.name.toLowerCase() === preferred.toLowerCase() ||
        p.route.toLowerCase() === preferred.toLowerCase(),
    );
    if (hit) return hit;
  }
  return pages[0];
}

function inferPageType(name: string, body: string): PageType {
  const b = `${name}\n${body}`.toLowerCase();
  if (/dashboard|home overview|analytics/.test(b)) return "dashboard";
  if (/sign\s?in|sign\s?up|login|auth/.test(b)) return "auth";
  if (/setting/.test(b)) return "settings";
  if (/checkout|payment|cart/.test(b)) return "checkout";
  if (/profile|account/.test(b)) return "profile";
  if (/landing|marketing|hero/.test(b)) return "landing";
  if (/detail|single|view\b/.test(b)) return "detail";
  if (/list|browse|catalog|feed|search/.test(b)) return "list";
  return "other";
}

function inferNav(projectType: string, pageType: PageType, pagesText: string): NavigationType {
  const b = pagesText.toLowerCase();
  if (pageType === "auth" || pageType === "landing") return "none";
  if (/tab\b|bottom nav/.test(b) || /mobile app/i.test(projectType)) return "tabs";
  if (/sidebar|side nav/.test(b)) return "sidebar";
  if (/top nav|header nav/.test(b)) return "topnav";
  if (/web app/i.test(projectType)) return "sidebar";
  if (/landing/i.test(projectType)) return "topnav";
  return "topnav";
}

function inferDensity(uiux: string): Density {
  const b = uiux.toLowerCase();
  if (/spacious|airy|generous/.test(b)) return "spacious";
  if (/compact|dense|tight/.test(b)) return "compact";
  return "medium";
}

function inferComplexity(sections: string[], features: string[]): Complexity {
  const n = sections.length + features.length;
  if (n <= 4) return "simple";
  if (n <= 9) return "medium";
  return "rich";
}

function persist(workspaceRoot: string, state: UiGenContextState): void {
  writeContextFile(workspaceRoot, state);
}

function fail(
  workspaceRoot: string,
  state: UiGenContextState,
  reason: string,
  status: UiGenContextState["status"] = "failed",
): RunUiGenerationResult {
  state.status = status;
  state.failure_reason = reason;
  state.user_visible_stage = status === "pending_discovery" ? "Needs discovery" : "Failed";
  appendStepLog(state, `FAILED — ${reason}`);
  try {
    writeCyclePolicy(workspaceRoot, {
      auto_triggered: state.auto_triggered === "yes" ? "yes" : "no",
      regeneration_count: state.regeneration_count,
      max_regenerations: state.max_regenerations || 3,
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
  } catch {
    /* ignore */
  }
  let waitingModel: unknown;
  try {
    waitingModel = buildBlockedWaitingModel(reason);
    writeEnginePreviewModel(workspaceRoot, waitingModel as Parameters<typeof writeEnginePreviewModel>[1]);
    writePreviewModel(workspaceRoot, waitingModel as Parameters<typeof writePreviewModel>[1]);
  } catch {
    waitingModel = undefined;
  }
  const contextPath = writeContextFile(workspaceRoot, state);
  return {
    ok: false,
    status,
    contextPath,
    context: state,
    error: reason,
    editorModel: waitingModel,
    regeneration_count: state.regeneration_count,
    max_regenerations: state.max_regenerations,
    user_visible_stage: state.user_visible_stage,
  };
}

/** Structured preview model — never dumps Master Plan prose or routes into titles. */
function buildEditorModelFromBrief(state: UiGenContextState): Record<string, unknown> {
  return buildRichEditorModelFromBrief(state) as Record<string, unknown>;
}

function extractCodeBlock(text: string): string {
  const m = text.match(/```(?:tsx|jsx|react|typescript)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : text.trim();
}

function extractEditorModelJson(text: string): string | null {
  const m = text.match(/```(?:json|editor-model)\s*([\s\S]*?)```/i);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && typeof parsed === "object" && parsed.pages) return JSON.stringify(parsed);
  } catch {
    /* ignore */
  }
  return null;
}

function validateAgainstBrief(code: string, state: UiGenContextState): {
  gate: "pass" | "repair" | "weak";
  missing: string[];
} {
  const missing: string[] = [];
  const lower = code.toLowerCase();
  for (const sec of state.required_sections.slice(0, 6)) {
    const token = sec.toLowerCase().slice(0, 12);
    if (token.length >= 3 && !lower.includes(token.split(/\s+/)[0])) {
      missing.push(sec);
    }
  }
  if (state.primary_cta) {
    const cta = state.primary_cta.toLowerCase().slice(0, 16);
    if (cta && !lower.includes(cta.split(/\s+/)[0])) missing.push(`primary CTA: ${state.primary_cta}`);
  }
  if (!/class(name)?=/.test(code) && !/tailwind/i.test(code)) {
    missing.push("Tailwind class usage");
  }
  // Skeleton / metadata anti-patterns in generated code
  if (/get started/i.test(code) && state.file_button_labels.length > 0) {
    missing.push("Generic Get started despite real file labels");
  }
  if (/\/[a-z0-9-]{8,}/i.test(code) && /<(h1|h2|title)/i.test(code)) {
    // Soft: routes appearing near headings often means slug dump
    if (/['"`]\/[a-z0-9/_-]{6,}['"`]\s*<\/(h1|h2|p|span)/i.test(code)) {
      missing.push("Route/slug appears as visible heading copy");
    }
  }
  const buttonMatches = code.match(/<(button|Button)\b/gi) || [];
  const sectionish = (code.match(/<(section|ul|ol|form|nav)\b/gi) || []).length;
  if (buttonMatches.length <= 1 && sectionish < 1) {
    missing.push("Insufficient structure (need sections/list/form + CTA)");
  }
  if (missing.length === 0) return { gate: "pass", missing };
  if (missing.length <= 2) return { gate: "repair", missing };
  return { gate: "weak", missing };
}

/**
 * Run Phases 1–14 in ascending order. Writes context after each phase that requires it.
 */
export async function runUiGenerationCycle(
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

  // -------- Regen / preference recovery gate (manual §§ C–D) --------
  state.max_regenerations = 3;
  state.auto_triggered = input.autoTriggered ? "yes" : "no";
  state.preference_feedback = preferenceFeedback;
  state.recovery_path = guidedImprovement ? "guided_improvement" : "none";

  if (input.regenerate && !guidedImprovement) {
    if (prevPolicy.regeneration_count >= prevPolicy.max_regenerations) {
      state.context_id = prevPolicy.page_key ? `uig-blocked-${Date.now().toString(36)}` : newContextId();
      state.project_name = (input.projectName || "").trim() || "Untitled project";
      state.page_name = pageKey;
      state.created_at = nowIso();
      state.status = "failed";
      state.regeneration_count = prevPolicy.regeneration_count;
      state.recovery_path = "none";
      state.failure_reason = "Regeneration limit reached (max 3). Preference recovery required.";
      appendStepLog(state, "BLOCKED — regeneration limit; preference recovery required");
      stage("Preference recovery");
      writeCyclePolicy(workspaceRoot, {
        ...prevPolicy,
        user_visible_stage: "Preference recovery",
        final_status: "rejected",
      });
      const contextPath = writeContextFile(workspaceRoot, state);
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
        user_visible_stage: "Preference recovery",
      };
    }
    state.regeneration_count = prevPolicy.regeneration_count + 1;
  } else if (guidedImprovement) {
    state.regeneration_count = prevPolicy.regeneration_count;
    state.recovery_path = "guided_improvement";
  } else if (input.autoTriggered) {
    if (prevPolicy.regeneration_count >= prevPolicy.max_regenerations) {
      state.context_id = newContextId();
      state.project_name = (input.projectName || "").trim() || "Untitled project";
      state.created_at = nowIso();
      state.status = "failed";
      state.regeneration_count = prevPolicy.regeneration_count;
      state.failure_reason =
        "UI generation already reached the regeneration limit for this cycle — not auto-starting.";
      appendStepLog(state, "BLOCKED — auto-trigger skipped (regen limit)");
      stage("Blocked — regeneration limit");
      const contextPath = writeContextFile(workspaceRoot, state);
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
    // Manual first Generate UI from Beta toolbar
    state.regeneration_count = Math.max(1, prevPolicy.regeneration_count || 1);
  }

  // -------- PHASE 1 — START THE CYCLE --------
  state.context_id = newContextId();
  state.project_name = (input.projectName || "").trim() || "Untitled project";
  state.page_name = (input.pageName || "").trim();
  state.created_at = nowIso();
  state.status = "in_progress";
  state.current_step = 1;
  appendStepLog(
    state,
    `Phase 1 start — cycle identity written (auto=${state.auto_triggered}, regen=${state.regeneration_count}/${state.max_regenerations})`,
  );
  stage("Reading Master Plan");
  persist(workspaceRoot, state);

  // -------- PHASE 2 — VERIFY (Master Plan + file grounding) --------
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    return fail(workspaceRoot || process.cwd(), state, "No active project workspace");
  }
  // Master Plan file may be missing; still allow generation if UI files exist.
  const planExists = Boolean(input.masterPlanPath && fs.existsSync(input.masterPlanPath));
  const plan = planExists
    ? hydrateAndPersistMasterPlan(workspaceRoot, input.masterPlanPath)
    : ({} as Record<string, string>);
  const goal = section(plan, 1);
  const tech = section(plan, 2);
  const features = section(plan, 3);
  const pagesText = section(plan, 4);
  const uiux = section(plan, 5);

  stage("Reading generated files");
  const fileFacts = collectWorkspaceFileFacts(workspaceRoot, input.writtenPaths);
  state.file_scanned = fileFacts.scanned_files;
  state.file_routes = fileFacts.routes;
  state.file_button_labels = [...fileFacts.button_labels, ...fileFacts.link_labels];
  state.file_headings = fileFacts.headings;

  const mpPages = pagesFromMasterPlan(plan, state.project_name, pagesText);
  const filePages = pagesFromFileFacts(fileFacts);
  const pages = mergePageDefs(mpPages, filePages);

  const hasGoal = hasUsableProductGoal(goal, tech, features, state.project_name, fileFacts);
  const hasType =
    detectProjectType(goal, tech).length > 0 ||
    /web|mobile|landing|ios|android|expo|react/i.test(`${goal}\n${tech}`) ||
    fileFacts.scanned_files.some((p) => /app\/|pages\//i.test(p));
  const hasPage = pages.length >= 1;
  const fileGrounded = hasMeaningfulUiFileGrounding(fileFacts);
  const hasMinFromPlan = hasGoal && hasType && hasPage;
  // Allow generation when plan is partial but concrete UI files exist (e.g. practice/page.tsx).
  const allowGeneration = hasMinFromPlan || (fileGrounded && (hasPage || filePages.length >= 1));

  if (!allowGeneration) {
    state.current_step = 2;
    appendStepLog(
      state,
      `Step 1 verify — blocked (goal=${hasGoal}, type=${hasType}, page=${hasPage}, files=${fileGrounded}, scanned=${fileFacts.scanned_files.length})`,
    );
    return fail(
      workspaceRoot,
      state,
      !planExists && !fileGrounded
        ? "No Master Plan and no generated UI files — complete discovery or generate app files first"
        : "Needs more product truth: add a goal/type/page in Master Plan, or generate UI app files first",
      "pending_discovery",
    );
  }

  appendStepLog(
    state,
    hasMinFromPlan
      ? "Step 1 verify — generation allowed (minimum product truth present)"
      : `Step 1 verify — generation allowed via file grounding (pages=${pages.length}, scanned=${fileFacts.scanned_files.length})`,
  );
  state.current_step = 2;
  persist(workspaceRoot, state);

  // -------- PHASE 3 — GATHER MASTER PLAN + FILE FACTS --------
  stage("Reading Master Plan");
  state.product_goal =
    firstLines(goal, 6) ||
    (state.project_name && !/^untitled/i.test(state.project_name)
      ? `Build ${state.project_name} using generated routes: ${fileFacts.routes.slice(0, 6).join(", ") || pages.map((p) => p.name).join(", ")}`
      : firstLines(features, 3) ||
        `App with pages: ${pages.map((p) => p.name).slice(0, 6).join(", ")}`);
  const userMatch = goal.match(/target user[s]?:\s*(.+)/i) || tech.match(/target user[s]?:\s*(.+)/i);
  state.target_user = userMatch
    ? userMatch[1].trim().slice(0, 200)
    : firstLines(goal, 2) || "Primary app user";
  state.project_type = detectProjectType(
    `${goal}\n${tech}`,
    fileFacts.scanned_files.some((p) => /app\//i.test(p)) ? "mobile app expo" : tech,
  );
  if (
    /BottomNav|tab bar|expo/i.test(fileFacts.scanned_files.join(" ")) ||
    fileFacts.scanned_files.some((p) => /components\/.*Nav/i.test(p))
  ) {
    if (state.project_type === "Web App") state.project_type = "Mobile App";
  }
  state.priority_features = extractBullets(features, 8);
  if (!state.priority_features.length && features) {
    state.priority_features = [firstLines(features, 3)];
  }
  if (!state.priority_features.length && fileFacts.page_names.length) {
    state.priority_features = fileFacts.page_names.slice(0, 6).map((n) => `${n} screen`);
  }
  state.product_function = inferFunction(goal || state.product_goal, features || fileFacts.headings.join("\n"));
  state.industry = inferIndustry(goal || state.product_goal, tech);

  const chosen = pickPage(pages, input.pageName || undefined) || pages[0];
  if (!chosen) {
    return fail(
      workspaceRoot,
      state,
      "No meaningful page found in Master Plan or generated files",
      "pending_discovery",
    );
  }
  // Clean human page label — prefer short file page names over Master Plan prose dumps.
  const filePageFallback =
    fileFacts.page_names.find((n) => n.trim().length >= 2 && n.trim().length <= 28 && !n.includes("/")) ||
    fileFacts.page_names[0] ||
    "Home";
  const cleanedChosen = cleanHumanTitle(chosen.name, filePageFallback);
  // If Master Plan "name" was a purpose paragraph, cleaned result may still be weak — prefer file label.
  const chosenLooksLikeProse =
    chosen.name.trim().split(/\s+/).length > 5 || chosen.name.trim().length > 36;
  state.page_name =
    chosenLooksLikeProse && filePageFallback !== "Home"
      ? cleanHumanTitle(filePageFallback, cleanedChosen)
      : cleanedChosen;
  const rawPurpose = firstLines(chosen.body.replace(chosen.name, ""), 4);
  // Keep full purpose for the brief only; visible subtitle is cleaned separately later.
  state.page_purpose =
    rawPurpose && !/^generated page\b/i.test(rawPurpose) && !rawPurpose.includes("/")
      ? rawPurpose
      : fileFacts.headings.find((h) => h.length <= 48 && !h.includes("/")) ||
        `Help users use ${state.page_name}`;
  const actions = extractBullets(chosen.body, 6).filter(
    (a) => a.length <= 40 && !a.includes("/") && !/^generated/i.test(a),
  );
  state.primary_actions = actions.slice(0, 2);
  state.secondary_actions = actions.slice(2, 5);
  state.required_sections = extractBullets(chosen.body, 8)
    .map((s) => cleanHumanTitle(s, ""))
    .filter((s) => s && !/^(header|main content|primary action)$/i.test(s));
  if (!state.required_sections.length) {
    state.required_sections = uniqMerge(
      fileFacts.headings.map((h) => cleanHumanTitle(h, "")).filter(Boolean).slice(0, 4),
      [],
    );
  }
  state.navigation_role =
    pages.length > 1
      ? `One of ${pages.length} app screens`
      : "Primary page";

  state.visual_tone = firstLines(uiux, 3) || "(not found)";
  const paletteMatch = uiux.match(/palette[:\s]+([^\n]+)/i) || uiux.match(/#[0-9a-fA-F]{3,8}/);
  state.palette = paletteMatch
    ? Array.isArray(paletteMatch)
      ? paletteMatch[0]
      : String(paletteMatch[1] || paletteMatch[0])
    : "(not found)";
  state.density_mp = /compact|spacious|dense|medium/i.test(uiux)
    ? (uiux.match(/compact|spacious|dense|medium/i)?.[0] || "(not found)")
    : "(not found)";
  state.typography_notes = /font|typography|typeface/i.test(uiux)
    ? firstLines(uiux.match(/.*(?:font|typography|typeface).*/i)?.[0] || "", 2) || "(not found)"
    : "(not found)";
  state.style_constraints = uiux ? firstLines(uiux, 8) : "(not found)";
  state.explicit_do = extractBullets(uiux, 4);
  state.explicit_dont = [];
  if (!uiux) {
    state.visual_tone = "(not found)";
    state.palette = "(not found)";
  }

  if (fileFacts.button_labels[0] && !state.primary_actions.length) {
    state.primary_actions = [fileFacts.button_labels[0]];
  }
  if (fileFacts.button_labels.length > 1) {
    state.secondary_actions = uniqMerge(state.secondary_actions, fileFacts.button_labels.slice(1, 4));
  }
  if (fileFacts.headings.length) {
    state.required_sections = uniqMerge(state.required_sections, fileFacts.headings.slice(0, 6));
  }

  appendStepLog(state, "Step 2 gather — Master Plan extracts written");
  appendStepLog(
    state,
    `Step 2b files — scanned ${fileFacts.scanned_files.length}; routes=${fileFacts.routes.length}; pages=${fileFacts.page_names.length}; buttons=${fileFacts.button_labels.length}`,
  );
  state.current_step = 3;
  persist(workspaceRoot, state);

  // -------- PHASE 4 — CLASSIFY --------
  stage("Preparing brief");
  const device: DeviceClass =
    state.project_type === "Mobile App"
      ? "mobile"
      : state.project_type === "Landing Page"
        ? "landing"
        : "web";
  state.device = device;
  state.page_type = inferPageType(chosen.name, chosen.body);
  state.function = state.product_function as ProductFunction;
  state.industry_class = state.industry as Industry;
  state.navigation_type = inferNav(state.project_type, state.page_type, pagesText);
  state.density = inferDensity(uiux);
  state.complexity = inferComplexity(state.required_sections, state.priority_features);
  state.confidence =
    goal.length > 80 && pages.length >= 2 && uiux.length > 40
      ? "high"
      : goal.length > 40
        ? "medium"
        : "low";
  state.classification_notes = `Conservative classify from Master Plan + files: device=${state.device}, page_type=${state.page_type}, function=${state.function}, nav=${state.navigation_type}. Confidence ${state.confidence}.`;
  appendStepLog(state, "Step 3 classify — classification decisions written");
  state.current_step = 4;
  persist(workspaceRoot, state);

  // -------- PHASE 5 — BRIEF --------
  stage("Preparing brief");
  const visibleSubtitle = cleanHumanSubtitle(
    state.page_purpose,
    state.page_type,
    state.function,
    fileFacts.headings,
  );
  state.page_goal = `On ${state.page_name}, help the user: ${visibleSubtitle}`;
  state.audience = state.target_user || "(not found)";
  state.layout_navigation = `${state.navigation_type} navigation for a ${state.device} ${state.page_type}`;
  state.section_order = state.required_sections.length
    ? [...state.required_sections]
    : [];
  // Prefer real file labels; never default to "Get started" when better labels exist.
  state.primary_cta = pickPrimaryCta(state);
  state.secondary_ctas = uniqMerge(state.secondary_actions, fileFacts.button_labels, 4)
    .filter((c) => c !== state.primary_cta && !/^get started$/i.test(c))
    .slice(0, 3);
  state.metrics = /metric|kpi|stat|dashboard/i.test(chosen.body + state.page_type)
    ? ["Key metric cards"]
    : [];
  state.tables_or_lists =
    /list|table|feed|catalog|task|todo|practice/i.test(
      `${chosen.body} ${state.page_type} ${state.page_name} ${state.function}`,
    )
      ? ["Primary list or cards"]
      : [];
  state.forms = /form|settings|auth|sign|input/i.test(chosen.body + state.page_type)
    ? ["Primary form"]
    : [];
  state.cards_or_panels = ["Content cards or panels for required sections"];
  state.other_components = state.navigation_type !== "none" ? [`${state.navigation_type} navigation`] : [];
  state.color_direction =
    state.palette !== "(not found)"
      ? state.palette
      : uiux
        ? firstLines(uiux, 4)
        : state.visual_tone;
  state.hierarchy_rules =
    "Visible title must be a short human label (e.g. Tasks). Subtitle must be short (e.g. Today’s micro-tasks). NEVER put routes, Master Plan paragraphs, or page-purpose dumps in the canvas.";
  state.spacing_rules = `Density ${state.density}: consistent padding, clear section gaps, readable line length. Apply §5 palette/radius/tone when present.`;
  state.component_limits =
    "Real screen structure required: header + ≥2 content sections + primary CTA (+ secondary when available). Match product function (tasks→list/cards, learning→lesson/practice, settings→rows). No title+one-button skeletons. Prefer file labels over generic CTAs.";
  const fileBrief = formatFileFactsForBrief(fileFacts);
  state.final_brief_text = [
    `Product: ${state.product_goal}`,
    `Project type: ${state.project_type}`,
    `Page title (VISIBLE): ${state.page_name}`,
    `Page subtitle (VISIBLE): ${visibleSubtitle}`,
    `Page type/device: ${state.page_type} / ${state.device}`,
    `Audience: ${state.audience}`,
    `Goal: ${state.page_goal}`,
    `Navigation: ${state.layout_navigation}`,
    `Sections in order: ${state.section_order.join(" → ") || "(infer from product function)"}`,
    `Primary CTA (VISIBLE): ${state.primary_cta}`,
    `Secondary CTAs: ${state.secondary_ctas.join(", ") || "(none)"}`,
    `Visual contract (§5): ${state.color_direction}`,
    `Tone: ${state.visual_tone}`,
    `Hierarchy: ${state.hierarchy_rules}`,
    `Spacing: ${state.spacing_rules}`,
    `Limits: ${state.component_limits}`,
    `Function/industry: ${state.function} / ${state.industry_class}`,
    preferenceFeedback ? `User preference feedback: ${preferenceFeedback}` : "",
    "",
    fileBrief,
  ]
    .filter(Boolean)
    .join("\n");
  appendStepLog(state, "Step 4 brief — generation brief written (Master Plan + file facts)");
  state.current_step = 5;
  persist(workspaceRoot, state);

  // -------- PHASE 6 — REFERENCE NEEDS --------
  stage("Selecting references");
  state.criteria_device = state.device;
  state.criteria_page_type = state.page_type;
  state.criteria_function = state.function;
  state.criteria_industry = state.industry_class;
  state.criteria_navigation = state.navigation_type;
  state.criteria_components = [
    ...state.metrics,
    ...state.tables_or_lists,
    ...state.forms,
    ...state.cards_or_panels,
  ].join(", ");
  state.criteria_density_tone = `${state.density}; ${state.visual_tone}`;
  state.need_page_templates = "yes";
  state.need_navigation_patterns = state.navigation_type === "none" ? "no" : "yes";
  state.need_section_patterns = "yes";
  state.need_component_patterns = "yes";
  state.need_icons_assets = "no";
  state.resource_request_list = [
    `device=${state.criteria_device}`,
    `page_type=${state.criteria_page_type}`,
    `function=${state.criteria_function}`,
    `industry=${state.criteria_industry}`,
    `navigation=${state.criteria_navigation}`,
    `components=${state.criteria_components || "general"}`,
    `density_tone=${state.criteria_density_tone}`,
  ];
  appendStepLog(state, "Step 5 criteria — reference needs written");
  state.current_step = 6;
  persist(workspaceRoot, state);

  // -------- PHASE 7 — RETRIEVE REFERENCES --------
  stage("Selecting references");
  const figma = await tryFigmaCandidates(state);
  const seeds = rankSeedPatterns(state);
  const topSeeds = seeds.slice(0, 3);
  state.figma_status = figma.status;
  if (figma.ok && figma.status === "success" && figma.candidates.length) {
    state.reference_source = "mixed";
    state.figma_used = "yes";
    state.fallback_used = topSeeds.length ? "yes" : "no";
    state.candidates = [
      ...figma.candidates,
      ...topSeeds.map((s) => ({ id: s.id, reason: s.reason })),
    ];
  } else {
    state.reference_source = "seed";
    state.figma_used = "no";
    state.fallback_used = "yes";
    state.candidates = topSeeds.map((s) => ({
      id: s.id,
      reason: `${s.reason} — ${s.structure}`,
    }));
    state.generation_warnings.push(
      `Figma status=${figma.status}: ${figma.reason} — continuing with seed patterns`,
    );
  }
  const best = topSeeds[0] || seeds[0];
  state.selected_refs = [
    {
      id: best.id,
      why: `Best match for device=${state.device} page_type=${state.page_type} function=${state.function}: ${best.structure}`,
    },
  ];
  if (topSeeds[1]) {
    state.selected_refs.push({
      id: topSeeds[1].id,
      why: `Secondary structural guidance: ${topSeeds[1].structure}`,
    });
  }
  if (figma.candidates[0] && state.figma_status === "weak_matches") {
    state.selected_refs.push({
      id: figma.candidates[0].id,
      why: `Figma probe only (${state.figma_status}) — not used as layout authority: ${figma.reason}`,
    });
  }
  state.rejected_notes = topSeeds
    .slice(2)
    .map((s) => `${s.id} weaker match`)
    .join("; ");
  appendStepLog(
    state,
    `Step 6 retrieve — source=${state.reference_source}; figma_used=${state.figma_used}; figma_status=${state.figma_status}; fallback=${state.fallback_used}; selected=${state.selected_refs.map((r) => r.id).join(",")}`,
  );
  state.current_step = 7;
  persist(workspaceRoot, state);

  // -------- PHASE 8 — ADAPT --------
  state.adapt_kept = state.selected_refs.map((r) => r.why).join(" | ");
  state.adapt_discarded =
    "Decorative reference chrome, unrelated marketing blobs, and non-matching device shells.";
  state.adapt_replaced = `Generic labels → Master Plan page "${state.page_name}", CTA "${state.primary_cta}", sections: ${state.section_order.join(", ")}.`;
  appendStepLog(state, "Step 7 adapt — reference adaptation notes written");
  state.current_step = 8;
  persist(workspaceRoot, state);

  // -------- PHASE 9 — PACKAGE --------
  const codeModel = process.env.GROK_CODE_MODEL?.trim() || "grok-code-fast-1";
  state.model_used = codeModel;
  state.design_system_rules_applied = "yes";
  state.quality_rules_applied = "yes";
  state.generation_package = [
    "DESIGN SYSTEM RULES:",
    "- React function component + Tailwind utility classes only",
    "- Clear hierarchy, accessible contrast, no clutter",
    "- Do not invent a different product",
    "- Master Plan = product truth; generated files = concrete labels/actions/routes",
    "- Apply §5 visual contract (palette, density, radius, tone) when provided",
    "",
    "QUALITY RULES (HARD):",
    "- Visible title MUST be a short human label (e.g. Tasks) — NEVER a paragraph or route",
    "- Visible subtitle MUST be short (e.g. Today’s micro-tasks) — NEVER a path or Master Plan dump",
    "- Build real structure: header + content sections (list/cards/form/rows) + primary CTA",
    "- A page with only title + one generic button is a FAILURE",
    "- Prefer real button/heading labels from generated files over Get started",
    "- Match product function (tasks→list, learning→lesson/practice, settings→grouped rows)",
    "",
    "ADAPTED STRUCTURE:",
    state.adapt_kept,
    state.adapt_replaced,
    "",
    "PAGE BRIEF:",
    state.final_brief_text,
    "",
    "OUTPUT CONTRACT:",
    "1) Emit one ```tsx``` block with a complete React + Tailwind page component.",
    "2) Emit one ```json``` EditorModel { pages: { [PageTitle]: { rootId, nodes } } } with REAL structure (≥8 nodes, ≥2 sections, themed colors).",
    "3) Node types: container | text | button | box. Include role, style (#rrggbb only), text when relevant.",
    "4) Do not put routes or long descriptions in text nodes.",
  ].join("\n");
  appendStepLog(state, "Step 8 package — generation package assembled (pre-model-call)");
  state.current_step = 9;
  persist(workspaceRoot, state);

  // -------- PHASE 10 — GENERATE --------
  stage("Generating UI");
  const gen = await runAiChatCompletion({
    preferredProvider: "xai",
    apiKeyOverride: input.apiKeyOverride,
    clientChatModel: codeModel,
    messages: [
      {
        role: "system",
        content:
          "You are Grok Code generating UI for Nebulla UI Studio Beta. Obey the package only. Output React+Tailwind AND a structured EditorModel JSON. Never dump Master Plan paragraphs or routes into visible titles/subtitles. Prefer real file labels. Apply §5 colors when present. Title+one-button skeletons are forbidden.",
      },
      { role: "user", content: state.generation_package },
    ],
  });

  if (!gen.ok) {
    const errMsg = "error" in gen ? String(gen.error) : "unknown";
    return fail(workspaceRoot, state, `Generation failed: ${errMsg}`);
  }

  let code = extractCodeBlock(gen.content);
  state.generated_code = code;
  state.model_used = gen.model || codeModel;
  appendStepLog(state, "Step 8 generate — Grok code/text model returned output");
  state.current_step = 10;
  persist(workspaceRoot, state);

  // -------- PHASE 11 — VALIDATE (+ one repair) --------
  stage("Validating");
  let gate = validateAgainstBrief(code, state);
  state.missing_required_sections = gate.missing;
  state.quality_gate_result = gate.gate;
  state.repair_pass_used = "no";

  if (gate.gate === "repair" || gate.gate === "weak") {
    const repair = await runAiChatCompletion({
      preferredProvider: "xai",
      apiKeyOverride: input.apiKeyOverride,
      clientChatModel: codeModel,
      messages: [
        {
          role: "system",
          content:
            "Repair pass only. Fix structure + clean labels + apply §5 visual direction. Keep React+Tailwind. Replace description-dump titles and route subtitles. Ensure list/cards/sections exist — not title+one button.",
        },
        {
          role: "user",
          content: `Issues: ${gate.missing.join("; ")}\n\nBrief:\n${state.final_brief_text}\n\nCurrent code:\n${code.slice(0, 12000)}`,
        },
      ],
    });
    state.repair_pass_used = "yes";
    if (!repair.ok) {
      state.generation_warnings.push(`Repair pass failed: ${"error" in repair ? repair.error : "unknown"}`);
      state.quality_gate_result = "weak";
    } else {
      code = extractCodeBlock(repair.content);
      state.generated_code = code;
      gate = validateAgainstBrief(code, state);
      state.missing_required_sections = gate.missing;
      state.quality_gate_result = gate.gate === "weak" ? "weak" : "pass";
    }
  }

  // Prefer structured engine builder; only keep AI EditorModel if it passes quality.
  const richModel = buildEditorModelFromBrief(state);
  let editorModel: unknown = richModel;
  const modelJson = extractEditorModelJson(gen.content);
  if (modelJson) {
    try {
      const aiModel = JSON.parse(modelJson) as Parameters<typeof validateEditorModelQuality>[0];
      const aiQ = validateEditorModelQuality(aiModel, state);
      if (aiQ.gate === "pass") {
        editorModel = aiModel;
        appendStepLog(state, "Step 8 validate — accepted AI EditorModel (passed quality)");
      } else {
        appendStepLog(
          state,
          `Step 8 validate — rejected AI EditorModel (${aiQ.issues.join("; ")}) — using structured builder`,
        );
        state.generation_warnings.push(`AI EditorModel weak: ${aiQ.issues.join("; ")}`);
      }
    } catch {
      /* use rich builder */
    }
  }
  state.editor_model_json = JSON.stringify(editorModel);

  // Controlled repair: rebuild from brief if preview model is still a skeleton.
  let modelGate = validateEditorModelQuality(
    editorModel as Parameters<typeof validateEditorModelQuality>[0],
    state,
  );
  if (modelGate.gate !== "pass") {
    editorModel = buildEditorModelFromBrief(state);
    state.editor_model_json = JSON.stringify(editorModel);
    state.repair_pass_used = "yes";
    modelGate = validateEditorModelQuality(
      editorModel as Parameters<typeof validateEditorModelQuality>[0],
      state,
    );
    appendStepLog(
      state,
      `Step 8 validate — structured repair applied; model_gate=${modelGate.gate}; issues=${modelGate.issues.join("; ") || "none"}`,
    );
  }

  // Combine code gate + model gate — skeleton cannot be "pass".
  if (modelGate.gate === "weak" || gate.gate === "weak") {
    state.quality_gate_result = "weak";
    state.missing_required_sections = uniqMerge(
      state.missing_required_sections,
      modelGate.issues,
      12,
    );
  } else if (modelGate.gate === "repair" || gate.gate === "repair") {
    state.quality_gate_result = state.quality_gate_result === "weak" ? "weak" : "repair";
  } else {
    state.quality_gate_result = "pass";
  }

  appendStepLog(
    state,
    `Step 8 validate — quality_gate=${state.quality_gate_result}; repair=${state.repair_pass_used}; figma_status=${state.figma_status}`,
  );
  state.current_step = 11;
  persist(workspaceRoot, state);

  // -------- PHASE 12 — DELIVER TO UI STUDIO BETA --------
  const deliveredStage =
    state.quality_gate_result === "pass"
      ? "Ready in preview"
      : state.quality_gate_result === "repair"
        ? "Preview ready — quality repair applied"
        : "Weak quality — try Generate again";
  stage(deliveredStage);

  try {
    writeEnginePreviewModel(workspaceRoot, editorModel as Parameters<typeof writeEnginePreviewModel>[1]);
    writePreviewModel(workspaceRoot, editorModel as Parameters<typeof writePreviewModel>[1]);
  } catch (e) {
    state.generation_warnings.push(
      `preview-model write soft-failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const outDir = path.join(workspaceRoot, "nebulla-project");
  fs.mkdirSync(outDir, { recursive: true });
  const codePath = path.join(outDir, "ui-generation-output.tsx");
  fs.writeFileSync(codePath, state.generated_code || "// empty", "utf8");

  state.preview_delivered = "yes";
  state.export_available = state.quality_gate_result === "weak" ? "no" : "yes";
  state.output_type = "react_tailwind_page";
  // Weak skeletons are not a successful generation — keep honest status.
  state.status = state.quality_gate_result === "weak" ? "failed" : "generated";
  state.final_status = state.quality_gate_result === "weak" ? "rejected" : "pending";
  appendStepLog(
    state,
    `Step 9 deliver — preview delivered (quality_gate=${state.quality_gate_result}; stage=${deliveredStage}; status=${state.status})`,
  );
  state.current_step = 12;
  persist(workspaceRoot, state);

  // -------- PHASE 13 — REFINEMENT SUPPORT (metadata ready) --------
  state.refined_by_user = "no";
  appendStepLog(
    state,
    "Step 10 refine — Properties panel is the primary refinement surface (awaiting user)",
  );
  state.current_step = 13;
  persist(workspaceRoot, state);

  // -------- PHASE 14 — CLOSE --------
  appendStepLog(state, "Step 11 metadata — cycle closed with generated status");
  state.current_step = 14;
  stage(deliveredStage);
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
    final_status: state.quality_gate_result === "weak" ? "rejected" : "generated",
    user_visible_stage: deliveredStage,
    page_key: state.page_name,
    updated_at: nowIso(),
  });
  const contextPath = writeContextFile(workspaceRoot, state);

  return {
    ok: true,
    status: state.status,
    contextPath,
    context: state,
    editorModel,
    generatedCode: state.generated_code,
    regeneration_count: state.regeneration_count,
    max_regenerations: state.max_regenerations,
    user_visible_stage: deliveredStage,
  };
}
