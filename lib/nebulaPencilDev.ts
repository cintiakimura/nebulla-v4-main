/**
 * Nebulla ↔ Pencil.dev mockups API — bundled in the app (no separate CLI install for users).
 * Production: set PENCIL_API_KEY (from pencil.dev). Optional: PENCIL_API_URL override.
 */

import fs from "node:fs";
import path from "node:path";
import { getNebullaProductLayoutRoot } from "./nebulaWorkspaceRoot";

export const DEFAULT_PENCIL_MOCKUPS_URL = "https://api.pencil.dev/v1/mockups/generate";

export function resolvePencilApiKey(): string | undefined {
  for (const envName of ["PENCIL_API_KEY", "PENCIL_DEV_API_KEY", "PENCIL_CLI_KEY"] as const) {
    const t = process.env[envName]?.trim();
    if (t) return t;
  }
  return undefined;
}

export function resolvePencilMockupsUrl(): string {
  const raw = (process.env.PENCIL_API_URL?.trim() || DEFAULT_PENCIL_MOCKUPS_URL).replace(/\/$/, "");
  return normalizePencilEndpoint(raw);
}

function normalizePencilEndpoint(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === "pencil.dev" || u.hostname === "www.pencil.dev") {
      u.hostname = "api.pencil.dev";
    }

    if (!u.pathname || u.pathname === "/") {
      u.pathname = "/v1/mockups/generate";
    } else if (u.pathname === "/v1/mockups") {
      u.pathname = "/v1/mockups/generate";
    } else if (u.pathname === "/mockups" || u.pathname === "/mockups/generate") {
      u.pathname = `/v1${u.pathname}`;
    }

    return u.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_PENCIL_MOCKUPS_URL;
  }
}

/** Explicit demo: bundled SVG when no API key (staging / operator choice). */
export function isNebulaUiStudioDemoEnv(): boolean {
  const v = process.env.NEBULA_UI_STUDIO_DEMO?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Non-production: allow bundled demo mockups without any env flag when no key (local dev UX). */
export function useBundledDemoMockupWithoutKey(): boolean {
  if (resolvePencilApiKey()) return false;
  if (isNebulaUiStudioDemoEnv()) return true;
  return process.env.NODE_ENV !== "production";
}

export function loadBundledDemoMockupSvg(cwd: string = process.cwd()): string {
  const productRoot = getNebullaProductLayoutRoot(cwd);
  const file = path.join(productRoot, "templates", "nebula-ui-studio-demo-mockup.svg");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"><rect fill="#0e273d" width="720" height="480"/><text x="50%" y="45%" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="16" text-anchor="middle">Nebulla UI Studio — demo mockup</text><text x="50%" y="55%" fill="#64748b" font-family="system-ui,sans-serif" font-size="12" text-anchor="middle">Add PENCIL_API_KEY for live Pencil.dev output</text></svg>`;
  }
}

export function buildNebulaUiStudioPromptBody(params: {
  storedPrompt: string;
  skillExcerpt: string;
  pagesText: string;
  branding: unknown;
}): Record<string, unknown> {
  const { storedPrompt, skillExcerpt, pagesText, branding } = params;
  const brandingPrompt =
    branding && typeof branding === "object"
      ? (() => {
          const b = branding as Record<string, unknown>;
          return `
Branding Context:
- App Name: ${b.appName ?? ""}
- Primary Color: ${b.primaryColor ?? ""}
- Secondary Color: ${b.secondaryColor ?? ""}
- Style: ${b.style ?? ""}
`;
        })()
      : "";

  const designSystemBlock = skillExcerpt
    ? `
Design system (Nebula SKILL.md — Pencil CLI / visual design conventions; follow for layout, hierarchy, export discipline):
${skillExcerpt}
`
    : "";

  const prompt = `${storedPrompt && storedPrompt !== "No prompt generated yet." ? storedPrompt : `Generate a high-fidelity mobile/web app SVG UI from the product plan.`}
${designSystemBlock}
Master Plan — Pages and Navigation (must cover every listed screen):
${pagesText || "No pages defined yet."}
${brandingPrompt}

Requirements:
1. Return valid SVG only (UI codebook-style single canvas or multi-section SVG representing all pages from Pages and Navigation).
2. No markdown fences.
3. Apply SKILL.md design-system discipline above together with brand colors and style.
4. Ensure readable text and realistic spacing.
5. Include modern production-ready component structure.`;

  return { prompt, branding };
}

