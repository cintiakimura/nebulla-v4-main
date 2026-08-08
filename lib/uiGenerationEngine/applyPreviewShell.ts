/**
 * Apply UI Generation v2 output into workspace App Preview (index.html).
 * Only call when quality gate is pass or repair — never on weak.
 *
 * Renders template-aware structure (top bar, hero, metrics/list/auth, bottom tabs)
 * so App Preview matches Studio richness — not a bare hero+cards skeleton.
 */

import fs from "fs";
import path from "path";
import type { DesignTokens, SlotMap } from "./v2/types";

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Ready / Preview overwrite only on hard pass.
 * Repair must re-validate to pass before shipping pixels (Stitch-minimum).
 */
export function shouldApplyUiToPreview(gate: string | undefined | null): boolean {
  return gate === "pass";
}

export type PreviewClassificationHint = {
  device?: string;
  page_type?: string;
  navigation_mode?: string;
  product_function?: string;
  industry?: string;
};

type ContentItem = { title: string; meta: string };

function collectItems(slots: SlotMap, templateId: string): ContentItem[] {
  const items: ContentItem[] = [];
  const push = (title?: string, meta?: string) => {
    if (!title?.trim()) return;
    items.push({ title: title.trim(), meta: (meta || "").trim() });
  };

  if (/auth/i.test(templateId)) {
    push(slots.field_1_label || "Email", slots.field_1_placeholder || "you@school.edu");
    push(slots.field_2_label || "Password", slots.field_2_placeholder || "••••••••");
    return items;
  }

  if (/settings/i.test(templateId)) {
    for (let i = 1; i <= 4; i++) {
      push(slots[`row_${i}_title`], slots[`row_${i}_meta`] || "Configure");
    }
    return items;
  }

  if (/list/i.test(templateId)) {
    for (let i = 1; i <= 4; i++) {
      push(slots[`item_${i}_title`], slots[`item_${i}_meta`]);
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      push(
        slots[`metric_${i}_title`] || slots[`card_${i}_title`] || slots[`item_${i}_title`],
        slots[`metric_${i}_value`] || slots[`card_${i}_value`] || slots[`item_${i}_meta`],
      );
    }
  }

  if (items.length === 0 && !/auth/i.test(templateId)) {
    items.push(
      { title: "Today’s lesson", meta: "Short practice for this session" },
      { title: "Practice round", meta: "Build streak with quick reps" },
      { title: "Progress", meta: "See what improved this week" },
    );
  }
  return items.slice(0, 4);
}

function isMobileTemplate(templateId: string, classification?: PreviewClassificationHint): boolean {
  if (classification?.device === "mobile") return true;
  if (classification?.navigation_mode === "bottom_tabs") return true;
  return /^mobile_/i.test(templateId);
}

function wantsBottomTabs(templateId: string, classification?: PreviewClassificationHint): boolean {
  if (classification?.navigation_mode === "bottom_tabs") return true;
  if (/auth|landing|checkout/i.test(templateId)) return false;
  return /^mobile_/i.test(templateId);
}

function tabLabels(slots: SlotMap, classification?: PreviewClassificationHint): string[] {
  const home = slots.nav_title || "Home";
  const fn = (classification?.product_function || "").toLowerCase();
  const industry = (classification?.industry || "").toLowerCase();
  if (fn === "course" || industry === "education") {
    return [home, "Learn", "Practice", "Me"];
  }
  if (fn === "tasks") return [home, "Tasks", "Focus", "Me"];
  return [home, "Explore", "Activity", "Me"];
}

export type PreviewScreenInput = {
  pageKey: string;
  templateId: string;
  slots: SlotMap;
  classification?: PreviewClassificationHint;
};

