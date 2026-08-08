/**
 * Phase F — Constrained render through template regions only.
 * Authority: ui-generation-logic-v2.md §9
 * Style safety: always assign style objects; never hex-as-style.
 */

import { styleFromTokens } from "./designTokens";
import type {
  DesignTokens,
  FigmaStatusV2,
  PageClassification,
  SlotMap,
  TemplateDef,
  V2EditorModel,
  V2Node,
  V2NodeStyle,
  V2TemplateId,
} from "./types";

function ensureStyle(style: V2NodeStyle | string | undefined, tokens: DesignTokens): V2NodeStyle {
  if (!style || typeof style === "string") return styleFromTokens(tokens);
  return style;
}

function addText(
  nodes: Record<string, V2Node>,
  id: string,
  role: string,
  text: string,
  tokens: DesignTokens,
  opts?: Partial<V2NodeStyle>,
): void {
  nodes[id] = {
    id,
    role,
    type: "text",
    text,
    style: ensureStyle(
      styleFromTokens(tokens, {
        backgroundColor: opts?.backgroundColor ?? tokens.surface,
        color: opts?.color ?? tokens.text,
        pad: 0,
        radius: 0,
        ...opts,
      }),
      tokens,
    ),
  };
  // Fix padding after spread
  nodes[id].style.paddingTop = opts?.paddingTop ?? 0;
  nodes[id].style.paddingBottom = opts?.paddingBottom ?? 6;
  nodes[id].style.paddingLeft = opts?.paddingLeft ?? 0;
  nodes[id].style.paddingRight = opts?.paddingRight ?? 0;
}

function addButton(
  nodes: Record<string, V2Node>,
  id: string,
  role: string,
  text: string,
  tokens: DesignTokens,
  primary: boolean,
): void {
  nodes[id] = {
    id,
    role,
    type: "button",
    text,
    style: ensureStyle(
      styleFromTokens(tokens, {
        backgroundColor: primary ? tokens.primary : tokens.surface,
        color: primary ? (luma(tokens.primary) < 0.55 ? "#FFFFFF" : "#111111") : tokens.text,
        pad: 12,
        borderWidth: primary ? 0 : 1,
        width: "auto",
      }),
      tokens,
    ),
  };
  nodes[id].style.paddingLeft = 18;
  nodes[id].style.paddingRight = 18;
  nodes[id].style.marginTop = 8;
  nodes[id].style.borderColor = tokens.border;
}

