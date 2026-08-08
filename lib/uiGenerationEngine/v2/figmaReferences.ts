/**
 * Phase C — Forced Figma reference retrieval (honest status, layered fallback).
 * Authority: ui-generation-logic-v2.md §6 + ui-resource-selection-rubric.md
 *
 * Env (Render + local .env):
 * - FIGMA_API_KEY — personal access token (secret). Prefer a token that can
 *   read files (`file_content:read`). `/v1/me` (`current_user:read`) is optional.
 * - FIGMA_REFERENCE_FILE_KEYS — comma-separated file keys from
 *   figma.com/design/<KEY>/... or figma.com/file/<KEY>/...
 *   Community catalog IDs often 404 until you Duplicate into your account.
 * - FIGMA_REFERENCE_BUCKETS — optional tagged library, e.g.
 *   mobile=KEY,landing=KEY,dashboard=KEY (unknown buckets ignored)
 * - FIGMA_REFERENCE_MAX_FILES — optional (default 3, max 8) how many keys to probe
 *
 * Fallback order when live Figma fails (429/etc):
 * 1) other FileKeys in the probe list (do not abort on first 429)
 * 2) offline `nebulla-project/figma-library/raw/<key>/document.json`
 * 3) catalog + Stitch Design Brief hints (resource match)
 * 4) internal seed patterns (last resort only)
 *
 * Catalog: docs/figma-reference-library.md
 */

import fs from "fs";
import path from "path";
import { rankSeedPatterns } from "../seedPatterns";
import type { UiGenContextState } from "../types";
import type {
  FigmaKeyDiagnostic,
  FigmaRecord,
  FigmaStatusV2,
  PageClassification,
  V2TemplateId,
} from "./types";

const KNOWN_BUCKETS = new Set(["mobile", "landing", "dashboard", "auth", "web"]);