function buildScreenMarkup(input: {
  projectName: string;
  templateId: string;
  tokens: DesignTokens;
  slots: SlotMap;
  patternMode?: "seed" | "figma";
  classification?: PreviewClassificationHint;
  pageKey: string;
  active: boolean;
}): string {
  const { tokens, slots, templateId } = input;
  const title = esc(slots.hero_title || slots.nav_title || input.projectName || "App");
  const navTitle = esc(slots.nav_title || slots.hero_title || input.pageKey || "Home");
  const sub = esc(slots.hero_subtitle || "");
  const cta = esc(slots.primary_cta || "Continue");
  const cta2 = esc(slots.secondary_cta || "");
  const patternNote =
    input.patternMode === "figma"
      ? "Layout from offline / Figma library structure."
      : "Built-in seed patterns (library miss).";
  const items = collectItems(slots, templateId);
  const mobile = isMobileTemplate(templateId, input.classification);
  const tabs = wantsBottomTabs(templateId, input.classification);
  const auth = /auth/i.test(templateId);
  const dashboard = /dashboard|metrics|home_hero/i.test(templateId);
  const courseLike =
    input.classification?.product_function === "course" ||
    input.classification?.industry === "education" ||
    /course|lesson|practice|learn/i.test(`${slots.hero_title} ${slots.hero_subtitle} ${templateId}`);
  const libraryHit = input.patternMode === "figma";

  const metricRow =
    dashboard || courseLike || libraryHit
      ? items
          .slice(0, 3)
          .map(
            (it, i) => `
      <div class="metric">
        <p class="metric-value">${esc(it.meta || (i === 0 ? "3" : i === 1 ? "12" : "85%"))}</p>
        <p class="metric-label">${esc(it.title)}</p>
      </div>`,
          )
          .join("\n")
      : "";

  const authFieldsHtml = auth
    ? `
      <section class="list" aria-label="Sign in form">
        <article class="card">
          <div class="card-body">
            <h2>${esc(slots.field_1_label || "Email")}</h2>
            <p>${esc(slots.field_1_placeholder || "you@example.com")}</p>
          </div>
        </article>
        <article class="card">
          <div class="card-body">
            <h2>${esc(slots.field_2_label || "Password")}</h2>
            <p>${esc(slots.field_2_placeholder || "••••••••")}</p>
          </div>
        </article>
      </section>`
    : "";

  const listHtml = auth
    ? ""
    : items
        .map(
          (it, i) => `
    <article class="card${i === 0 ? " card--accent" : ""}">
      <div class="card-body">
        <h2>${esc(it.title)}</h2>
        ${it.meta ? `<p>${esc(it.meta)}</p>` : ""}
      </div>
      <span class="chev" aria-hidden>›</span>
    </article>`,
        )
        .join("\n");

  const tabHtml = tabs
    ? tabLabels(slots, input.classification)
        .map(
          (label, i) =>
            `<button type="button" class="tab${i === 0 ? " tab--active" : ""}">${esc(label)}</button>`,
        )
        .join("\n")
    : "";

  const progressHtml =
    courseLike && !auth
      ? `<section class="progress" aria-label="Progress">
      <div class="progress-head">
        <span>Weekly streak</span>
        <strong>4 days</strong>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:62%"></div></div>
    </section>`
      : "";

  const shellClass = [
    "shell",
    "screen",
    mobile ? "shell--phone" : "shell--web",
    tabs ? "shell--tabs" : "",
    auth ? "shell--auth" : "",
    input.active ? "screen--active" : "screen--hidden",
  ]
    .filter(Boolean)
    .join(" ");

  return `<div class="${shellClass}" data-screen="${esc(input.pageKey)}" data-template="${esc(templateId)}" ${input.active ? "" : 'hidden'}>
    <header class="topbar">
      <h1>${navTitle}</h1>
      <span class="badge">${esc(mobile ? "Mobile" : "Web")}</span>
    </header>
    <main class="scroll" style="padding-bottom:${tabs ? "76px" : "var(--pad)"}">
      <section class="hero">
        <h2>${title}</h2>
        ${sub ? `<p class="sub">${sub}</p>` : ""}
        <div class="actions">
          <button type="button" class="btn">${cta}</button>
          ${cta2 ? `<button type="button" class="btn secondary">${cta2}</button>` : ""}
        </div>
      </section>
      ${progressHtml}
      ${metricRow ? `<section class="metrics" aria-label="Highlights">${metricRow}</section>` : ""}
      ${auth ? authFieldsHtml : ""}
      <p class="section-label">${auth ? "Account" : courseLike ? "Up next" : "Overview"}</p>
      ${listHtml ? `<section class="list">${listHtml}</section>` : ""}
      <p class="meta">${esc(patternNote)}</p>
    </main>
    ${tabs ? `<nav class="tabs" aria-label="Primary">${tabHtml}</nav>` : ""}
  </div>`;
}

