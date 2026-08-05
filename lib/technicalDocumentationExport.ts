/**
 * Pure builder: Master Plan + non-secret ExportContext → Markdown technical documentation.
 * Packaging only — does not invent architecture beyond plan/context.
 */

import {
  MASTER_PLAN_SECTION_KEYS,
  normalizeMasterPlanRecord,
} from "./masterPlanSections";
import {
  assessMasterPlanCompleteness,
  type MasterPlanGap,
  type MasterPlanStrictMode,
} from "./masterPlanCompleteness";

const NOT_SPECIFIED = "Not specified";

export type TechnicalDocumentationHostingContext = {
  workspaceStorageMode?: "local" | "r2" | "dual";
  durableWorkspaceOk?: boolean;
  hasR2Storage?: boolean;
  syntheticIsolation?: boolean;
  /** Short non-secret platform notes (e.g. "shared Nebulla Render service"). */
  notes?: string[];
};

export type TechnicalDocumentationExportContext = {
  projectName?: string;
  projectKey?: string;
  generatedAt?: string;
  hosting?: TechnicalDocumentationHostingContext;
  /** Optional precomputed gaps; if omitted, assessed from plan when useful. */
  gaps?: Array<Pick<MasterPlanGap, "code" | "message" | "section">>;
  strictMode?: MasterPlanStrictMode;
};

export type TechnicalDocumentationExportResult = {
  markdown: string;
  filename: string;
  warnings?: string[];
};

const SECRET_LINE_RE =
  /(?:^|\b)(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|DATABASE_URL|CONNECTION_STRING)\s*[=:]\s*\S+/i;
const SECRET_VALUE_RE =
  /\b(?:sk-[A-Za-z0-9_\-]{8,}|xai-[A-Za-z0-9_\-]{8,}|Bearer\s+[A-Za-z0-9._\-]{12,}|postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@[^\s]+)/i;

/** Best-effort strip of secret-looking lines/tokens from plan prose. */
export function sanitizePlanProseForExport(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (SECRET_LINE_RE.test(line) || SECRET_VALUE_RE.test(line)) {
      kept.push("[redacted — possible secret]");
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

/** Safe filename slug from project name / key. */
export function slugifyProjectForFilename(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "project";
}

export function technicalDocumentationFilename(
  ctx: TechnicalDocumentationExportContext,
): string {
  const base =
    ctx.projectName?.trim() ||
    (ctx.projectKey && ctx.projectKey !== "default" ? ctx.projectKey : "") ||
    "";
  if (!base) return "technical-documentation.md";
  return `${slugifyProjectForFilename(base)}-technical-documentation.md`;
}

function sectionText(plan: Record<string, string>, key: (typeof MASTER_PLAN_SECTION_KEYS)[number]): string {
  const raw = (plan[key] || "").trim();
  if (!raw) return "";
  return sanitizePlanProseForExport(raw).trim();
}

function orNotSpecified(text: string): string {
  return text.trim() ? text.trim() : NOT_SPECIFIED;
}

function extractBulletish(text: string, max = 12): string[] {
  if (!text.trim()) return [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines
    .filter((l) => /^[-*•]\s+|^\d+[.)]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+|^\d+[.)]\s+/, "").trim())
    .filter(Boolean);
  if (bullets.length) return bullets.slice(0, max);
  // Fall back to short paragraphs / sentences
  const paras = text
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 8);
  return paras.slice(0, Math.min(max, 4));
}

function pickLinesMatching(text: string, re: RegExp, max = 8): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => re.test(l))
    .slice(0, max);
}

type PageSpec = {
  name: string;
  route?: string;
  purpose?: string;
  authz?: string;
  primaryActions?: string;
};