function resolveLibraryKeys(): string[] {
  return (process.env.FIGMA_REFERENCE_FILE_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse `mobile=KEY,landing=KEY2` — unknown buckets ignored. */
export function parseReferenceBuckets(
  raw: string = process.env.FIGMA_REFERENCE_BUCKETS || "",
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const bucket = t.slice(0, eq).trim().toLowerCase();
    const key = t.slice(eq + 1).trim();
    if (!KNOWN_BUCKETS.has(bucket) || !key) continue;
    const list = map.get(bucket) || [];
    if (!list.includes(key)) list.push(key);
    map.set(bucket, list);
  }
  return map;
}

function resolveMaxFiles(): number {
  // Default 4 when buckets are set so mobile/landing/dashboard/auth can all be probed.
  const bucketsSet = (process.env.FIGMA_REFERENCE_BUCKETS || "").trim().length > 0;
  const fallback = bucketsSet ? "4" : "3";
  const raw = Number(process.env.FIGMA_REFERENCE_MAX_FILES || fallback);
  if (!Number.isFinite(raw) || raw < 1) return bucketsSet ? 4 : 3;
  return Math.min(8, Math.floor(raw));
}

/** Preferred bucket for Stitch-like C.3 (device → page type). */
export function preferredBucketForClassification(classification: PageClassification): string | null {
  if (classification.page_type === "auth") return "auth";
  if (classification.device === "landing" || classification.page_type === "landing") return "landing";
  if (classification.device === "mobile") return "mobile";
  if (classification.page_type === "dashboard") return "dashboard";
  if (classification.device === "web") return "web";
  return null;
}

function isLooseClassification(classification: PageClassification): boolean {
  const preferred = preferredBucketForClassification(classification);
  // Never treat landing/dashboard/auth/mobile as "loose" — that would probe untagged
  // CSV (often a mobile-only library) and defeat C.3 bucket isolation.
  if (
    preferred === "landing" ||
    preferred === "dashboard" ||
    preferred === "auth" ||
    preferred === "mobile"
  ) {
    return false;
  }
  return classification.confidence === "low" || classification.page_type === "other";
}

/** Sibling tags safe to try when preferred bucket is empty (never mobile↔landing). */
function siblingBuckets(preferred: string): string[] {
  if (preferred === "landing") return ["web"];
  if (preferred === "web") return ["landing"];
  return [];
}

/**
 * Build ordered probe keys.
 * - Buckets set + preferred has keys → only those (avoid wrong mobile on landing/dashboard).
 * - Buckets set + preferred empty → try safe siblings, then untagged CSV only if classification is loose; else [].
 * - No buckets → CSV with light mobile prefer (and mobile deprioritized for landing/dashboard).
 */
export function resolveProbeKeys(
  classification: PageClassification,
  libraryKeys: string[] = resolveLibraryKeys(),
  buckets: Map<string, string[]> = parseReferenceBuckets(),
): { keys: string[]; selection_mode: string; preferred_bucket: string | null } {
  const preferred = preferredBucketForClassification(classification);
  const hasBuckets = buckets.size > 0;

  if (hasBuckets && preferred) {
    const tagged = buckets.get(preferred) || [];
    if (tagged.length > 0) {
      return {
        keys: tagged,
        selection_mode: `bucket:${preferred}`,
        preferred_bucket: preferred,
      };
    }
    for (const sib of siblingBuckets(preferred)) {
      const sibKeys = buckets.get(sib) || [];
      if (sibKeys.length > 0) {
        return {
          keys: sibKeys,
          selection_mode: `bucket_sibling:${preferred}->${sib}`,
          preferred_bucket: preferred,
        };
      }
    }
    // Strict page types: never probe untagged CSV (often a mobile-only library).
    if (isLooseClassification(classification) && libraryKeys.length > 0) {
      return {
        keys: orderKeysForClassification(libraryKeys, classification),
        selection_mode: "untagged_loose",
        preferred_bucket: preferred,
      };
    }
    return {
      keys: [],
      selection_mode: `bucket_miss:${preferred}`,
      preferred_bucket: preferred,
    };
  }

  if (hasBuckets && !preferred && libraryKeys.length > 0) {
    return {
      keys: orderKeysForClassification(libraryKeys, classification),
      selection_mode: "untagged_no_prefer",
      preferred_bucket: null,
    };
  }

  return {
    keys: orderKeysForClassification(libraryKeys, classification),
    selection_mode: "csv",
    preferred_bucket: preferred,
  };
}

/** Prefer known mobile key on mobile; deprioritize it for landing/dashboard/auth/web. */
function orderKeysForClassification(keys: string[], classification: PageClassification): string[] {
  if (keys.length <= 1) return keys;
  const mobilePreferred = "ZEbJpC67UQyeeynt1UR8gT";
  if (!keys.includes(mobilePreferred)) return keys;
  const preferred = preferredBucketForClassification(classification);
  if (preferred && preferred !== "mobile") {
    return [...keys.filter((k) => k !== mobilePreferred), mobilePreferred];
  }
  if (classification.device === "mobile") {
    return [mobilePreferred, ...keys.filter((k) => k !== mobilePreferred)];
  }
  return keys;
}

type FigmaNode = {
  id?: string;
  name?: string;
  type?: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { width?: number; height?: number };
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  cornerRadius?: number;
};

function mapSeedToTemplateHints(templateId: V2TemplateId, structure: string): string[] {
  return [
    `template=${templateId}`,
    `structure=${structure}`,
    "Prefer stacked regions: header → content → actions → nav",
    "Card grouping with consistent gap/padding",
    "Mobile: single vertical column, no free-float absolute chaos",
    "Bottom tabs as one horizontal row at the bottom only",
  ];
}

/** Offline ingest from `npm run figma:download` — used when live API is rate-limited. */
function loadOfflineFigmaFile(fileKey: string): {
  name?: string;
  document?: FigmaNode;
} | null {
  const key = fileKey.trim();
  if (!key) return null;
  const roots = [path.join(process.cwd(), "nebulla-project", "figma-library", "raw", key)];
  const seen = new Set<string>();
  for (const dir of roots) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    const docPath = path.join(dir, "document.json");
    if (!fs.existsSync(docPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(docPath, "utf8")) as {
        name?: string;
        document?: FigmaNode;
      };
      if (data?.document) return data;
    } catch {
      /* try next */
    }
  }
  return null;
}

