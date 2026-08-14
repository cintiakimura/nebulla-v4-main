/**
 * Phase C — Figma / reference retrieval (local library first).
 * Authority: ui-generation-logic-v2.md §6 + ui-resource-selection-rubric.md
 *
 * Generate-time order (single path):
 * 1) offline `nebulla-project/figma-library/raw/<key>/document.json`
 * 2) published catalog profiles + Stitch / ui-brief hints
 * 3) internal seed patterns (last resort)
 * 4) live Figma only when FIGMA_LIVE_ON_GENERATE=1|true AND FIGMA_API_KEY set
 *    AND offline + catalog did not yield usable structure (max 1 file, hard cap 2)
 *
 * Ingest/refresh (`npm run figma:download` etc.) may call live Figma freely.
 *
 * Env (Render + local .env):
 * - FIGMA_API_KEY — token for ingest / optional live Generate (secret)
 * - FIGMA_LIVE_ON_GENERATE — default off; set 1|true to allow live probe on Generate
 * - FIGMA_REFERENCE_FILE_KEYS / FIGMA_REFERENCE_BUCKETS — owned FileKeys + buckets
 * - FIGMA_REFERENCE_MAX_FILES — offline scan width (default 3–4, max 8);
 *   live Generate capped at min(env, 2) with default 1
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

/** Committed shortlist — used when env keys unset so structure/ still resolves on Render. */
const DEFAULT_SHORTLIST_KEYS = [
  "ZEbJpC67UQyeeynt1UR8gT", // mobile
  "P6lA9sHTHVbnmUfoYbV9Ir", // landing
  "TgYmEqMwrWFHBxF2kAVOaF", // dashboard
  "MaFREMBRF3vQ8BhtqA2ZpK", // auth
] as const;

const DEFAULT_SHORTLIST_BUCKETS =
  "mobile=ZEbJpC67UQyeeynt1UR8gT,landing=P6lA9sHTHVbnmUfoYbV9Ir,dashboard=TgYmEqMwrWFHBxF2kAVOaF,auth=MaFREMBRF3vQ8BhtqA2ZpK";

