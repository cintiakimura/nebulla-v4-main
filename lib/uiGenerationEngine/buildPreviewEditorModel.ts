/**
 * Build a real, structured EditorModel for UI Studio Beta preview.
 * Authority: ui-generation-engine-manual.md + ui-generation-sequence.md
 * Never dumps Master Plan prose, routes, or metadata into visible titles.
 */

import type { UiGenContextState } from "./types";

export type VisualTheme = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  primaryText: string;
  border: string;
  radius: number;
  pad: number;
  gap: number;
};

type Style = Record<string, string | number>;
type Node = {
  id: string;
  role: string;
  type: "container" | "text" | "button" | "box";
  children?: string[];
  text?: string;
  style: Style;
};

function baseStyle(theme: VisualTheme, pad?: number): Style {
  const p = pad ?? theme.pad;
  return {
    backgroundColor: theme.surface,
    color: theme.text,
    paddingTop: p,
    paddingRight: p,
    paddingBottom: p,
    paddingLeft: p,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    width: "100%",
    height: "auto",
    borderRadius: theme.radius,
    borderWidth: 0,
    borderColor: theme.border,
    boxShadow: "none",
    opacity: 1,
  };
}

function normalizeHex(raw: string, fallback: string): string {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return `#${s.slice(1, 7)}`.toLowerCase();
  return fallback;
}

function luminance(hex: string): number {
  const h = normalizeHex(hex, "#ffffff").slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Parse Master Plan §5 / palette field into a concrete theme. */
export function parseVisualTheme(uiux: string, paletteField: string, density: string): VisualTheme {
  const blob = `${uiux}\n${paletteField}`;
  const hexes = [...blob.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) =>
    normalizeHex(`#${m[1]}`, ""),
  ).filter(Boolean);

  const spacious = /spacious|airy|generous/i.test(blob) || density === "spacious";
  const compact = /compact|dense|tight/i.test(blob) || density === "compact";
  const radiusMatch = blob.match(/(?:radius|rounded|corner)[^\d]{0,12}(\d{1,2})/i);
  const radius = radiusMatch ? Math.min(24, Math.max(4, Number(radiusMatch[1]))) : 12;

  let background = "#F7F5F2";
  let surface = "#FFFFFF";
  let text = "#1C1917";
  let muted = "#78716C";
  let primary = "#0F766E";
  let primaryText = "#FFFFFF";
  let border = "#E7E5E4";

  if (hexes.length >= 1) {
    const sorted = [...hexes].sort((a, b) => luminance(a) - luminance(b));
    const darkest = sorted[0];
    const lightest = sorted[sorted.length - 1];
    const mid = sorted[Math.floor(sorted.length / 2)] || darkest;
    // Prefer light canvas if §5 looks soft/cream; dark if mostly dark tokens.
    const mostlyDark = hexes.filter((h) => luminance(h) < 0.35).length >= hexes.length / 2;
    if (mostlyDark) {
      background = darkest;
      surface = mid;
      text = lightest;
      muted = normalizeHex(hexes[1] || "#A8A29E", "#A8A29E");
      primary = hexes.find((h) => h !== darkest && h !== lightest) || mid;
      primaryText = luminance(primary) < 0.5 ? "#FFFFFF" : "#111111";
      border = mid;
    } else {
      background = lightest.length ? lightest : "#F7F5F2";
      surface = "#FFFFFF";
      text = darkest;
      muted = mid;
      primary = hexes.find((h) => h !== lightest && h !== darkest) || mid || "#0F766E";
      primaryText = luminance(primary) < 0.55 ? "#FFFFFF" : "#111111";
      border = normalizeHex(hexes[hexes.length - 2] || "#E7E5E4", "#E7E5E4");
    }
  } else if (/dark|night|black/i.test(blob) && !/soft|cream|warm/i.test(blob)) {
    background = "#0C0A09";
    surface = "#1C1917";
    text = "#FAFAF9";
    muted = "#A8A29E";
    primary = "#2DD4BF";
    primaryText = "#042F2E";
    border = "#292524";
  }

  return {
    background,
    surface,
    text,
    muted,
    primary,
    primaryText,
    border,
    radius,
    pad: spacious ? 20 : compact ? 12 : 16,
    gap: spacious ? 16 : compact ? 8 : 12,
  };
}

