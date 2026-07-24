/**
 * Read/write nebulla-project/ui-generation-context.md for one cycle.
 * Authority: ui-generation-context.md + engine manual Phase writes.
 */

import fs from "fs";
import path from "path";
import type { UiGenContextState } from "./types";
import { emptyContextState } from "./types";

export const CONTEXT_REL = path.join("nebulla-project", "ui-generation-context.md");

export function contextAbsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CONTEXT_REL);
}

function bullets(items: string[]): string {
  if (!items.length) return "  - (none)\n";
  return items.map((i) => `  - ${i}`).join("\n") + "\n";
}

function numbered(items: string[]): string {
  if (!items.length) return "  1. (none)\n";
  return items.map((i, idx) => `  ${idx + 1}. ${i}`).join("\n") + "\n";
}

/** Serialize state into the authority markdown notebook format. */
export function serializeContextMarkdown(s: UiGenContextState): string {
  const cand =
    s.candidates.length === 0
      ? "  1. (none)\n"
      : s.candidates.map((c, i) => `  ${i + 1}. ${c.id} — ${c.reason}`).join("\n") + "\n";
  const sel =
    s.selected_refs.length === 0
      ? "  1. (none)\n"
      : s.selected_refs.map((c, i) => `  ${i + 1}. ${c.id} — ${c.why}`).join("\n") + "\n";
  const log =
    s.step_log.length === 0
      ? "(empty)\n"
      : s.step_log.map((line, i) => `${i + 1}. ${line}`).join("\n") + "\n";

  return `# UI Generation Context

This file is the source of truth for one UI generation cycle.

---

## 0. Cycle identity

- context_id: ${s.context_id}
- project_name: ${s.project_name}
- page_name: ${s.page_name}
- created_at: ${s.created_at}
- status: ${s.status}
- current_step: ${s.current_step}
- auto_triggered: ${s.auto_triggered || "no"}
- regeneration_count: ${s.regeneration_count}
- max_regenerations: ${s.max_regenerations}
- preference_feedback: ${s.preference_feedback || "(none)"}
- recovery_path: ${s.recovery_path || "none"}
- user_visible_stage: ${s.user_visible_stage || "(none)"}
${s.failure_reason ? `- failure_reason: ${s.failure_reason}\n` : ""}
---

## 0.5 Generated file grounding

- scanned_files:
${bullets(s.file_scanned)}
- routes:
${bullets(s.file_routes)}
- button_labels:
${bullets(s.file_button_labels)}
- headings:
${bullets(s.file_headings)}

---

## 1. Master Plan extracts

### 1.1 Project identity
- product_goal: ${s.product_goal || "(not found)"}
- target_user: ${s.target_user || "(not found)"}
- project_type: ${s.project_type || "(not found)"}

### 1.2 Product understanding
- product_function: ${s.product_function || "(not found)"}
- industry: ${s.industry || "general"}
- priority_features:
${bullets(s.priority_features)}

### 1.3 Page definition
- page_name: ${s.page_name || "(not found)"}
- page_purpose: ${s.page_purpose || "(not found)"}
- primary_actions:
${bullets(s.primary_actions)}
- secondary_actions:
${bullets(s.secondary_actions)}
- required_sections:
${bullets(s.required_sections)}
- navigation_role: ${s.navigation_role || "(not found)"}

### 1.4 UI/UX direction
- visual_tone: ${s.visual_tone || "(not found)"}
- palette: ${s.palette || "(not found)"}
- density: ${s.density_mp || "(not found)"}
- typography_notes: ${s.typography_notes || "(not found)"}
- style_constraints: ${s.style_constraints || "(not found)"}
- explicit_do:
${bullets(s.explicit_do)}
- explicit_dont:
${bullets(s.explicit_dont)}

---

## 2. Classification decisions

- device: ${s.device}
- page_type: ${s.page_type}
- function: ${s.function}
- industry: ${s.industry_class}
- complexity: ${s.complexity}
- navigation_type: ${s.navigation_type}
- density: ${s.density}
- classification_notes: ${s.classification_notes}
- confidence: ${s.confidence}

---

## 3. Generation brief

### 3.1 Page goal
- ${s.page_goal}

### 3.2 Audience
- ${s.audience}

### 3.3 Layout contract
- navigation: ${s.layout_navigation}
- section_order:
${numbered(s.section_order)}
- primary_cta: ${s.primary_cta}
- secondary_ctas:
${bullets(s.secondary_ctas)}

### 3.4 Content inventory
- metrics:
${bullets(s.metrics)}
- tables_or_lists:
${bullets(s.tables_or_lists)}
- forms:
${bullets(s.forms)}
- cards_or_panels:
${bullets(s.cards_or_panels)}
- other_components:
${bullets(s.other_components)}

### 3.5 Visual contract
- color_direction: ${s.color_direction}
- hierarchy_rules: ${s.hierarchy_rules}
- spacing_rules: ${s.spacing_rules}
- component_limits: ${s.component_limits}

### 3.6 Final brief text
> ${s.final_brief_text.replace(/\n/g, "\n> ")}

---

## 4. Reference selection

### 4.1 Selection criteria used
- device: ${s.criteria_device}
- page_type: ${s.criteria_page_type}
- function: ${s.criteria_function}
- industry: ${s.criteria_industry}
- navigation_pattern: ${s.criteria_navigation}
- component_needs: ${s.criteria_components}
- density_tone: ${s.criteria_density_tone}

### 4.2 Resource types requested
- page_templates: ${s.need_page_templates}
- navigation_patterns: ${s.need_navigation_patterns}
- section_patterns: ${s.need_section_patterns}
- component_patterns: ${s.need_component_patterns}
- icons_assets: ${s.need_icons_assets}
- other: ${s.resource_request_list.join("; ") || "(none)"}

### 4.3 Candidates retrieved
- source: ${s.reference_source}
- candidates:
${cand}

### 4.4 Selected references
- selected:
${sel}
- rejected_notes: ${s.rejected_notes || "(none)"}

### 4.5 Adaptation notes
- what structure was kept: ${s.adapt_kept}
- what was discarded: ${s.adapt_discarded}
- what was replaced with Master Plan content: ${s.adapt_replaced}

---

## 5. Generation package

- model_used: ${s.model_used}
- design_system_rules_applied: ${s.design_system_rules_applied}
- quality_rules_applied: ${s.quality_rules_applied}
- figma_used: ${s.figma_used}
- fallback_used: ${s.fallback_used}
- repair_pass_used: ${s.repair_pass_used}
- generation_warnings:
${bullets(s.generation_warnings)}

---

## 6. Output record

- output_type: ${s.output_type}
- preview_delivered: ${s.preview_delivered}
- export_available: ${s.export_available}
- missing_required_sections:
${bullets(s.missing_required_sections)}
- quality_gate_result: ${s.quality_gate_result}

---

## 7. Human refinement

- refined_by_user: ${s.refined_by_user}
- major_edits:
${bullets(s.major_edits)}
- final_status: ${s.final_status}

---

## 8. Step log

${log}
`;
}

export function writeContextFile(workspaceRoot: string, state: UiGenContextState): string {
  const abs = contextAbsPath(workspaceRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, serializeContextMarkdown(state), "utf8");
  return abs;
}

export function ensureContextTemplate(workspaceRoot: string): void {
  const abs = contextAbsPath(workspaceRoot);
  if (fs.existsSync(abs) && fs.statSync(abs).size > 0) return;
  writeContextFile(workspaceRoot, emptyContextState());
}

export function appendStepLog(state: UiGenContextState, line: string): void {
  state.step_log.push(line);
}
