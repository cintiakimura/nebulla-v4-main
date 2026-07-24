/**
 * Nebulla UI Generation Engine — types for one cycle.
 * Authority: nebulla-project/ui-generation-engine-manual.md
 */

export type CycleStatus =
  | "in_progress"
  | "generated"
  | "refined"
  | "accepted"
  | "failed"
  | "pending_discovery";

export type DeviceClass = "web" | "mobile" | "landing";
export type PageType =
  | "dashboard"
  | "auth"
  | "settings"
  | "list"
  | "detail"
  | "landing"
  | "checkout"
  | "profile"
  | "other";
export type ProductFunction =
  | "saas_admin"
  | "course"
  | "ecommerce"
  | "booking"
  | "marketplace"
  | "community"
  | "marketing"
  | "general";
export type Industry =
  | "education"
  | "finance"
  | "health"
  | "retail"
  | "general"
  | "other";
export type Complexity = "simple" | "medium" | "rich";
export type NavigationType = "sidebar" | "topnav" | "tabs" | "none";
export type Density = "spacious" | "medium" | "compact";
export type Confidence = "high" | "medium" | "low";
export type QualityGate = "pass" | "repair" | "weak";
export type ReferenceSource = "figma" | "seed" | "mixed";

export type UiGenContextState = {
  context_id: string;
  project_name: string;
  page_name: string;
  created_at: string;
  status: CycleStatus;
  current_step: number;

  product_goal: string;
  target_user: string;
  project_type: string;
  product_function: string;
  industry: string;
  priority_features: string[];

  page_purpose: string;
  primary_actions: string[];
  secondary_actions: string[];
  required_sections: string[];
  navigation_role: string;

  visual_tone: string;
  palette: string;
  density_mp: string;
  typography_notes: string;
  style_constraints: string;
  explicit_do: string[];
  explicit_dont: string[];

  device: DeviceClass | "";
  page_type: PageType | "";
  function: ProductFunction | "";
  industry_class: Industry | "";
  complexity: Complexity | "";
  navigation_type: NavigationType | "";
  density: Density | "";
  classification_notes: string;
  confidence: Confidence | "";

  page_goal: string;
  audience: string;
  layout_navigation: string;
  section_order: string[];
  primary_cta: string;
  secondary_ctas: string[];
  metrics: string[];
  tables_or_lists: string[];
  forms: string[];
  cards_or_panels: string[];
  other_components: string[];
  color_direction: string;
  hierarchy_rules: string;
  spacing_rules: string;
  component_limits: string;
  final_brief_text: string;

  criteria_device: string;
  criteria_page_type: string;
  criteria_function: string;
  criteria_industry: string;
  criteria_navigation: string;
  criteria_components: string;
  criteria_density_tone: string;
  need_page_templates: "yes" | "no" | "";
  need_navigation_patterns: "yes" | "no" | "";
  need_section_patterns: "yes" | "no" | "";
  need_component_patterns: "yes" | "no" | "";
  need_icons_assets: "yes" | "no" | "";
  resource_request_list: string[];

  reference_source: ReferenceSource | "";
  candidates: { id: string; reason: string }[];
  selected_refs: { id: string; why: string }[];
  rejected_notes: string;
  adapt_kept: string;
  adapt_discarded: string;
  adapt_replaced: string;

  model_used: string;
  design_system_rules_applied: "yes" | "no" | "";
  quality_rules_applied: "yes" | "no" | "";
  figma_used: "yes" | "no" | "";
  /** Explicit Figma outcome — never imply success when unavailable. */
  figma_status: "success" | "failed" | "missing_key" | "weak_matches" | "";
  fallback_used: "yes" | "no" | "";
  repair_pass_used: "yes" | "no" | "";
  generation_warnings: string[];
  generation_package: string;

  output_type: string;
  preview_delivered: "yes" | "no" | "";
  export_available: "yes" | "no" | "";
  missing_required_sections: string[];
  quality_gate_result: QualityGate | "";

  refined_by_user: "yes" | "no" | "";
  major_edits: string[];
  final_status: "accepted" | "rejected" | "pending" | "";

  /** Policy fields (manual §§ A–H + After File Creation). */
  auto_triggered: "yes" | "no" | "";
  regeneration_count: number;
  max_regenerations: number;
  preference_feedback: string;
  recovery_path: "guided_improvement" | "manual_refinement" | "partial_redesign" | "none" | "";
  user_visible_stage: string;

  /** Grounding from applied workspace files. */
  file_routes: string[];
  file_button_labels: string[];
  file_headings: string[];
  file_scanned: string[];

  step_log: string[];
  failure_reason: string;

  /** Runtime artifacts (not all serialized to markdown). */
  generated_code: string;
  editor_model_json: string;
};

export function emptyContextState(): UiGenContextState {
  return {
    context_id: "",
    project_name: "",
    page_name: "",
    created_at: "",
    status: "in_progress",
    current_step: 0,
    product_goal: "",
    target_user: "",
    project_type: "",
    product_function: "",
    industry: "",
    priority_features: [],
    page_purpose: "",
    primary_actions: [],
    secondary_actions: [],
    required_sections: [],
    navigation_role: "",
    visual_tone: "",
    palette: "",
    density_mp: "",
    typography_notes: "",
    style_constraints: "",
    explicit_do: [],
    explicit_dont: [],
    device: "",
    page_type: "",
    function: "",
    industry_class: "",
    complexity: "",
    navigation_type: "",
    density: "",
    classification_notes: "",
    confidence: "",
    page_goal: "",
    audience: "",
    layout_navigation: "",
    section_order: [],
    primary_cta: "",
    secondary_ctas: [],
    metrics: [],
    tables_or_lists: [],
    forms: [],
    cards_or_panels: [],
    other_components: [],
    color_direction: "",
    hierarchy_rules: "",
    spacing_rules: "",
    component_limits: "",
    final_brief_text: "",
    criteria_device: "",
    criteria_page_type: "",
    criteria_function: "",
    criteria_industry: "",
    criteria_navigation: "",
    criteria_components: "",
    criteria_density_tone: "",
    need_page_templates: "",
    need_navigation_patterns: "",
    need_section_patterns: "",
    need_component_patterns: "",
    need_icons_assets: "",
    resource_request_list: [],
    reference_source: "",
    candidates: [],
    selected_refs: [],
    rejected_notes: "",
    adapt_kept: "",
    adapt_discarded: "",
    adapt_replaced: "",
    model_used: "",
    design_system_rules_applied: "",
    quality_rules_applied: "",
    figma_used: "",
    figma_status: "",
    fallback_used: "",
    repair_pass_used: "",
    generation_warnings: [],
    generation_package: "",
    output_type: "react_tailwind_page",
    preview_delivered: "",
    export_available: "",
    missing_required_sections: [],
    quality_gate_result: "",
    refined_by_user: "no",
    major_edits: [],
    final_status: "pending",
    auto_triggered: "no",
    regeneration_count: 0,
    max_regenerations: 3,
    preference_feedback: "",
    recovery_path: "none",
    user_visible_stage: "",
    file_routes: [],
    file_button_labels: [],
    file_headings: [],
    file_scanned: [],
    step_log: [],
    failure_reason: "",
    generated_code: "",
    editor_model_json: "",
  };
}