function luma(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function addCard(
  nodes: Record<string, V2Node>,
  id: string,
  title: string,
  meta: string,
  tokens: DesignTokens,
): string {
  const tid = `${id}-t`;
  const mid = `${id}-m`;
  nodes[id] = {
    id,
    role: "card",
    type: "container",
    children: [tid, mid],
    style: ensureStyle(
      styleFromTokens(tokens, {
        backgroundColor: tokens.surface,
        borderWidth: 1,
        marginTop: tokens.gap,
      }),
      tokens,
    ),
  };
  addText(nodes, tid, "text_title", title, tokens, {
    backgroundColor: tokens.surface,
    color: tokens.text,
    paddingBottom: 4,
  });
  addText(nodes, mid, "text_muted", meta, tokens, {
    backgroundColor: tokens.surface,
    color: tokens.mutedText,
    paddingBottom: 0,
  });
  return id;
}

function stackContainer(
  nodes: Record<string, V2Node>,
  id: string,
  role: string,
  children: string[],
  tokens: DesignTokens,
  bg: string,
  opts?: Partial<V2NodeStyle> & { pad?: number },
): void {
  const { pad, ...styleOpts } = opts || {};
  nodes[id] = {
    id,
    role,
    type: "container",
    children,
    style: ensureStyle(
      styleFromTokens(tokens, {
        backgroundColor: bg,
        pad,
        ...styleOpts,
      }),
      tokens,
    ),
  };
}

function renderTopBar(
  nodes: Record<string, V2Node>,
  tokens: DesignTokens,
  slots: SlotMap,
): string {
  const bar = "region-topbar";
  addText(nodes, "topbar-title", "nav_bar", slots.nav_title || slots.hero_title || "Home", tokens, {
    backgroundColor: tokens.surface,
    color: tokens.text,
    paddingTop: 10,
    paddingBottom: 10,
  });
  stackContainer(nodes, bar, "top_bar", ["topbar-title"], tokens, tokens.surface, {
    borderWidth: 1,
    marginBottom: tokens.gap,
    pad: 10,
  });
  return bar;
}

function renderBottomTabs(
  nodes: Record<string, V2Node>,
  tokens: DesignTokens,
  slots: SlotMap,
  classification: PageClassification,
): string | null {
  if (classification.navigation_mode !== "bottom_tabs") return null;
  const nav = "bottom-tabs";
  const course =
    classification.product_function === "course" || classification.industry === "education";
  const labels = (
    course
      ? [slots.nav_title || "Home", "Learn", "Practice", "Me"]
      : [slots.nav_title || "Home", "Learn", "Practice", "Profile"]
  ).slice(0, 4);
  const kids: string[] = [];
  labels.forEach((label, i) => {
    const id = `tab-${i + 1}`;
    addText(nodes, id, "nav-tab", label, tokens, {
      backgroundColor: tokens.surface,
      color: i === 0 ? tokens.primary : tokens.mutedText,
      paddingTop: 8,
      paddingBottom: 8,
    });
    kids.push(id);
  });
  stackContainer(nodes, nav, "bottom_tabs", kids, tokens, tokens.surface, {
    borderWidth: 1,
    marginTop: tokens.gap + 8,
    pad: 8,
  });
  return nav;
}

function renderSidebar(
  nodes: Record<string, V2Node>,
  tokens: DesignTokens,
  slots: SlotMap,
): string {
  const side = "sidebar";
  const kids = ["side-brand", "side-1", "side-2", "side-3"].filter(Boolean);
  addText(nodes, "side-brand", "nav_bar", slots.nav_title || "App", tokens, {
    backgroundColor: tokens.surface,
    color: tokens.text,
  });
  ["side_1", "side_2", "side_3"].forEach((k, i) => {
    const id = `side-${i + 1}`;
    addText(nodes, id, "nav_bar", slots[k] || `Nav ${i + 1}`, tokens, {
      backgroundColor: tokens.surface,
      color: tokens.mutedText,
    });
  });
  stackContainer(nodes, side, "nav-sidebar", kids, tokens, tokens.surface, {
    width: "200px",
    borderWidth: 1,
    pad: 14,
  });
  return side;
}

function renderCommonHero(
  nodes: Record<string, V2Node>,
  tokens: DesignTokens,
  slots: SlotMap,
  withCtas: boolean,
): string {
  const header = "region-hero";
  const kids = ["title-1", "sub-1"];
  addText(nodes, "title-1", "text_title", slots.hero_title || "Home", tokens, {
    backgroundColor: tokens.surface,
    color: tokens.text,
  });
  addText(nodes, "sub-1", "text_muted", slots.hero_subtitle || "", tokens, {
    backgroundColor: tokens.surface,
    color: tokens.mutedText,
  });
  if (withCtas && slots.primary_cta) {
    const actions = "cta-row";
    const actionKids = ["cta-1"];
    addButton(nodes, "cta-1", "button_primary", slots.primary_cta, tokens, true);
    if (slots.secondary_cta) {
      actionKids.push("cta-2");
      addButton(nodes, "cta-2", "button_secondary", slots.secondary_cta, tokens, false);
    }
    stackContainer(nodes, actions, "cta-row", actionKids, tokens, tokens.surface, { pad: 0 });
    kids.push(actions);
  }
  stackContainer(nodes, header, "hero", kids, tokens, tokens.surface, {
    borderWidth: 1,
    marginBottom: tokens.gap,
  });
  return header;
}

/** Render constrained EditorModel for the chosen template. */
export function renderTemplateModel(input: {
  template: TemplateDef;
  classification: PageClassification;
  tokens: DesignTokens;
  slots: SlotMap;
  figmaStatus: FigmaStatusV2;
  /** Offline/catalog hints — drive denser card stacks when present. */
  structureHints?: string[];
}): V2EditorModel {
  const { template, classification, tokens, slots, figmaStatus } = input;
  const hintJoined = (input.structureHints || []).join("\n");
  const forceCardStack = /VERTICAL auto-layout|card|content block|list/i.test(hintJoined);
  const cardCount = forceCardStack || classification.page_type !== "empty" ? 3 : 2;
  const nodes: Record<string, V2Node> = {};
  const root = "root-page";
  const pageTitle = slots.hero_title || slots.nav_title || "Home";
  const regionIds: string[] = [];

  const needsTabs = classification.navigation_mode === "bottom_tabs";
  const needsSidebar =
    classification.navigation_mode === "sidebar" ||
    template.id === "web_dashboard_sidebar" ||
    template.id === "web_settings_two_column";
  const needsTopBar =
    /^mobile_/i.test(template.id) ||
    classification.device === "mobile" ||
    needsTabs;

  if (needsTopBar && !/auth/i.test(template.id)) {
    regionIds.push(renderTopBar(nodes, tokens, slots));
  }

  // Content regions by template family
  if (
    template.id === "mobile_list_actions" ||
    template.id === "web_list_table"
  ) {
    regionIds.push(renderCommonHero(nodes, tokens, slots, true));
    const list = "region-list";
    const kids: string[] = [];
    for (let i = 1; i <= Math.max(3, cardCount + 1); i++) {
      const title = slots[`item_${i}_title`] || `Item ${i}`;
      const meta = slots[`item_${i}_meta`] || "";
      kids.push(addCard(nodes, `item-${i}`, title, meta, tokens));
    }
    stackContainer(nodes, list, "list", kids, tokens, tokens.bg, { pad: 0 });
    regionIds.push(list);
  } else if (
    template.id === "mobile_dashboard_metrics" ||
    template.id === "mobile_home_hero_cards" ||
    template.id === "landing_hero_features_cta" ||
    template.id === "landing_pricing_sections" ||
    template.id === "web_dashboard_sidebar"
  ) {
    regionIds.push(renderCommonHero(nodes, tokens, slots, true));
    const metrics = "region-metrics";
    const kids: string[] = [];
    for (let i = 1; i <= cardCount; i++) {
      const t =
        slots[`metric_${i}_title`] ||
        slots[`card_${i}_title`] ||
        `Metric ${i}`;
      const v =
        slots[`metric_${i}_value`] ||
        slots[`card_${i}_value`] ||
        "—";
      kids.push(addCard(nodes, `metric-${i}`, t, v, tokens));
    }
    stackContainer(nodes, metrics, "section", kids, tokens, tokens.bg, { pad: 0 });
    regionIds.push(metrics);
    // Always emit a content section when structure hints ask for card stacks.
    if (slots.section_title || forceCardStack) {
      const sec = "region-section";
      addText(
        nodes,
        "sec-title",
        "text_title",
        slots.section_title || "Up next",
        tokens,
        {
          backgroundColor: tokens.bg,
          color: tokens.text,
          paddingTop: tokens.gap,
        },
      );
      addText(nodes, "sec-body", "text_body", slots.section_body || "", tokens, {
        backgroundColor: tokens.bg,
        color: tokens.mutedText,
      });
      const secKids = ["sec-title", "sec-body"];
      for (let i = 1; i <= cardCount; i++) {
        secKids.push(
          addCard(
            nodes,
            `content-${i}`,
            slots[`card_${i}_title`] || slots[`item_${i}_title`] || `Card ${i}`,
            slots[`card_${i}_value`] || slots[`item_${i}_meta`] || "",
            tokens,
          ),
        );
      }
      stackContainer(nodes, sec, "section", secKids, tokens, tokens.bg, { pad: 0 });
      regionIds.push(sec);
    }
  } else if (template.id === "mobile_settings_groups" || template.id === "web_settings_two_column") {
    regionIds.push(renderCommonHero(nodes, tokens, slots, Boolean(slots.primary_cta)));
    const groups = "region-settings";
    const kids: string[] = [];
    for (let i = 1; i <= 4; i++) {
      kids.push(
        addCard(
          nodes,
          `row-${i}`,
          slots[`row_${i}_title`] || `Setting ${i}`,
          slots[`row_${i}_meta`] || "Configure",
          tokens,
        ),
      );
    }
    stackContainer(nodes, groups, "section", kids, tokens, tokens.bg, { pad: 0 });
    regionIds.push(groups);
  } else if (template.id === "mobile_auth_form" || template.id === "web_auth_center_card") {
    regionIds.push(renderCommonHero(nodes, tokens, slots, false));
    const form = "region-form";
    const f1 = addCard(
      nodes,
      "field-1",
      slots.field_1_label || "Email",
      slots.field_1_placeholder || "",
      tokens,
    );
    const f2 = addCard(
      nodes,
      "field-2",
      slots.field_2_label || "Password",
      slots.field_2_placeholder || "",
      tokens,
    );
    addButton(nodes, "cta-1", "button_primary", slots.primary_cta || "Continue", tokens, true);
    if (slots.secondary_cta) {
      addButton(nodes, "cta-2", "button_secondary", slots.secondary_cta, tokens, false);
    }
    stackContainer(
      nodes,
      form,
      "section",
      ["field-1", "field-2", "cta-1", ...(slots.secondary_cta ? ["cta-2"] : [])],
      tokens,
      tokens.bg,
      { pad: 0 },
    );
    void f1;
    void f2;
    regionIds.push(form);
  } else if (template.id === "mobile_empty_state") {
    regionIds.push(renderCommonHero(nodes, tokens, slots, true));
    const empty = "region-empty";
    addText(nodes, "empty-t", "empty_state", slots.empty_title || "Nothing here yet", tokens, {
      backgroundColor: tokens.surface,
      color: tokens.text,
    });
    addText(nodes, "empty-b", "text_muted", slots.empty_body || "", tokens, {
      backgroundColor: tokens.surface,
      color: tokens.mutedText,
    });
    stackContainer(nodes, empty, "empty_state", ["empty-t", "empty-b"], tokens, tokens.surface, {
      borderWidth: 1,
      marginTop: tokens.gap,
    });
    regionIds.push(empty);
  } else {
    // detail / fallback sections
    regionIds.push(renderCommonHero(nodes, tokens, slots, true));
    const sections = "region-sections";
    const kids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      kids.push(
        addCard(
          nodes,
          `sec-${i}`,
          slots[`section_${i}_title`] || `Section ${i}`,
          slots[`section_${i}_body`] || "",
          tokens,
        ),
      );
    }
    stackContainer(nodes, sections, "section", kids, tokens, tokens.bg, { pad: 0 });
    regionIds.push(sections);
  }

  if (needsTabs) {
    const tab = renderBottomTabs(nodes, tokens, slots, classification);
    if (tab) regionIds.push(tab);
  }

  // Root assembly
  if (needsSidebar) {
    const side = renderSidebar(nodes, tokens, slots);
    const main = "main-column";
    stackContainer(nodes, main, "screen", regionIds, tokens, tokens.bg, { pad: tokens.pad });
    stackContainer(nodes, root, "screen", [side, main], tokens, tokens.bg, {
      pad: 0,
    });
  } else {
    stackContainer(nodes, root, "screen", regionIds, tokens, tokens.bg, {
      pad: tokens.pad,
    });
  }

  // Harden: every node must have a real style object
  for (const n of Object.values(nodes)) {
    n.style = ensureStyle(n.style, tokens);
    if (typeof (n as { style?: unknown }).style !== "object" || n.style === null) {
      n.style = styleFromTokens(tokens);
    }
  }

  return {
    pages: {
      [pageTitle]: { rootId: root, nodes },
    },
    meta: {
      engine: "v2",
      template_id: template.id as V2TemplateId,
      tokens,
      slots,
      figma_status: figmaStatus,
    },
  };
}