/**
 * Build self-contained preview HTML from template + slots + tokens.
 * Exported for tests. Supports up to 3 plan screens with a switcher.
 */
export function buildUiGenerationPreviewHtml(options: {
  projectName: string;
  templateId: string;
  tokens: DesignTokens;
  slots: SlotMap;
  patternMode?: "seed" | "figma";
  classification?: PreviewClassificationHint;
  screens?: PreviewScreenInput[];
}): string {
  const { tokens } = options;
  const screens: PreviewScreenInput[] =
    options.screens && options.screens.length > 0
      ? options.screens
      : [
          {
            pageKey: options.slots.hero_title || options.slots.nav_title || "Home",
            templateId: options.templateId,
            slots: options.slots,
            classification: options.classification,
          },
        ];

  const screenMarkup = screens
    .map((s, i) =>
      buildScreenMarkup({
        projectName: options.projectName,
        templateId: s.templateId,
        tokens,
        slots: s.slots,
        patternMode: options.patternMode,
        classification: s.classification || options.classification,
        pageKey: s.pageKey,
        active: i === 0,
      }),
    )
    .join("\n");

  const switcher =
    screens.length > 1
      ? `<div class="screen-switcher" role="tablist" aria-label="Screens">
      ${screens
        .map(
          (s, i) =>
            `<button type="button" class="screen-btn${i === 0 ? " screen-btn--active" : ""}" data-go="${esc(s.pageKey)}" role="tab" aria-selected="${i === 0 ? "true" : "false"}">${esc(s.pageKey)}</button>`,
        )
        .join("\n")}
    </div>`
      : "";

  const docTitle = esc(screens[0]?.pageKey || options.projectName || "App");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${docTitle} — Preview</title>
  <style>
    :root {
      --bg: ${tokens.bg};
      --surface: ${tokens.surface};
      --primary: ${tokens.primary};
      --text: ${tokens.text};
      --muted: ${tokens.mutedText};
      --border: ${tokens.border};
      --radius: ${Math.max(4, tokens.radius)}px;
      --gap: ${Math.max(8, tokens.gap)}px;
      --pad: ${Math.max(12, tokens.pad)}px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      background: #0a0a0a;
      color: var(--text);
      display: flex; flex-direction: column; align-items: center;
      padding: 12px; gap: 10px;
    }
    .screen-switcher {
      display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;
      max-width: 420px; width: 100%;
    }
    .screen-btn {
      border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
      background: color-mix(in srgb, var(--primary) 12%, transparent);
      color: #fff; border-radius: 8px; padding: .4rem .75rem;
      font-size: .75rem; cursor: pointer;
    }
    .screen-btn--active {
      background: color-mix(in srgb, var(--primary) 28%, transparent);
      border-color: color-mix(in srgb, var(--primary) 55%, transparent);
    }
    .stage { width: 100%; display: flex; justify-content: center; }
    .shell {
      width: 100%;
      background: var(--bg); color: var(--text);
      display: flex; flex-direction: column;
      border: 1px solid color-mix(in srgb, var(--border) 80%, #fff 10%);
      border-radius: calc(var(--radius) + 4px);
      overflow: hidden;
      min-height: min(720px, 100vh - 64px);
      position: relative;
    }
    .shell--phone { max-width: 390px; }
    .shell--web { max-width: 920px; }
    .screen--hidden { display: none !important; }
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px var(--pad);
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      gap: 8px;
    }
    .topbar h1 { margin: 0; font-size: 1rem; font-weight: 600; letter-spacing: -0.02em; }
    .topbar .badge {
      font-size: .65rem; color: var(--muted);
      border: 1px solid var(--border); border-radius: 999px; padding: .2rem .55rem;
    }
    .scroll {
      flex: 1; overflow: auto;
      padding: var(--pad);
      display: flex; flex-direction: column; gap: var(--gap);
    }
    .hero {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: calc(var(--pad) * 1.15);
    }
    .hero h2 { margin: 0 0 .4rem; font-size: 1.4rem; letter-spacing: -0.02em; font-weight: 650; }
    .hero .sub { margin: 0; color: var(--muted); line-height: 1.45; font-size: .92rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .55rem; margin-top: 1rem; }
    .btn {
      border: none; cursor: pointer; font-weight: 600; font-size: .88rem;
      padding: .6rem 1.05rem; border-radius: var(--radius);
      background: var(--primary); color: #fff;
    }
    .btn.secondary {
      background: transparent; color: var(--text);
      border: 1px solid var(--border);
    }
    .metrics {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: calc(var(--gap) * .75);
    }
    .metric {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: .75rem .65rem; text-align: center;
    }
    .metric-value { margin: 0; font-size: 1.15rem; font-weight: 700; color: var(--primary); }
    .metric-label { margin: .25rem 0 0; font-size: .68rem; color: var(--muted); line-height: 1.25; }
    .progress {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: .85rem var(--pad);
    }
    .progress-head {
      display: flex; justify-content: space-between; align-items: baseline;
      font-size: .78rem; color: var(--muted); margin-bottom: .45rem;
    }
    .progress-head strong { color: var(--text); font-size: .85rem; }
    .progress-track {
      height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--border) 70%, var(--bg));
      overflow: hidden;
    }
    .progress-fill { height: 100%; border-radius: inherit; background: var(--primary); }
    .section-label {
      margin: .25rem 0 0; font-size: .72rem; font-weight: 600;
      letter-spacing: .04em; text-transform: uppercase; color: var(--muted);
    }
    .list { display: flex; flex-direction: column; gap: calc(var(--gap) * .65); }
    .card {
      display: flex; align-items: center; gap: .75rem;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: .9rem var(--pad);
    }
    .card--accent { border-color: color-mix(in srgb, var(--primary) 45%, var(--border)); }
    .card-body { flex: 1; min-width: 0; }
    .card h2 { margin: 0 0 .25rem; font-size: .95rem; font-weight: 600; }
    .card p { margin: 0; color: var(--muted); font-size: .8rem; line-height: 1.35; }
    .chev { color: var(--muted); font-size: 1.2rem; line-height: 1; }
    .meta { font-size: .68rem; color: var(--muted); opacity: .85; margin: 0; }
    .tabs {
      position: absolute; left: 0; right: 0; bottom: 0;
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 2px; padding: 8px 6px calc(8px + env(safe-area-inset-bottom, 0px));
      background: var(--surface); border-top: 1px solid var(--border);
    }
    .tab {
      border: none; background: transparent; color: var(--muted);
      font-size: .68rem; padding: .45rem .2rem; border-radius: 8px; cursor: pointer;
    }
    .tab--active { color: var(--primary); font-weight: 650; background: color-mix(in srgb, var(--primary) 12%, transparent); }
    .shell--auth .scroll { justify-content: center; }
  </style>