function extractSvgFromPencilJson(data: unknown): string {
  const d = data as Record<string, unknown>;
  let svg =
    (typeof d.svg === "string" && d.svg) ||
    (typeof (d.output as Record<string, unknown>)?.svg === "string" && (d.output as Record<string, unknown>).svg) ||
    (typeof (d.result as Record<string, unknown>)?.svg === "string" && (d.result as Record<string, unknown>).svg) ||
    "";
  if (!svg && Array.isArray(d.choices)) {
    const msg = (d.choices as { message?: { content?: string } }[])[0]?.message?.content;
    if (typeof msg === "string") svg = msg;
  }
  return String(svg || "");
}

export function normalizeSvgResponse(svgCode: string): string {
  let s = svgCode
    .replace(/```xml/g, "")
    .replace(/```svg/g, "")
    .replace(/```/g, "")
    .trim();
  const m = s.match(/<svg[\s\S]*?<\/svg>/i);
  if (m) s = m[0];
  return s;
}

export type PencilMockupResult =
  | { ok: true; svg: string; raw: unknown; demoMode?: boolean }
  | { ok: false; status: number; error: string };

export async function callPencilMockupsGenerate(params: {
  apiKey: string;
  apiUrl?: string;
  body: Record<string, unknown>;
}): Promise<PencilMockupResult> {
  const requestedUrl = normalizePencilEndpoint(params.apiUrl || resolvePencilMockupsUrl());
  const fallbackUrl = DEFAULT_PENCIL_MOCKUPS_URL;
  const candidateUrls = requestedUrl === fallbackUrl ? [requestedUrl] : [requestedUrl, fallbackUrl];
  let lastError: PencilMockupResult | null = null;

  for (const url of candidateUrls) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(params.body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errorMessage = `Nebula UI Studio Engine Error: ${response.status}`;
      try {
        const parsedErr = JSON.parse(errBody) as { error?: { message?: string } };
        if (parsedErr.error?.message) errorMessage += ` - ${parsedErr.error.message}`;
      } catch {
        if (/<html|<!doctype html/i.test(errBody)) {
          errorMessage += ` - Non-API HTML response from ${url}. Verify PENCIL_API_URL points to api.pencil.dev/v1/mockups/generate.`;
        } else {
          errorMessage += ` - ${errBody.substring(0, 200)}`;
        }
      }
      lastError = { ok: false, status: response.status, error: errorMessage };
      continue;
    }

    const data = (await response.json()) as unknown;
    let svg = normalizeSvgResponse(extractSvgFromPencilJson(data));
    if (!svg || !/<svg/i.test(svg)) {
      lastError = {
        ok: false,
        status: 502,
        error: "Nebula UI Studio: response had no valid SVG. Check PENCIL_API_KEY and API response shape.",
      };
      continue;
    }
    return { ok: true, svg, raw: data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastError = { ok: false, status: 500, error: msg };
    continue;
  }
  }

  const fallbackMsg = lastError?.ok === false ? lastError.error : "";
  // Hard fail-safe: if Pencil endpoint keeps returning HTML/404, keep UI flow usable.
  if (
    /non-api html response|<html|<!doctype html|engine error: 404/i.test(fallbackMsg)
  ) {
    return {
      ok: true,
      demoMode: true,
      svg: loadBundledDemoMockupSvg(),
      raw: {
        warning:
          "Live Pencil endpoint returned HTML/404. Served bundled demo SVG instead.",
        originalError: fallbackMsg,
      },
    };
  }

  return (
    lastError || {
      ok: false,
      status: 500,
      error: "Nebula UI Studio: unknown error while calling Pencil endpoint.",
    }
  );
}