/** Mirror constrained structure as React + Tailwind (secondary to preview model). */
export function renderTemplateCode(input: {
  template: TemplateDef;
  tokens: DesignTokens;
  slots: SlotMap;
}): string {
  const { template, tokens, slots } = input;
  const title = slots.hero_title || "Home";
  const sub = slots.hero_subtitle || "";
  const cta = slots.primary_cta || "Continue";
  const items = [1, 2, 3, 4]
    .map((i) => slots[`item_${i}_title`] || slots[`card_${i}_title`] || slots[`row_${i}_title`])
    .filter(Boolean);

  return `export default function GeneratedPage() {
  return (
    <main className="min-h-screen w-full" style={{ backgroundColor: "${tokens.bg}", color: "${tokens.text}", padding: ${tokens.pad} }}>
      <section className="rounded-xl border p-4 mb-4" style={{ backgroundColor: "${tokens.surface}", borderColor: "${tokens.border}", borderRadius: ${tokens.radius} }}>
        <h1 className="text-2xl font-semibold">${escapeJsx(title)}</h1>
        <p className="mt-1 opacity-80" style={{ color: "${tokens.mutedText}" }}>${escapeJsx(sub)}</p>
        <button className="mt-4 px-4 py-2 rounded-lg" style={{ backgroundColor: "${tokens.primary}", color: "#fff", borderRadius: ${tokens.radius} }}>
          ${escapeJsx(cta)}
        </button>
      </section>
      <section className="space-y-3" data-template="${template.id}">
        ${items
          .map(
            (label) =>
              `<div className="rounded-xl border p-4" style={{ backgroundColor: "${tokens.surface}", borderColor: "${tokens.border}", borderRadius: ${tokens.radius} }}>
          <div className="font-medium">${escapeJsx(label || "")}</div>
        </div>`,
          )
          .join("\n        ")}
      </section>
    </main>
  );
}
`;
}

function escapeJsx(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
