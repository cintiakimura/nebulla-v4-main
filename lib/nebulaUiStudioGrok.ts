/**
 * Grok 4–based Nebula UI Studio SVG generation (full UI from prompt).
 */

const XAI_CHAT = "https://api.x.ai/v1/chat/completions";

export function getGrokUiStudioModel(): string {
  return process.env.GROK_UI_STUDIO_MODEL?.trim() || "grok-4-1-fast-reasoning";
}

export function normalizeExtractedSvg(raw: string): string {
  let s = String(raw || "")
    .replace(/```xml/gi, "")
    .replace(/```svg/gi, "")
    .replace(/```/g, "")
    .trim();
  const m = s.match(/<svg[\s\S]*?<\/svg>/i);
  if (m) return m[0];
  return s;
}

export async function callGrokGenerateUiSvg(params: {
  apiKey: string;
  fullPromptText: string;
  variationIndex: number;
}): Promise<{ svg: string; rawText: string }> {
  const hints = [
    "Visual variation A: balanced information hierarchy and standard dashboard rhythm.",
    "Visual variation B: airy spacing, prominent hero / focal region, lighter density.",
    "Visual variation C: compact, information-dense panels with strong grid alignment.",
  ];
  const hint = hints[params.variationIndex % hints.length] ?? hints[0];
  const userMsg = `${params.fullPromptText}\n\n${hint}\nRespond with exactly one root <svg>...</svg> document only. No markdown, no commentary.`;

  const res = await fetch(XAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: getGrokUiStudioModel(),
      messages: [
        {
          role: "system",
          content: `You are Nebulla UI Studio. You generate production-oriented interface mockups as a single SVG document.

Rules:
- Output ONLY one valid SVG root element from opening <svg to closing </svg>.
- Include xmlns="http://www.w3.org/2000/svg" on the root.
- Encode all screen content from the product brief; use readable system-ui fonts and sufficient contrast.
- Do not output markdown fences, prose, or XML declarations outside the SVG.
- Prefer vector shapes, text, and groups; avoid foreignObject unless necessary.`,
        },
        { role: "user", content: userMsg },
      ],
      temperature: 0.62 + (params.variationIndex % 3) * 0.1,
      max_tokens: 24000,
    }),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err =
      typeof data.error === "object" && data.error !== null && "message" in data.error
        ? String((data.error as { message?: string }).message)
        : JSON.stringify(data);
    throw new Error(err || `Grok UI Studio HTTP ${res.status}`);
  }

  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const rawText = choices?.[0]?.message?.content ?? "";
  const svg = normalizeExtractedSvg(rawText);
  if (!svg || !/<svg/i.test(svg)) {
    throw new Error("Grok did not return a parseable SVG document.");
  }
  return { svg, rawText };
}

/** Fast client/server checks when Grok analysis is unavailable. */
export function heuristicSvgEditRisks(originalCode: string, editedCode: string): string[] {
  const w: string[] = [];
  const o = originalCode || "";
  const e = editedCode || "";

  if (!e.trim()) {
    w.push("The SVG is empty — the preview and export will break.");
    return w;
  }
  if (!/<svg[\s\S]*<\/svg>/i.test(e)) {
    w.push("Missing a single root <svg>…</svg> document — renderers may fail.");
  }
  if (/<script[\s>]/i.test(e)) {
    w.push("SVG contains a <script> block — remove scripts for static UI exports.");
  }
  if (/\son\w+\s*=/i.test(e)) {
    w.push("Inline event handlers (onclick, etc.) appear — usually invalid or unsafe in static SVG.");
  }
  if (e.length < Math.min(80, o.length * 0.2) && o.length > 200) {
    w.push("The edit is much shorter than the original — content may have been deleted unintentionally.");
  }
  const openG = (e.match(/<g\b/gi) || []).length;
  const closeG = (e.match(/<\/g>/gi) || []).length;
  if (openG > 0 && openG !== closeG) {
    w.push("Possible unbalanced <g> tags — structure may be malformed.");
  }
  const openTspan = (e.match(/<tspan\b/gi) || []).length;
  const closeTspan = (e.match(/<\/tspan>/gi) || []).length;
  if (openTspan !== closeTspan) {
    w.push("Possible unbalanced <tspan> elements — text may not render correctly.");
  }
  return w;
}

export async function callGrokAnalyzeSvgEdit(params: {
  apiKey: string;
  originalCode: string;
  editedCode: string;
}): Promise<{ warnings: string[]; summary: string }> {
  const truncated = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}\n…[truncated]`);

  const res = await fetch(XAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: getGrokUiStudioModel(),
      messages: [
        {
          role: "system",
          content: `You review SVG edits for a UI mockup pipeline. Reply with compact JSON only:
{"warnings":["short bullet risks"],"riskLevel":"low"|"medium"|"high","summary":"one sentence"}
Focus on: broken XML, missing pages vs master plan intent, style clashes, removed critical UI, accessibility/contrast regressions.`,
        },
        {
          role: "user",
          content: `ORIGINAL (truncated):\n${truncated(params.originalCode, 12000)}\n\nEDITED (truncated):\n${truncated(params.editedCode, 12000)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error("Grok analysis failed");
  }
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const text = choices?.[0]?.message?.content?.trim() ?? "";
  let warnings: string[] = [];
  let summary = "";
  try {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    const slice = jsonStart >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
    const parsed = JSON.parse(slice) as { warnings?: unknown; summary?: unknown };
    if (Array.isArray(parsed.warnings)) {
      warnings = parsed.warnings.map((x) => String(x)).filter(Boolean);
    }
    if (typeof parsed.summary === "string") summary = parsed.summary;
  } catch {
    summary = text.slice(0, 400);
    if (!warnings.length) warnings.push("Could not parse structured analysis — review the edit manually.");
  }
  return { warnings, summary };
}

export async function callGrokAdaptUserSvg(params: {
  apiKey: string;
  editedCode: string;
  warningsSummary: string;
}): Promise<{ svg: string }> {
  const userMsg = `The user edited an SVG mockup and accepted risk warnings:
${params.warningsSummary || "(none)"}

Produce one corrected SVG that preserves the user's intent and visual changes, fixes malformed structure if any, keeps a single root <svg>, and remains valid for static rendering. Output ONLY the SVG document.

USER SVG TO ADAPT:
${params.editedCode}`;

  const res = await fetch(XAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: getGrokUiStudioModel(),
      messages: [
        {
          role: "system",
          content:
            "You normalize and repair UI mockup SVGs while preserving user edits. Output only one valid <svg>...</svg>.",
        },
        { role: "user", content: userMsg },
      ],
      temperature: 0.35,
      max_tokens: 24000,
    }),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error("Adaptation request failed");
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const rawText = choices?.[0]?.message?.content ?? "";
  const svg = normalizeExtractedSvg(rawText);
  if (!svg || !/<svg/i.test(svg)) throw new Error("Adaptation did not return valid SVG");
  return { svg };
}
