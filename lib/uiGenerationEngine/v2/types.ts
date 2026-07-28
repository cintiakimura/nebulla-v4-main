/**
 * UI Generation Logic v2 — types for constrained template generation.
 * Authority: nebulla-project/ui-generation-logic-v2.md
 */

export type V2Device = "mobile" | "web" | "landing";

export type V2PageType =
  | "home"
  | "dashboard"
  | "list"
  | "detail"
  | "auth"
  | "settings"
  | "profile"
  | "checkout"
  | "landing"
  | "empty"
  | "other";

export type V2ProductFunction =
  | "course"
  | "tasks"
  | "saas_admin"
  | "ecommerce"
  | "booking"
  | "community"
  | "marketing"
  | "general";

export type V2NavMode = "bottom_tabs" | "top_nav" | "sidebar" | "none";

export type V2TemplateId =
  | "mobile_home_hero_cards"
  | "mobile_list_actions"
  | "mobile_dashboard_metrics"
  | "mobile_settings_groups"
  | "mobile_auth_form"
  | "mobile_detail_sections"
  | "mobile_empty_state"
  | "web_dashboard_sidebar"
  | "web_list_table"
  | "web_settings_two_column"
  | "web_detail_header_content"
  | "web_auth_center_card"
  | "landing_hero_features_cta"
  | "landing_pricing_sections";

export type FigmaStatusV2 =
  | "success"
  | "failed"
  | "missing_key"
  | "unauthorized"
  | "rate_limited"
  | "weak_matches"
  | "skipped";

export type DesignTokens = {
  bg: string;
  surface: string;
  primary: string;
  accent: string;
  text: string;
  mutedText: string;
  border: string;
  radius: number;
  gap: number;
  pad: number;
  shadow: string;
  tone: string;
};

export type PageClassification = {
  device: V2Device;
  page_type: V2PageType;
  product_function: V2ProductFunction;
  navigation_mode: V2NavMode;
  industry: string;
  density: "spacious" | "medium" | "compact";
  confidence: "high" | "medium" | "low";
  notes: string;
};

export type TemplateDef = {
  id: V2TemplateId;
  device: V2Device;
  regions: string[];
  slots: string[];
  needsPrimaryCta: boolean;
};

export type SlotMap = Record<string, string>;

export type FigmaRecord = {
  figma_used: "yes" | "no";
  figma_status: FigmaStatusV2;
  figma_error: string;
  candidates: { id: string; reason: string }[];
  selected_refs: { id: string; why: string }[];
  fallback_used: "yes" | "no";
  structure_hints: string[];
  /** Count only — never log the API token. File keys are non-secret IDs. */
  reference_file_keys_configured: number;
  /** Operator hint for Render / .env (no secrets). */
  env_guidance: string;
};

export type V2NodeStyle = {
  backgroundColor: string;
  color: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  width: string;
  height: string;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  boxShadow: string;
  opacity: number;
};

export type V2Node = {
  id: string;
  role: string;
  type: "container" | "text" | "button" | "box";
  children?: string[];
  text?: string;
  style: V2NodeStyle;
};

export type V2EditorModel = {
  pages: Record<string, { rootId: string; nodes: Record<string, V2Node> }>;
  meta?: {
    engine: "v2";
    template_id: V2TemplateId;
    tokens: DesignTokens;
    slots: SlotMap;
    figma_status: FigmaStatusV2;
  };
};

export type QualityGateV2 = {
  gate: "pass" | "repair" | "weak";
  issues: string[];
};