function resolveLibraryKeys(): string[] {
  const fromEnv = (process.env.FIGMA_REFERENCE_FILE_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return [...DEFAULT_SHORTLIST_KEYS];
}

/** Parse `mobile=KEY,landing=KEY2` — unknown buckets ignored. */
export function parseReferenceBuckets(
  raw: string = process.env.FIGMA_REFERENCE_BUCKETS || "",
): Map<string, string[]> {
  const effective = raw.trim() ? raw : DEFAULT_SHORTLIST_BUCKETS;
  const map = new Map<string, string[]>();
  for (const part of effective.split(",")) {
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
  // Offline/local scan width — buckets default to 4 so mobile/landing/dashboard/auth fit.
  const bucketsSet = (process.env.FIGMA_REFERENCE_BUCKETS || "").trim().length > 0;
  const fallback = bucketsSet ? "4" : "3";
  const raw = Number(process.env.FIGMA_REFERENCE_MAX_FILES || fallback);
  if (!Number.isFinite(raw) || raw < 1) return bucketsSet ? 4 : 3;
  return Math.min(8, Math.floor(raw));
}

/** Live Generate probe — default 1 file, hard cap 2. */
function resolveLiveGenerateMaxFiles(): number {
  const raw = Number(process.env.FIGMA_REFERENCE_MAX_FILES || "1");
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(2, Math.floor(raw));
}

/** Opt-in live Figma on Generate UI (default: disabled). */
export function isFigmaLiveOnGenerate(
  raw: string = process.env.FIGMA_LIVE_ON_GENERATE || "",
): boolean {
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
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

/**
 * Offline extract — Generate primary path.
 * Prefer lean committed `structure/<key>/document.json`, then full `raw/` download.
 */
function loadOfflineFigmaFile(fileKey: string): {
  name?: string;
  document?: FigmaNode;
} | null {
  const key = fileKey.trim();
  if (!key) return null;
  const roots = [
    path.join(process.cwd(), "nebulla-project", "figma-library", "structure", key),
    path.join(process.cwd(), "nebulla-project", "figma-library", "raw", key),
  ];
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

/** True when catalog profile provides real structure guidance (not thin density tags). */
function hasUsableCatalogStructure(input: {
  catalogHints?: string[];
  catalogProfileId?: string;
  catalogScoredMatch?: boolean;
}): boolean {
  if (!input.catalogProfileId && !input.catalogScoredMatch) return false;
  if (input.catalogScoredMatch) return true;
  const hints = input.catalogHints || [];
  return hints.some((h) => {
    const t = String(h || "").trim();
    if (!t) return false;
    if (/^(density|personality|template|catalog_profile)=/i.test(t)) return false;
    if (/^best_for:/i.test(t)) return true;
    if (/card|cta|hero|form|stack|section|layout|spacing/i.test(t)) return true;
    return t.length >= 12;
  });
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
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
    try {
      const res = await fetch(url, {
        headers,
        signal: controller?.signal,
      });
      return { res };
    } catch (e) {
      return { res: null, networkError: e instanceof Error ? e.message : "network error" };
    } finally {
      if (timer) clearTimeout(timer);
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

/**
 * Generate-time reference retrieval — local library first.
 * Never claims live Figma success when only seeds/catalog ran.
 */
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
  /** True when resource match was a scored catalog hit (not below_threshold). */
  catalogScoredMatch?: boolean;
}): Promise<FigmaRecord> {
  const apiKey = (process.env.FIGMA_API_KEY || "").trim();
  const liveEnabled = isFigmaLiveOnGenerate();
  const preferred = (input.preferredFileKey || "").trim();
  const libraryKeys = [
    ...new Set([...(preferred ? [preferred] : []), ...resolveLibraryKeys()]),
  ];
  const buckets = parseReferenceBuckets();
  const allConfiguredKeys = [
    ...new Set([...libraryKeys, ...[...buckets.values()].flat()]),
  ];
  const keysConfigured = allConfiguredKeys.length;
  const bucketsConfigured = buckets.size;
  const preferredEarly = preferredBucketForClassification(input.classification);

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
  const seedHints = mapSeedToTemplateHints(
    input.templateId,
    topSeeds[0]?.structure || "stacked sections",
  );
  const intelligenceHints = catalogBriefHints({
    templateId: input.templateId,
    catalogHints: input.catalogHints,
    catalogProfileId: input.catalogProfileId,
  });
  const hasCatalogStructure = hasUsableCatalogStructure({
    catalogHints: input.catalogHints,
    catalogProfileId: input.catalogProfileId,
    catalogScoredMatch: input.catalogScoredMatch,
  });
  const hasBriefHints = Boolean(input.catalogHints && input.catalogHints.length > 0);

  const envGuidance =
    keysConfigured === 0 && bucketsConfigured === 0
      ? "Populate shortlist: npm run figma:download && npm run figma:extract-structure (or ship structure/). Set FIGMA_REFERENCE_FILE_KEYS / BUCKETS. Live Generate optional via FIGMA_LIVE_ON_GENERATE=1."
      : !apiKey
        ? "Local library keys configured. FIGMA_API_KEY needed only for ingest (`figma:download`) or optional live Generate (FIGMA_LIVE_ON_GENERATE=1)."
        : liveEnabled
          ? "FIGMA_LIVE_ON_GENERATE enabled — live probe only if offline + catalog miss. Prefer committed structure/ + catalog profiles on Render."
          : "Local-first Generate (live off). Prefer nebulla-project/figma-library/structure/<key>/document.json; refresh via figma:download + figma:extract-structure.";

  const probe = resolveProbeKeys(input.classification, libraryKeys, buckets);
  const probeKeys =
    preferred && !probe.keys.includes(preferred)
      ? [preferred, ...probe.keys]
      : preferred && probe.keys[0] !== preferred
        ? [preferred, ...probe.keys.filter((k) => k !== preferred)]
        : probe.keys;
  const selectionModeBase =
    preferred && probeKeys[0] === preferred && !probe.selection_mode.includes("preferred")
      ? `preferred+${probe.selection_mode}`
      : probe.selection_mode;
  const preferredBucket = probe.preferred_bucket ?? preferredEarly;

  // Offline may scan configured keys even on bucket_miss (avoid wrong live, still use local).
  const offlineScanKeys = [
    ...new Set([
      ...probeKeys,
      ...(probeKeys.length === 0 ? allConfiguredKeys : []),
    ]),
  ].slice(0, resolveMaxFiles());

  // 1) Offline extracts first
  for (const fileKey of offlineScanKeys) {
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
      env_guidance: envGuidance,
      key_diagnostics: [
        {
          key: fileKey,
          outcome: "ok",
          score: extracted.score,
          file_name: offline.name,
          bucket: bucketForKey(fileKey, buckets),
        },
      ],
      selection_mode: `offline:${selectionModeBase}`,
      preferred_bucket: preferredBucket,
      figma_used: "yes",
      figma_status: "offline",
      figma_error: "",
      candidates: [
        {
          id: `figma-offline:${fileKey}`,
          reason: `Offline library "${offline.name || fileKey}" bucket=${bucketForKey(fileKey, buckets) || preferredBucket || "—"} score=${extracted.score}`,
        },
        ...seedCandidates,
      ],
      selected_refs: [
        {
          id: `figma-offline:${fileKey}`,
          why: `Offline library hit key=${fileKey} bucket=${bucketForKey(fileKey, buckets) || preferredBucket || "—"} → ${input.templateId}`,
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

  // 2) Published catalog profile (scored / structural) — before thin brief-only
  if (hasCatalogStructure) {
    const structural = [
      `catalog_profile=${input.catalogProfileId || "match"}`,
      `bucket=${preferredBucket || "none"}`,
      "layout: header → content cards → primary CTA → nav when applicable",
      "Prefer stacked regions with consistent card grouping and spacing",
      ...intelligenceHints,
    ];
    if (preferredBucket === "auth" || /auth/i.test(input.templateId)) {
      structural.push(
        "auth: title, subtitle, email/password fields, primary button, secondary link",
      );
    }
    return {
      reference_file_keys_configured: keysConfigured,
      env_guidance: envGuidance,
      key_diagnostics: [],
      selection_mode: `local:catalog:${selectionModeBase}`,
      preferred_bucket: preferredBucket,
      figma_used: "no",
      figma_status: "skipped",
      figma_error: `Catalog profile hit (${input.catalogProfileId || "match"}; offline miss for bucket ${preferredBucket || "—"})`,
      candidates: [
        {
          id: `catalog:${input.catalogProfileId || "match"}`,
          reason: "Scored ui-resource-catalog structure",
        },
        ...seedCandidates,
      ],
      selected_refs: [
        {
          id: `catalog:${input.catalogProfileId || "match"}`,
          why: `Catalog structure for ${preferredBucket || input.templateId}`,
        },
      ],
      fallback_used: "yes",
      structure_hints: structural.slice(0, 16),
    };
  }

  // 3) Stitch / ui-brief only (thinner than catalog)
  if (hasBriefHints) {
    return {
      reference_file_keys_configured: keysConfigured,
      env_guidance:
        keysConfigured === 0
          ? `${envGuidance} Operator: run figma:download + figma:extract-structure for shortlist (or deploy structure/).`
          : envGuidance,
      key_diagnostics: [],
      selection_mode: `local:brief:${selectionModeBase}`,
      preferred_bucket: preferredBucket,
      figma_used: "no",
      figma_status: "skipped",
      figma_error: `Brief-only guidance (offline miss; no scored catalog structure for bucket ${preferredBucket || "—"})`,
      candidates: [
        {
          id: "brief:ui-brief",
          reason: "Stitch Design Brief / Master Plan §5",
        },
        ...seedCandidates,
      ],
      selected_refs: [
        {
          id: "brief:ui-brief",
          why: "Brief color/density guidance — layout from template + seed",
        },
        ...seedSelected.slice(0, 1),
      ],
      fallback_used: "yes",
      structure_hints: [...intelligenceHints, ...seedHints].slice(0, 16),
    };
  }

  // 3→4) Optional live only after offline + catalog miss
  const canLive = liveEnabled && Boolean(apiKey) && probeKeys.length > 0;
  if (canLive) {
    try {
      const keyDiagnostics: FigmaKeyDiagnostic[] = [];
      const figmaCandidates: { id: string; reason: string }[] = [];
      const allHints: string[] = [];
      let bestScore = 0;
      let bestKey = "";
      let sawUnauthorizedFile = false;
      let sawNotFound = 0;
      let sawRateLimited = false;

      const ordered = probeKeys.slice(0, resolveLiveGenerateMaxFiles());

      for (const fileKey of ordered) {
        if (sawRateLimited) break; // stop further live probes on 429
        const bucket = bucketForKey(fileKey, buckets);
        try {
          const { res: fr } = await fetchFigmaFileOnce(fileKey, apiKey);
          if (!fr) {
            keyDiagnostics.push({ key: fileKey, outcome: "network", bucket });
            continue;
          }
          if (fr.status === 429) {
            sawRateLimited = true;
            keyDiagnostics.push({
              key: fileKey,
              outcome: "429",
              http_status: 429,
              bucket,
            });
            break;
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
          const extracted = extractStructureHints(
            data.document,
            input.classification,
            input.templateId,
          );
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
            reason: `Live "${data.name || fileKey}" frames=${extracted.frameNames.slice(0, 5).join(", ") || "(none)"} score=${extracted.score}`,
          });
          if (extracted.score > bestScore) {
            bestScore = extracted.score;
            bestKey = fileKey;
            allHints.length = 0;
            allHints.push(...extracted.hints);
          }
        } catch {
          keyDiagnostics.push({ key: fileKey, outcome: "network", bucket });
        }
      }

      if (figmaCandidates.length > 0 && bestScore >= 4) {
        const selected = figmaCandidates
          .filter((c) => c.id.includes(bestKey))
          .slice(0, 2)
          .map((c) => ({
            id: c.id,
            why: `Live structural guidance for ${input.templateId}: ${c.reason}`,
          }));
        if (!selected.length) {
          selected.push({
            id: figmaCandidates[0].id,
            why: figmaCandidates[0].reason,
          });
        }
        return {
          reference_file_keys_configured: keysConfigured,
          env_guidance: envGuidance,
          key_diagnostics: keyDiagnostics,
          selection_mode: `live:${selectionModeBase}`,
          preferred_bucket: preferredBucket,
          figma_used: "yes",
          figma_status: "success",
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
      }

      const diagSummary = summarizeDiagnostics(keyDiagnostics);
      // Fall through to seeds with honest live-attempt status
      const liveStatus: FigmaStatusV2 = sawRateLimited
        ? "rate_limited"
        : sawUnauthorizedFile && figmaCandidates.length === 0
          ? "unauthorized"
          : "weak_matches";
      let detail =
        bestScore === 0
          ? "Live Figma probe yielded no usable structure — seed last resort"
          : `Live Figma structure score too weak (${bestScore}) — seed last resort`;
      if (sawRateLimited) {
        detail = `Figma rate limited (${diagSummary || "429"}) — seed last resort (MVP not blocked)`;
      } else if (sawNotFound > 0 && figmaCandidates.length === 0) {
        detail =
          "Figma file key(s) returned 404. Duplicate Community files into your account first. See docs/figma-reference-library.md";
      } else if (sawUnauthorizedFile && figmaCandidates.length === 0) {
        detail =
          "Figma file read unauthorized — token needs file_content:read (and access to those files).";
      }
      if (diagSummary && !sawRateLimited) detail = `${detail} [${diagSummary}]`;

      return {
        reference_file_keys_configured: keysConfigured,
        env_guidance: diagSummary ? `${envGuidance} Probes: ${diagSummary}` : envGuidance,
        key_diagnostics: keyDiagnostics,
        selection_mode: `local:seed_after_live:${selectionModeBase}`,
        preferred_bucket: preferredBucket,
        figma_used: "no",
        figma_status: liveStatus,
        figma_error: detail,
        candidates: seedCandidates,
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: seedHints,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Figma request failed";
      return {
        reference_file_keys_configured: keysConfigured,
        env_guidance: envGuidance,
        key_diagnostics: [],
        selection_mode: `local:seed_after_live_error:${selectionModeBase}`,
        preferred_bucket: preferredBucket,
        figma_used: "no",
        figma_status: "failed",
        figma_error: `${redactSecrets(msg)} — seed last resort`,
        candidates: seedCandidates,
        selected_refs: seedSelected,
        fallback_used: "yes",
        structure_hints: seedHints,
      };
    }
  }

  // Live gated off / no key / no probe keys → seed last resort (never fake live success)
  const seedReason = !liveEnabled
    ? "Local library miss — seed patterns (live Generate disabled; set FIGMA_LIVE_ON_GENERATE=1 only if needed)"
    : !apiKey
      ? "Local library miss — seed patterns (FIGMA_API_KEY unset; live Generate not attempted)"
      : probeKeys.length === 0
        ? selectionModeBase.startsWith("bucket_miss:")
          ? `No bucket keys for "${preferredBucket || "unknown"}" — seed patterns (avoids wrong-bucket live)`
          : "No FIGMA_REFERENCE_FILE_KEYS / BUCKETS for probe — seed patterns"
        : "Local library miss — seed patterns";

  return {
    reference_file_keys_configured: keysConfigured,
    env_guidance: envGuidance,
    key_diagnostics: [],
    selection_mode: `local:seed:${selectionModeBase}`,
    preferred_bucket: preferredBucket,
    figma_used: "no",
    // Distinct from catalog `skipped` and from live `success` / offline `offline`
    figma_status: "weak_matches",
    figma_error: seedReason,
    candidates: seedCandidates,
    selected_refs: seedSelected,
    fallback_used: "yes",
    structure_hints: seedHints,
  };
}
