/**
 * Internal seed pattern fallbacks when FIGMA_API_KEY is missing/weak.
 * Authority: engine manual Phase 7.5–7.11
 */

import type {
  DeviceClass,
  NavigationType,
  PageType,
  ProductFunction,
  UiGenContextState,
} from "./types";

export type SeedPattern = {
  id: string;
  device: DeviceClass[];
  page_types: PageType[];
  functions: ProductFunction[];
  navigation: NavigationType[];
  structure: string;
  reason: string;
};

export const SEED_PATTERNS: SeedPattern[] = [
  {
    id: "seed-web-dashboard-sidebar",
    device: ["web"],
    page_types: ["dashboard"],
    functions: ["saas_admin", "course", "general"],
    navigation: ["sidebar"],
    structure:
      "Left sidebar nav + top header + metrics row (3–4 cards) + primary content panel + secondary list/table.",
    reason: "Standard SaaS admin dashboard shell",
  },
  {
    id: "seed-web-settings-sidebar",
    device: ["web"],
    page_types: ["settings"],
    functions: ["saas_admin", "general"],
    navigation: ["sidebar"],
    structure: "Sidebar + settings header + form sections grouped in cards + save CTA.",
    reason: "Settings form layout",
  },
  {
    id: "seed-web-list-topnav",
    device: ["web"],
    page_types: ["list"],
    functions: ["ecommerce", "marketplace", "general"],
    navigation: ["topnav"],
    structure: "Top nav + filters bar + card/table list + pagination.",
    reason: "List/browse pattern",
  },
  {
    id: "seed-web-detail",
    device: ["web"],
    page_types: ["detail"],
    functions: ["general", "course", "ecommerce"],
    navigation: ["sidebar", "topnav"],
    structure: "Header with title/CTA + main detail column + side meta panel.",
    reason: "Detail page pattern",
  },
  {
    id: "seed-auth",
    device: ["web", "mobile"],
    page_types: ["auth"],
    functions: ["general", "saas_admin", "community"],
    navigation: ["none"],
    structure: "Centered card with logo, form fields, primary submit, secondary link.",
    reason: "Auth form pattern",
  },
  {
    id: "seed-landing",
    device: ["landing", "web"],
    page_types: ["landing"],
    functions: ["marketing", "general"],
    navigation: ["topnav", "none"],
    structure: "Hero + features grid + social proof + final CTA band.",
    reason: "Marketing landing pattern",
  },
  {
    id: "seed-mobile-profile",
    device: ["mobile"],
    page_types: ["profile"],
    functions: ["community", "general"],
    navigation: ["tabs", "none"],
    structure: "Avatar header + stats + action list + bottom tabs.",
    reason: "Mobile profile pattern",
  },
  {
    id: "seed-checkout",
    device: ["web", "mobile"],
    page_types: ["checkout"],
    functions: ["ecommerce", "booking"],
    navigation: ["none", "topnav"],
    structure: "Order summary + payment/form steps + confirm CTA.",
    reason: "Checkout pattern",
  },
  {
    id: "seed-generic-page",
    device: ["web", "mobile", "landing"],
    page_types: ["other", "dashboard", "list", "detail", "settings", "profile"],
    functions: ["general"],
    navigation: ["sidebar", "topnav", "tabs", "none"],
    structure: "Header + primary section stack + one primary CTA.",
    reason: "Conservative fallback when classification is weak",
  },
];

export function rankSeedPatterns(state: UiGenContextState): SeedPattern[] {
  const device = state.device || "web";
  const pageType = state.page_type || "other";
  const fn = state.function || "general";
  const nav = state.navigation_type || "none";

  const scored = SEED_PATTERNS.map((p) => {
    let score = 0;
    if (p.device.includes(device as DeviceClass)) score += 40;
    if (p.page_types.includes(pageType as PageType)) score += 30;
    if (p.functions.includes(fn as ProductFunction)) score += 15;
    if (p.navigation.includes(nav as NavigationType)) score += 10;
    if (p.id === "seed-generic-page") score += 1;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.p);
}

/** Optional Figma: only when FIGMA_API_KEY is present. Never blocks the engine. */
export async function tryFigmaCandidates(state: UiGenContextState): Promise<{
  ok: boolean;
  reason: string;
  candidates: { id: string; reason: string }[];
}> {
  const key = (process.env.FIGMA_API_KEY || "").trim();
  if (!key) {
    return { ok: false, reason: "FIGMA_API_KEY not set", candidates: [] };
  }
  // Soft probe — do not hard-depend on Figma REST shape for this cycle.
  try {
    const res = await fetch("https://api.figma.com/v1/me", {
      headers: { "X-Figma-Token": key },
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: `Figma API probe failed (${res.status})`,
        candidates: [],
      };
    }
    return {
      ok: false,
      reason:
        "Figma key valid but curated library mapping is not configured — using seed fallback",
      candidates: [
        {
          id: "figma-library-unmapped",
          reason: `Authenticated Figma user available; page=${state.page_type} device=${state.device}`,
        },
      ],
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Figma request failed",
      candidates: [],
    };
  }
}