/** Parse §4 page blocks (`### Name \`/route\``) or thin comma/list pages. */
export function parsePagesFromSection4(section4: string): PageSpec[] {
  const text = section4.trim();
  if (!text) return [];

  const pages: PageSpec[] = [];
  const headingRe =
    /^#{2,4}\s+(.+?)(?:\s+`(\/[^`]+)`|\s+(\/[A-Za-z0-9_][\w\-./:{}\*]*))?\s*$/gm;
  let m: RegExpExecArray | null;
  const headings: { name: string; route?: string; index: number }[] = [];
  while ((m = headingRe.exec(text)) !== null) {
    const name = m[1].replace(/`/g, "").trim();
    const route = (m[2] || m[3] || "").trim() || undefined;
    headings.push({ name, route, index: m.index });
  }

  if (headings.length > 0) {
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].index;
      const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
      const body = text.slice(start, end);
      const purpose = body.match(/[-*•]?\s*Purpose:\s*(.+)/i)?.[1]?.trim();
      const authz = body.match(/[-*•]?\s*Authz:\s*(.+)/i)?.[1]?.trim();
      const primaryActions = body.match(/[-*•]?\s*Primary actions:\s*(.+)/i)?.[1]?.trim();
      pages.push({
        name: headings[i].name,
        route: headings[i].route,
        purpose,
        authz,
        primaryActions,
      });
    }
    return pages;
  }

  // Thin plan: "Home, Login, Board, Settings." or bullet list without routes
  const listMatch = text.match(/^([A-Za-z][^.\n]{2,200})\.?$/m);
  if (listMatch && /,\s*/.test(listMatch[1]) && !/\n#{2,4}\s/.test(text)) {
    return listMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  }

  const bullets = extractBulletish(text, 20);
  if (bullets.length) {
    return bullets.map((name) => {
      const routeM = name.match(/`(\/[^`]+)`|(\/[A-Za-z0-9_][\w\-./:{}\*]*)/);
      return {
        name: name.replace(/`(\/[^`]+)`/g, "").replace(/\s+\/[\w\-./:{}\*]+/, "").trim(),
        route: routeM?.[1] || routeM?.[2],
      };
    });
  }

  return [];
}

function buildOverview(goal: string): string {
  if (!goal) return NOT_SPECIFIED;
  const lines = extractBulletish(goal, 6);
  if (lines.length >= 2) {
    return lines.map((l) => `- ${l}`).join("\n");
  }
  return goal;
}

function buildSystemContext(goal: string, tech: string, hosting?: TechnicalDocumentationHostingContext): string {
  const parts: string[] = [];
  const typeLine = pickLinesMatching(tech, /project\s*type\s*:/i, 1)[0];
  if (typeLine) parts.push(`- ${typeLine}`);
  else if (/web\s*app/i.test(tech)) parts.push("- Product type: Web App (from Master Plan)");

  const deps: string[] = [];
  if (/\b(oauth|auth|login|magic[-\s]?link)\b/i.test(tech) || /\bauth\b/i.test(goal)) {
    deps.push("Authentication (as planned in Master Plan)");
  }
  if (/\b(ai|grok|llm|openai|anthropic)\b/i.test(tech)) {
    deps.push("AI provider (as named in Master Plan)");
  }
  if (/\b(postgres|d1|database|rls)\b/i.test(tech)) {
    deps.push("Application database");
  }
  if (hosting?.hasR2Storage || hosting?.workspaceStorageMode === "r2" || hosting?.workspaceStorageMode === "dual") {
    deps.push("Object storage (platform-configured)");
  } else if (/\b(s3|r2|object storage|blob)\b/i.test(tech)) {
    deps.push("Object storage (as planned)");
  }
  if (deps.length) {
    parts.push("- Main external dependencies:");
    for (const d of deps) parts.push(`  - ${d}`);
  }

  const flowBits: string[] = [];
  if (/\blogin|sign[\s-]?in|auth\b/i.test(`${goal}\n${tech}`)) flowBits.push("authenticate");
  flowBits.push("use core product flows");
  if (/\btask|project|board|crud\b/i.test(`${goal}\n${tech}`)) flowBits.push("manage primary entities");
  parts.push(`- End-to-end flow (high level): ${flowBits.join(" → ")}`);

  return parts.length ? parts.join("\n") : NOT_SPECIFIED;
}

function buildArchitecture(tech: string): string {
  if (!tech) return NOT_SPECIFIED;
  const bullets: string[] = [];
  const spa = /\b(react|spa|vite|next)\b/i.test(tech);
  const api = /\b(api|express|server|backend)\b/i.test(tech);
  if (spa && api) bullets.push("High-level pattern: SPA + API (from Master Plan stack language)");
  else if (spa) bullets.push("High-level pattern: SPA / client-heavy web app (from Master Plan)");
  else if (api) bullets.push("High-level pattern: API-backed application (from Master Plan)");

  bullets.push("Major parts:");
  bullets.push("- Frontend: as specified in Tech stack / Master Plan §2");
  bullets.push("- Backend: as specified in Master Plan §2 (if any)");
  bullets.push("- Data: database and/or files as named in Master Plan");
  bullets.push("- Storage: object/file storage only if mentioned in plan or platform context");

  const stackHints = pickLinesMatching(tech, /stack recommendation|react|postgres|tailwind/i, 4);
  for (const h of stackHints) bullets.push(`- Note: ${h.replace(/^[-*•]\s*/, "")}`);

  return bullets.join("\n");
}

function buildTechStack(tech: string, hosting?: TechnicalDocumentationHostingContext): string {
  const rows: [string, string][] = [
    ["Frontend", guessField(tech, /react|vue|svelte|next|tailwind|shadcn/i) || NOT_SPECIFIED],
    ["Backend", guessField(tech, /express|node|api|server|fastapi|django/i) || NOT_SPECIFIED],
    ["Database", guessField(tech, /postgres|d1|sqlite|mysql|mongodb|rls/i) || NOT_SPECIFIED],
    [
      "Hosting",
      hosting?.workspaceStorageMode
        ? `Platform workspace storage: ${hosting.workspaceStorageMode}${
            hosting.durableWorkspaceOk === false ? " (durability warning)" : ""
          }`
        : guessField(tech, /render|vercel|cloudflare|aws|hosting/i) || NOT_SPECIFIED,
    ],
    ["Auth", guessField(tech, /oauth|magic[-\s]?link|auth|session/i) || NOT_SPECIFIED],
    [
      "Object storage",
      hosting?.hasR2Storage || hosting?.workspaceStorageMode === "r2" || hosting?.workspaceStorageMode === "dual"
        ? "Configured on platform (R2/object storage ready)"
        : guessField(tech, /r2|s3|object storage|blob/i) || NOT_SPECIFIED,
    ],
    ["AI", guessField(tech, /grok|openai|anthropic|llm|ai\b/i) || NOT_SPECIFIED],
    ["Other", extractOtherStack(tech)],
  ];

  const lines = [
    "| Layer | Choice |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | ${escapeTableCell(v)} |`),
  ];
  return lines.join("\n");
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function guessField(tech: string, re: RegExp): string {
  const line = tech
    .split("\n")
    .map((l) => l.trim())
    .find((l) => re.test(l));
  if (line) return line.replace(/^[-*•]\s*/, "").slice(0, 220);
  const stack = tech.match(/Stack recommendation:\s*([^\n]+)/i)?.[1]?.trim();
  if (stack && re.test(stack)) return stack.slice(0, 220);
  return "";
}

function extractOtherStack(tech: string): string {
  const comps = pickLinesMatching(tech, /competitors|ui patterns|evidence/i, 2);
  if (!comps.length) return NOT_SPECIFIED;
  return comps.map((c) => c.replace(/^[-*•]\s*/, "")).join("; ").slice(0, 220);
}

function buildData(tech: string, pagesSection: string): string {
  const entities = new Set<string>();
  const entityLines = [
    ...pickLinesMatching(tech, /\b(entities?|tables?|models?)\b/i, 6),
    ...pickLinesMatching(pagesSection, /Data(?:\s+entities?)?:\s*(.+)/i, 12),
  ];
  for (const line of entityLines) {
    const after = line.match(/Data(?:\s+entities?)?:\s*(.+)/i)?.[1] || line;
    for (const part of after.split(/[,;/]/)) {
      const t = part.replace(/\[\]/g, "").trim();
      if (t && t.length < 40 && !/^data$/i.test(t)) entities.add(t);
    }
  }

  const lines: string[] = [];
  if (entities.size) {
    lines.push("- Main entities:");
    for (const e of [...entities].slice(0, 16)) lines.push(`  - ${e}`);
  } else {
    lines.push(`- Main entities: ${NOT_SPECIFIED}`);
  }

  lines.push("- Where data lives (high level):");
  if (/\b(postgres|d1|database|rls|workspace_id)\b/i.test(tech)) {
    lines.push("  - Application / project database (as planned in Master Plan)");
  }
  if (/\b(file|object storage|r2|s3|blob)\b/i.test(tech)) {
    lines.push("  - Files / object storage (as planned)");
  }
  if (lines[lines.length - 1]?.startsWith("- Where")) {
    lines.push(`  - ${NOT_SPECIFIED}`);
  }

  const pii = pickLinesMatching(tech, /\b(pii|personal data|email|sensitive)\b/i, 3);
  lines.push("- Sensitive data (categories only):");
  if (pii.length) {
    for (const p of pii) lines.push(`  - ${p.replace(/^[-*•]\s*/, "").slice(0, 200)}`);
  } else {
    lines.push(`  - ${NOT_SPECIFIED}`);
  }

  return lines.join("\n");
}

function buildKeyFeatures(features: string): string {
  if (!features) return NOT_SPECIFIED;
  const mvp = extractBulletish(
    features.match(/MVP features:([\s\S]*?)(?:KPIs|$)/i)?.[1] || features,
    10,
  );
  const kpis = extractBulletish(features.match(/KPIs[\s\S]*?:([\s\S]*)/i)?.[1] || "", 8);
  const lines: string[] = [];
  if (mvp.length) {
    lines.push("- MVP features:");
    for (const f of mvp) lines.push(`  - ${f}`);
  } else {
    lines.push(`- MVP features: ${NOT_SPECIFIED}`);
  }
  if (kpis.length) {
    lines.push("- KPIs:");
    for (const k of kpis) lines.push(`  - ${k}`);
  }
  return lines.join("\n");
}

function buildPagesSection(section4: string): string {
  const pages = parsePagesFromSection4(section4);
  if (!pages.length) return NOT_SPECIFIED;
  return pages
    .map((p) => {
      const bits = [`### ${p.name}${p.route ? ` \`${p.route}\`` : ""}`];
      bits.push(`- Purpose: ${p.purpose || NOT_SPECIFIED}`);
      bits.push(`- Authz: ${p.authz || NOT_SPECIFIED}`);
      bits.push(`- Primary actions: ${p.primaryActions || NOT_SPECIFIED}`);
      return bits.join("\n");
    })
    .join("\n\n");
}

function buildSecurity(tech: string): string {
  if (!tech) return NOT_SPECIFIED;
  const lines: string[] = [];
  const baseline = tech.match(/Security baseline[\s\S]*/i)?.[0] || tech;
  const auth = pickLinesMatching(baseline, /auth|login|session|oauth|magic/i, 3);
  const tenant = pickLinesMatching(baseline, /tenant|workspace_id|rls|isolation|scoped/i, 3);
  const secrets = pickLinesMatching(baseline, /secret|env|token|byok|server-only/i, 3);
  const deny = pickLinesMatching(baseline, /deny by default|least privilege/i, 2);

  const pushGroup = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`- ${title}:`);
    for (const i of items) lines.push(`  - ${i.replace(/^[-*•]\s*/, "").slice(0, 220)}`);
  };

  pushGroup("Auth model", auth);
  pushGroup("Isolation / tenant", tenant);
  pushGroup("Secrets handling", secrets);
  pushGroup("Access default", deny);

  if (!lines.length) {
    // Still surface short security-relevant lines if present
    const any = pickLinesMatching(tech, /security|authz|rls|pii/i, 5);
    if (!any.length) return NOT_SPECIFIED;
    return any.map((a) => `- ${a.replace(/^[-*•]\s*/, "")}`).join("\n");
  }
  return lines.join("\n");
}

function buildUiUx(ui: string): string {
  if (!ui) return NOT_SPECIFIED;
  const mood = pickLinesMatching(ui, /mood/i, 1)[0];
  const palette = pickLinesMatching(ui, /palette|color|#([0-9a-f]{3,6})\b/i, 2);
  const typo = pickLinesMatching(ui, /typography|font/i, 1)[0];
  const density = pickLinesMatching(ui, /density|spacing/i, 1)[0];
  const nav = pickLinesMatching(ui, /nav pattern|sidebar|bottom tab/i, 1)[0];
  const lines = [mood, ...palette, typo, density, nav]
    .filter(Boolean)
    .map((l) => `- ${String(l).replace(/^[-*•]\s*/, "")}`);
  if (!lines.length) {
    return extractBulletish(ui, 6).map((l) => `- ${l}`).join("\n") || orNotSpecified(ui.slice(0, 400));
  }
  return lines.join("\n");
}

function buildOperations(hosting?: TechnicalDocumentationHostingContext): string {
  const lines: string[] = [];
  if (hosting?.workspaceStorageMode) {
    lines.push(`- Workspace storage mode: \`${hosting.workspaceStorageMode}\``);
  }
  if (typeof hosting?.durableWorkspaceOk === "boolean") {
    lines.push(
      `- Durability: ${hosting.durableWorkspaceOk ? "durable workspace path OK" : "durability not OK for current mode"}`,
    );
  }
  if (hosting?.syntheticIsolation) {
    lines.push("- Isolation: synthetic project workspace ids (`cfproj_…`) on shared platform service");
  }
  if (hosting?.hasR2Storage) {
    lines.push("- Object storage: platform R2/object storage configured (credentials never exported)");
  }
  for (const n of hosting?.notes || []) {
    if (n.trim()) lines.push(`- ${n.trim()}`);
  }
  lines.push("- Secrets: not included in this export; configure via server env / encrypted BYOK only");
  return lines.length ? lines.join("\n") : NOT_SPECIFIED;
}

function buildOpenDecisions(
  gaps: Array<Pick<MasterPlanGap, "code" | "message" | "section">>,
): string | null {
  if (!gaps.length) return null;
  const bullets = gaps.slice(0, 7).map((g) => {
    const sec = g.section ? ` (${g.section})` : "";
    return `- ${g.message}${sec}`.trim();
  });
  return bullets.join("\n");
}

/**
 * Build Markdown technical documentation from a Master Plan record + optional context.
 */
export function buildTechnicalDocumentationMarkdown(
  planRaw: Record<string, unknown>,
  context: TechnicalDocumentationExportContext = {},
): TechnicalDocumentationExportResult {
  const warnings: string[] = [];
  const plan = normalizeMasterPlanRecord(planRaw);
  const goal = sectionText(plan, "1. Goal of the app");
  const tech = sectionText(plan, "2. Tech and Research");
  const features = sectionText(plan, "3. Features and KPIs");
  const pages = sectionText(plan, "4. Pages and navigation");
  const ui = sectionText(plan, "5. UI/UX design");

  const filled = MASTER_PLAN_SECTION_KEYS.filter((k) => (plan[k] || "").trim()).length;
  if (filled === 0) {
    warnings.push("Master Plan is empty; export contains Not specified placeholders.");
  } else if (filled < MASTER_PLAN_SECTION_KEYS.length) {
    warnings.push(`Master Plan is partial (${filled}/${MASTER_PLAN_SECTION_KEYS.length} sections).`);
  }

  let gaps = context.gaps || [];
  let assessedShape: string | undefined;
  if (!gaps.length) {
    try {
      const assessed = assessMasterPlanCompleteness({
        plan: planRaw,
        mode: context.strictMode || "warn",
        checkUiBrief: false,
      });
      assessedShape = assessed.shape;
      gaps = assessed.gaps.map((g) => ({
        code: g.code,
        message: g.message,
        section: g.section,
      }));
    } catch {
      /* ignore */
    }
  }
  if (
    !warnings.length &&
    (assessedShape === "incomplete" || assessedShape === "legacy" || gaps.length > 0)
  ) {
    warnings.push(
      assessedShape === "legacy"
        ? "Master Plan is thin/legacy; several fields may be Not specified."
        : "Master Plan has completeness gaps; see Open decisions / risks.",
    );
  }

  const projectName = (context.projectName || "").trim() || "Untitled Project";
  const generatedAt = context.generatedAt || new Date().toISOString();
  const filename = technicalDocumentationFilename(context);

  const openDecisions = buildOpenDecisions(gaps);

  const body = [
    `# ${projectName}`,
    ``,
    `## Technical Documentation`,
    ``,
    `- **Generated:** ${generatedAt}`,
    `- **Source:** Generated by Nebulla from Master Plan and project configuration`,
    `- **Disclaimer:** Content reflects current plan completeness; not a certification or security audit.`,
    context.projectKey ? `- **Project key:** \`${context.projectKey}\`` : null,
    ``,
    `## Overview`,
    ``,
    buildOverview(goal),
    ``,
    `## System context`,
    ``,
    buildSystemContext(goal, tech, context.hosting),
    ``,
    `## Architecture`,
    ``,
    buildArchitecture(tech),
    ``,
    `## Tech stack`,
    ``,
    buildTechStack(tech, context.hosting),
    ``,
    `## Data`,
    ``,
    buildData(tech, pages),
    ``,
    `## Key features`,
    ``,
    buildKeyFeatures(features),
    ``,
    `## Application structure (pages / routes)`,
    ``,
    buildPagesSection(pages),
    ``,
    `## Security baseline`,
    ``,
    buildSecurity(tech),
    ``,
    `## UI / UX direction`,
    ``,
    buildUiUx(ui),
    ``,
    `## Operations`,
    ``,
    buildOperations(context.hosting),
  ]
    .filter((line) => line !== null)
    .join("\n");

  const withRisks = openDecisions
    ? `${body}\n\n## Open decisions / risks\n\n${openDecisions}\n`
    : `${body}\n\n## Open decisions / risks\n\nNone recorded\n`;

  return {
    markdown: withRisks.endsWith("\n") ? withRisks : `${withRisks}\n`,
    filename,
    warnings: warnings.length ? warnings : undefined,
  };
}