</head>
<body>
  ${switcher}
  <div class="stage">${screenMarkup}</div>
  <script>
    (function () {
      var buttons = document.querySelectorAll('.screen-btn');
      var screens = document.querySelectorAll('[data-screen]');
      function show(key) {
        screens.forEach(function (el) {
          var on = el.getAttribute('data-screen') === key;
          el.hidden = !on;
          el.classList.toggle('screen--active', on);
          el.classList.toggle('screen--hidden', !on);
        });
        buttons.forEach(function (btn) {
          var on = btn.getAttribute('data-go') === key;
          btn.classList.toggle('screen-btn--active', on);
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      }
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          show(btn.getAttribute('data-go') || '');
        });
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Writes a self-contained preview HTML matching Beta slots/tokens.
 * Returns relative paths written.
 */
export function applyUiGenerationToPreviewShell(options: {
  workspaceRoot: string;
  projectName: string;
  templateId: string;
  tokens: DesignTokens;
  slots: SlotMap;
  patternMode?: "seed" | "figma";
  classification?: PreviewClassificationHint;
  screens?: PreviewScreenInput[];
}): string[] {
  const { workspaceRoot } = options;
  const html = buildUiGenerationPreviewHtml(options);

  const written: string[] = [];
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const idx = path.join(workspaceRoot, "index.html");
  fs.writeFileSync(idx, html, "utf8");
  written.push("index.html");

  const pub = path.join(workspaceRoot, "public");
  fs.mkdirSync(pub, { recursive: true });
  const copy = path.join(pub, "nebula-ui-gen-preview.html");
  fs.writeFileSync(copy, html, "utf8");
  written.push("public/nebula-ui-gen-preview.html");

  return written;
}