/** Strip routes, prose dumps, and slug noise into a short human title. */
export function cleanHumanTitle(raw: string, fallback = "Home"): string {
  let s = (raw || "").trim();
  if (!s) return fallback;
  s = s.replace(/`[^`]+`/g, "").replace(/\*\*/g, "").trim();
  s = s.replace(/^(generated page|page:|route:)\s*/i, "").trim();

  // Whole-string route/slug only (do not treat "listen/speak/write" prose as a path).
  const isPathLike = /^\/[a-z0-9/_-]+$/i.test(s) || /^[a-z0-9]+(?:[-_][a-z0-9]+){2,}$/i.test(s);
  if (isPathLike) {
    const leaf = s.replace(/^\/+/, "").split("/").filter(Boolean).pop() || fallback;
    const parts = leaf.replace(/[-_]+/g, " ").split(/\s+/).filter(Boolean);
    // Prefer short human labels from slugs: tasks-screen-daily-practice → Tasks Screen
    s = parts.slice(0, Math.min(2, parts.length)).join(" ");
  }

  // Drop trailing "at /route" crumbs
  s = s.replace(/\s+at\s+\/[a-z0-9/_-]+$/i, "").trim();
  s = s.replace(/\s+/g, " ").trim();

  // Reject long description dumps — keep first 2–4 content words (skip helper verbs).
  if (s.length > 36 || s.split(/\s+/).length > 5) {
    const stop = new Set([
      "help",
      "helps",
      "the",
      "a",
      "an",
      "to",
      "for",
      "and",
      "with",
      "from",
      "your",
      "users",
      "user",
      "learners",
      "across",
    ]);
    const words = s
      .split(/[.!?:\n]/)[0]
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9-]/g, ""))
      .filter(Boolean);
    const meaningful = words.filter((w) => !stop.has(w.toLowerCase()));
    const pick = (meaningful.length ? meaningful : words).slice(0, 3);
    s = pick.join(" ") || fallback;
  }

  // Always title-case short labels (prose slices often keep stray capitals).
  s = s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
  return s.slice(0, 36) || fallback;
}

/** Short human subtitle — never a route or Master Plan paragraph. */
export function cleanHumanSubtitle(
  purpose: string,
  pageType: string,
  productFunction: string,
  fileHeadings: string[],
): string {
  const heading = fileHeadings.find(
    (h) => h.trim().length >= 3 && h.trim().length <= 48 && !h.includes("/") && !/[.]{1}.+\s/.test(h),
  );
  if (heading) return heading.trim();

  let s = (purpose || "").trim();
  s = s.replace(/`[^`]+`/g, "").replace(/\*\*/g, "");
  s = s.replace(/^generated page\b.*?\bat\s+/i, "");
  s = s.replace(/\/[a-z0-9/_-]+/gi, "");
  s = s.replace(/\blabels?:\s*.+$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 56 || s.split(/\s+/).length > 10 || /[.!?]/.test(s)) {
    s = "";
  }
  if (s.length >= 4) return s;

  const fn = `${productFunction} ${pageType}`.toLowerCase();
  if (/task|todo|list/.test(fn)) return "Today’s micro-tasks";
  if (/course|learn|practice|lesson|education/.test(fn)) return "Keep your streak going";
  if (/setting/.test(fn)) return "Preferences and account";
  if (/auth|sign|login/.test(fn)) return "Sign in to continue";
  if (/dashboard/.test(fn)) return "Your overview";
  if (/profile/.test(fn)) return "Your profile";
  if (/checkout|cart/.test(fn)) return "Review and confirm";
  return "Ready when you are";
}