function catalogBriefHints(input: {
  templateId: V2TemplateId;
  catalogHints?: string[];
  catalogProfileId?: string;
}): string[] {
  const out: string[] = [
    `template=${input.templateId}`,
    "Stitch Design Brief: honor color roles, density, dos/donts from Master Plan §5 + ui-brief",
    "Prefer catalog/Figma structure over Nebulla marketing chrome",
  ];
  if (input.catalogProfileId) out.push(`catalog_profile=${input.catalogProfileId}`);
  for (const h of input.catalogHints || []) {
    const t = String(h || "").trim();
    if (t) out.push(t);
  }
  return out.slice(0, 14);
}

/** Walk Figma document tree and collect structural layout hints. */
function extractStructureHints(
  root: FigmaNode | undefined,
  classification: PageClassification,
  templateId: V2TemplateId,
): { hints: string[]; frameNames: string[]; score: number } {
  const hints: string[] = [];
  const frameNames: string[] = [];
  let score = 0;
  if (!root) return { hints, frameNames, score };

  const walk = (n: FigmaNode, depth: number) => {
    if (!n || depth > 6) return;
    const name = (n.name || "").trim();
    const type = (n.type || "").toUpperCase();
    if ((type === "FRAME" || type === "COMPONENT" || type === "INSTANCE") && name) {
      frameNames.push(name);
      const lower = name.toLowerCase();
      if (/header|hero|nav|tab|list|card|metric|cta|button|setting|auth|form/i.test(lower)) {
        score += 2;
      }
      if (n.layoutMode === "VERTICAL") {
        hints.push(`frame "${name}" uses VERTICAL auto-layout`);
        score += 3;
      } else if (n.layoutMode === "HORIZONTAL") {
        hints.push(`frame "${name}" uses HORIZONTAL auto-layout`);
        score += 2;
      }
      if (typeof n.itemSpacing === "number") {
        hints.push(`spacing rhythm ≈ ${n.itemSpacing}px (${name})`);
        score += 1;
      }
      if (typeof n.cornerRadius === "number" && n.cornerRadius > 0) {
        hints.push(`corner radius ≈ ${Math.round(n.cornerRadius)}px (${name})`);
        score += 1;
      }
    }
    for (const c of n.children || []) walk(c, depth + 1);
  };
  walk(root, 0);

  const deviceHint =
    classification.device === "mobile"
      ? frameNames.find((n) => /mobile|iphone|ios|phone/i.test(n))
      : frameNames.find((n) => /desktop|web|dashboard/i.test(n));
  if (deviceHint) {
    hints.unshift(`preferred frame: ${deviceHint}`);
    score += 4;
  }
  const pageHint = frameNames.find((n) =>
    new RegExp(classification.page_type.replace(/_/g, "[-_ ]?"), "i").test(n),
  );
  if (pageHint) {
    hints.unshift(`page-type frame: ${pageHint}`);
    score += 3;
  }

  hints.push(`adapt into template slots for ${templateId} — keep section order, discard decorative noise`);
  const uniq = [...new Set(hints)].slice(0, 12);
  return { hints: uniq, frameNames: frameNames.slice(0, 24), score };
}

function redactSecrets(msg: string): string {
  return msg.replace(/figd_[A-Za-z0-9_-]+/g, "[redacted-token]");
}

function summarizeDiagnostics(diags: FigmaKeyDiagnostic[]): string {
  if (!diags.length) return "";
  return diags
    .map((d) => {
      const short = d.key.length > 12 ? `${d.key.slice(0, 10)}…` : d.key;
      const score = typeof d.score === "number" ? ` score=${d.score}` : "";
      return `${short}:${d.outcome}${score}`;
    })
    .join("; ");
}

function outcomeFromStatus(status: number): FigmaKeyDiagnostic["outcome"] {
  if (status === 401) return "401";
  if (status === 403) return "403";
  if (status === 404) return "404";
  if (status === 429) return "429";
  if (status >= 500) return "5xx";
  if (status >= 200 && status < 300) return "ok";
  return "other";
}

