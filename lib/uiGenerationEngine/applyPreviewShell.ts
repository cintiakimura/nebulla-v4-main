/**
 * Apply UI Generation v2 output into workspace App Preview (index.html).
 * Only call when quality gate is pass or repair — never on weak.
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

export function shouldApplyUiToPreview(gate: string | undefined | null): boolean {
  return gate === "pass" || gate === "repair";
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
}): string[] {
  const { workspaceRoot, tokens, slots, templateId } = options;
  const title = esc(slots.hero_title || slots.nav_title || options.projectName || "App");
  const sub = esc(slots.hero_subtitle || "");
  const cta = esc(slots.primary_cta || "Continue");
  const cta2 = esc(slots.secondary_cta || "");
  const patternNote =
    options.patternMode === "figma"
      ? "Layout references Figma structure hints where available."
      : "Using Nebulla built-in layout patterns (Figma optional).";

  const items: { title: string; meta: string }[] = [];
  for (let i = 1; i <= 4; i++) {
    const t =
      slots[`item_${i}_title`] ||
      slots[`card_${i}_title`] ||
      slots[`row_${i}_title`] ||
      slots[`metric_${i}_title`] ||
      slots[`section_${i}_title`];
    if (!t) continue;
    const meta =
      slots[`item_${i}_meta`] ||
      slots[`card_${i}_value`] ||
      slots[`row_${i}_meta`] ||
      slots[`metric_${i}_value`] ||
      slots[`section_${i}_body`] ||
      "";
    items.push({ title: esc(t), meta: esc(meta) });
  }
  // Seed / rate-limit path: never leave App Preview as a single hero wash (cyan Login shell).
  if (items.length === 0 && !/auth/i.test(templateId)) {
    const fallbacks = [
      { title: "Today’s lesson", meta: "Short practice for this session" },
      { title: "Practice round", meta: "Build streak with quick reps" },
      { title: "Progress", meta: "See what improved this week" },
    ];
    for (const f of fallbacks) items.push({ title: esc(f.title), meta: esc(f.meta) });
  }

  const itemHtml = items
    .map(
      (it) => `
    <article class="card">
      <h2>${it.title}</h2>
      ${it.meta ? `<p>${it.meta}</p>` : ""}
    </article>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} — Preview</title>
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
      background: var(--bg); color: var(--text);
    }
    .shell { max-width: 720px; margin: 0 auto; padding: var(--pad); display: flex; flex-direction: column; gap: var(--gap); }
    .hero {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: calc(var(--pad) * 1.1);
    }
    .hero h1 { margin: 0 0 .4rem; font-size: 1.45rem; letter-spacing: -0.02em; }
    .hero .sub { margin: 0; color: var(--muted); line-height: 1.45; font-size: .95rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1rem; }
    .btn {
      border: none; cursor: pointer; font-weight: 600; font-size: .9rem;
      padding: .55rem 1rem; border-radius: var(--radius);
      background: var(--primary); color: #fff;
    }
    .btn.secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .grid { display: grid; gap: var(--gap); }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: var(--pad);
    }
    .card h2 { margin: 0 0 .35rem; font-size: 1rem; }
    .card p { margin: 0; color: var(--muted); font-size: .85rem; line-height: 1.4; }
    .meta { font-size: .7rem; color: var(--muted); opacity: .85; margin-top: .5rem; }
  </style>
</head>
<body>
  <div class="shell" data-template="${esc(templateId)}">
    <header class="hero">
      <h1>${title}</h1>
      ${sub ? `<p class="sub">${sub}</p>` : ""}
      <div class="actions">
        <button type="button" class="btn">${cta}</button>
        ${cta2 ? `<button type="button" class="btn secondary">${cta2}</button>` : ""}
      </div>
      <p class="meta">${esc(patternNote)}</p>
    </header>
    <section class="grid">${itemHtml}</section>
  </div>
</body>
</html>`;

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
