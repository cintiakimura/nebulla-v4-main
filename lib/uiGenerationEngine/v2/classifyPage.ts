/**
 * Phase A — Classify page (device, page type, function, nav).
 * Authority: ui-generation-logic-v2.md §4
 */

import type {
  PageClassification,
  V2Device,
  V2NavMode,
  V2PageType,
  V2ProductFunction,
} from "./types";
import { preferredSheetBucket } from "./figmaSheetCatalog";

export { preferredSheetBucket };

export type ClassifyInput = {
  projectType: string;
  goal: string;
  features: string;
  uiux: string;
  pageName: string;
  pagePurpose: string;
  /** This page's route only — never the full workspace route list for auth. */
  pageRoute?: string;
  filePaths: string[];
  /** Workspace routes — device/nav/grounding only; NOT used for page_type auth. */
  fileRoutes: string[];
  hasBottomNav?: boolean;
};

const AUTH_PAGE_RE = /sign[\s_-]?in|sign[\s_-]?up|\blog[\s_-]?in\b|\bauth\b|\bregister\b/i;
const AUTH_ROUTE_RE = /\/(login|signin|sign-in|sign-up|signup|register|auth)(\/|$)/i;
const PRODUCT_HOME_NAME_RE =
  /\b(home|practice|exercise|lesson|progress|dashboard|teacher|parent|today)\b/i;

function detectDevice(input: ClassifyInput): V2Device {
  const blob = `${input.projectType}\n${input.goal}\n${input.filePaths.join("\n")}`.toLowerCase();
  if (/landing|marketing site|waitlist/.test(blob) && !/mobile app|expo|react native/.test(blob)) {
    return "landing";
  }
  if (
    input.hasBottomNav ||
    /mobile|expo|react native|ios|android|bottomnav|tab bar/.test(blob) ||
    input.filePaths.some((p) => /app\/\(tabs\)|components\/.*nav/i.test(p))
  ) {
    return "mobile";
  }
  if (/web app|next\.?js|saas|dashboard/.test(blob)) return "web";
  if (input.filePaths.some((p) => /^app\//i.test(p) || /expo/i.test(p))) return "mobile";
  return "web";
}

/**
 * Auth (and other page types) from THIS page only: name, purpose, pageRoute.
 * Global fileRoutes must never force Email/Password onto Kid Home after Foundation.
 */
function isAuthPageLocal(input: ClassifyInput): boolean {
  const name = (input.pageName || "").trim();
  const purpose = (input.pagePurpose || "").trim();
  const route = (input.pageRoute || "").trim();
  if (AUTH_ROUTE_RE.test(route)) return true;
  if (AUTH_PAGE_RE.test(name)) return true;
  // Purpose may say "after login…" on product pages — do not treat those as auth screens.
  if (PRODUCT_HOME_NAME_RE.test(name)) return false;
  if (AUTH_PAGE_RE.test(purpose) && !/\bafter\s+(sign|log)[\s_-]?in\b/i.test(purpose)) {
    return true;
  }
  return false;
}

function detectPageType(input: ClassifyInput, device: V2Device): V2PageType {
  // Page-local only — never join workspace fileRoutes into auth / page_type decisions.
  const blob = `${input.pageName} ${input.pagePurpose} ${input.pageRoute || ""}`.toLowerCase();
  if (isAuthPageLocal(input)) return "auth";
  if (/setting/.test(blob)) return "settings";
  if (/profile|account/.test(blob)) return "profile";
  if (/checkout|cart|payment/.test(blob)) return "checkout";
  if (/empty|no results|zero state/.test(blob)) return "empty";
  if (/landing|marketing|pricing/.test(blob) && device === "landing") return "landing";
  if (/dashboard|overview|metrics|home feed/.test(blob)) return "dashboard";
  if (/task|todo|list|feed|practice|catalog|browse/.test(blob)) return "list";
  if (/detail|lesson|item|show/.test(blob)) return "detail";
  if (/home screen|\bhome\b/.test(blob) || /\/$|\/home\b/.test(blob)) return "home";
  if (device === "landing") return "landing";
  if (device === "mobile" && /home|index/.test(blob)) return "home";
  return device === "mobile" ? "home" : "dashboard";
}

function detectFunction(input: ClassifyInput): V2ProductFunction {
  const blob = `${input.goal}\n${input.features}\n${input.pageName}\n${input.pagePurpose}`.toLowerCase();
  if (/task|todo|micro-task|checklist/.test(blob)) return "tasks";
  if (/course|learn|lesson|practice|education|language|study/.test(blob)) return "course";
  if (/shop|store|cart|ecommerce|product catalog/.test(blob)) return "ecommerce";
  if (/book|reserv|appoint/.test(blob)) return "booking";
  if (/community|social|forum|chat/.test(blob)) return "community";
  if (/admin|saas|crm|analytics/.test(blob)) return "saas_admin";
  if (/market|landing|waitlist|campaign/.test(blob)) return "marketing";
  return "general";
}

function detectNav(input: ClassifyInput, device: V2Device, pageType: V2PageType): V2NavMode {
  if (pageType === "auth" || pageType === "checkout" || pageType === "landing") return "none";
  const blob = `${input.projectType}\n${input.filePaths.join("\n")}`.toLowerCase();
  if (device === "mobile" || input.hasBottomNav || /bottomnav|tab bar|tabs/.test(blob)) {
    return "bottom_tabs";
  }
  if (device === "web" || /sidebar|side nav/.test(blob)) {
    if (pageType === "dashboard" || pageType === "settings" || pageType === "list") return "sidebar";
    return "top_nav";
  }
  return "none";
}

function detectDensity(uiux: string): PageClassification["density"] {
  if (/spacious|airy|generous/i.test(uiux)) return "spacious";
  if (/compact|dense|tight/i.test(uiux)) return "compact";
  return "medium";
}

function detectIndustry(goal: string, tech: string): string {
  const b = `${goal}\n${tech}`.toLowerCase();
  if (/educat|learn|course|school|language/.test(b)) return "education";
  if (/financ|bank|fintech/.test(b)) return "finance";
  if (/health|clinic|medical|wellness/.test(b)) return "health";
  if (/retail|shop|store|commerce/.test(b)) return "retail";
  return "general";
}

export function classifyPage(input: ClassifyInput): PageClassification {
  const device = detectDevice(input);
  const page_type = detectPageType(input, device);
  const product_function = detectFunction(input);
  const navigation_mode = detectNav(input, device, page_type);
  const density = detectDensity(input.uiux);
  const industry = detectIndustry(input.goal, input.projectType);
  const confidence: PageClassification["confidence"] =
    input.goal.length > 80 && input.pageName.length >= 2
      ? "high"
      : input.goal.length > 40 || input.filePaths.length > 2
        ? "medium"
        : "low";

  return {
    device,
    page_type,
    product_function,
    navigation_mode,
    industry,
    density,
    confidence,
    notes: `v2 classify device=${device} page=${page_type} fn=${product_function} nav=${navigation_mode} density=${density} conf=${confidence}`,
  };
}