/** One retry on network failure or HTTP 5xx only. */
async function fetchFigmaFileOnce(
  fileKey: string,
  token: string,
): Promise<{ res: Response | null; networkError?: string; retried: boolean }> {
  const url = `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=3`;
  const headers = { "X-Figma-Token": token };

  const attempt = async (): Promise<{ res: Response | null; networkError?: string }> => {
    try {
      const res = await fetch(url, { headers });
      return { res };
    } catch (e) {
      return { res: null, networkError: e instanceof Error ? e.message : "network error" };
    }
  };

  let first = await attempt();
  if (first.res && first.res.status < 500) {
    return { res: first.res, retried: false };
  }
  if (!first.res || first.res.status >= 500) {
    const second = await attempt();
    return {
      res: second.res,
      networkError: second.networkError || first.networkError,
      retried: true,
    };
  }
  return { res: first.res, networkError: first.networkError, retried: false };
}

function bucketForKey(key: string, buckets: Map<string, string[]>): string | undefined {
  for (const [bucket, keys] of buckets) {
    if (keys.includes(key)) return bucket;
  }
  return undefined;
}

/** Always attempt Figma when key exists; never claim success without usable structural refs. */
export async function retrieveFigmaReferences(input: {
  classification: PageClassification;
  templateId: V2TemplateId;
  seedState: Pick<
    UiGenContextState,
    "device" | "page_type" | "function" | "navigation_type" | "industry_class" | "visual_tone" | "density"
  >;
  /** Optional profile-preferred Figma key from resource match — probed first when present. */
  preferredFileKey?: string;
  /** Scored catalog + Stitch brief hints — used before Nebulla seed last-resort. */
  catalogHints?: string[];
  catalogProfileId?: string;
}): Promise<FigmaRecord> {
  const key = (process.env.FIGMA_API_KEY || "").trim();
  const preferred = (input.preferredFileKey || "").trim();
  const libraryKeys = [
    ...new Set([...(preferred ? [preferred] : []), ...resolveLibraryKeys()]),
  ];
  const buckets = parseReferenceBuckets();
  const allConfiguredKeys = [
    ...new Set([...libraryKeys, ...[...buckets.values()].flat()]),
  ];
  const seeds = rankSeedPatterns({
    ...({} as UiGenContextState),
    device: input.seedState.device || "web",
    page_type: input.seedState.page_type || "other",
    function: input.seedState.function || "general",
    navigation_type: input.seedState.navigation_type || "none",
    industry_class: input.seedState.industry_class || "general",
    visual_tone: input.seedState.visual_tone || "",
    density: input.seedState.density || "medium",
  } as UiGenContextState);
  const topSeeds = seeds.slice(0, 3);
  const seedCandidates = topSeeds.map((s) => ({
    id: s.id,
    reason: `${s.reason} — ${s.structure}`,
  }));
  const seedSelected = topSeeds.slice(0, 2).map((s) => ({
    id: s.id,
    why: `Strong seed fallback for ${input.classification.device}/${input.classification.page_type}: ${s.structure}`,
  }));
  const seedHints = mapSeedToTemplateHints(input.templateId, topSeeds[0]?.structure || "stacked sections");
  const intelligenceHints = catalogBriefHints({
    templateId: input.templateId,
    catalogHints: input.catalogHints,
    catalogProfileId: input.catalogProfileId,
  });
  const hasCatalogIntel =
    Boolean(input.catalogProfileId) || (input.catalogHints && input.catalogHints.length > 0);

  const buildLayeredFallback = (opts: {
    status: FigmaStatusV2;
    selection_mode: string;
    figma_error: string;
    key_diagnostics?: FigmaKeyDiagnostic[];
    env_guidance?: string;
    probeKeys?: string[];
  }): FigmaRecord => {
    // Prefer offline Figma extracts (full library download) before Nebulla seeds.
    const tryKeys = opts.probeKeys?.length
      ? opts.probeKeys
      : [...allConfiguredKeys].slice(0, resolveMaxFiles());
    for (const fileKey of tryKeys) {
      const offline = loadOfflineFigmaFile(fileKey);
      if (!offline?.document) continue;
      const extracted = extractStructureHints(
        offline.document,
        input.classification,
        input.templateId,
      );
      if (extracted.score < 4) continue;
      return {
        reference_file_keys_configured: keysConfigured,
        env_guidance: opts.env_guidance || envGuidance,
        key_diagnostics: [
          ...(opts.key_diagnostics || []),
          {
            key: fileKey,
            outcome: "ok",
            score: extracted.score,
            file_name: offline.name,
            bucket: bucketForKey(fileKey, buckets),
          },
        ],
        selection_mode: `${opts.selection_mode}+offline`,
        preferred_bucket: preferredEarly,
        figma_used: "yes",
        figma_status: "success",
        figma_error: "",
        candidates: [
          {
            id: `figma-offline:${fileKey}`,
            reason: `Offline library "${offline.name || fileKey}" score=${extracted.score} (live API skipped/busy)`,
          },
          ...seedCandidates,
        ],
        selected_refs: [
          {
            id: `figma-offline:${fileKey}`,
            why: `Offline Figma structure for ${input.templateId} (API busy — library used)`,
          },
        ],
        fallback_used: "no",
        structure_hints: [
          ...extracted.hints,
          ...intelligenceHints,
          "Use Figma section order / card grouping / spacing only — do not copy decorative noise",
        ].slice(0, 16),
      };
    }

    const layeredHints = hasCatalogIntel
      ? [...intelligenceHints, ...seedHints].slice(0, 16)
      : seedHints;
    const layeredSelected = hasCatalogIntel
      ? [
          {
            id: `catalog:${input.catalogProfileId || "brief"}`,
            why: "Catalog + Stitch Design Brief (Figma API unavailable) — not Nebulla-only seeds",
          },
          ...seedSelected.slice(0, 1),
        ]
      : seedSelected;
    return {
      reference_file_keys_configured: keysConfigured,
      env_guidance: opts.env_guidance || envGuidance,
      key_diagnostics: opts.key_diagnostics || [],
      selection_mode: opts.selection_mode,
      preferred_bucket: preferredEarly,
      figma_used: "no",
      figma_status: opts.status,
      figma_error: opts.figma_error,
      candidates: [
        ...(hasCatalogIntel
          ? [
              {
                id: `catalog:${input.catalogProfileId || "brief"}`,
                reason: "Scored ui-resource-catalog + Stitch brief",
              },
            ]
          : []),
        ...seedCandidates,
      ],
      selected_refs: layeredSelected,
      fallback_used: "yes",
      structure_hints: layeredHints,
    };
  };

  const keysConfigured = allConfiguredKeys.length;
  const bucketsConfigured = buckets.size;
  const envGuidance =
    !key && keysConfigured === 0
      ? "Set FIGMA_API_KEY + FIGMA_REFERENCE_FILE_KEYS on Render. Duplicate Community files into your account, then use figma.com/design/<KEY>/…. Optional: FIGMA_REFERENCE_BUCKETS=mobile=KEY,landing=KEY,dashboard=KEY. See docs/figma-reference-library.md"
      : !key
        ? "Set FIGMA_API_KEY (token with file read). FIGMA_REFERENCE_FILE_KEYS alone is not enough."
        : keysConfigured === 0 && bucketsConfigured === 0
          ? "FIGMA_API_KEY is set, but FIGMA_REFERENCE_FILE_KEYS / BUCKETS missing — add design keys (Duplicate Community files first). Example: FIGMA_REFERENCE_BUCKETS=mobile=KEY,landing=KEY,dashboard=KEY"
          : bucketsConfigured > 0
            ? "FIGMA_API_KEY + FIGMA_REFERENCE_BUCKETS set. Tag landing/dashboard separately so mobile refs are not used. Duplicate Community files before using catalog IDs."
            : "Both FIGMA_API_KEY and FIGMA_REFERENCE_FILE_KEYS are configured. Tip: set FIGMA_REFERENCE_BUCKETS for landing/dashboard/mobile.";

  const emptyDiags: FigmaKeyDiagnostic[] = [];
  const preferredEarly = preferredBucketForClassification(input.classification);
  const base = {
    reference_file_keys_configured: keysConfigured,
    env_guidance: envGuidance,
    key_diagnostics: emptyDiags,
    selection_mode: "pending",
    preferred_bucket: preferredEarly,
  };

  if (!key) {
    return buildLayeredFallback({
      status: "missing_key",
      selection_mode: "skipped_no_api_key",
      figma_error: hasCatalogIntel
        ? "FIGMA_API_KEY not set — using catalog + Stitch Design Brief (seed last)"
        : "FIGMA_API_KEY not set — using polished seed templates (built-in patterns)",
      probeKeys: allConfiguredKeys,
    });
  }

  try {
    // Optional identity probe — fine-grained tokens may lack current_user:read.
    // Do not hard-fail: file reads are what matter for layout extract.
    const me = await fetch("https://api.figma.com/v1/me", {
      headers: { "X-Figma-Token": key },
    });
    if (me.status === 401) {
      return buildLayeredFallback({
        status: "unauthorized",
        selection_mode: "skipped_unauthorized",
        figma_error: `Figma unauthorized (${me.status}) — check FIGMA_API_KEY; using offline/catalog/Stitch before seeds`,
        probeKeys: allConfiguredKeys,
      });
    }
    // 429 on /me: still probe files + offline — do not jump straight to Nebulla seeds.
    const meRateLimited = me.status === 429;
    // 403 on /me (missing current_user:read) → continue to file probes
    void meRateLimited;

    const probe = resolveProbeKeys(input.classification, libraryKeys, buckets);
    // Resource-match preferred key must stay first even when buckets return only tagged keys.
    const probeKeys =
      preferred && !probe.keys.includes(preferred)
        ? [preferred, ...probe.keys]
        : preferred && probe.keys[0] !== preferred
          ? [preferred, ...probe.keys.filter((k) => k !== preferred)]
          : probe.keys;
    const withProbe = {
      ...base,
      selection_mode:
        preferred && probeKeys[0] === preferred && !probe.selection_mode.includes("preferred")
          ? `preferred+${probe.selection_mode}`
          : probe.selection_mode,
      preferred_bucket: probe.preferred_bucket,
    };

    if (probe.selection_mode.startsWith("bucket_miss:") && probeKeys.length === 0) {
      const bucket = probe.preferred_bucket || "unknown";
      return buildLayeredFallback({
        status: "weak_matches",
        selection_mode: withProbe.selection_mode,
        figma_error: `No FIGMA_REFERENCE_BUCKETS entry for "${bucket}" — offline/catalog/Stitch before seed (avoids wrong-bucket Figma). Duplicate a ${bucket} design, then add ${bucket}=<designKey>.`,
        env_guidance: `${envGuidance} Missing bucket: ${bucket}. Example: FIGMA_REFERENCE_BUCKETS=mobile=…,landing=…,dashboard=…`,
        probeKeys: allConfiguredKeys,
      });
    }

    if (probeKeys.length === 0 && allConfiguredKeys.length === 0) {
      return buildLayeredFallback({
        status: "weak_matches",
        selection_mode: withProbe.selection_mode,
        figma_error:
          "FIGMA_API_KEY present but FIGMA_REFERENCE_FILE_KEYS / BUCKETS not set — cannot extract layout; catalog/Stitch then seed",
        probeKeys: [],
      });
    }

    const figmaCandidates: { id: string; reason: string }[] = [];
    const allHints: string[] = [];
    const keyDiagnostics: FigmaKeyDiagnostic[] = [];
    let bestScore = 0;
    let bestKey = "";
    let sawUnauthorizedFile = false;
    let sawNotFound = 0;

    const ordered = probeKeys.slice(0, resolveMaxFiles());

    for (const fileKey of ordered) {
      const bucket = bucketForKey(fileKey, buckets);
      try {
        const { res: fr, networkError } = await fetchFigmaFileOnce(fileKey, key);
        if (!fr) {
          keyDiagnostics.push({
            key: fileKey,
            outcome: "network",
            bucket,
          });
          continue;
        }
        if (fr.status === 429) {
          // Do not abort the whole library — try remaining FileKeys, then offline/catalog.
          keyDiagnostics.push({
            key: fileKey,
            outcome: "429",
            http_status: 429,
            bucket,
          });
          continue;
        }
        if (fr.status === 401 || fr.status === 403) {
          sawUnauthorizedFile = true;
          keyDiagnostics.push({
            key: fileKey,
            outcome: outcomeFromStatus(fr.status),
            http_status: fr.status,
            bucket,
          });
          continue;
        }
        if (fr.status === 404) {
          sawNotFound += 1;
          keyDiagnostics.push({
            key: fileKey,
            outcome: "404",
            http_status: 404,
            bucket,
          });
          continue;
        }
        if (!fr.ok) {
          keyDiagnostics.push({
            key: fileKey,
            outcome: outcomeFromStatus(fr.status),
            http_status: fr.status,
            bucket,
          });
          continue;
        }
        const data = (await fr.json()) as {
          name?: string;
          document?: FigmaNode;
        };
        const extracted = extractStructureHints(data.document, input.classification, input.templateId);
        keyDiagnostics.push({
          key: fileKey,
          outcome: "ok",
          http_status: 200,
          score: extracted.score,
          file_name: data.name,
          bucket,
        });
        figmaCandidates.push({
          id: `figma:${fileKey}`,
          reason: `File "${data.name || fileKey}" frames=${extracted.frameNames.slice(0, 5).join(", ") || "(none)"} score=${extracted.score} mode=${probe.selection_mode}`,
        });
        if (extracted.score > bestScore) {
          bestScore = extracted.score;
          bestKey = fileKey;
          allHints.length = 0;
          allHints.push(...extracted.hints);
        }
        void networkError;
      } catch (e) {
        keyDiagnostics.push({
          key: fileKey,
          outcome: "network",
          bucket,
        });
        void e;
      }
    }

    const diagSummary = summarizeDiagnostics(keyDiagnostics);
    const sawRateLimited = keyDiagnostics.some((d) => d.outcome === "429") || meRateLimited;

    if (figmaCandidates.length === 0 || bestScore < 4) {
      let detail =
        bestScore === 0
          ? "Figma live probe yielded no usable structure — trying offline library → catalog/Stitch → seed"
          : `Figma structure score too weak (${bestScore}) — trying offline library → catalog/Stitch → seed`;
      if (sawRateLimited) {
        detail = `Figma rate limited (${diagSummary || "429"}) — offline library / catalog + Stitch Design Brief before Nebulla seeds (MVP not blocked)`;
      } else if (sawNotFound > 0 && figmaCandidates.length === 0) {
        detail =
          "Figma file key(s) returned 404. Community catalog IDs are not API-readable until you Duplicate the file into your Figma account and use the new /design/<KEY>/ id. See docs/figma-reference-library.md";
      } else if (sawUnauthorizedFile && figmaCandidates.length === 0) {
        detail =
          "Figma file read unauthorized — token needs file_content:read (and access to those files).";
      }
      if (diagSummary && !sawRateLimited) detail = `${detail} [${diagSummary}]`;
      const status: FigmaStatusV2 = sawRateLimited
        ? "rate_limited"
        : sawUnauthorizedFile && figmaCandidates.length === 0
          ? "unauthorized"
          : "weak_matches";
      return buildLayeredFallback({
        status,
        selection_mode: withProbe.selection_mode,
        figma_error: detail,
        key_diagnostics: keyDiagnostics,
        env_guidance: diagSummary ? `${envGuidance} Probes: ${diagSummary}` : envGuidance,
        probeKeys: ordered,
      });
    }

    const selected = figmaCandidates
      .filter((c) => c.id.includes(bestKey))
      .slice(0, 2)
      .map((c) => ({
        id: c.id,
        why: `Structural guidance for ${input.templateId}: ${c.reason}`,
      }));
    if (!selected.length) {
      selected.push({
        id: figmaCandidates[0].id,
        why: figmaCandidates[0].reason,
      });
    }

    return {
      ...withProbe,
      key_diagnostics: keyDiagnostics,
      figma_used: "yes",
      figma_status: "success" as FigmaStatusV2,
      figma_error: "",
      candidates: [...figmaCandidates, ...seedCandidates],
      selected_refs: selected,
      fallback_used: "no",
      structure_hints: [
        ...allHints,
        ...intelligenceHints.slice(0, 4),
        "Use Figma section order / card grouping / spacing only — do not copy decorative noise",
      ].slice(0, 16),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Figma request failed";
    return buildLayeredFallback({
      status: "failed",
      selection_mode: "failed",
      figma_error: `${redactSecrets(msg)} — offline/catalog/Stitch before seed`,
      probeKeys: allConfiguredKeys,
    });
  }
}