export function pickPrimaryCta(state: UiGenContextState): string {
  const candidates = [
    ...state.primary_actions,
    ...state.file_button_labels,
    ...state.secondary_actions,
  ]
    .map((x) => (x || "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .filter((x) => x.length <= 28)
    .filter((x) => !/^get started$/i.test(x))
    .filter((x) => !/\//.test(x));
  if (candidates[0]) return candidates[0];
  const fn = `${state.function} ${state.page_type} ${state.page_name}`.toLowerCase();
  if (/task|todo/.test(fn)) return "Start task";
  if (/practice|lesson|learn|course/.test(fn)) return "Start practice";
  if (/setting/.test(fn)) return "Save changes";
  if (/auth|sign|login/.test(fn)) return "Continue";
  if (/book/.test(fn)) return "Book now";
  return "Continue";
}

function sectionsForProduct(state: UiGenContextState): string[] {
  const fromPlan = (state.section_order.length ? state.section_order : state.required_sections)
    .map((s) => cleanHumanTitle(s, ""))
    .filter((s) => s && !/^(header|main content|primary action|content for)/i.test(s));
  const fromFiles = state.file_headings
    .map((h) => cleanHumanTitle(h, ""))
    .filter((h) => h && h.length <= 32);
  const merged: string[] = [];
  for (const s of [...fromPlan, ...fromFiles]) {
    if (!merged.some((m) => m.toLowerCase() === s.toLowerCase())) merged.push(s);
    if (merged.length >= 5) break;
  }
  if (merged.length >= 2) return merged;

  const fn = `${state.function} ${state.page_type} ${state.page_name}`.toLowerCase();
  if (/task|todo|list/.test(fn)) return ["Today", "Up next", "Quick actions"];
  if (/course|learn|practice|lesson|education/.test(fn))
    return ["Progress", "Today’s lesson", "Practice"];
  if (/setting/.test(fn)) return ["Account", "Preferences", "Notifications"];
  if (/auth|sign|login/.test(fn)) return ["Email", "Password"];
  if (/dashboard/.test(fn)) return ["Highlights", "Recent activity", "Next steps"];
  if (/profile/.test(fn)) return ["About", "Activity", "Settings"];
  if (/checkout|cart|ecommerce/.test(fn)) return ["Order summary", "Payment", "Confirm"];
  return ["Overview", "Details", "Actions"];
}

function addText(
  nodes: Record<string, Node>,
  id: string,
  role: string,
  text: string,
  theme: VisualTheme,
  opts?: Partial<Style>,
): void {
  nodes[id] = {
    id,
    role,
    type: "text",
    text,
    style: {
      ...baseStyle(theme, 0),
      backgroundColor: theme.surface,
      color: theme.text,
      paddingTop: 0,
      paddingBottom: 6,
      paddingLeft: 0,
      paddingRight: 0,
      borderRadius: 0,
      ...opts,
    },
  };
}

function addButton(
  nodes: Record<string, Node>,
  id: string,
  role: string,
  text: string,
  theme: VisualTheme,
  primary: boolean,
): void {
  nodes[id] = {
    id,
    role,
    type: "button",
    text,
    style: {
      ...baseStyle(theme, 12),
      backgroundColor: primary ? theme.primary : theme.surface,
      color: primary ? theme.primaryText : theme.text,
      width: "auto",
      borderWidth: primary ? 0 : 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      paddingLeft: 18,
      paddingRight: 18,
      marginTop: 8,
    },
  };
}

function addCardRow(
  nodes: Record<string, Node>,
  id: string,
  title: string,
  meta: string,
  theme: VisualTheme,
): string {
  const tid = `${id}-t`;
  const mid = `${id}-m`;
  nodes[id] = {
    id,
    role: "list-item",
    type: "container",
    children: [tid, mid],
    style: {
      ...baseStyle(theme, 14),
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: theme.gap,
      borderRadius: theme.radius,
    },
  };
  addText(nodes, tid, "list-item-title", title, theme, {
    color: theme.text,
    paddingBottom: 4,
    backgroundColor: theme.surface,
  });
  addText(nodes, mid, "list-item-meta", meta, theme, {
    color: theme.muted,
    paddingBottom: 0,
    backgroundColor: theme.surface,
  });
  return id;
}

/**
 * Build a structured, theme-aware EditorModel (never title + one generic button only).
 */
export function buildRichEditorModelFromBrief(state: UiGenContextState): {
  pages: Record<string, { rootId: string; nodes: Record<string, Node> }>;
} {
  const theme = parseVisualTheme(
    `${state.visual_tone}\n${state.style_constraints}\n${state.color_direction}`,
    state.palette,
    state.density,
  );
  const title = cleanHumanTitle(state.page_name, state.project_name || "Home");
  const subtitle = cleanHumanSubtitle(
    state.page_purpose,
    state.page_type,
    state.function,
    state.file_headings,
  );
  const cta = pickPrimaryCta(state);
  const sections = sectionsForProduct(state);
  const secondary =
    state.secondary_ctas.find((c) => c && !/^get started$/i.test(c) && c.length <= 28) ||
    state.file_button_labels.find((b) => b !== cta && b.length <= 28) ||
    "";

  const root = "root-page";
  const header = "header-1";
  const titleId = "title-1";
  const subId = "sub-1";
  const actionsRow = "actions-1";
  const ctaId = "cta-1";
  const cta2Id = "cta-2";
  const nodes: Record<string, Node> = {};

  nodes[root] = {
    id: root,
    role: "page-root",
    type: "container",
    children: [header],
    style: {
      ...baseStyle(theme, theme.pad),
      backgroundColor: theme.background,
      paddingTop: theme.pad + 8,
      paddingBottom: theme.pad + 16,
    },
  };

  nodes[header] = {
    id: header,
    role: "page-header",
    type: "container",
    children: [titleId, subId, actionsRow],
    style: {
      ...baseStyle(theme, theme.pad),
      backgroundColor: theme.surface,
      borderRadius: theme.radius,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: theme.gap,
    },
  };

  addText(nodes, titleId, "hero-title", title, theme, {
    color: theme.text,
    paddingBottom: 4,
    backgroundColor: theme.surface,
  });
  addText(nodes, subId, "hero-sub", subtitle, theme, {
    color: theme.muted,
    paddingBottom: 8,
    backgroundColor: theme.surface,
  });

  const actionChildren = [ctaId];
  addButton(nodes, ctaId, "cta-primary", cta, theme, true);
  if (secondary) {
    actionChildren.push(cta2Id);
    addButton(nodes, cta2Id, "cta-secondary", secondary, theme, false);
  }
  nodes[actionsRow] = {
    id: actionsRow,
    role: "cta-row",
    type: "container",
    children: actionChildren,
    style: {
      ...baseStyle(theme, 0),
      backgroundColor: theme.surface,
      paddingTop: 4,
      paddingBottom: 0,
    },
  };

  const fn = `${state.function} ${state.page_type} ${title}`.toLowerCase();
  const sectionIds: string[] = [];

  // Function-specific content blocks
  if (/task|todo|list/.test(fn) || state.page_type === "list") {
    const listId = "section-list";
    const listTitle = "section-list-title";
    const items: string[] = [];
    const itemLabels =
      state.file_headings.slice(0, 4).length >= 2
        ? state.file_headings.slice(0, 4).map((h) => cleanHumanTitle(h, "Item"))
        : ["Review vocabulary", "Listen practice", "Write three sentences", "Quick quiz"];
    itemLabels.forEach((label, i) => {
      const id = `item-${i + 1}`;
      items.push(addCardRow(nodes, id, label, i === 0 ? "Ready" : "5 min", theme));
    });
    nodes[listTitle] = {
      id: listTitle,
      role: "section-title",
      type: "text",
      text: sections[0] || "Today",
      style: {
        ...baseStyle(theme, 0),
        backgroundColor: theme.background,
        color: theme.text,
        paddingBottom: 4,
        paddingTop: theme.gap,
      },
    };
    nodes[listId] = {
      id: listId,
      role: "task-list",
      type: "container",
      children: [listTitle, ...items],
      style: { ...baseStyle(theme, 0), backgroundColor: theme.background },
    };
    sectionIds.push(listId);
  } else if (/course|learn|practice|lesson|education/.test(fn)) {
    const prog = "section-progress";
    const lesson = "section-lesson";
    addText(nodes, "prog-title", "section-title", sections[0] || "Progress", theme, {
      backgroundColor: theme.background,
      paddingTop: theme.gap,
    });
    nodes[prog] = {
      id: prog,
      role: "progress-panel",
      type: "container",
      children: ["prog-title", "prog-body"],
      style: {
        ...baseStyle(theme, theme.pad),
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        marginTop: theme.gap,
      },
    };
    addText(nodes, "prog-body", "section-body", "Day streak · keep practicing", theme, {
      color: theme.muted,
      backgroundColor: theme.surface,
    });
    addText(nodes, "lesson-title", "section-title", sections[1] || "Today’s lesson", theme, {
      backgroundColor: theme.background,
      paddingTop: theme.gap,
    });
    const cards = ["card-a", "card-b"];
    cards.forEach((id, i) => {
      addCardRow(
        nodes,
        id,
        state.file_headings[i] ? cleanHumanTitle(state.file_headings[i], `Lesson ${i + 1}`) : `Lesson ${i + 1}`,
        i === 0 ? "Start now" : "Up next",
        theme,
      );
    });
    nodes[lesson] = {
      id: lesson,
      role: "lesson-panel",
      type: "container",
      children: ["lesson-title", ...cards],
      style: { ...baseStyle(theme, 0), backgroundColor: theme.background },
    };
    sectionIds.push(prog, lesson);
  } else if (/setting/.test(fn)) {
    sections.slice(0, 4).forEach((label, i) => {
      const sid = `settings-${i + 1}`;
      addCardRow(nodes, sid, label, "Configure", theme);
      sectionIds.push(sid);
    });
  } else if (/auth|sign|login/.test(fn)) {
    const form = "auth-form";
    const fieldIds = ["field-email", "field-password"];
    addCardRow(nodes, "field-email", "Email", "you@example.com", theme);
    addCardRow(nodes, "field-password", "Password", "••••••••", theme);
    nodes[form] = {
      id: form,
      role: "auth-form",
      type: "container",
      children: fieldIds,
      style: { ...baseStyle(theme, 0), backgroundColor: theme.background, marginTop: theme.gap },
    };
    sectionIds.push(form);
  } else {
    // Generic but still structured: section cards with body + optional metric row
    if (/dashboard/.test(fn)) {
      const metrics = "metrics-row";
      const mids = ["m1", "m2", "m3"];
      mids.forEach((id, i) => {
        nodes[id] = {
          id,
          role: "metric-card",
          type: "box",
          style: {
            ...baseStyle(theme, 14),
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            width: "30%",
            height: "72px",
            marginTop: theme.gap,
          },
        };
        void i;
      });
      nodes[metrics] = {
        id: metrics,
        role: "metrics-row",
        type: "container",
        children: mids,
        style: { ...baseStyle(theme, 0), backgroundColor: theme.background },
      };
      sectionIds.push(metrics);
    }
    sections.slice(0, 4).forEach((label, i) => {
      const sid = `section-${i + 1}`;
      const tid = `${sid}-title`;
      const bid = `${sid}-body`;
      nodes[sid] = {
        id: sid,
        role: `section-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20) || i + 1}`,
        type: "container",
        children: [tid, bid],
        style: {
          ...baseStyle(theme, theme.pad),
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          marginTop: theme.gap,
        },
      };
      addText(nodes, tid, "section-title", label, theme, { backgroundColor: theme.surface });
      addText(
        nodes,
        bid,
        "section-body",
        i === 0
          ? `Key content for ${title}`
          : secondary
            ? `${secondary} and related details`
            : `Supporting content for ${label.toLowerCase()}`,
        theme,
        { color: theme.muted, backgroundColor: theme.surface },
      );
      sectionIds.push(sid);
    });
  }

  // Mobile / tabs hint
  if (state.device === "mobile" || state.navigation_type === "tabs") {
    const nav = "bottom-nav";
    const tabs = (state.file_routes.length
      ? state.file_routes
      : ["/", "/learn", "/practice", "/progress"]
    )
      .slice(0, 4)
      .map((r, i) => {
        const id = `nav-tab-${i + 1}`;
        const label = cleanHumanTitle(r.replace(/^\//, "") || "Home", "Home");
        addText(nodes, id, "nav-tab", label, theme, {
          backgroundColor: theme.surface,
          color: i === 0 ? theme.primary : theme.muted,
          paddingBottom: 0,
          paddingTop: 4,
        });
        return id;
      });
    nodes[nav] = {
      id: nav,
      role: "bottom-nav",
      type: "container",
      children: tabs,
      style: {
        ...baseStyle(theme, 10),
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        marginTop: theme.gap + 4,
      },
    };
    sectionIds.push(nav);
  }

  nodes[root].children = [header, ...sectionIds];
  return {
    pages: {
      [title]: { rootId: root, nodes },
    },
  };
}

export type EditorModelQuality = {
  gate: "pass" | "repair" | "weak";
  issues: string[];
};

/** Fail weak skeletons: description titles, route subtitles, single generic CTA, no structure. */
export function validateEditorModelQuality(
  model: { pages?: Record<string, { nodes?: Record<string, Node> }> } | null | undefined,
  state: UiGenContextState,
): EditorModelQuality {
  const issues: string[] = [];
  if (!model?.pages) return { gate: "weak", issues: ["No editor model pages"] };
  const page = Object.values(model.pages)[0];
  const nodes = Object.values(page?.nodes || {});
  if (!nodes.length) return { gate: "weak", issues: ["Empty node tree"] };

  const texts = nodes.filter((n) => n.type === "text").map((n) => (n.text || "").trim());
  const buttons = nodes.filter((n) => n.type === "button");
  const containers = nodes.filter((n) => n.type === "container" || n.type === "box");
  const title = texts[0] || "";
  const subtitle = texts[1] || "";

  if (!title || title.length > 42) issues.push("Title missing or too long (description dump)");
  if (/\//.test(title) || /generated page/i.test(title)) issues.push("Title looks like metadata/route");
  if (/\//.test(subtitle) || /generated page/i.test(subtitle) || subtitle.length > 72) {
    issues.push("Subtitle looks like route/metadata dump");
  }
  if (buttons.length < 1) issues.push("Missing primary CTA");
  if (
    buttons.length === 1 &&
    /^get started$/i.test(buttons[0].text || "") &&
    (state.file_button_labels.length > 0 || state.primary_actions.length > 0)
  ) {
    issues.push("Generic Get started used despite real labels available");
  }
  if (containers.length < 3) issues.push("Insufficient screen structure (need content sections)");
  if (nodes.length < 8) issues.push("Skeleton node count too low");

  const themeBlob = `${state.palette}\n${state.color_direction}\n${state.style_constraints}`;
  const hexes = [...themeBlob.matchAll(/#[0-9a-fA-F]{3,8}\b/g)];
  if (hexes.length >= 2) {
    const used = new Set<string>();
    for (const n of nodes) {
      const bg = String(n.style?.backgroundColor || "").toLowerCase();
      const fg = String(n.style?.color || "").toLowerCase();
      if (bg.startsWith("#")) used.add(bg);
      if (fg.startsWith("#")) used.add(fg);
    }
    const onlyBw =
      [...used].every((c) => ["#ffffff", "#000000", "#171717", "#fafaf9", "#f7f5f2"].includes(c)) &&
      used.size > 0;
    // Soft signal: if §5 had multiple hexes and we stayed pure B/W, flag repair
    if (onlyBw && hexes.length >= 2) issues.push("§5 palette present but preview stayed generic B/W");
  }

  if (issues.length === 0) return { gate: "pass", issues };
  if (issues.length <= 2) return { gate: "repair", issues };
  return { gate: "weak", issues };
}
