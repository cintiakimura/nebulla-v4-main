import dotenv from "dotenv";
import path from "path";
import express from "express";
import fs from "fs";
import { exec, execFile, spawn } from "child_process";
import { Readable } from "stream";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
import {
  appendConversationTurn,
  appendWriterAuditEvent,
  buildMemorySystemContent,
  clearConversationLog,
  injectMemoryIntoMessages,
  loadPrunedEntries,
} from "./conversationLog";
import { sanitizeAssistantChatText } from "./lib/assistantChatSanitize";
import {
  initGuardianProcessHandlers,
  registerGuardianRoutes,
  guardianExpressErrorHandler,
  captureError,
} from "./lib/nebulaGuardian";
import {
  mountRenderStack,
  getRenderPublicConfig,
  resolveNebulaProjectDiskKey,
  readNebulaSessionUserId,
  ensureDbReady,
  userOwnsWorkspaceDiskKey,
} from "./renderStack";
import {
  canReadAppPreview,
  issuePreviewGrantCookieMerging,
  isSyntheticWorkspaceKey,
} from "./lib/appPreviewAuthz";
import { createApiRateLimitGate } from "./lib/rateLimit";
import { getOpsReadiness, logOpsReadinessAtBoot } from "./lib/opsReadiness";
import { registerFigmaIngestAdminRoutes } from "./lib/figmaIngestAdminRoutes";
import {
  isLegacyV0ApiFrozen,
  isPencilApiFrozen,
  LEGACY_V0_FROZEN_MESSAGE,
} from "./lib/betaLeanFlags";
import { getPlatformQueryable } from "./lib/nebulaPgPool";
import { getUserByokStatus, hasAnyByokConfigured } from "./lib/nebulaUserGrokStore";
import {
  resolvePencilApiKey,
  resolvePencilMockupsUrl,
  useBundledDemoMockupWithoutKey,
  loadBundledDemoMockupSvg,
  buildNebulaUiStudioPromptBody,
  callPencilMockupsGenerate,
} from "./lib/nebulaPencilDev";
import {
  createResolveMainGrokApiKey,
  createResolveMainGrokApiKeyDetailed,
  isGrokQuotaLimitError,
  MAIN_AI_ENV_VAR,
  MAIN_AI_KEY_SETUP_HINT,
  mainAiApiKeyTail,
  requestHasClientAiKey,
  readMainAiApiKeyFromEnv,
  readPlatformSwarmApiKey,
  readPlatformTtsApiKey,
  readPlatformWriterApiKey,
  tryClaudeQuotaFallback,
  detectMainAiProvider,
  resolveMainAiChatModel,
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
} from "./lib/nebulaMainGrokResolver";
import { callClaudeChatCompletion } from "./lib/nebulaClaudeFallback";
import {
  runAiChatCompletion,
  toOpenAiStyleChatResponse,
} from "./lib/aiChatCompletion";
import { formatWorkspaceFileIndexBlock } from "./lib/ideAiContextBlocks";
import {
  bootstrapMasterPlanFromWorkspace,
  ensurePreviewIndexHtml,
  isLegacyNebulaBasicPreviewHtml,
  fillMissingMasterPlanSectionsLocal,
  hydrateAndPersistMasterPlan,
  readMasterPlanFile,
  syncMindMapFromMasterPlan,
  syncUiArtifactsFromMasterPlan,
  unlockVisualEditorFromWorkspaceCoding,
  writeBasicUiScaffold,
} from "./lib/nebulaIdeWorkspaceArtifacts";
import { parsePagesFromUiBrief, readUiBriefMarkdown } from "./lib/nebulaUiBrief";
import { resolveMasterPlanStrictMode } from "./lib/masterPlanStrictPolicy";
import { isUserAppProductPath } from "./lib/nebulaOrchestrationPaths";
import { isLoadableStudioModel } from "./lib/uiMockupArtifactHonesty";
import { assessMasterPlanCompletenessWithWorkspace } from "./lib/masterPlanCompletenessIo";
import { buildTechnicalDocumentationMarkdown } from "./lib/technicalDocumentationExport";
import { assessMindMapSubsetOfSection4 } from "./lib/mindMapFidelity";
import { recordContractTelemetry } from "./lib/nebulaContractTelemetry";
import {
  buildSecurityBaselineProposal,
  ensureSecurityBaselineInPlan,
  mergeSecurityBaselineIntoSection2,
} from "./lib/securityBaselinePropose";
import { softenSecurityBlocksForMvpGo } from "./lib/mvpDeliveryGates";
import { draftSection4AmendmentsForRoutes } from "./lib/mindMapAmendmentPropose";
import { isMasterPlanReadyForUiMockup } from "./lib/masterPlanCompleteness";
import {
  inferGoalFromPlanRecord,
  isUsableProjectGoal,
  seedGoalOfTheAppSection,
  uiBriefUsable,
} from "./lib/spineSequenceGates";
import { assessResearchArtifact, RESEARCH_STOPPED } from "./lib/researchArtifact";
import { isResearchJobActive, runResearchStroke } from "./lib/nebulaResearchStroke";
import { grokChatCompletionsExtras } from "./lib/grokRequestPolicy";
import {
  addDesignReference,
  readDesignReferences,
  summarizeDesignReferencesForPrompt,
} from "./lib/nebulaDesignReferences";
import {
  cancelProjectBackgroundAttempts,
  resetProjectWorkspaceScratch,
} from "./lib/nebulaProjectReset";
import {
  buildV0PromptMarkdown,
  clampV0PromptForApi,
  hasRealV0ApiGeneration,
  readV0PromptMarkdown,
  saveCanonicalV0OriginalCopy,
  writeV0PromptMarkdown,
} from "./lib/nebulaUiStudioPipeline";
import { seedPreviewModelFromMasterPlan } from "./lib/visualUiEditorPreview";
import {
  runUiGenerationCycle,
  readCyclePolicy,
  readEnginePreviewModel,
  writeEnginePreviewModel,
  sanitizeEditorModelColors,
  shouldApplyUiToPreview,
  applyUiGenerationToPreviewShell,
} from "./lib/uiGenerationEngine";
import { MOCKUP_NON_AUTHORITATIVE_GO_BULLETS } from "./lib/codingMockupContract";
import {
  buildLocalPreCodingSummary,
  applyClampedSliceToSummary,
  buildCompactGoCodeUserPrompt,
  formatSlicePromptLine,
  isUsablePreCodingSummary,
  lockedUserConstraintsFromPlan,
  parseGoSliceLabel,
  shouldSkipPhaseALlm,
} from "./lib/goSliceContract";
import { classifyGoFailure, goBlocked } from "./lib/goBlockedReason";
import {
  buildCodedAppPreviewBridgeHtml,
  inferRoutesFromProductFiles,
  assessApplyRouteDepth,
  resolveAppPreviewAuthority,
  workspaceHasCodedAppUi,
  listProductUiFiles,
} from "./lib/workspaceCodedAppUi";
import {
  filterUnsolicitedBaaSBlocks,
  MVP_STACK_GO_BULLETS,
} from "./lib/mvpStackContract";
import {
  ensureRunnableSkeleton,
  inspectRunnableSkeleton,
  RUNNABLE_SKELETON_GO_BULLETS,
  runnableStatusLine,
  writtenPathsNeedRunnableSkeleton,
} from "./lib/runnableAppSkeleton";
import { runWorkspaceBuildCheck } from "./lib/workspaceBuildCheck";
import {
  INTERACTIVE_PREVIEW_GO_BULLETS,
  ensureInteractiveProductPreview,
  PRODUCT_PREVIEW_REL,
} from "./lib/interactiveProductPreview";
import {
  masterPlanKeyForTabIndex,
  normalizeMasterPlanRecord,
  parseMasterPlanBlock,
} from "./lib/masterPlanSections";
import {
  isAllowedV0WriteRel,
  normalizeV0WriteRel,
  pickPrimaryUiFile,
  v0CreateChat,
  v0ResolveChatFiles,
  v0SendChatMessage,
  type V0FileEntry,
} from "./lib/nebulaV0Client";
import { clearV0Pending, readV0Pending, writeV0Pending, expireStaleV0Pending, bumpV0PendingRecovery } from "./lib/nebulaV0Pending";
import { isV0StartJobActive, isV0StartStale, scheduleV0CreateChatJob, v0StartElapsedMs } from "./lib/nebulaV0StartJob";
import { NEBULA_V0_KEY_SETUP_HINT, resolveV0ApiKey, resolveV0ApiKeyFromRequest, V0_ENV_VAR } from "./lib/nebulaV0Resolver";
import { PRE_CODING_SUMMARY_KEY } from "./lib/masterPlanSections";
import {
  goCodePendingToPollResponse,
  isGoCodeJobActive,
  scheduleGoCodeJob,
} from "./lib/nebulaGoCodeJob";
import {
  consumeGoCodeResult,
  failGoCodePreparing,
  readGoCodePending,
  writeGoCodePending,
} from "./lib/nebulaGoCodePending";
import {
  callGrokGenerateUiSvg,
  heuristicSvgEditRisks,
  callGrokAnalyzeSvgEdit,
  callGrokAdaptUserSvg,
} from "./lib/nebulaUiStudioGrok";
import { getNebullaPersistRoot, getNebulaProjectDocsRoot } from "./lib/nebulaWorkspaceRoot";
import { ensureCloudProjectWorkspace } from "./lib/nebulaCloudProjectRoot";
import { registerSecurityScanRoutes } from "./lib/securityScan/registerSecurityScanRoutes";
import { registerCloudflareDnsRoutes } from "./lib/nebulaCloudflareDnsRoutes";
import { getCloudflareDnsStatus } from "./lib/nebulaCloudflareDns";
import { getProjectKeyFromRequest, sanitizeProjectKey } from "./lib/nebulaProjectKey";
import {
  emptyPreviewHtmlWithBridge,
  wrapHtmlWithPreviewRuntimeBridge,
} from "./src/lib/previewRuntimeBridgeScript";
import {
  isVisualEditorEligible,
  readUiGenerationV2PublicMeta,
  canPersistVisualPreviewModel,
  hasWorkspaceCodingShell,
  markV0FirstGenerationComplete,
  persistV0SessionMeta,
  readEditorState,
  readV0DemoUrl,
  writeEditorState,
  writeTimestampVersionDir,
  restoreImmutableV0IntoWorkspace,
  restoreVersionBackupIntoWorkspace,
  resolveOriginalV0FolderRel,
  sanitizeProjectNameForVersions,
  visualEditorPreviewAbs,
} from "./lib/visualUiEditorWorkspace";
import { buildSwarmHandoffParallel } from "./lib/nebulaSwarmHandoff";
import { readNebulaSwarmState } from "./lib/nebulaSwarmState";
import {
  addTokens,
  checkAndEnforceLimit,
  isFreeTierTokenLimitDisabled,
  TokenLimitExceededError,
} from "./lib/token-usage";
import multer from "multer";
import {
  contentTypeFromFilename,
  getMissingR2EnvVars,
  isR2Configured,
  probeR2Bucket,
  resolveR2Config,
  uploadProjectAsset,
  type UploadToR2Result,
} from "./lib/nebulaR2Storage";

type NebulaRequest = express.Request & { nebulaDiskKey?: string };

function xaiUsageTotal(usage: unknown): number {
  if (!usage || typeof usage !== "object") return 0;
  const t = (usage as { total_tokens?: number }).total_tokens;
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

/** Strip orchestration tags + code/CSS/Master Plan dumps before persisting assistant text. */
function stripAssistantTagsForMemory(text: string): string {
  return sanitizeAssistantChatText(text, {
    fallback: "",
  });
}

/** TEMPORARY: one-shot Claude response when Grok quota is exceeded (see lib/nebulaClaudeFallback.ts). */
async function respondWithClaudeQuotaFallback(
  messagesForApi: { role: string; content?: string }[],
  convScopeChat: { userId: string; projectKey: string; projectLabel: string },
  res: express.Response
): Promise<boolean> {
  const payload = await tryClaudeQuotaFallback(messagesForApi);
  if (!payload) return false;

  const responseText = payload.choices?.[0]?.message?.content || "";
  const cleanText = stripAssistantTagsForMemory(responseText);

  try {
    const lastUser = [...messagesForApi].reverse().find((m) => m.role === "user");
    if (lastUser && typeof lastUser.content === "string" && lastUser.content.length > 0) {
      appendConversationTurn(convScopeChat, "user", lastUser.content);
    }
    if (cleanText) {
      appendConversationTurn(convScopeChat, "assistant", cleanText);
    }
  } catch (logErr) {
    console.error("Conversation memory append failed (Claude fallback):", logErr);
  }

  res.json(payload);
  return true;
}

const REPO_ROOT = getNebullaPersistRoot();
/** Bundled template docs (seed for new cloud projects). */
const NEBULA_PROJECT_ROOT = getNebulaProjectDocsRoot(REPO_ROOT);

const resolveWorkspaceRelative = (workspaceRoot: string, relativePath: string): string => {
  const clean = String(relativePath || "").trim().replace(/^\.\/+/, "");
  const target = path.resolve(workspaceRoot, clean);
  if (!target.startsWith(workspaceRoot)) throw new Error("Access denied");
  return target;
};

const FILE_OPEN_MAX_BYTES = 2_000_000;

function getLanguageFromPath(filePath: string): string {
  const p = String(filePath || "").split("?")[0].toLowerCase();
  if (p.endsWith(".ts") || p.endsWith(".tsx")) return "typescript";
  if (p.endsWith(".js") || p.endsWith(".jsx")) return "javascript";
  if (p.endsWith(".md")) return "markdown";
  return "plaintext";
}

/** Convert a github.com blob URL (or raw URL) into a raw.githubusercontent.com URL. */
function toGitHubRawUrl(url: string, branch = "main"): string | null {
  try {
    const u = new URL(String(url || "").trim());
    const host = u.hostname.toLowerCase();
    if (host === "raw.githubusercontent.com") return u.toString();
    if (host !== "github.com" && host !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 5 && parts[2] === "blob") {
      const [owner, repo, , ref, ...rest] = parts;
      if (!rest.length) return null;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest.join("/")}`;
    }
    // path without /blob/ — treat remainder as file path under branch
    if (parts.length >= 3) {
      const [owner, repo, ...rest] = parts;
      if (!rest.length) return null;
      const safeBranch = String(branch || "main").replace(/[^\w.\-\/]/g, "") || "main";
      return `https://raw.githubusercontent.com/${owner}/${repo}/${safeBranch}/${rest.join("/")}`;
    }
    return null;
  } catch {
    return null;
  }
}

dotenv.config({ path: path.join(REPO_ROOT, ".env") });
const envLocalPath = path.join(REPO_ROOT, ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const mainAiEnvProbe = readMainAiApiKeyFromEnv();
if (mainAiEnvProbe.length < 20) {
  console.warn(
    `[nebula] ${MAIN_AI_ENV_VAR} is missing or shorter than 20 characters after trim — main AI chat and tools will return 401 until set (Render: set in the service Environment, not only in a local .env file). Legacy: MAIN_AI_API_KEY, GROK_API_KEY_LUMEN.`
  );
}

if (isFreeTierTokenLimitDisabled()) {
  console.warn(
    "[nebula] Free plan monthly AI token cap is OFF (default). Set ENFORCE_FREE_TIER_TOKEN_LIMIT=true to enable billing metering later.",
  );
} else {
  console.warn(
    "[nebula] Free plan monthly AI token cap is ON (ENFORCE_FREE_TIER_TOKEN_LIMIT). BYOK users are still exempt.",
  );
}

const r2MissingOnBoot = getMissingR2EnvVars();
if (r2MissingOnBoot.length > 0) {
  console.warn(
    `[nebula] Cloudflare R2 not configured (missing: ${r2MissingOnBoot.join(", ")}). File uploads and R2-backed assets will return 503 until set.`
  );
}

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

async function tryUploadBufferToR2(params: {
  projectKey: string;
  category: "images" | "assets" | "generated";
  filename: string;
  body: Buffer;
  contentType?: string;
}): Promise<UploadToR2Result | null> {
  if (!isR2Configured()) return null;
  try {
    return await uploadProjectAsset(params);
  } catch (err) {
    console.warn("[r2] upload failed:", err);
    return null;
  }
}

async function r2FieldsForSvg(
  projectKey: string,
  svg: string,
  filename: string
): Promise<{ assetKey?: string; assetUrl?: string }> {
  const uploaded = await tryUploadBufferToR2({
    projectKey,
    category: "generated",
    filename,
    body: Buffer.from(svg, "utf8"),
    contentType: "image/svg+xml",
  });
  if (!uploaded) return {};
  return { assetKey: uploaded.key, assetUrl: uploaded.url };
}

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

const resolveMainGrokApiKey = createResolveMainGrokApiKey(readNebulaSessionUserId);
const resolveMainGrokApiKeyDetailed = createResolveMainGrokApiKeyDetailed(readNebulaSessionUserId);

async function startServer() {
  initGuardianProcessHandlers();
  const { assertProductionSecretsOrExit } = await import("./lib/assertProductionSecrets");
  assertProductionSecretsOrExit();
  logOpsReadinessAtBoot();

  // Behind Railway / Render / Fly / nginx / Docker — correct client IPs and secure cookies.
  app.set("trust proxy", 1);

  app.use(express.json({ limit: '50mb' }) as any);
  app.use(express.urlencoded({ extended: true, limit: '50mb' }) as any);
  app.use(createApiRateLimitGate());

  await mountRenderStack(app);

  app.use(async (req, _res, next) => {
    try {
      (req as NebulaRequest).nebulaDiskKey = await resolveNebulaProjectDiskKey(req);
    } catch {
      (req as NebulaRequest).nebulaDiskKey = getProjectKeyFromRequest(req);
    }
    next();
  });

  const projectDiskKey = (req: express.Request) =>
    (req as NebulaRequest).nebulaDiskKey ?? getProjectKeyFromRequest(req);

  // LOGGING MIDDLEWARE
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
  app.get("/api/health", (_req, res) => {
    const ops = getOpsReadiness();
    res.json({
      status: "ok",
      workspaceStorageMode: ops.workspaceStorageMode,
      durableWorkspaceOk: ops.durableWorkspaceOk,
      billingEnabled: ops.billingEnabled,
      warnings: ops.warnings.length,
    });
  });

  app.get("/api/ops/readiness", (_req, res) => {
    res.json({ ok: true, ...getOpsReadiness() });
  });

  // Side job only — does not block Generate / workflow / coding
  registerFigmaIngestAdminRoutes(app, process.cwd());

  app.get("/api/storage/status", async (_req, res) => {
    const missing = getMissingR2EnvVars();
    if (missing.length > 0) {
      return res.json({
        configured: false,
        missing,
        hint: `Set ${missing.join(", ")} (or R2_* aliases) in .env / Render for Cloudflare R2.`,
      });
    }
    const resolved = resolveR2Config();
    const bucket = resolved.ok === true ? resolved.config.bucketName : undefined;
    try {
      const probe = await probeR2Bucket();
      return res.json({
        configured: true,
        bucket,
        reachable: probe.ok,
        ...(probe.ok === false ? { error: probe.error } : {}),
      });
    } catch (e) {
      return res.status(500).json({
        error: e instanceof Error ? e.message : "R2 status check failed",
      });
    }
  });

  app.post(
    "/api/storage/upload",
    (req, res, next) => {
      uploadMemory.single("file")(req, res, (err: unknown) => {
        if (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return res.status(400).json({ error: msg });
        }
        next();
      });
    },
    async (req, res) => {
      const keyRes = resolveR2Config();
      if (keyRes.ok === false) {
        return res.status(503).json({
          error: keyRes.message,
          missing: keyRes.missing,
          hint: `Set ${keyRes.missing.join(", ")} in .env for Cloudflare R2.`,
        });
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ error: "file is required (multipart field name: file)" });
      }
      const rawCategory = typeof req.body?.category === "string" ? req.body.category.trim().toLowerCase() : "assets";
      const category =
        rawCategory === "images" || rawCategory === "generated" ? rawCategory : "assets";
      const filename =
        (typeof req.body?.filename === "string" && req.body.filename.trim()) ||
        file.originalname ||
        "upload.bin";
      try {
        const pk = projectDiskKey(req);
        const uploaded = await uploadProjectAsset({
          projectKey: pk,
          category,
          filename,
          body: file.buffer,
          contentType: file.mimetype || contentTypeFromFilename(filename),
        });
        return res.json({
          ok: true,
          key: uploaded.key,
          url: uploaded.url,
          bucket: uploaded.bucket,
          contentType: file.mimetype || contentTypeFromFilename(filename),
          size: file.size,
        });
      } catch (e) {
        console.error("[storage/upload]", e);
        return res.status(500).json({
          error: e instanceof Error ? e.message : "Upload to R2 failed",
        });
      }
    }
  );

  app.get("/api/config", async (req, res) => {
    await ensureDbReady();
    const grok = readMainAiApiKeyFromEnv();
    const mainAiProvider = grok.length >= 20 ? detectMainAiProvider(grok) : "unknown";
    const mainAiChatModel = grok.length >= 20 ? resolveMainAiChatModel(mainAiProvider) : undefined;
    // Sidecars share MAIN_API_KEY_GROK unless a dedicated override env is set.
    const grokSwarm = readPlatformSwarmApiKey();
    const tts = readPlatformTtsApiKey();
    const writer = readPlatformWriterApiKey();
    const render = getRenderPublicConfig();
    const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim() || "";
    const pencilKey = resolvePencilApiKey();
    const v0KeyRes = resolveV0ApiKeyFromRequest(req);
    const pp = ensureCloudProjectWorkspace(REPO_ROOT, NEBULA_PROJECT_ROOT, projectDiskKey(req));

    let byok = {
      xai: { configured: false as boolean, tail: undefined as string | undefined },
      anthropic: { configured: false as boolean, tail: undefined as string | undefined },
      openai: { configured: false as boolean, tail: undefined as string | undefined },
    };
    let hasUserByok = false;
    const uid = readNebulaSessionUserId(req);
    const pool = getPlatformQueryable();
    if (uid && pool) {
      try {
        const status = await getUserByokStatus(pool, uid);
        byok = {
          xai: { configured: status.xai.configured, tail: status.xai.tail },
          anthropic: { configured: status.anthropic.configured, tail: status.anthropic.tail },
          openai: { configured: status.openai.configured, tail: status.openai.tail },
        };
        hasUserByok = hasAnyByokConfigured(status);
      } catch {
        /* ignore — config still returns env flags */
      }
    }

    const hasPlatformMain = grok.length >= 20;
    const hasClientByok = requestHasClientAiKey(req);
    const hasMainAi =
      hasPlatformMain ||
      hasClientByok ||
      byok.xai.configured ||
      byok.anthropic.configured ||
      byok.openai.configured;

    res.json({
      ...render,
      publicSiteUrl,
      githubClientId: process.env.GITHUB_CLIENT_ID || process.env.github_client_id,
      builderPublicKey: process.env.BUILDER_PUBLIC_KEY,
      hasMainAiApiKey: hasMainAi,
      hasGrokApiKey: hasMainAi,
      hasPlatformMainAiApiKey: hasPlatformMain,
      hasUserByok,
      byok,
      mainAiKeyTail: byok.xai.tail || mainAiApiKeyTail(),
      freeTierTokenLimitDisabled: isFreeTierTokenLimitDisabled(),
      /** Checkout live only when BILLING_ENABLED=true (beta defaults off). */
      billingEnabled: process.env.BILLING_ENABLED === "true",
      mainAiProvider,
      mainAiChatModel,
      hasGrokSwarmApiKey: grokSwarm.length >= 20,
      mainAiKeyHint: MAIN_AI_KEY_SETUP_HINT,
      grokKeyHint: MAIN_AI_KEY_SETUP_HINT,
      hasGrokTtsKey: tts.length >= 20,
      hasGrokWriterKey: writer.length >= 20,
      hasV0ApiKey: isLegacyV0ApiFrozen() ? false : v0KeyRes.ok === true,
      v0ApiFrozen: isLegacyV0ApiFrozen(),
      v0KeyHint: isLegacyV0ApiFrozen()
        ? LEGACY_V0_FROZEN_MESSAGE
        : NEBULA_V0_KEY_SETUP_HINT,
      hasR2Storage: isR2Configured(),
      r2MissingEnv: r2MissingOnBoot,
      r2StorageHint:
        r2MissingOnBoot.length > 0
          ? `Set ${r2MissingOnBoot.join(", ")} in .env for Cloudflare R2 uploads.`
          : undefined,
      d1ProvisioningReady: Boolean(render.d1ProvisioningReady),
      cloudflareDnsReady: getCloudflareDnsStatus().ready,
      cloudflareDnsHint: getCloudflareDnsStatus().hint,
      pencilMockupsReady: isPencilApiFrozen() ? false : Boolean(pencilKey),
      pencilApiFrozen: isPencilApiFrozen(),
      nebulaUiStudioDemo: Boolean(
        (isPencilApiFrozen() || !pencilKey) && useBundledDemoMockupWithoutKey(),
      ),
      workspaceMode: "cloud",
      hasActiveWorkspace: true,
      activeWorkspacePath: null,
      cloudProjectKey: pp.projectKey,
      ...(() => {
        const ops = getOpsReadiness();
        return {
          workspaceStorageMode: ops.workspaceStorageMode,
          durableWorkspaceOk: ops.durableWorkspaceOk,
          opsWarnings: ops.warnings,
          syntheticIsolation: true as const,
        };
      })(),
    });
  });

  /** Cloud workspace metadata (no local folder selection). */
  app.get("/api/workspace/active", (req, res) => {
    const pp = ensureCloudProjectWorkspace(REPO_ROOT, NEBULA_PROJECT_ROOT, projectDiskKey(req));
    const q = (req.query || {}) as Record<string, unknown>;
    const projectName =
      typeof q.projectName === "string" && q.projectName.trim()
        ? String(q.projectName).trim()
        : "Untitled Project";
    res.json({
      mode: "cloud",
      projectKey: pp.projectKey,
      projectName,
      workspaceRoot: pp.workspaceRoot,
      workspaceRootLabel: `data/cloud-projects/${pp.projectKey}`,
      activePath: null,
      configuredPath: null,
      exists: fs.existsSync(pp.workspaceRoot),
    });
  });

  app.post("/api/workspace/active", (_req, res) => {
    res.status(410).json({
      error: "Local folder binding is disabled. Projects use server-side cloud workspaces per project key.",
    });
  });

  const projectPathsFor = (req: express.Request) =>
    ensureCloudProjectWorkspace(REPO_ROOT, NEBULA_PROJECT_ROOT, projectDiskKey(req));

  registerSecurityScanRoutes(app, {
    projectPathsFor: (req) => {
      const pp = projectPathsFor(req);
      return { workspaceRoot: pp.workspaceRoot, projectKey: pp.projectKey };
    },
    projectNameFromReq: (req) => {
      const fromBody = typeof req.body?.projectName === "string" ? req.body.projectName.trim() : "";
      const fromQuery =
        typeof req.query.projectName === "string" ? String(req.query.projectName).trim() : "";
      return fromBody || fromQuery || undefined;
    },
  });

  registerCloudflareDnsRoutes(app, {
    projectPathsFor: (req) => {
      const pp = projectPathsFor(req);
      return { workspaceRoot: pp.workspaceRoot, projectKey: pp.projectKey };
    },
  });

  /** Optional: download active cloud project as a tar.gz archive. */
  app.get("/api/cloud-project/download", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="nebula-cloud-${pp.projectKey}.tar.gz"`);
      const child = spawn("tar", ["-czf", "-", "-C", pp.workspaceRoot, "."], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stderr.on("data", () => {});
      child.stdout.pipe(res);
      child.on("error", (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: err instanceof Error ? err.message : "tar failed" });
        }
      });
      child.on("close", (code) => {
        if (code !== 0 && !res.headersSent) {
          res.status(500).json({ error: `tar exited ${code}` });
        }
      });
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ error: e instanceof Error ? e.message : "download failed" });
      }
    }
  });

  const readSkillDesignSystemExcerpt = (workspaceRoot: string): string => {
    const candidates = [path.join(workspaceRoot, "SKILL.md"), path.join(NEBULA_PROJECT_ROOT, "SKILL.md")];
    for (const skillPath of candidates) {
      if (!fs.existsSync(skillPath)) continue;
      try {
        let raw = fs.readFileSync(skillPath, "utf8").replace(/^---[\s\S]*?---\s*/m, "").trim();
        if (raw.length > 14000) raw = `${raw.slice(0, 14000)}\n…`;
        return raw;
      } catch {
        /* try next */
      }
    }
    return "";
  };

  const ensureNebulaUiStudioFileAt = (nebulaUiStudioPath: string) => {
    if (!fs.existsSync(nebulaUiStudioPath)) {
      fs.mkdirSync(path.dirname(nebulaUiStudioPath), { recursive: true });
      const seedPath = path.join(NEBULA_PROJECT_ROOT, "nebula-ui-studio.md");
      const fallback = `<!--
NEBULA_UI_STUDIO_PROMPT
No prompt generated yet.
-->

<!--
NEBULA_UI_STUDIO_CODE
No approved UI code yet.
-->
`;
      const body = fs.existsSync(seedPath) ? fs.readFileSync(seedPath, "utf8") : fallback;
      fs.writeFileSync(nebulaUiStudioPath, body, "utf8");
    }
  };

  const extractNebulaCommentSection = (
    content: string,
    key: "NEBULA_UI_STUDIO_PROMPT" | "NEBULA_UI_STUDIO_CODE"
  ): string => {
    const re = new RegExp(`<!--\\s*${key}\\n([\\s\\S]*?)-->`, "m");
    const match = content.match(re);
    return match?.[1]?.trim() || "";
  };

  const upsertNebulaCommentSection = (
    content: string,
    key: "NEBULA_UI_STUDIO_PROMPT" | "NEBULA_UI_STUDIO_CODE",
    value: string
  ): string => {
    const normalized = value.trim() || (key === "NEBULA_UI_STUDIO_PROMPT" ? "No prompt generated yet." : "No approved UI code yet.");
    const section = `<!--\n${key}\n${normalized}\n-->`;
    const re = new RegExp(`<!--\\s*${key}[\\s\\S]*?-->`, "m");
    if (re.test(content)) return content.replace(re, section);
    return `${section}\n\n${content}`;
  };

  const mirrorV0PromptToStudioFile = (pp: ReturnType<typeof projectPathsFor>, promptContent: string) => {
    ensureNebulaUiStudioFileAt(pp.nebulaUiStudioPath);
    const studioExisting = fs.readFileSync(pp.nebulaUiStudioPath, "utf8");
    fs.writeFileSync(
      pp.nebulaUiStudioPath,
      upsertNebulaCommentSection(studioExisting, "NEBULA_UI_STUDIO_PROMPT", promptContent),
      "utf8",
    );
  };

  /**
   * Rebuild ui-brief.md (primary) + v0-prompt.md (legacy) from Master Plan.
   * Studio prompt mirror prefers the full ui-brief.
   * Returns v0 content for backward-compatible callers; also exposes uiBrief.
   */
  const ensureV0PromptSynced = (
    pp: ReturnType<typeof projectPathsFor>,
  ): { content: string; synced: boolean; uiBrief: string; uiBriefSynced: boolean } => {
    try {
      const prevBrief = readUiBriefMarkdown(pp.workspaceRoot).trim();
      const prevV0 = readV0PromptMarkdown(pp.workspaceRoot).trim();
      const arts = syncUiArtifactsFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      const uiBrief = arts.uiBrief.content.trim();
      const content = arts.v0Prompt.content.trim();
      mirrorV0PromptToStudioFile(pp, uiBrief || content);
      return {
        content,
        synced: content !== prevV0,
        uiBrief,
        uiBriefSynced: uiBrief !== prevBrief,
      };
    } catch (e) {
      console.warn("[ensureV0PromptSynced]", e);
      return {
        content: readV0PromptMarkdown(pp.workspaceRoot).trim(),
        synced: false,
        uiBrief: readUiBriefMarkdown(pp.workspaceRoot).trim(),
        uiBriefSynced: false,
      };
    }
  };

  const writeV0FilesToWorkspace = (
    workspaceRoot: string,
    files: V0FileEntry[]
  ): { written: string[]; skipped: string[]; filesMap: Record<string, string> } => {
    const written: string[] = [];
    const skipped: string[] = [];
    const filesMap: Record<string, string> = {};
    const seen = new Set<string>();
    for (const f of files) {
      const rel = normalizeV0WriteRel(f.name);
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (!isAllowedV0WriteRel(rel)) {
        skipped.push(rel);
        continue;
      }
      const target = path.resolve(workspaceRoot, rel);
      if (!target.startsWith(workspaceRoot)) {
        skipped.push(rel);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.content, "utf8");
      written.push(rel);
      filesMap[rel] = f.content;
    }
    return { written, skipped, filesMap };
  };

  const buildV0PromptTextForRequest = (
    req: express.Request,
    body: Record<string, unknown>,
  ): { promptText: string; projectDisplayName?: string } => {
    const pp = projectPathsFor(req);
    ensureNebulaUiStudioFileAt(pp.nebulaUiStudioPath);

    // Rebuild concise brief from Master Plan (§4 routes + §5 visuals + project type).
    // Do not re-append full §5 — that bloated prompts and truncated routes first.
    const synced = ensureV0PromptSynced(pp);
    let combined = synced.content.trim();
    if (!combined) {
      combined = readV0PromptMarkdown(pp.workspaceRoot).trim();
    }

    const skillExcerpt = readSkillDesignSystemExcerpt(pp.workspaceRoot);
    const extra = typeof body.message === "string" ? body.message.trim() : "";
    const projectDisplayName =
      typeof body.projectDisplayName === "string" && body.projectDisplayName.trim()
        ? String(body.projectDisplayName).trim()
        : undefined;
    const skillBlock = skillExcerpt
      ? `Design system (SKILL.md):\n${skillExcerpt.slice(0, 200)}`
      : "";
    const promptTextRaw = [combined, skillBlock, extra].filter(Boolean).join("\n\n");
    return { promptText: clampV0PromptForApi(promptTextRaw), projectDisplayName };
  };

  const applyV0FilesToWorkspace = (
    req: express.Request,
    v0Files: V0FileEntry[],
    opts: { chatId: string; message: string; demoUrl?: string; projectDisplayName?: string },
  ):
    | {
        ok: true;
        chatId: string;
        written: string[];
        skipped: string[];
        demoUrl?: string;
      }
    | { ok: false; status: number; error: string } => {
    const { workspaceRoot, nebulaUiStudioPath, masterPlanPath } = projectPathsFor(req);
    const normalized = v0Files.map((f) => ({
      name: normalizeV0WriteRel(f.name),
      content: f.content,
    }));
    const { written, skipped, filesMap } = writeV0FilesToWorkspace(workspaceRoot, normalized);

    if (written.length === 0) {
      if (skipped.length > 0) {
        return {
          ok: false,
          status: 422,
          error: `v0 returned ${v0Files.length} file(s) but none matched allowed paths (src/, app/, components/, etc.). Skipped: ${skipped.slice(0, 6).join(", ")}`,
        };
      }
      return {
        ok: false,
        status: 422,
        error:
          "v0 returned no usable files. Ensure nebula-ui-studio/v0-prompt.md has Master Plan §4+§5 content, then try again.",
      };
    }

    const projectNameSafe = sanitizeProjectNameForVersions(
      opts.projectDisplayName?.trim() || getProjectKeyFromRequest(req),
    );
    // Mark complete only after real workspace writes succeeded
    markV0FirstGenerationComplete(workspaceRoot, projectNameSafe, {
      files: filesMap,
      source: "v0-api",
      notes: "Nebula UI Studio v0 generation",
    });
    saveCanonicalV0OriginalCopy(workspaceRoot, filesMap);
    seedPreviewModelFromMasterPlan(
      workspaceRoot,
      masterPlanPath,
      opts.projectDisplayName?.trim() || "Untitled Project",
    );

    ensureNebulaUiStudioFileAt(nebulaUiStudioPath);
    const existing = fs.readFileSync(nebulaUiStudioPath, "utf8");
    const promptFromDisk = readV0PromptMarkdown(workspaceRoot) || opts.message.slice(0, 120000);
    const withPrompt = upsertNebulaCommentSection(existing, "NEBULA_UI_STUDIO_PROMPT", promptFromDisk);
    const primaryCode = pickPrimaryUiFile(normalized.filter((f) => written.includes(f.name)));
    const withCode = upsertNebulaCommentSection(withPrompt, "NEBULA_UI_STUDIO_CODE", primaryCode);
    fs.writeFileSync(nebulaUiStudioPath, withCode, "utf8");
    clearV0Pending(workspaceRoot);
    persistV0SessionMeta(workspaceRoot, { demoUrl: opts.demoUrl, chatId: opts.chatId });

    return {
      ok: true,
      chatId: opts.chatId,
      written,
      skipped,
      demoUrl: opts.demoUrl,
    };
  };

  const runV0PollPass = async (
    req: express.Request,
    chatId: string,
    projectDisplayName?: string,
    promptText?: string,
  ): Promise<
    | { ok: true; pending: true; chatId: string; versionStatus?: string; demoUrl?: string }
    | {
        ok: true;
        pending: false;
        chatId: string;
        written: string[];
        skipped: string[];
        demoUrl?: string;
        source: "v0";
      }
    | { ok: false; status: number; error: string; hint?: string }
  > => {
    const keyRes = resolveV0ApiKeyFromRequest(req);
    if (keyRes.ok === false) {
      return {
        ok: false,
        status: keyRes.code === "INVALID_LENGTH" ? 400 : 401,
        error: keyRes.message,
        hint: keyRes.hint,
      };
    }

    const resolved = await v0ResolveChatFiles(keyRes.apiKey, chatId);
    let v0Files = resolved.files;
    let demoUrl = resolved.demoUrl;
    const status = resolved.versionStatus;

    if (v0Files.length === 0) {
      if (status === "failed") {
        const { workspaceRoot } = projectPathsFor(req);
        clearV0Pending(workspaceRoot);
        return {
          ok: false,
          status: 422,
          error: "v0 generation failed on the v0 side. Try again with a shorter prompt.",
        };
      }
      if (status === "pending" || status === undefined) {
        console.log(
          `[v0-poll] chat=${chatId.slice(0, 12)}… status=${status ?? "unknown"} files=0 demo=${demoUrl ? "yes" : "no"}`,
        );
        return {
          ok: true,
          pending: true,
          chatId,
          versionStatus: status ?? "pending",
          demoUrl,
        };
      }
      return {
        ok: false,
        status: 422,
        error:
          "v0 finished but returned no files. Check nebula-ui-studio/v0-prompt.md or regenerate on v0.dev.",
        hint: demoUrl ? `Preview may still be available: ${demoUrl}` : undefined,
      };
    }

    const pending = readV0Pending(projectPathsFor(req).workspaceRoot);
    const message = promptText ?? pending?.promptPreview ?? "v0 UI generation";
    const applied = applyV0FilesToWorkspace(req, v0Files, {
      chatId,
      message,
      demoUrl,
      projectDisplayName,
    });
    if (applied.ok === false) return applied;
    return { ok: true, pending: false, ...applied, source: "v0" };
  };

  const kickV0BackgroundStart = (
    req: express.Request,
    workspaceRoot: string,
    apiKey: string,
    promptText: string,
    projectDisplayName?: string,
  ): void => {
    writeV0Pending(workspaceRoot, {
      chatId: "",
      startedAt: Date.now(),
      projectDisplayName,
      promptPreview: promptText.slice(0, 500),
      starting: true,
    });
    scheduleV0CreateChatJob({
      workspaceRoot,
      apiKey,
      promptText,
      projectDisplayName,
      applyFiles: (files, chatId, demoUrl) => {
        const applied = applyV0FilesToWorkspace(req, files, {
          chatId,
          message: promptText,
          demoUrl,
          projectDisplayName,
        });
        if (applied.ok === false) return { ok: false as const, error: applied.error };
        return {
          ok: true as const,
          written: applied.written,
          skipped: applied.skipped,
          demoUrl: applied.demoUrl,
        };
      },
    });
  };

  const V0_HTTP_POLL_ROUNDS = 8;
  const V0_HTTP_POLL_MS = 2500;
  const v0PollSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  type V0PassResult =
    | {
        ok: true;
        chatId: string;
        written: string[];
        skipped: string[];
        demoUrl?: string;
        pending?: false;
        source?: "v0";
      }
    | {
        ok: false;
        status: number;
        error: string;
        hint?: string;
        pending?: boolean;
        chatId?: string;
      };

  /** Start or resume v0, poll briefly (Render-safe), return files or pending chatId. */
  const runV0UiStudioPass = async (opts: {
    req: express.Request;
    message: string;
    chatId?: string;
    projectDisplayName?: string;
    /** When true, never call v0CreateChat — only poll an existing pending chat. */
    resumeOnly?: boolean;
  }): Promise<V0PassResult> => {
    const keyRes = resolveV0ApiKeyFromRequest(opts.req);
    if (keyRes.ok === false) {
      return {
        ok: false,
        status: keyRes.code === "INVALID_LENGTH" ? 400 : 401,
        error: keyRes.message,
        hint: keyRes.hint,
      };
    }

    const { workspaceRoot } = projectPathsFor(opts.req);
    let chatId = opts.chatId?.trim() || "";
    let promptPreview = opts.message.slice(0, 500);

    if (!chatId && opts.resumeOnly) {
      const pending = readV0Pending(workspaceRoot);
      chatId = pending?.chatId ?? "";
      if (pending?.promptPreview) promptPreview = pending.promptPreview;
    }

    if (!chatId && !opts.resumeOnly) {
      const existing = readV0Pending(workspaceRoot);
      if (existing?.chatId && !hasRealV0ApiGeneration(workspaceRoot)) {
        chatId = existing.chatId;
        if (existing.promptPreview) promptPreview = existing.promptPreview;
      }
    }

    if (!chatId && !opts.resumeOnly) {
      const v0Call = await v0CreateChat(keyRes.apiKey, opts.message);
      if (v0Call.ok === false) {
        return { ok: false, status: v0Call.status, error: v0Call.error };
      }
      chatId = v0Call.result.chatId;
      writeV0Pending(workspaceRoot, {
        chatId,
        startedAt: Date.now(),
        projectDisplayName: opts.projectDisplayName,
        promptPreview,
      });
      if (v0Call.result.files.length > 0) {
        const applied = applyV0FilesToWorkspace(opts.req, v0Call.result.files, {
          chatId,
          message: opts.message,
          demoUrl: v0Call.result.demoUrl,
          projectDisplayName: opts.projectDisplayName,
        });
        if (applied.ok === true) return { ...applied, source: "v0" };
      }
    } else if (chatId && opts.message.trim() && opts.chatId) {
      const sent = await v0SendChatMessage(keyRes.apiKey, chatId, opts.message);
      if (sent.ok === false) {
        return { ok: false, status: sent.status, error: sent.error };
      }
      writeV0Pending(workspaceRoot, {
        chatId,
        startedAt: Date.now(),
        projectDisplayName: opts.projectDisplayName,
        promptPreview: opts.message.slice(0, 500),
      });
      if (sent.result.files.length > 0) {
        const applied = applyV0FilesToWorkspace(opts.req, sent.result.files, {
          chatId,
          message: opts.message,
          demoUrl: sent.result.demoUrl,
          projectDisplayName: opts.projectDisplayName,
        });
        if (applied.ok === true) return { ...applied, source: "v0" };
      }
    } else if (!chatId) {
      return {
        ok: false,
        status: 400,
        error: "No v0 chat in progress. Start generation first.",
        hint: "Call /api/nebula-ui-studio/v0-start or Generate UI with v0.",
      };
    }

    for (let i = 0; i < V0_HTTP_POLL_ROUNDS; i++) {
      const pass = await runV0PollPass(
        opts.req,
        chatId,
        opts.projectDisplayName,
        promptPreview,
      );
      if (pass.ok === true && pass.pending === false) {
        return { ...pass, source: "v0" };
      }
      if (pass.ok === false) {
        return pass;
      }
      if (i < V0_HTTP_POLL_ROUNDS - 1) await v0PollSleep(V0_HTTP_POLL_MS);
    }

    return {
      ok: false,
      status: 200,
      pending: true,
      chatId,
      error: "v0 is still generating.",
      hint:
        "Credits may already have been used. Click Generate again to resume polling — no new v0 chat is created until files land.",
    };
  };

  /** Hide legacy bundled Grok/orchestration copy in API responses so the Master Plan UI stays blank until real sections are written. */
  function sanitizeMasterPlanForClientResponse(plan: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...plan };
    const checks: [string, (v: string) => boolean][] = [
      ["1. Goal of the app", (v) => v.includes("First question exact wording, alone in that message")],
      ["2. Tech Research", (v) => v.includes("**Market**: Competitors (Proloquo2Go")],
      ["3. Features and KPIs", (v) => v.includes("8 core features grouped into 4 modules")],
      ["4. Pages and navigation", (v) => v.includes("12 lean pages. Kid: Bottom tabs")],
      ["5. UI/UX design", (v) => v.includes("Nebula UI Studio workflow (canonical)")],
      ["6. Environment Setup", (v) => v.includes("## Render workspaces & internal identity (canonical)")],
    ];
    for (const [key, pred] of checks) {
      const raw = out[key];
      if (typeof raw !== "string") continue;
      try {
        if (pred(raw)) out[key] = "";
      } catch {
        /* ignore */
      }
    }
    return out;
  }

  app.get("/api/master-plan/read", (req, res) => {
    try {
      const { masterPlanPath } = projectPathsFor(req);
      if (!fs.existsSync(masterPlanPath)) {
        return res.status(404).json({ error: "Master plan data not found" });
      }
      const { workspaceRoot } = projectPathsFor(req);
      const plan = hydrateAndPersistMasterPlan(
        workspaceRoot,
        masterPlanPath
      );
      res.json(sanitizeMasterPlanForClientResponse(plan));
    } catch (error) {
      console.error("Error reading master plan:", error);
      res.status(500).json({ error: "Failed to read master plan" });
    }
  });

  /**
   * Markdown technical documentation export (Master Plan + non-secret ops context).
   * Same project resolution as Master Plan read — never includes secrets/env values.
   */
  app.get("/api/master-plan/technical-documentation", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      let plan: Record<string, unknown> = {};
      if (fs.existsSync(pp.masterPlanPath)) {
        try {
          plan = sanitizeMasterPlanForClientResponse(
            hydrateAndPersistMasterPlan(pp.workspaceRoot, pp.masterPlanPath) as Record<
              string,
              unknown
            >,
          );
        } catch {
          plan = {};
        }
      }

      const projectNameParam = req.query.projectName;
      const projectNameRaw = Array.isArray(projectNameParam)
        ? String(projectNameParam[0] ?? "").trim()
        : typeof projectNameParam === "string"
          ? projectNameParam.trim()
          : "";
      const projectName = projectNameRaw || "Untitled Project";
      const ops = getOpsReadiness();
      const completeness = assessMasterPlanCompletenessWithWorkspace({
        plan,
        mode: resolveMasterPlanStrictMode(pp.workspaceRoot),
        workspaceRoot: pp.workspaceRoot,
        checkUiBrief: false,
      });

      const exportResult = buildTechnicalDocumentationMarkdown(plan, {
        projectName,
        projectKey: pp.projectKey,
        generatedAt: new Date().toISOString(),
        hosting: {
          workspaceStorageMode: ops.workspaceStorageMode,
          durableWorkspaceOk: ops.durableWorkspaceOk,
          hasR2Storage: ops.r2CredentialsConfigured || ops.workspaceR2Ready,
          syntheticIsolation: true,
          notes: [
            "Shared Nebulla platform service; project isolation via workspace ids",
            ...(ops.warnings.length
              ? [`Known platform warnings: ${ops.warnings.length} (see ops readiness; details not expanded here)`]
              : []),
          ],
        },
        gaps: completeness.gaps.map((g) => ({
          code: g.code,
          message: g.message,
          section: g.section,
        })),
        strictMode: completeness.mode,
      });

      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportResult.filename.replace(/"/g, "")}"`,
      );
      if (exportResult.warnings?.length) {
        res.setHeader("X-Nebulla-Export-Warnings", exportResult.warnings.join("; ").slice(0, 500));
      }
      return res.status(200).send(exportResult.markdown);
    } catch (error) {
      console.error("Error exporting technical documentation:", error);
      return res.status(500).json({ error: "Failed to export technical documentation" });
    }
  });

  /** Completeness gaps for UI badge / Go gate (MASTER_PLAN_STRICT=off|warn|strict).
   * Phase 3: IF plan usable AND brief missing/short/no pages → auto-build from §4/§5 + goal. */
  app.get("/api/master-plan/status", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      let plan: Record<string, unknown> = {};
      let uiBriefLength = 0;
      let uiBriefPageCount = 0;
      if (fs.existsSync(pp.masterPlanPath)) {
        try {
          const arts = syncUiArtifactsFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
          plan = arts.plan;
          uiBriefLength = arts.uiBrief.content.length;
          uiBriefPageCount = parsePagesFromUiBrief(arts.uiBrief.content).length;
          mirrorV0PromptToStudioFile(pp, arts.uiBrief.content || arts.v0Prompt.content);
        } catch {
          plan = hydrateAndPersistMasterPlan(pp.workspaceRoot, pp.masterPlanPath) as Record<
            string,
            unknown
          >;
          const brief = readUiBriefMarkdown(pp.workspaceRoot);
          uiBriefLength = brief.length;
          uiBriefPageCount = parsePagesFromUiBrief(brief).length;
        }
      }
      // Auto-merge security/sign-in assumptions into §2 (asset). Never wait on Accept for MVP.
      let securityAutoApplied = false;
      try {
        const ensured = ensureSecurityBaselineInPlan(plan as Record<string, string>);
        if (ensured.applied) {
          plan = ensured.plan;
          securityAutoApplied = true;
          fs.mkdirSync(path.dirname(pp.masterPlanPath), { recursive: true });
          fs.writeFileSync(pp.masterPlanPath, JSON.stringify(ensured.plan, null, 2), "utf8");
        } else {
          plan = ensured.plan;
        }
      } catch {
        /* non-fatal */
      }

      // SEC_* are warn-only; soften is a safety net for residual blocks.
      let completeness = assessMasterPlanCompletenessWithWorkspace({
        plan,
        mode: resolveMasterPlanStrictMode(pp.workspaceRoot),
        workspaceRoot: pp.workspaceRoot,
        checkUiBrief: true,
      });
      completeness = softenSecurityBlocksForMvpGo(completeness);
      // Optional acknowledgment only — coding/Go must not depend on this.
      const securityProposal = buildSecurityBaselineProposal(plan);
      const section1 = String((plan as Record<string, string>)["1. Goal of the app"] || "");
      const qName = typeof req.query.projectName === "string" ? req.query.projectName : "";
      const goalForResearch = inferGoalFromPlanRecord(plan as Record<string, unknown>, [
        section1,
        qName,
      ]);
      const researchGate = assessResearchArtifact(pp.workspaceRoot, {
        goal: goalForResearch,
        goalCandidates: [section1, qName],
        plan: plan as Record<string, unknown>,
      });
      res.json({
        mode: completeness.mode,
        ok: completeness.ok,
        allowGo: completeness.allowGo,
        shape: completeness.shape,
        gaps: completeness.gaps,
        sectionLengths: completeness.sectionLengths,
        uiBriefLength,
        uiBriefPageCount,
        researchOk: researchGate.ok,
        researchCompetitorCount: researchGate.competitorCount,
        researchReasons: researchGate.reasons,
        researchSkipped: researchGate.skipped,
        securityAutoApplied,
        securityProposal: securityProposal
          ? {
              needed: true,
              optional: true,
              sectionKey: securityProposal.sectionKey,
              draftMarkdown: securityProposal.draftMarkdown,
            }
          : null,
      });
    } catch (error) {
      console.error("Error reading master plan status:", error);
      res.status(500).json({ error: "Failed to assess master plan" });
    }
  });

  /** Optional acknowledgment — append security assumptions to §2 (Go does not require this). */
  app.post("/api/master-plan/accept-security-baseline", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      let raw: Record<string, string> = {};
      if (fs.existsSync(pp.masterPlanPath)) {
        raw = JSON.parse(fs.readFileSync(pp.masterPlanPath, "utf8")) as Record<string, string>;
      }
      const ensured = ensureSecurityBaselineInPlan(raw);
      if (!ensured.applied) {
        return res.json({ ok: true, applied: false, reason: "already_present" });
      }
      fs.mkdirSync(path.dirname(pp.masterPlanPath), { recursive: true });
      fs.writeFileSync(pp.masterPlanPath, JSON.stringify(ensured.plan, null, 2), "utf8");
      try {
        syncUiArtifactsFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      } catch {
        /* ignore */
      }
      res.json({ ok: true, applied: true, sectionKey: ensured.sectionKey });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "accept failed" });
    }
  });

  /** Propose §4 markdown for Mind Map extra routes (Accept merges via master-plan/update). */
  app.post("/api/master-plan/propose-section4-amendment", (req, res) => {
    try {
      const extras = Array.isArray(req.body?.extraRoutes)
        ? req.body.extraRoutes.filter((r: unknown) => typeof r === "string")
        : [];
      const draftMarkdown = draftSection4AmendmentsForRoutes(extras);
      if (!draftMarkdown) {
        return res.status(400).json({ error: "extraRoutes required" });
      }
      res.json({
        ok: true,
        sectionKey: "4. Pages and navigation",
        tabIndex: 4,
        draftMarkdown,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "propose failed" });
    }
  });

  app.post("/api/master-plan/accept-section4-amendment", (req, res) => {
    try {
      const draft = typeof req.body?.draftMarkdown === "string" ? req.body.draftMarkdown.trim() : "";
      if (!draft) return res.status(400).json({ error: "draftMarkdown required" });
      const pp = projectPathsFor(req);
      let plan: Record<string, string> = {};
      if (fs.existsSync(pp.masterPlanPath)) {
        plan = JSON.parse(fs.readFileSync(pp.masterPlanPath, "utf8")) as Record<string, string>;
      }
      const key = "4. Pages and navigation";
      const cur = String(plan[key] ?? "").trim();
      plan[key] = cur ? `${cur}\n\n${draft}` : draft;
      fs.writeFileSync(pp.masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
      try {
        syncUiArtifactsFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      } catch {
        /* ignore */
      }
      res.json({ ok: true, applied: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "accept failed" });
    }
  });

  app.get("/api/conversation-log", (req, res) => {
    try {
      const uid = readNebulaSessionUserId(req) || "anonymous";
      const pp = projectPathsFor(req);
      const q = (req.query || {}) as Record<string, unknown>;
      const projectLabel =
        typeof q.projectName === "string" && q.projectName.trim()
          ? String(q.projectName).trim()
          : "Untitled project";
      const entries = loadPrunedEntries({ userId: uid, projectKey: pp.projectKey, projectLabel });
      res.json({ entries });
    } catch (error) {
      console.error("/api/conversation-log:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to read conversation log" });
    }
  });

  app.post("/api/master-plan/update", (req, res) => {
    const { tabIndex, content } = req.body;
    if (tabIndex === undefined || content === undefined) {
      return res.status(400).json({ error: "tabIndex and content are required" });
    }

    const tabNames: Record<number, string> = {
      1: "1. Goal of the app",
      2: "2. Tech and Research",
      3: "3. Features and KPIs",
      4: "4. Pages and navigation",
      5: "5. UI/UX design",
      6: "6. Environment Setup",
    };

    const tabName = tabNames[tabIndex as number];
    if (!tabName) {
      return res.status(400).json({ error: "Invalid tabIndex. Must be 1-6." });
    }

    try {
      const pp = projectPathsFor(req);
      let plan = {};
      if (fs.existsSync(pp.masterPlanPath)) {
        plan = JSON.parse(fs.readFileSync(pp.masterPlanPath, "utf8"));
      }
      
      // Update the specific tab content using mapped tabName as key
      (plan as any)[tabName] = content;

      fs.writeFileSync(pp.masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
      const v0Sync = ensureV0PromptSynced(pp);
      res.json({
        success: true,
        tabName,
        uiBriefSynced: v0Sync.uiBriefSynced,
        uiBriefLength: v0Sync.uiBrief.length,
        v0PromptSynced: v0Sync.synced,
        v0PromptLength: v0Sync.content.length,
      });
    } catch (error) {
      console.error("Error updating master plan:", error);
      res.status(500).json({ error: "Failed to update master plan" });
    }
  });

  // Silent Writer Endpoint
  app.post("/api/write-spec", (req, res) => {
    const { content } = req.body;
    const { workspaceRoot } = projectPathsFor(req);
    const specPath = path.join(workspaceRoot, "Nebula Architecture Spec.md");
    try {
      fs.writeFileSync(specPath, content, "utf8");
      res.json({ success: true });
    } catch (error) {
      console.error("Error writing spec:", error);
      res.status(500).json({ error: "Failed to write spec" });
    }
  });

  // Example backend function: read file system
  app.get("/api/fs/list", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const pathParam = req.query.path as string || ".";
      const targetDir = resolveWorkspaceRelative(workspaceRoot, pathParam);
      
      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: "Directory not found" });
      }

      const nebulaInternal = new Set([
        'node_modules', 'dist', '.git', '.github', 'index.ts', 'README.md',
        'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.node.json',
        'vite.config.ts', 'postcss.config.js', 'tailwind.config.js', 'components.json',
        'metadata.json', 'server.ts', '.env.example', 'firebase-applet-config.json',
        'master-plan.json', 'Nebula Architecture Spec.md', 'index.html', 'src', 'public',
        'firebase-blueprint.json', 'firestore.rules', 'DRAFT_firestore.rules',
        '.gitignore', 'nebula-ui-studio.md'
      ]);

      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      const files = items
        .filter(item => {
          const isHidden = item.name.startsWith('.');
          const isInternal = nebulaInternal.has(item.name);
          return !isHidden && !isInternal;
        })
        .map(item => ({
          name: item.name,
          isDirectory: item.isDirectory()
        }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ files });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/files/content", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: "Path is required" });

      const targetFile = resolveWorkspaceRelative(workspaceRoot, filePath);

      if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
        return res.status(404).json({ error: "File not found" });
      }

      const content = fs.readFileSync(targetFile, "utf8");
      res.json({ content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Batch-read inference-first working files (200 + nulls for missing).
   * Avoids spamming the browser console with /api/files/open 404s on first Start.
   */
  app.post("/api/inference-first/memory", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const rawPaths = Array.isArray(req.body?.paths) ? req.body.paths : [];
      const paths = rawPaths
        .filter((p: unknown): p is string => typeof p === "string")
        .map((p: string) => p.trim().replace(/^\.\/+/, "").replace(/\\/g, "/"))
        .filter(Boolean)
        .slice(0, 12);

      const tryResolveUnder = (root: string, rel: string): string | null => {
        try {
          const full = resolveWorkspaceRelative(root, rel);
          if (fs.existsSync(full) && !fs.statSync(full).isDirectory()) return full;
        } catch {
          /* access denied or missing */
        }
        return null;
      };

      const files: Record<string, string | null> = {};
      for (const filePath of paths) {
        let fullPath =
          tryResolveUnder(workspaceRoot, filePath) ||
          tryResolveUnder(REPO_ROOT, filePath) ||
          tryResolveUnder(NEBULA_PROJECT_ROOT, filePath);
        if (!fullPath && filePath.startsWith("nebulla-project/")) {
          const alt = filePath.replace(/^nebulla-project\//, "");
          fullPath = tryResolveUnder(NEBULA_PROJECT_ROOT, alt);
        }
        if (!fullPath) {
          files[filePath] = null;
          continue;
        }
        try {
          const size = fs.statSync(fullPath).size;
          if (size > FILE_OPEN_MAX_BYTES) {
            files[filePath] = null;
            continue;
          }
          files[filePath] = fs.readFileSync(fullPath, "utf8");
        } catch {
          files[filePath] = null;
        }
      }
      return res.json({ ok: true, files });
    } catch (err: unknown) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "memory read failed",
        files: {},
      });
    }
  });

  /** Open a workspace-relative file (File Ops mode) — content + language hint. */
  const handleFilesOpen = (req: express.Request, res: express.Response) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const fromBody = typeof req.body?.path === "string" ? req.body.path : "";
      const fromQuery = typeof req.query.path === "string" ? String(req.query.path) : "";
      const filePath = (fromBody || fromQuery)
        .trim()
        .replace(/^\.\/+/, "")
        .replace(/\\/g, "/");
      if (!filePath) {
        return res.json({ success: false, error: "path is required" });
      }
      // Project display titles (spaces, no slash) are not file paths. Phase 7: open by projectKey + encoded path.
      if (/\s/.test(filePath) && !filePath.includes("/")) {
        return res.json({
          success: false,
          error: "path must be a workspace-relative file, not the project title",
        });
      }

      const tryResolveUnder = (root: string, rel: string): string | null => {
        try {
          const full = resolveWorkspaceRelative(root, rel);
          if (fs.existsSync(full) && !fs.statSync(full).isDirectory()) return full;
        } catch {
          /* access denied or missing */
        }
        return null;
      };

      // Workspace first; then repo product docs (nebulla-project/, nebula-project/).
      let fullPath =
        tryResolveUnder(workspaceRoot, filePath) ||
        tryResolveUnder(REPO_ROOT, filePath) ||
        tryResolveUnder(NEBULA_PROJECT_ROOT, filePath);

      // Allow nebulla-project/foo.md → nebula-project/foo.md template docs
      if (!fullPath && filePath.startsWith("nebulla-project/")) {
        const alt = filePath.replace(/^nebulla-project\//, "");
        fullPath = tryResolveUnder(NEBULA_PROJECT_ROOT, alt);
      }

      if (!fullPath) {
        // 200 + success:false — missing ui-brief / early Plan files must not 404 the browser console.
        return res.json({ success: false, error: "File not found" });
      }
      const size = fs.statSync(fullPath).size;
      if (size > FILE_OPEN_MAX_BYTES) {
        return res.status(413).json({ error: "File too large to open" });
      }

      const content = fs.readFileSync(fullPath, "utf8");
      return res.json({
        success: true,
        path: filePath,
        content,
        language: getLanguageFromPath(filePath),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open file";
      if (/Access denied/i.test(msg)) {
        return res.status(403).json({ error: "Access denied" });
      }
      return res.status(500).json({ error: "Failed to open file" });
    }
  };

  app.post("/api/files/open", handleFilesOpen);
  /** GET alias — projectKey (not raw title) scopes the workspace; path must be encoded. */
  app.get("/api/files/open", handleFilesOpen);

  /** Open a single public GitHub file (blob or raw URL). */
  app.post("/api/files/open-github", async (req, res) => {
    try {
      const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
      const branch =
        typeof req.body?.branch === "string" && req.body.branch.trim()
          ? req.body.branch.trim()
          : "main";
      if (!url) return res.status(400).json({ error: "url is required" });

      const rawUrl = toGitHubRawUrl(url, branch);
      if (!rawUrl) {
        return res.status(400).json({
          error: "Only public github.com or raw.githubusercontent.com file URLs are supported",
        });
      }

      const response = await fetch(rawUrl, {
        headers: { Accept: "text/plain" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        return res.status(response.status === 404 ? 404 : 502).json({
          error: response.status === 404 ? "File not found on GitHub" : "Failed to fetch GitHub file",
        });
      }

      const content = await response.text();
      if (Buffer.byteLength(content, "utf8") > FILE_OPEN_MAX_BYTES) {
        return res.status(413).json({ error: "File too large to open" });
      }

      return res.json({
        success: true,
        source: "github",
        url,
        content,
        language: getLanguageFromPath(url),
      });
    } catch {
      return res.status(500).json({ error: "Failed to open GitHub file" });
    }
  });

  /** Save UTF-8 workspace file (same path rules as source-control product files). */
  app.put("/api/files/content", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const relRaw = typeof req.body?.path === "string" ? req.body.path : "";
      const content = typeof req.body?.content === "string" ? req.body.content : undefined;
      const rel = relRaw.replace(/^\.\/+/, "").replace(/\\/g, "/");
      if (!rel) return res.status(400).json({ error: "path is required" });
      if (content === undefined) return res.status(400).json({ error: "content is required" });
      // Product app files, plus small IDE workspace metadata under nebulla-ide/ (locale, etc.).
      const isIdeMeta =
        rel.startsWith("nebulla-ide/") &&
        !rel.includes("..") &&
        !rel.includes("/node_modules/") &&
        !rel.startsWith("nebulla-ide/node_modules/");
      if (!isUserAppProductPath(rel) && !isIdeMeta) {
        return res.status(403).json({ error: "Path not allowed for save" });
      }
      const target = resolveWorkspaceRelative(workspaceRoot, rel);
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        return res.status(400).json({ error: "Path is a directory" });
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content.replace(/\r\n/g, "\n"), "utf8");
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "save failed" });
    }
  });

  /** IDE mind map graph (React Flow JSON) — workspace-scoped, product path. */
  const MIND_MAP_WORKSPACE_REL = "nebulla-ide/mind-map.json";

  app.get("/api/workspace/mind-map", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const target = resolveWorkspaceRelative(pp.workspaceRoot, MIND_MAP_WORKSPACE_REL);
      if (!fs.existsSync(target)) {
        return res.json({ pages: [], edges: [], fidelityWarning: undefined, mindMapFidelity: null });
      }
      const raw = fs.readFileSync(target, "utf8");
      const j = JSON.parse(raw) as {
        pages?: unknown;
        edges?: unknown;
        fidelityWarning?: unknown;
      };
      const pages = Array.isArray(j.pages) ? j.pages : [];
      const edges = Array.isArray(j.edges) ? j.edges : [];
      const plan = hydrateAndPersistMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      const fidelity = assessMindMapSubsetOfSection4({
        plan,
        mindMapPages: pages,
        mode: resolveMasterPlanStrictMode(pp.workspaceRoot),
      });
      res.json({
        pages,
        edges,
        fidelityWarning: j.fidelityWarning ?? fidelity.gaps,
        mindMapFidelity: fidelity,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "mind map read failed" });
    }
  });

  /** Privacy-safe contract telemetry from the browser (counts/enums only). */
  app.post("/api/contract-telemetry", (req, res) => {
    try {
      const body = req.body || {};
      const event = String(body.event || "");
      if (event === "go_apply_result") {
        const applyKind = String(body.applyKind || "unknown");
        recordContractTelemetry({
          event: "go_apply_result",
          applyKind:
            applyKind === "planOnly" || applyKind === "hasAppFiles"
              ? applyKind
              : "unknown",
          writtenCount: Math.max(0, Math.min(500, Number(body.writtenCount) || 0)),
          sliceLabel:
            typeof body.sliceLabel === "string"
              ? body.sliceLabel.trim().slice(0, 40)
              : undefined,
        });
        return res.json({ ok: true });
      }
      if (event === "app_status_fix_outcome") {
        const outcome = String(body.outcome || "unknown");
        recordContractTelemetry({
          event: "app_status_fix_outcome",
          outcome:
            outcome === "reachedGreen" || outcome === "stillRed"
              ? outcome
              : "unknown",
          reloadCycles: Math.max(0, Math.min(20, Number(body.reloadCycles) || 0)),
        });
        return res.json({ ok: true });
      }
      if (event === "ndm_app_status_turn") {
        const fileCount = Math.max(0, Math.min(100, Number(body.fileCount) || 0));
        recordContractTelemetry({
          event: "ndm_app_status_turn",
          verifyBeforeApply: body.verifyBeforeApply === true,
          fileCount,
          smallFix: body.smallFix === true || (fileCount > 0 && fileCount <= 6),
        });
        return res.json({ ok: true });
      }
      return res.status(400).json({ error: "unsupported event" });
    } catch (e) {
      return res.status(500).json({
        error: e instanceof Error ? e.message : "telemetry failed",
      });
    }
  });

  app.put("/api/workspace/mind-map", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const pages = req.body?.pages;
      const edges = req.body?.edges;
      if (!Array.isArray(pages) || !Array.isArray(edges)) {
        return res.status(400).json({ error: "pages and edges must be arrays" });
      }
      const plan = hydrateAndPersistMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      const fidelity = assessMindMapSubsetOfSection4({
        plan,
        mindMapPages: pages,
        mode: resolveMasterPlanStrictMode(pp.workspaceRoot),
      });
      recordContractTelemetry({
        event: "mindmap_fidelity",
        mode: fidelity.mode,
        extraRouteCount: fidelity.extraRoutes.length,
        allowWrite: fidelity.allowWrite,
      });
      if (!fidelity.allowWrite) {
        return res.status(409).json({
          error: "Mind Map has pages not in Master Plan §4 (MASTER_PLAN_STRICT=strict).",
          code: "MINDMAP_NOT_SUBSET",
          mindMapFidelity: fidelity,
        });
      }
      const payload = JSON.stringify({
        version: 1,
        pages,
        edges,
        fidelityWarning: fidelity.extraRoutes.length > 0 ? fidelity.gaps : undefined,
      });
      if (payload.length > 900_000) {
        return res.status(413).json({ error: "Mind map payload too large" });
      }
      const target = resolveWorkspaceRelative(pp.workspaceRoot, MIND_MAP_WORKSPACE_REL);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, payload, "utf8");
      res.json({
        ok: true,
        mindMapFidelity: fidelity,
        warning: fidelity.extraRoutes.length > 0,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "mind map write failed" });
    }
  });

  app.post("/api/workspace/mind-map/sync-from-master-plan", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = req.body || {};
      const projectLabel =
        typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : "Untitled Project";
      const graph = syncMindMapFromMasterPlan({
        workspaceRoot: pp.workspaceRoot,
        masterPlanPath: pp.masterPlanPath,
        projectLabel,
      });
      const plan = readMasterPlanFile(pp.masterPlanPath);
      const fidelity = assessMindMapSubsetOfSection4({
        plan,
        mindMapPages: graph.pages,
        mode: resolveMasterPlanStrictMode(pp.workspaceRoot),
      });
      res.json({
        ok: true,
        pages: graph.pages,
        edges: graph.edges,
        routeCount: graph.routeCount,
        source: graph.source,
        mindMapFidelity: fidelity,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "mind map sync failed" });
    }
  });

  app.post("/api/visual-ui-editor/unlock-from-workspace", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = req.body || {};
      const projectName =
        typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : "Untitled Project";
      const unlocked = unlockVisualEditorFromWorkspaceCoding(pp.workspaceRoot, projectName);
      const gate = isVisualEditorEligible(pp.workspaceRoot);
      const persist = canPersistVisualPreviewModel(pp.workspaceRoot);
      return res.json({
        ok: true,
        unlocked,
        eligible: gate.eligible || persist.ok,
        reason: gate.eligible ? gate.reason : persist.reason,
        canPersistPreview: persist.ok,
      });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "unlock failed" });
    }
  });

  app.post("/api/ide/sync-project-artifacts", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = req.body || {};
      const projectName =
        typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : "Untitled Project";
      const userNote = typeof body.userNote === "string" ? body.userNote.trim() : "";
      const mp = bootstrapMasterPlanFromWorkspace({
        workspaceRoot: pp.workspaceRoot,
        masterPlanPath: pp.masterPlanPath,
        projectName,
        userNote,
      });
      hydrateAndPersistMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      const plan = readMasterPlanFile(pp.masterPlanPath);
      const v0Prompt = writeV0PromptMarkdown(pp.workspaceRoot, plan);
      ensureNebulaUiStudioFileAt(pp.nebulaUiStudioPath);
      const studioExisting = fs.readFileSync(pp.nebulaUiStudioPath, "utf8");
      fs.writeFileSync(
        pp.nebulaUiStudioPath,
        upsertNebulaCommentSection(studioExisting, "NEBULA_UI_STUDIO_PROMPT", v0Prompt.content),
        "utf8"
      );
      const uiStudioUnlocked = unlockVisualEditorFromWorkspaceCoding(pp.workspaceRoot, projectName);
      const mind = syncMindMapFromMasterPlan({
        workspaceRoot: pp.workspaceRoot,
        masterPlanPath: pp.masterPlanPath,
        projectLabel: projectName,
      });
      const previewIndexWritten = ensurePreviewIndexHtml(pp.workspaceRoot, projectName);
      let basicUiWritten: string[] = [];
      if (Boolean(body.seedBasicUi)) {
        basicUiWritten = writeBasicUiScaffold(pp.workspaceRoot, projectName);
      }
      const mindMapPages = Array.isArray(mind.pages) ? mind.pages.length : 0;
      res.json({
        masterPlanTabs: mp.updated,
        v0PromptWritten: v0Prompt.written,
        mindMapSynced: mind.written && mindMapPages > 0,
        mindMapPageCount: mindMapPages,
        mindMapRouteCount: mind.routeCount,
        previewIndexWritten,
        basicUiWritten,
        uiStudioUnlocked,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "artifact sync failed" });
    }
  });

  /** Cancel stale v0 / Go jobs without wiping workspace files. */
  app.post("/api/ide/cancel-background-jobs", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const cleared = cancelProjectBackgroundAttempts(pp.workspaceRoot);
      return res.json({ ok: true, cleared });
    } catch (err: unknown) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "cancel background jobs failed",
      });
    }
  });

  /** Reset cloud workspace to template + cancel all pending v0/Go attempts. */
  app.post("/api/ide/reset-project-scratch", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = req.body || {};
      const projectName =
        typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : undefined;
      const uid = readNebulaSessionUserId(req) || "anonymous";
      const convLabel =
        projectName ||
        (typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : "Untitled Project");
      const chatScope = { userId: uid, projectKey: pp.projectKey, projectLabel: convLabel };
      let chatCleared = clearConversationLog(chatScope);
      chatCleared =
        clearConversationLog({ ...chatScope, projectLabel: "Untitled Project" }) || chatCleared;
      chatCleared =
        clearConversationLog({ ...chatScope, projectLabel: "Untitled project" }) || chatCleared;
      const cleared = cancelProjectBackgroundAttempts(pp.workspaceRoot);
      if (chatCleared) {
        cleared.push("conversation-log (chat history cleared)");
      }
      const { removed } = resetProjectWorkspaceScratch({
        workspaceRoot: pp.workspaceRoot,
        templateRoot: NEBULA_PROJECT_ROOT,
        projectDisplayName: projectName,
      });
      writeBasicUiScaffold(pp.workspaceRoot, projectName || "Untitled Project", { force: true });
      return res.json({ ok: true, cleared, removed, chatCleared });
    } catch (err: unknown) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "reset project failed",
      });
    }
  });

  app.get("/api/ide/design-references", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const items = readDesignReferences(pp.workspaceRoot);
      return res.json({ ok: true, items });
    } catch (err: unknown) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "read design references failed",
      });
    }
  });

  app.post("/api/ide/design-references", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = req.body || {};
      const filename = typeof body.filename === "string" ? body.filename.trim() : "";
      if (!filename) {
        return res.status(400).json({ error: "filename is required" });
      }
      const items = addDesignReference(pp.workspaceRoot, {
        filename,
        url: typeof body.url === "string" ? body.url : undefined,
        storageKey: typeof body.storageKey === "string" ? body.storageKey : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
      });
      const plan = hydrateAndPersistMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      writeV0PromptMarkdown(pp.workspaceRoot, plan);
      return res.json({ ok: true, items, summary: summarizeDesignReferencesForPrompt(pp.workspaceRoot) });
    } catch (err: unknown) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "save design reference failed",
      });
    }
  });

  app.post("/api/ide/master-plan-ui-pipeline", async (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = req.body || {};
      const projectName =
        typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : "Untitled Project";
      // Auto-V0 is off unless the client explicitly opts in (manual path only).
      const autoV0 = body.autoV0 === true;

      // Inference-first start path: if auth/child/private data is implied but §2 lacks a
      // security baseline, draft it now (labeled assumption) so strict Go isn't stuck.
      try {
        let planForSec = readMasterPlanFile(pp.masterPlanPath);
        const secProposal = buildSecurityBaselineProposal(planForSec);
        if (secProposal?.needed) {
          const key = secProposal.sectionKey;
          const merged = mergeSecurityBaselineIntoSection2(String(planForSec[key] ?? ""));
          if (merged) {
            planForSec = { ...planForSec, [key]: merged };
            fs.mkdirSync(path.dirname(pp.masterPlanPath), { recursive: true });
            fs.writeFileSync(pp.masterPlanPath, JSON.stringify(planForSec, null, 2), "utf8");
          }
        }
      } catch {
        /* non-fatal — mockup can still proceed without security for structure-ready plans */
      }

      // Primary ui-brief + legacy v0-prompt — required before plan-first UI mockup.
      const uiArts = syncUiArtifactsFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      ensureNebulaUiStudioFileAt(pp.nebulaUiStudioPath);
      const studioExisting = fs.readFileSync(pp.nebulaUiStudioPath, "utf8");
      fs.writeFileSync(
        pp.nebulaUiStudioPath,
        upsertNebulaCommentSection(
          studioExisting,
          "NEBULA_UI_STUDIO_PROMPT",
          uiArts.uiBrief.content || uiArts.v0Prompt.content,
        ),
        "utf8"
      );

      const mind = syncMindMapFromMasterPlan({
        workspaceRoot: pp.workspaceRoot,
        masterPlanPath: pp.masterPlanPath,
        projectLabel: projectName,
      });
      const mindMapPages = Array.isArray(mind.pages) ? mind.pages.length : 0;

      let v0Triggered = false;
      let v0Ok = false;
      let v0Error: string | undefined;
      let v0Written: string[] = [];

      // v0 runs via /v0-start + /v0-poll from the client (Render HTTP timeout ~30s).
      if (autoV0) {
        v0Triggered = Boolean(readV0PromptMarkdown(pp.workspaceRoot).trim());
        if (v0Triggered) {
          v0Error =
            "autoV0 on this route is deprecated — client calls /api/nebula-ui-studio/v0-start then v0-poll.";
        }
      }

      res.json({
        ok: true,
        v0PromptWritten: uiArts.v0Prompt.written,
        v0PromptPath: "nebula-ui-studio/v0-prompt.md",
        uiBriefWritten: uiArts.uiBrief.written,
        uiBriefPath: "nebula-ui-studio/ui-brief.md",
        uiBriefLength: uiArts.uiBrief.content.length,
        mindMapSynced: mind.written && mindMapPages > 0,
        mindMapPageCount: mindMapPages,
        mindMapRouteCount: mind.routeCount,
        v0Triggered,
        v0Ok,
        v0Error,
        v0Written,
        hasRealV0: hasRealV0ApiGeneration(pp.workspaceRoot),
      });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "master plan UI pipeline failed",
      });
    }
  });

  app.get("/api/nebula-ui-studio/status", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      expireStaleV0Pending(pp.workspaceRoot, {
        jobActive: isV0StartJobActive(pp.workspaceRoot),
      });
      const { content: prompt } = ensureV0PromptSynced(pp);
      const gate = isVisualEditorEligible(pp.workspaceRoot);
      const keyRes = resolveV0ApiKeyFromRequest(req);
      const pending = readV0Pending(pp.workspaceRoot);
      const editorSt = readEditorState(pp.workspaceRoot);
      return res.json({
        ok: true,
        v0PromptPath: "nebula-ui-studio/v0-prompt.md",
        v0PromptExists: Boolean(prompt.trim()),
        v0PromptLength: prompt.length,
        v0PromptPreview: prompt.slice(0, 500),
        hasRealV0: hasRealV0ApiGeneration(pp.workspaceRoot),
        v0DemoUrl: editorSt.v0DemoUrl || readV0DemoUrl(pp.workspaceRoot),
        v0ChatId: editorSt.v0ChatId || pending?.chatId,
        v0Pending: Boolean(pending?.chatId || pending?.starting),
        v0PendingChatId: pending?.chatId || undefined,
        v0Starting: Boolean(pending?.starting || isV0StartJobActive(pp.workspaceRoot)),
        v0StartError: pending?.startError,
        eligible: gate.eligible,
        eligibilityReason: gate.reason,
        hasV0ApiKey: keyRes.ok === true,
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "status failed" });
    }
  });

  app.post("/api/nebula-ui-studio/basic-scaffold", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = req.body || {};
      const projectName =
        typeof body.projectDisplayName === "string" && body.projectDisplayName.trim()
          ? String(body.projectDisplayName).trim()
          : "Untitled Project";
      const written = writeBasicUiScaffold(pp.workspaceRoot, projectName);
      ensurePreviewIndexHtml(pp.workspaceRoot, projectName);
      res.json({ ok: true, written, source: "basic-scaffold" });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "basic scaffold failed" });
    }
  });

  /** Preview metadata. IDE App Preview always uses workspace bootstrap (preferV0 is always false). */
  app.get("/api/app-preview/meta", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const demoUrl = readV0DemoUrl(pp.workspaceRoot);
      const hasReal = hasRealV0ApiGeneration(pp.workspaceRoot);
      // Do not heal coded workspaces into the generic role-picker mock.
      const authority = resolveAppPreviewAuthority(pp.workspaceRoot);
      res.json({
        ok: true,
        v0DemoUrl: demoUrl,
        preferV0: false,
        hasRealV0: hasReal,
        previewSource: "workspace",
        previewMode: authority.mode,
        previewStatusLabel: authority.statusLabel,
        previewHonesty: authority.honesty,
        codedApp: authority.codedApp,
        indexIsMockup: authority.indexIsMockup,
        entryRel: authority.entryRel,
        mockupRel: authority.mockupRel,
        productFileCount: authority.productFiles.length,
        productFilesSample: authority.productFiles.slice(0, 8),
        productRoutes: inferRoutesFromProductFiles(authority.productFiles),
        limitation: authority.limitation,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "preview meta failed" });
    }
  });

  /** Bootstrap HTML for in-IDE preview: inject base + rewrite root-relative URLs under this project. */
  app.get("/api/app-preview/bootstrap", async (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const uid = readNebulaSessionUserId(req);
      if (isSyntheticWorkspaceKey(pp.projectKey)) {
        if (!uid) {
          return res.status(401).type("text/plain").send("Sign in required for this workspace preview");
        }
        const owns = await userOwnsWorkspaceDiskKey(uid, pp.projectKey);
        if (!owns) {
          return res.status(403).type("text/plain").send("Preview access denied for this workspace");
        }
      }
      issuePreviewGrantCookieMerging(req, res, pp.projectKey);

      const q = req.query as Record<string, unknown>;
      const displayName =
        (typeof q.projectName === "string" && q.projectName.trim()) ||
        pp.projectKey ||
        "Untitled Project";

      // Coded app/src pages: serve those routes or an honest bridge — never the role-picker mock.

      const authority = resolveAppPreviewAuthority(pp.workspaceRoot);
      let html = "";
      const surface = String(q.surface || "").toLowerCase();
      const preferMockup = surface === "mockup" || surface === "ui-gen";

      if (preferMockup && authority.mockupRel) {
        const mockAbs = path.join(pp.workspaceRoot, authority.mockupRel);
        if (fs.existsSync(mockAbs)) {
          html = fs.readFileSync(mockAbs, "utf8");
        }
      }

      if (
        !html &&
        authority.mode === "interactive_product_preview" &&
        authority.entryRel
      ) {
        const entryAbs = path.join(pp.workspaceRoot, authority.entryRel);
        if (fs.existsSync(entryAbs)) {
          html = fs.readFileSync(entryAbs, "utf8");
        }
      }

      if (
        !html &&
        (authority.mode === "post_code_bridge" ||
          authority.mode === "thin_code_shell" ||
          (authority.codedApp && !authority.entryRel))
      ) {
        const productPrev = path.join(pp.workspaceRoot, PRODUCT_PREVIEW_REL);
        if (fs.existsSync(productPrev)) {
          html = fs.readFileSync(productPrev, "utf8");
        }
        if (!html) {
          html = buildCodedAppPreviewBridgeHtml({
            projectName: displayName,
            productFiles: authority.productFiles,
            mockupRel: authority.mockupRel,
            limitation: authority.limitation,
            honesty: authority.honesty,
          });
        }
      } else if (!html && authority.entryRel) {
        const entryAbs = path.join(pp.workspaceRoot, authority.entryRel);
        if (fs.existsSync(entryAbs)) {
          html = fs.readFileSync(entryAbs, "utf8");
        }
      }

      if (!html) {
        const idx = path.join(pp.workspaceRoot, "index.html");
        if (!fs.existsSync(idx) || fs.statSync(idx).size < 80) {
          ensurePreviewIndexHtml(pp.workspaceRoot, displayName);
        }
        if (!fs.existsSync(idx)) {
          return res.status(200).type("html").send(emptyPreviewHtmlWithBridge());
        }
        html = fs.readFileSync(idx, "utf8");
      }

      if (html && isLegacyNebulaBasicPreviewHtml(html)) {
        writeBasicUiScaffold(pp.workspaceRoot, displayName, { force: true });
        const idx = path.join(pp.workspaceRoot, "index.html");
        html = fs.existsSync(idx) ? fs.readFileSync(idx, "utf8") : html;
      }

      const xfProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
      const proto = xfProto || req.protocol || "http";
      const host = req.get("host") || `localhost:${PORT}`;
      const baseHref = `${proto}://${host}/api/app-preview/p/${encodeURIComponent(pp.projectKey)}/`;
      if (!/<base\s/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
      }
      html = html.replace(/(src|href)=(["'])\/(?!\/)/gi, "$1=$2");
      // Early App Status capture — before parent onload inject (idempotent with client inject).
      html = wrapHtmlWithPreviewRuntimeBridge(html);
      // HTTP headers must be ASCII — never put em-dashes / status prose here (crashes Node setHeader).
      // Full label lives in /api/app-preview/meta for the IDE chrome.
      res.setHeader("X-Nebulla-Preview-Mode", String(authority.mode).replace(/[^\x20-\x7E]/g, ""));
      res.type("html").send(html);
    } catch (err: unknown) {
      res.status(500).type("text/plain").send(err instanceof Error ? err.message : "bootstrap failed");
    }
  });

  /** Raw workspace file for preview assets (URL path must match active project key). */
  app.use(async (req, res, next) => {
    if (req.method !== "GET" || !req.path.startsWith("/api/app-preview/p/")) return next();
    try {
      const asterisk = req.path.slice("/api/app-preview/p/".length);
      const slash = asterisk.indexOf("/");
      const projectKeyRaw = slash === -1 ? asterisk : asterisk.slice(0, slash);
      const projectKey = sanitizeProjectKey(projectKeyRaw);
      const relEncoded = slash === -1 ? "" : asterisk.slice(slash + 1);
      let relPath = relEncoded ? decodeURIComponent(relEncoded.replace(/\+/g, " ")) : "";
      relPath = relPath.replace(/^\.\/+/, "").replace(/^\/+/, "");
      if (!relPath) relPath = "index.html";

      const access = await canReadAppPreview(req, projectKey, {
        sessionUserId: readNebulaSessionUserId(req),
        userOwnsDiskKey: userOwnsWorkspaceDiskKey,
      });
      if (access.ok === false) {
        res.status(access.status).type("text/plain").send(access.reason);
        return;
      }

      const { workspaceRoot } = ensureCloudProjectWorkspace(
        REPO_ROOT,
        NEBULA_PROJECT_ROOT,
        projectKey,
      );
      const target = path.resolve(workspaceRoot, relPath);
      if (!target.startsWith(workspaceRoot)) {
        res.status(403).end();
        return;
      }
      if (!fs.existsSync(target)) {
        if (relPath === "index.html") {
          ensurePreviewIndexHtml(workspaceRoot, projectKey);
          if (fs.existsSync(target)) {
            res.sendFile(target);
            return;
          }
        }
        res.status(404).type("text/plain").send("Not found");
        return;
      }
      const st = fs.statSync(target);
      if (st.isDirectory()) {
        res.status(403).type("text/plain").send("Directory listing disabled");
        return;
      }
      res.sendFile(target);
    } catch (err: unknown) {
      res.status(500).type("text/plain").send(err instanceof Error ? err.message : "preview file failed");
    }
  });

  const VERSION_HISTORY_DIR = path.join("nebulla-version-history", "snapshots");
  const SNAPSHOT_TEXT_EXT = new Set([
    ".html",
    ".htm",
    ".css",
    ".js",
    ".mjs",
    ".cjs",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".md",
    ".svg",
    ".txt",
    ".xml",
    ".yml",
    ".yaml",
  ]);

  app.get("/api/version-history/list", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const dir = path.join(workspaceRoot, VERSION_HISTORY_DIR);
      if (!fs.existsSync(dir)) {
        return res.json({ snapshots: [] as { id: string; createdAt: string; label: string; fileCount: number }[] });
      }
      const names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
      const snapshots: { id: string; createdAt: string; label: string; fileCount: number }[] = [];
      for (const name of names) {
        const abs = path.join(dir, name);
        try {
          const raw = fs.readFileSync(abs, "utf8");
          const j = JSON.parse(raw) as { id?: string; createdAt?: string; label?: string; files?: Record<string, string> };
          const id = typeof j.id === "string" ? j.id : name.replace(/\.json$/i, "");
          const createdAt = typeof j.createdAt === "string" ? j.createdAt : "";
          const label = typeof j.label === "string" ? j.label : "";
          const fileCount = j.files && typeof j.files === "object" ? Object.keys(j.files).length : 0;
          snapshots.push({ id, createdAt, label, fileCount });
        } catch {
          /* skip corrupt */
        }
      }
      snapshots.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      res.json({ snapshots });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "list failed" });
    }
  });

  app.get("/api/version-history/read", (req, res) => {
    try {
      const id = String(req.query.id || "").trim().replace(/[^a-zA-Z0-9._-]/g, "");
      if (!id) return res.status(400).json({ error: "id is required" });
      const { workspaceRoot } = projectPathsFor(req);
      const safeName = id.endsWith(".json") ? id : `${id}.json`;
      const abs = path.resolve(workspaceRoot, VERSION_HISTORY_DIR, safeName);
      const root = path.resolve(workspaceRoot, VERSION_HISTORY_DIR);
      if (!abs.startsWith(root) || !fs.existsSync(abs)) return res.status(404).json({ error: "Not found" });
      const raw = fs.readFileSync(abs, "utf8");
      res.type("json").send(raw);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "read failed" });
    }
  });

  app.post("/api/version-history/snapshot", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 200) : "";
      const dir = path.join(workspaceRoot, VERSION_HISTORY_DIR);
      fs.mkdirSync(dir, { recursive: true });

      const createdAt = new Date().toISOString();
      const id = `snap-${createdAt.replace(/[:.]/g, "-")}`;
      const files: Record<string, string> = {};
      const maxPerFile = 120_000;
      const maxFiles = 100;
      let count = 0;

      const all = collectWorkspaceFiles(workspaceRoot);
      for (const row of all) {
        if (count >= maxFiles) break;
        const p = row.relativePath.replace(/\\/g, "/");
        if (p.startsWith("nebulla-version-history/")) continue;
        if (p.includes("node_modules/") || p.includes(".git/")) continue;
        const ext = path.extname(p).toLowerCase();
        if (!SNAPSHOT_TEXT_EXT.has(ext)) continue;
        if (row.size > maxPerFile * 2) continue;
        const abs = path.resolve(workspaceRoot, p);
        if (!abs.startsWith(workspaceRoot)) continue;
        try {
          const body = fs.readFileSync(abs, "utf8");
          files[p] = body.length > maxPerFile ? `${body.slice(0, maxPerFile)}\n\n… [truncated]` : body;
          count += 1;
        } catch {
          /* skip binary / unreadable */
        }
      }

      const payload = { version: 1 as const, id, createdAt, label, files };
      const fileName = `${id}.json`;
      fs.writeFileSync(path.join(dir, fileName), JSON.stringify(payload, null, 2), "utf8");
      res.json({ ok: true, id, createdAt, label, fileCount: Object.keys(files).length });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "snapshot failed" });
    }
  });

  /** Cheap disk check — apply POST must not wait on git/source-control overview. */
  app.post("/api/files/exists", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const raw = Array.isArray(req.body?.paths) ? req.body.paths : [];
      const found: string[] = [];
      for (const item of raw.slice(0, 40)) {
        const rel = String(item || "")
          .replace(/\\/g, "/")
          .replace(/^\.\//, "")
          .trim();
        if (!rel || rel.includes("..") || /(^|\/)\.git(\/|$)|(^|\/)node_modules(\/|$)/i.test(rel)) {
          continue;
        }
        const target = path.resolve(workspaceRoot, rel);
        if (!target.startsWith(workspaceRoot)) continue;
        if (fs.existsSync(target)) found.push(rel);
      }
      res.json({ found });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "exists check failed",
        found: [],
      });
    }
  });

  const sendApplyGeneratedMethodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      error:
        "POST /api/files/apply-generated with JSON { content } or { contentBase64 }. GET is not file apply — Chrome DevTools opens a failed POST as GET.",
      code: "METHOD_NOT_ALLOWED",
    });
  };
  app.get("/api/files/apply-generated", sendApplyGeneratedMethodNotAllowed);
  app.head("/api/files/apply-generated", sendApplyGeneratedMethodNotAllowed);
  app.options("/api/files/apply-generated", (_req, res) => {
    res.setHeader("Allow", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-nebula-project-key");
    res.status(204).end();
  });
  app.post("/api/files/apply-generated", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      let raw = typeof req.body?.content === "string" ? req.body.content : "";
      if (!raw.trim() && typeof req.body?.contentBase64 === "string" && req.body.contentBase64.trim()) {
        try {
          raw = Buffer.from(String(req.body.contentBase64).trim(), "base64").toString("utf8");
        } catch {
          return res.status(400).json({ error: "contentBase64 is invalid" });
        }
      }
      if (!raw.trim()) return res.status(400).json({ error: "content is required" });
      raw = raw.replace(/"""file:/gi, "```file:").replace(/'''file:/gi, "```file:");

      type FileBlock = { relativePath: string; body: string };
      const blocks: FileBlock[] = [];

      const addBlock = (p: string, b: string) => {
        const cleanedPath = p.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/^\.\/+/, "");
        if (!cleanedPath) return;
        blocks.push({ relativePath: cleanedPath, body: b.replace(/\r\n/g, "\n") });
      };

      // Pattern 1: ```file:path/to/file.ext ... ```
      const reInline = /```(?:file|filepath)\s*:\s*([^\n`]+)\n([\s\S]*?)```/gi;
      let m1: RegExpExecArray | null;
      while ((m1 = reInline.exec(raw)) !== null) addBlock(m1[1], m1[2]);

      // Pattern 2: File: path/to/file.ext \n ```lang ... ```
      const reHeader = /(?:^|\n)\s*(?:File|FILE)\s*:\s*([^\n]+)\n```[^\n]*\n([\s\S]*?)```/g;
      let m2: RegExpExecArray | null;
      while ((m2 = reHeader.exec(raw)) !== null) addBlock(m2[1], m2[2]);

      // Pattern 3: Raw multi-file format:
      // src/main.jsx
      // <code...>
      // src/App.jsx
      // <code...>
      const pathLine = /^\s*(?:\.\/)?([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\.[A-Za-z0-9]+)\s*$/;
      const lines = raw.replace(/\r\n/g, "\n").split("\n");
      let currentPath: string | null = null;
      let currentBody: string[] = [];
      const flushCurrent = () => {
        if (!currentPath) return;
        const body = currentBody.join("\n").trim();
        if (body) addBlock(currentPath, body);
        currentPath = null;
        currentBody = [];
      };
      for (const line of lines) {
        const m = line.match(pathLine);
        if (m) {
          flushCurrent();
          currentPath = m[1];
          continue;
        }
        if (currentPath) currentBody.push(line);
      }
      flushCurrent();

      let fallbackPath: string | null = null;
      if (blocks.length === 0) {
        const trimmed = raw.trim();
        // Heuristic fallback when model returns a single raw file body with no path wrapper.
        if (/function\s+App\s*\(|export\s+default\s+App|<Route\s+path=|react-router/i.test(trimmed)) {
          fallbackPath = "app/page.tsx";
        } else if (/^<!DOCTYPE html>/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
          fallbackPath = "index.html";
        } else if (/^import\s+.*from\s+['"][^'"]+['"]/m.test(trimmed) && /export\s+default/m.test(trimmed)) {
          fallbackPath = "app/page.tsx";
        }
        if (fallbackPath) {
          addBlock(fallbackPath, trimmed);
        }
      }
      if (blocks.length === 0) {
        return res.status(422).json({
          error:
            "No file blocks found. Expected format: ```file:path/to/file.ext ...``` or `File: path` followed by fenced code.",
        });
      }

      const deny = /(^|\/)\.git(\/|$)|(^|\/)\.cursor(\/|$)|(^|\/)node_modules(\/|$)/i;
      const written: string[] = [];
      const skipped: string[] = [];
      const seen = new Set<string>();

      // Hard gate: no Supabase/Firebase files unless Master Plan / note names that vendor.
      let planBlob = "";
      try {
        const ppGate = projectPathsFor(req);
        if (fs.existsSync(ppGate.masterPlanPath)) {
          planBlob = fs.readFileSync(ppGate.masterPlanPath, "utf8");
        }
      } catch {
        /* ignore */
      }
      const userNoteGate =
        typeof req.body?.userNote === "string" ? String(req.body.userNote) : "";
      const baasPlanNote = `${planBlob}\n${userNoteGate}`;
      const baasFilter = filterUnsolicitedBaaSBlocks(blocks, baasPlanNote);
      const blocksToWrite = baasFilter.kept;
      for (const p of baasFilter.skipped) skipped.push(p);

      for (const b of blocksToWrite) {
        if (seen.has(b.relativePath)) continue;
        seen.add(b.relativePath);

        if (deny.test(b.relativePath) || b.relativePath.includes("..")) {
          skipped.push(b.relativePath);
          continue;
        }
        const target = path.resolve(workspaceRoot, b.relativePath);
        if (!target.startsWith(workspaceRoot)) {
          skipped.push(b.relativePath);
          continue;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, b.body, "utf8");
        written.push(b.relativePath);
      }

      const applyDepth = assessApplyRouteDepth(written);

      // Ack writes immediately. Preview/mind-map used to run before res.json
      // and left chat stuck on "Applying N file(s) to workspace".
      res.json({
        success: true,
        written,
        writtenCount: written.length,
        skipped,
        parsedBlocks: blocks.length,
        usedFallbackPath: fallbackPath || undefined,
        baasSkippedReason: baasFilter.reason || undefined,
        runnableRoot: false,
        appRoot: ".",
        framework: "unknown",
        runnableStatusLine: undefined,
        skeletonWritten: undefined,
        deployable: false,
        interactivePreview: false,
        productRoutes: applyDepth.productRoutes,
        thinCodeShell: applyDepth.thinCodeShell,
        zeroProductRoutes: applyDepth.zeroProductRoutes,
      });

      if (written.length > 0) {
        const pp = projectPathsFor(req);
        const body = req.body || {};
        const projectName =
          typeof body.projectName === "string" && body.projectName.trim()
            ? String(body.projectName).trim()
            : "Untitled Project";
        const userNote = typeof body.userNote === "string" ? body.userNote.trim() : "";
        const writtenSnapshot = [...written];
        setTimeout(() => {
          try {
            const diskUi = listProductUiFiles(workspaceRoot, 24);
            const diskDepth = assessApplyRouteDepth(diskUi.length ? diskUi : writtenSnapshot);
            if (!diskDepth.zeroProductRoutes) {
              ensureInteractiveProductPreview(workspaceRoot, {
                projectName,
                productFiles: diskUi.length ? diskUi : writtenSnapshot,
              });
            }
            if (writtenPathsNeedRunnableSkeleton(writtenSnapshot)) {
              ensureRunnableSkeleton(workspaceRoot, { projectName });
            }
            bootstrapMasterPlanFromWorkspace({
              workspaceRoot: pp.workspaceRoot,
              masterPlanPath: pp.masterPlanPath,
              projectName,
              userNote,
            });
            hydrateAndPersistMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
            syncMindMapFromMasterPlan({
              workspaceRoot: pp.workspaceRoot,
              masterPlanPath: pp.masterPlanPath,
              projectLabel: projectName,
            });
          } catch (syncErr) {
            console.warn("[apply-generated] post-apply artifact sync:", syncErr);
          }
        }, 0);
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to apply generated files" });
    }
  });

  /** Product app runnable status (workspace root convention). */
  app.get("/api/workspace/runnable-status", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const status = inspectRunnableSkeleton(workspaceRoot);
      res.json({
        ok: true,
        ...status,
        runnableStatusLine: runnableStatusLine(status),
        deployable: status.runnable,
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "runnable status failed",
      });
    }
  });

  /**
   * Deploy path (MVP): ensure runnable skeleton + npm install + npm run build.
   * Does NOT redeploy the Nebulla platform Render service.
   * Public per-project URL hosting is deferred — returns build result + nextStep.
   */
  app.post("/api/workspace/deploy", async (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const body = req.body || {};
      const projectName =
        typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : "Untitled Project";
      const skipInstall = body.skipInstall === true;
      const pre = inspectRunnableSkeleton(workspaceRoot);
      if (!pre.hasPackageJson && !workspaceHasCodedAppUi(workspaceRoot)) {
        return res.status(422).json({
          ok: false,
          mode: "build_check",
          error: "No product app root — missing package.json and product UI files",
          url: null,
          nextStep: "Run a Foundation/Primary coding slice first, then Deploy / Build check.",
        });
      }
      const result = await runWorkspaceBuildCheck(workspaceRoot, {
        projectName,
        skipInstall,
      });
      return res.status(result.ok ? 200 : 422).json(result);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        mode: "build_check",
        error: e instanceof Error ? e.message : "Deploy / build check failed",
        url: null,
      });
    }
  });

  app.post("/api/workspace/build-check", async (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const body = req.body || {};
      const projectName =
        typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : "Untitled Project";
      const result = await runWorkspaceBuildCheck(workspaceRoot, {
        projectName,
        skipInstall: body.skipInstall === true,
      });
      return res.status(result.ok ? 200 : 422).json(result);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        mode: "build_check",
        error: e instanceof Error ? e.message : "Build check failed",
        url: null,
      });
    }
  });

  function collectWorkspaceFiles(workspaceRoot: string): { relativePath: string; size: number; mtimeMs: number }[] {
    const out: { relativePath: string; size: number; mtimeMs: number }[] = [];
    if (!fs.existsSync(workspaceRoot)) return out;

    const stack: string[] = [workspaceRoot];
    while (stack.length > 0 && out.length < 3000) {
      const dir = stack.pop()!;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of dirents) {
        if (d.name === ".git" || d.name === "node_modules") continue;
        const abs = path.join(dir, d.name);
        if (d.isDirectory()) {
          stack.push(abs);
        } else {
          try {
            const st = fs.statSync(abs);
            const rel = path.relative(workspaceRoot, abs).replace(/\\/g, "/");
            out.push({ relativePath: rel, size: st.size, mtimeMs: st.mtimeMs });
          } catch {
            /* skip */
          }
        }
      }
    }
    out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return out;
  }

  function parseGitPorcelain(stdout: string): { status: string; path: string }[] {
    const entries: { status: string; path: string }[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const status = line.slice(0, 2);
      let rest = line.slice(3);
      if (rest.startsWith('"') && rest.endsWith('"') && rest.length > 2) {
        rest = rest.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
      let filePath = rest.trim();
      if (filePath.includes(" -> ")) {
        filePath = filePath.split(" -> ").pop()!.trim();
      }
      entries.push({ status, path: filePath.replace(/\\/g, "/") });
    }
    return entries;
  }

  /** Git status + workspace tree for the active cloud project. */
  app.get("/api/source-control/overview", async (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const workspaceRoot = pp.workspaceRoot;
      const allFiles = collectWorkspaceFiles(workspaceRoot);
      const nebulaFiles = allFiles.filter((f) => isUserAppProductPath(f.relativePath));
      const nebulaProjectRelative = `cloud:${pp.projectKey}`;

      let git: {
        branch: string;
        entries: { status: string; path: string }[];
        error?: string;
        latestCommit?: {
          hash: string;
          shortHash: string;
          subject: string;
          author: string;
          date: string;
        } | null;
      } | null = null;

      if (fs.existsSync(path.join(workspaceRoot, ".git"))) {
        try {
          const { stdout: branchOut } = await execFileAsync(
            "git",
            ["-C", workspaceRoot, "branch", "--show-current"],
            { maxBuffer: 1024 * 1024, encoding: "utf8" }
          );
          const { stdout: porcOut } = await execFileAsync(
            "git",
            ["-C", workspaceRoot, "status", "--porcelain", "-u"],
            { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }
          );
          let latestCommit: {
            hash: string;
            shortHash: string;
            subject: string;
            author: string;
            date: string;
          } | null = null;
          try {
            const { stdout: logOut } = await execFileAsync(
              "git",
              ["-C", workspaceRoot, "log", "-1", "--format=%H|%h|%s|%an|%aI"],
              { maxBuffer: 1024 * 1024, encoding: "utf8" }
            );
            const line = (logOut || "").trim().split("\n")[0];
            if (line) {
              const [hash, shortHash, subject, author, date] = line.split("|");
              if (hash && shortHash) {
                latestCommit = {
                  hash,
                  shortHash,
                  subject: subject || "(no message)",
                  author: author || "Unknown",
                  date: date || new Date().toISOString(),
                };
              }
            }
          } catch {
            /* no commits yet */
          }
          git = {
            branch: (branchOut || "unknown").trim() || "unknown",
            entries: parseGitPorcelain(porcOut || "").filter((e) => isUserAppProductPath(e.path)),
            latestCommit,
          };
        } catch (e) {
          git = {
            branch: "?",
            entries: [],
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }

      res.json({
        nebulaProjectRoot: nebulaProjectRelative,
        nebulaFiles,
        git,
      });
    } catch (err: unknown) {
      console.error("/api/source-control/overview:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "overview failed" });
    }
  });

  async function readGitPorcelainEntries(workspaceRoot: string) {
    const { stdout: porcOut } = await execFileAsync(
      "git",
      ["-C", workspaceRoot, "status", "--porcelain", "-u"],
      { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }
    );
    return parseGitPorcelain(porcOut || "").filter((e) => isUserAppProductPath(e.path));
  }

  async function ensureGitCommitIdentity(workspaceRoot: string) {
    try {
      await execFileAsync("git", ["-C", workspaceRoot, "var", "GIT_AUTHOR_IDENT"], {
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      });
    } catch {
      await execFileAsync("git", ["-C", workspaceRoot, "config", "user.email", "nebulla@users.noreply.local"], {
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      });
      await execFileAsync("git", ["-C", workspaceRoot, "config", "user.name", "Nebulla"], {
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      });
    }
  }

  /** Stage product-path changes (`git add`). Body: `{ paths?: string[] }` — omit to stage all unstaged. */
  app.post("/api/source-control/stage", async (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      if (!fs.existsSync(path.join(workspaceRoot, ".git"))) {
        return res.status(400).json({ error: "No git repository in this workspace" });
      }
      const rawPaths = Array.isArray(req.body?.paths) ? req.body.paths : null;
      let paths: string[];
      if (rawPaths && rawPaths.length > 0) {
        const cleaned: string[] = rawPaths
          .filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
          .map((p: string) => p.replace(/\\/g, "/").replace(/^\.\/+/, ""))
          .filter((p: string) => isUserAppProductPath(p));
        paths = [...new Set(cleaned)];
      } else {
        const entries = await readGitPorcelainEntries(workspaceRoot);
        paths = [
          ...new Set(
            entries
              .filter((e) => {
                const idx = e.status[0] ?? " ";
                const wt = e.status[1] ?? " ";
                return wt !== " " || idx === "?";
              })
              .map((e) => e.path)
          ),
        ];
      }
      if (paths.length === 0) {
        return res.json({ ok: true, staged: 0 });
      }
      await execFileAsync("git", ["-C", workspaceRoot, "add", "--", ...paths], {
        maxBuffer: 10 * 1024 * 1024,
        encoding: "utf8",
      });
      res.json({ ok: true, staged: paths.length, paths });
    } catch (err: unknown) {
      console.error("/api/source-control/stage:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "stage failed" });
    }
  });

  /** Commit staged product changes. Body: `{ message: string }`. */
  app.post("/api/source-control/commit", async (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      if (!fs.existsSync(path.join(workspaceRoot, ".git"))) {
        return res.status(400).json({ error: "No git repository in this workspace" });
      }
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) {
        return res.status(400).json({ error: "Commit message is required" });
      }
      const entries = await readGitPorcelainEntries(workspaceRoot);
      const hasStaged = entries.some((e) => {
        const idx = e.status[0] ?? " ";
        return idx !== " " && idx !== "?";
      });
      if (!hasStaged) {
        return res.status(400).json({ error: "Nothing staged to commit — stage changes first" });
      }
      await ensureGitCommitIdentity(workspaceRoot);
      const { stdout } = await execFileAsync(
        "git",
        ["-C", workspaceRoot, "commit", "-m", message],
        { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }
      );
      res.json({ ok: true, output: (stdout || "").trim() });
    } catch (err: unknown) {
      console.error("/api/source-control/commit:", err);
      const msg =
        err && typeof err === "object" && "stderr" in err && typeof (err as { stderr: unknown }).stderr === "string"
          ? (err as { stderr: string }).stderr.trim()
          : err instanceof Error
            ? err.message
            : "commit failed";
      res.status(500).json({ error: msg || "commit failed" });
    }
  });

  // Example backend function: execute terminal command
  app.post("/api/terminal/exec", (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ output: "No command provided" });
    }
    const { workspaceRoot } = projectPathsFor(req);
    
    // Execute the command in the current working directory
    exec(command, { cwd: workspaceRoot, timeout: 30000 }, (error, stdout, stderr) => {
      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += stderr;
      
      if (error) {
        if (error.killed) {
          output += "\n[Error: Command timed out after 30 seconds]";
        } else if (!stdout && !stderr) {
          output += `\n[Error: ${error.message}]`;
        }
      }
      
      res.json({ output: output || "Command executed successfully with no output." });
    });
  });

  app.post("/api/render/deploy", async (_req, res) => {
    try {
      const renderApiKey = process.env.RENDER_API_KEY?.trim();
      const serviceId = process.env.RENDER_SERVICE_ID?.trim();
      const deployHookUrl = process.env.RENDER_DEPLOY_HOOK_URL?.trim();
      const baseUrl = (process.env.RENDER_API_BASE_URL || "https://api.render.com/v1").replace(/\/$/, "");

      if (serviceId && renderApiKey) {
        const r = await fetch(`${baseUrl}/services/${serviceId}/deploys`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${renderApiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });
        const bodyText = await r.text();
        if (!r.ok) {
          return res.status(r.status).json({ error: `Render deploy failed: ${bodyText.slice(0, 300)}` });
        }
        let payload: any = {};
        try {
          payload = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          payload = {};
        }
        const deployId = payload?.id || payload?.deploy?.id || payload?.deployId || null;
        const status = payload?.status || payload?.deploy?.status || "created";
        return res.json({
          ok: true,
          mode: "service-api",
          serviceId,
          deployId,
          status,
          raw: payload,
        });
      }

      if (deployHookUrl) {
        const r = await fetch(deployHookUrl, { method: "POST" });
        const bodyText = await r.text();
        if (!r.ok) {
          return res.status(r.status).json({ error: `Render deploy hook failed: ${bodyText.slice(0, 300)}` });
        }
        let payload: any = {};
        try {
          payload = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          payload = {};
        }
        return res.json({
          ok: true,
          mode: "deploy-hook",
          status: "triggered",
          raw: payload,
        });
      }

      return res.status(503).json({
        error:
          "Render deploy is not configured. Set RENDER_SERVICE_ID + RENDER_API_KEY, or set RENDER_DEPLOY_HOOK_URL.",
      });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown Render deploy error",
      });
    }
  });

  app.get("/api/render/deploy/status", async (req, res) => {
    try {
      const deployId = typeof req.query.deployId === "string" ? req.query.deployId.trim() : "";
      if (!deployId) return res.status(400).json({ error: "deployId is required" });

      const renderApiKey = process.env.RENDER_API_KEY?.trim();
      const serviceId = process.env.RENDER_SERVICE_ID?.trim();
      if (!renderApiKey || !serviceId) {
        return res.status(503).json({ error: "RENDER_API_KEY and RENDER_SERVICE_ID are required for status polling" });
      }
      const baseUrl = (process.env.RENDER_API_BASE_URL || "https://api.render.com/v1").replace(/\/$/, "");
      const r = await fetch(`${baseUrl}/services/${serviceId}/deploys/${deployId}`, {
        headers: {
          Authorization: `Bearer ${renderApiKey}`,
          Accept: "application/json",
        },
      });
      const bodyText = await r.text();
      if (!r.ok) {
        return res.status(r.status).json({ error: `Render deploy status failed: ${bodyText.slice(0, 300)}` });
      }
      let payload: any = {};
      try {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        payload = {};
      }
      const status =
        payload?.status ||
        payload?.deploy?.status ||
        payload?.state ||
        payload?.deploy?.state ||
        "unknown";
      const message =
        payload?.message ||
        payload?.deploy?.message ||
        payload?.error ||
        payload?.deploy?.error ||
        "";
      res.json({ ok: true, status, message, raw: payload });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown Render status polling error",
      });
    }
  });

  app.get("/auth/callback", (_req, res) => {
    res.redirect(302, "/");
  });

  app.post("/api/leads", (req, res) => {
    const { email, action } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    
    console.log(`[LEAD CAPTURED] Email: ${email}, Action: ${action}, Time: ${new Date().toISOString()}`);
    // In a real app, we would save this to a database
    res.json({ success: true });
  });

  /** Stripe Checkout — requires BILLING_ENABLED=true + STRIPE_SECRET_KEY (+ STRIPE_PRICE_PRO / STRIPE_PRICE_POWER). */
  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      if (process.env.BILLING_ENABLED !== "true") {
        return res.status(503).json({
          error: "Billing not enabled",
          message:
            "Nebulla beta is free — checkout is paused. Set BILLING_ENABLED=true when you are ready to charge.",
        });
      }
      const secret =
        process.env.STRIPE_SECRET_KEY?.trim() ||
        process.env.STRIPE_SECRET_KEY_LIVE?.trim() ||
        process.env.STRIPE_SECRET_KEY_TEST?.trim() ||
        "";
      if (!secret) {
        return res.status(503).json({
          error: "Payments are not configured",
          message:
            "Stripe is not configured on this server yet. Set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO (or STRIPE_PRICE_POWER), then redeploy.",
        });
      }

      const uid = readNebulaSessionUserId(req);
      if (!uid) return res.status(401).json({ error: "Sign in to upgrade." });

      const plan = String(req.body?.plan || "pro").trim().toLowerCase();
      const priceId =
        plan === "power"
          ? process.env.STRIPE_PRICE_POWER?.trim() || process.env.STRIPE_PRICE_PRO?.trim() || ""
          : process.env.STRIPE_PRICE_PRO?.trim() || "";
      if (!priceId) {
        return res.status(503).json({
          error: "Price not configured",
          message: `No Stripe price id for plan "${plan}". Set STRIPE_PRICE_PRO / STRIPE_PRICE_POWER in the environment.`,
        });
      }

      const site =
        process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(secret);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${site}/app?checkout=success`,
        cancel_url: `${site}/payment?canceled=1`,
        client_reference_id: uid,
        metadata: { nebula_user_id: uid, nebula_plan: plan === "power" ? "power" : "pro" },
      });
      if (!session.url) {
        return res.status(500).json({ error: "Stripe did not return a checkout URL" });
      }
      return res.json({ ok: true, url: session.url });
    } catch (e) {
      console.error("[stripe/checkout]", e);
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Checkout failed",
        message: "Could not start Stripe Checkout. Check API keys and price IDs.",
      });
    }
  });

  app.post("/api/nebula-ui-studio/prompt", (req, res) => {
    const { prompt } = req.body || {};
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }
    try {
      const { nebulaUiStudioPath } = projectPathsFor(req);
      ensureNebulaUiStudioFileAt(nebulaUiStudioPath);
      const existing = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const withPrompt = upsertNebulaCommentSection(existing, "NEBULA_UI_STUDIO_PROMPT", prompt);
      const existingCode = extractNebulaCommentSection(withPrompt, "NEBULA_UI_STUDIO_CODE");
      const finalContent = upsertNebulaCommentSection(withPrompt, "NEBULA_UI_STUDIO_CODE", existingCode || "No approved UI code yet.");
      fs.writeFileSync(nebulaUiStudioPath, finalContent, "utf8");
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to save Nebula UI Studio prompt:", err);
      res.status(500).json({ error: "Failed to save prompt" });
    }
  });

  const handleV0Start = async (req: express.Request, res: express.Response) => {
    try {
      const body = req.body || {};
      const { promptText, projectDisplayName } = buildV0PromptTextForRequest(req, body);
      if (!promptText.trim()) {
        return res.status(400).json({ error: "v0-prompt.md is empty — save Master Plan §4+§5 first." });
      }

      const keyRes = resolveV0ApiKeyFromRequest(req);
      if (keyRes.ok === false) {
        return res.status(keyRes.code === "INVALID_LENGTH" ? 400 : 401).json({
          error: keyRes.message,
          hint: keyRes.hint,
        });
      }

      const { workspaceRoot } = projectPathsFor(req);
      const existing = readV0Pending(workspaceRoot);

      if (existing?.startError && !existing.chatId) {
        clearV0Pending(workspaceRoot);
      } else if (existing?.startError && existing.chatId) {
        return res.json({
          ok: true,
          chatId: existing.chatId,
          pending: true,
          resumed: true,
          hint: "Resuming v0 chat after a slow run — poll /v0-poll (no new charge).",
        });
      }

      if (existing?.chatId && !hasRealV0ApiGeneration(workspaceRoot)) {
        return res.json({
          ok: true,
          chatId: existing.chatId,
          pending: true,
          resumed: true,
          hint: "Resuming an in-progress v0 chat (no new charge). Poll /v0-poll next.",
        });
      }

      const startStale =
        isV0StartStale(existing) && !isV0StartJobActive(workspaceRoot);
      if ((existing?.starting || isV0StartJobActive(workspaceRoot)) && !startStale) {
        return res.json({
          ok: true,
          chatId: existing?.chatId || undefined,
          pending: true,
          starting: true,
          elapsedMs: v0StartElapsedMs(existing),
          hint: "v0 chat is starting — poll /api/nebula-ui-studio/v0-poll every few seconds (no new charge).",
        });
      }

      kickV0BackgroundStart(req, workspaceRoot, keyRes.apiKey, promptText, projectDisplayName);

      return res.json({
        ok: true,
        pending: true,
        starting: true,
        hint: startStale
          ? "Recovered a stalled v0 start — polling will continue (no new charge)."
          : "v0 chat starting in background — poll /api/nebula-ui-studio/v0-poll until files land.",
      });
    } catch (e) {
      console.error("[nebula-ui-studio/v0-start]", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "v0 start failed" });
    }
  };

  const rejectFrozenV0: express.RequestHandler = (_req, res) => {
    res.status(410).json({ error: LEGACY_V0_FROZEN_MESSAGE, uiStudioBeta: true });
  };
  const mountV0 = <T extends express.RequestHandler>(handler: T): express.RequestHandler =>
    isLegacyV0ApiFrozen() ? rejectFrozenV0 : handler;

  app.post("/api/nebula-ui-studio/v0-start", mountV0(handleV0Start));
  /** Legacy bundles called this before v0-start/v0-poll (Render-safe background start). */
  app.post("/api/nebulla-v0-generate", mountV0(handleV0Start));
  app.post("/api/nebula-v0-generate", mountV0(handleV0Start));

  const handleV0Poll = async (req: express.Request, res: express.Response) => {
    try {
      const body = req.body || {};
      const { workspaceRoot } = projectPathsFor(req);
      const jobActive = isV0StartJobActive(workspaceRoot);
      expireStaleV0Pending(workspaceRoot, { jobActive });
      const projectDisplayName =
        typeof body.projectDisplayName === "string" && body.projectDisplayName.trim()
          ? String(body.projectDisplayName).trim()
          : undefined;
      let pending = readV0Pending(workspaceRoot);
      if (pending?.startError && pending.chatId) {
        // Prior apply may have failed — still try fetching files from v0 (no new charge).
        console.warn("[v0-poll] prior startError, retrying fetch:", pending.startError.slice(0, 120));
      }
      if (pending?.startError && !pending.chatId) {
        const err = pending.startError;
        clearV0Pending(workspaceRoot);
        return res.status(422).json({
          error: err,
          hint: "Fix the issue above, then click Generate v0 once to retry.",
        });
      }
      const chatIdFromBody =
        typeof body.chatId === "string" && body.chatId.trim() ? body.chatId.trim() : "";
      const chatIdFromPending = pending?.chatId?.trim() || "";
      const resolvedChatId = chatIdFromBody || chatIdFromPending;
      const awaitingChatId =
        (pending?.starting && !chatIdFromPending) || (jobActive && !resolvedChatId);
      if (awaitingChatId) {
        const elapsedMs = v0StartElapsedMs(pending);
        const stale =
          isV0StartStale(pending) && !isV0StartJobActive(workspaceRoot);
        if (stale) {
          const keyRes = resolveV0ApiKeyFromRequest(req);
          const promptText =
            readV0PromptMarkdown(workspaceRoot).trim() ||
            pending?.promptPreview?.trim() ||
            "";
          const recoveries = pending?.recoveryCount ?? 0;
          if (keyRes.ok && promptText && recoveries < 3) {
            bumpV0PendingRecovery(workspaceRoot);
            kickV0BackgroundStart(
              req,
              workspaceRoot,
              keyRes.apiKey,
              promptText,
              projectDisplayName || pending?.projectDisplayName,
            );
          } else if (!promptText) {
            clearV0Pending(workspaceRoot);
            return res.status(422).json({
              error: "v0 start stalled and v0-prompt.md is missing. Save Master Plan §4+§5 first.",
            });
          } else {
            clearV0Pending(workspaceRoot);
            return res.status(422).json({
              error: "v0 session expired after repeated stale recoveries. Click Generate v0 once to start fresh.",
              hint: "Use Cancel stale v0 in UI Studio or Reset project in Settings if this repeats.",
            });
          }
        }
        return res.json({
          ok: true,
          pending: true,
          starting: !resolvedChatId,
          chatId: resolvedChatId || pending?.chatId || undefined,
          elapsedMs,
          recovered: stale,
          hint: stale
            ? "Recovered stalled v0 start — keep polling (no new charge)."
            : resolvedChatId
              ? "v0 chat created — fetching files from v0 API…"
              : elapsedMs > 120_000
                ? "v0-pro is still working — keep polling (typically 1–4 min, no new charge)."
                : "v0 is still starting on the server — keep polling (no new charge).",
        });
      }
      const chatId = resolvedChatId;
      if (hasRealV0ApiGeneration(workspaceRoot)) {
        clearV0Pending(workspaceRoot);
        const editorSt = readEditorState(workspaceRoot);
        const demoUrl = editorSt.v0DemoUrl || readV0DemoUrl(workspaceRoot);
        return res.json({
          ok: true,
          pending: false,
          source: "v0",
          chatId: chatId || editorSt.v0ChatId || "",
          written: ["app/layout.tsx"],
          demoUrl: demoUrl || undefined,
          hint: "v0 files already in workspace — refresh preview if needed.",
        });
      }
      if (!chatId) {
        const keyRes = resolveV0ApiKeyFromRequest(req);
        if (keyRes.ok === false) {
          return res.status(keyRes.code === "INVALID_LENGTH" ? 400 : 401).json({
            error: keyRes.message,
            hint: keyRes.hint,
          });
        }
        const ppPoll = projectPathsFor(req);
        let promptText = ensureV0PromptSynced(ppPoll).content;
        if (!promptText.trim()) {
          return res.status(400).json({
            error: "v0-prompt.md is empty — save Master Plan §4+§5 first.",
            hint: "Open Master Plan tabs 4+5, save, or press Go so routes from app/ hydrate the prompt.",
          });
        }
        return res.json({
          ok: true,
          pending: false,
          idle: true,
          hint: "No v0 chat in progress — click Generate v0 in UI Studio once.",
        });
      }

      const pass = await runV0PollPass(req, chatId, projectDisplayName, pending?.promptPreview);
      if (pass.ok === true && pass.pending === false && "written" in pass && pass.written.length > 0) {
        console.log(`[v0-poll] Applied ${pass.written.length} file(s) for chat ${chatId.slice(0, 12)}…`);
      }
      if (pass.ok === false) {
        const errLower = String(pass.error ?? "").toLowerCase();
        const creditsLike =
          errLower.includes("credit") ||
          errLower.includes("quota") ||
          errLower.includes("billing") ||
          pass.status === 402 ||
          pass.status === 429;
        if (creditsLike) {
          const displayName = projectDisplayName || "Untitled Project";
          const written = writeBasicUiScaffold(workspaceRoot, displayName);
          ensurePreviewIndexHtml(workspaceRoot, displayName);
          clearV0Pending(workspaceRoot);
          return res.json({
            ok: true,
            source: "basic-scaffold",
            written,
            error: pass.error,
            hint: "V0 credits unavailable — basic HTML preview written.",
          });
        }
        return res.status(pass.status).json({ error: pass.error, hint: pass.hint });
      }
      if (pass.pending) {
        return res.json({
          ok: true,
          pending: true,
          chatId: pass.chatId,
          versionStatus: pass.versionStatus,
          demoUrl: pass.demoUrl,
          hint: pass.demoUrl
            ? "v0 preview URL is ready — still waiting for file payload to land in the workspace."
            : undefined,
        });
      }
      const source = "source" in pass && pass.source ? pass.source : "v0";
      return res.json({ ok: true, pending: false, source, ...pass });
    } catch (e) {
      console.error("[nebula-ui-studio/v0-poll]", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "v0 poll failed" });
    }
  };

  app.post("/api/nebula-ui-studio/v0-poll", mountV0(handleV0Poll));
  app.post("/api/nebulla-v0-poll", mountV0(handleV0Poll));
  app.post("/api/nebula-v0-poll", mountV0(handleV0Poll));

  /** Clear stale v0 pending state (errors, stuck sessions) so Generate v0 can retry. */
  app.post(
    "/api/nebula-ui-studio/v0-clear",
    mountV0((req, res) => {
      try {
        const pp = projectPathsFor(req);
        const cleared = cancelProjectBackgroundAttempts(pp.workspaceRoot);
        return res.json({ ok: true, cleared });
      } catch (err: unknown) {
        return res.status(500).json({
          error: err instanceof Error ? err.message : "v0 clear failed",
        });
      }
    }),
  );

  app.post("/api/nebula-ui-studio/v0-generate", mountV0(handleV0Start));

  app.post("/api/nebula-ui-studio/v0-update", mountV0(async (req, res) => {
    const body = req.body || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    if (!message) return res.status(400).json({ error: "message is required" });
    if (!chatId) return res.status(400).json({ error: "chatId is required for v0 updates" });
    try {
      const pass = await runV0UiStudioPass({
        req,
        message,
        chatId,
        projectDisplayName:
          typeof body.projectDisplayName === "string" ? body.projectDisplayName : undefined,
      });
      if (pass.ok === false) {
        if (pass.pending && pass.chatId) {
          return res.json({
            ok: true,
            pending: true,
            chatId: pass.chatId,
            written: [],
            hint: pass.hint ?? pass.error,
          });
        }
        return res.status(pass.status).json({
          error: pass.hint ?? pass.error,
          hint: pass.hint,
        });
      }
      return res.json({
        ok: true,
        source: "v0",
        pending: false,
        chatId: pass.chatId,
        written: pass.written,
        skipped: pass.skipped,
        demoUrl: pass.demoUrl,
      });
    } catch (e) {
      console.error("[nebula-ui-studio/v0-update]", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "v0 update failed" });
    }
  }));

  app.post("/api/nebula-ui-studio/generate", async (req, res) => {
    const { pagesText, branding } = req.body;
    const pencilKey = isPencilApiFrozen() ? "" : resolvePencilApiKey();
    const pencilUrl = resolvePencilMockupsUrl();
    const variationIndex = typeof req.body?.variationIndex === "number" ? req.body.variationIndex : 0;

    try {
      const { nebulaUiStudioPath, workspaceRoot } = projectPathsFor(req);
      ensureNebulaUiStudioFileAt(nebulaUiStudioPath);
      const uiStudioFile = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const storedPrompt = extractNebulaCommentSection(uiStudioFile, "NEBULA_UI_STUDIO_PROMPT");
      const skillExcerpt = readSkillDesignSystemExcerpt(workspaceRoot);

      const body = buildNebulaUiStudioPromptBody({
        storedPrompt,
        skillExcerpt,
        pagesText: typeof pagesText === "string" ? pagesText : "",
        branding,
      });
      const promptText = String((body as { prompt?: string }).prompt ?? "");

      // SVG mockups only — full v0 file generation uses /v0-start + /v0-poll (Render-safe background job).
      const grokKey = await resolveMainGrokApiKey(req);

      if (grokKey) {
        try {
          const { svg } = await callGrokGenerateUiSvg({
            apiKey: grokKey,
            fullPromptText: promptText,
            variationIndex,
          });
          const r2 = await r2FieldsForSvg(
            projectDiskKey(req),
            svg,
            `grok-variation-${variationIndex}.svg`
          );
          return res.json({ svg, usedPrompt: storedPrompt || "", source: "grok-4", ...r2 });
        } catch (grokErr) {
          console.warn("[nebula-ui-studio/generate] Grok SVG failed, trying fallbacks:", grokErr);
        }
      }

      if (pencilKey) {
        const result = await callPencilMockupsGenerate({ apiKey: pencilKey, apiUrl: pencilUrl, body });
        if (result.ok === true) {
        const raw = result.raw as Record<string, unknown>;
          const r2 = await r2FieldsForSvg(
            projectDiskKey(req),
            result.svg,
            `pencil-variation-${variationIndex}.svg`
          );
          return res.json({ ...raw, svg: result.svg, usedPrompt: storedPrompt || "", source: "pencil", ...r2 });
        }
        console.warn("[nebula-ui-studio/generate] Pencil failed, using bundled SVG:", result.error);
      }

      if (useBundledDemoMockupWithoutKey()) {
        const svg = loadBundledDemoMockupSvg();
        const r2 = await r2FieldsForSvg(
          projectDiskKey(req),
          svg,
          `demo-variation-${variationIndex}.svg`
        );
        return res.json({
          svg,
          demoMode: true,
          usedPrompt: storedPrompt || "",
          message:
            process.env.NODE_ENV === "production"
              ? `Bundled demo mockup. Set ${MAIN_AI_ENV_VAR} (recommended) or PENCIL_API_KEY for live generation.`
              : `Bundled demo mockup (dev). Set ${MAIN_AI_ENV_VAR} or PENCIL_API_KEY for live output.`,
          source: "demo",
          ...r2,
        });
      }

      const pp = projectPathsFor(req);
      const displayName =
        typeof req.body?.projectDisplayName === "string" ? req.body.projectDisplayName : "Untitled Project";
      writeBasicUiScaffold(pp.workspaceRoot, displayName);
      ensurePreviewIndexHtml(pp.workspaceRoot, displayName);
      const svg = loadBundledDemoMockupSvg();
      const r2 = await r2FieldsForSvg(projectDiskKey(req), svg, `fallback-variation-${variationIndex}.svg`);
      return res.json({
        svg,
        demoMode: true,
        usedPrompt: storedPrompt || "",
        source: "basic-scaffold",
        message:
          "V0/Grok/Pencil unavailable — using bundled demo mockup and basic HTML preview. Open Preview in the IDE.",
        ...r2,
      });
    } catch (error) {
      console.error("Error calling Nebula UI Studio engine:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/nebula-ui-studio/generate",
      });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to call Nebula UI Studio engine" });
    }
  });

  app.post("/api/nebula-ui-studio/analyze-edit", async (req, res) => {
    const { originalCode, editedCode } = req.body || {};
    if (typeof originalCode !== "string" || typeof editedCode !== "string") {
      return res.status(400).json({ error: "originalCode and editedCode strings are required" });
    }
    const grokKey = await resolveMainGrokApiKey(req);
    const heuristic = heuristicSvgEditRisks(originalCode, editedCode);
    try {
      if (grokKey) {
        const ai = await callGrokAnalyzeSvgEdit({ apiKey: grokKey, originalCode, editedCode });
        const merged = [...new Set([...heuristic, ...ai.warnings])];
        return res.json({
          warnings: merged,
          summary: ai.summary,
          source: "grok+heuristic",
        });
      }
    } catch (e) {
      console.warn("[analyze-edit] Grok analysis failed, heuristic only:", e);
    }
    res.json({ warnings: heuristic, summary: "", source: "heuristic" });
  });

  app.post("/api/nebula-ui-studio/adapt-edit", async (req, res) => {
    const { editedCode, warningsSummary } = req.body || {};
    if (typeof editedCode !== "string" || !editedCode.trim()) {
      return res.status(400).json({ error: "editedCode is required" });
    }
    const grokKey = await resolveMainGrokApiKey(req);
    if (!grokKey) {
      return res.status(400).json({
        error: `Main AI API key missing. Set ${MAIN_AI_ENV_VAR} in the server .env file and restart.`,
      });
    }
    try {
      const { svg } = await callGrokAdaptUserSvg({
        apiKey: grokKey,
        editedCode,
        warningsSummary: typeof warningsSummary === "string" ? warningsSummary : "",
      });
      const r2 = await r2FieldsForSvg(projectDiskKey(req), svg, "adapted-ui.svg");
      res.json({ svg, ...r2 });
    } catch (e) {
      console.error("[adapt-edit]", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Adapt failed" });
    }
  });

  app.post("/api/nebula-ui-studio/approve", async (req, res) => {
    const { code } = req.body || {};
    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "code is required" });
    }
    try {
      const trimmed = code.trim();
      const pk = projectDiskKey(req);
      const { nebulaUiStudioPath, nebulaUiStudioOutputDir } = projectPathsFor(req);
      ensureNebulaUiStudioFileAt(nebulaUiStudioPath);
      const existing = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const promptText = extractNebulaCommentSection(existing, "NEBULA_UI_STUDIO_PROMPT") || "No prompt generated yet.";
      const withPrompt = upsertNebulaCommentSection(existing, "NEBULA_UI_STUDIO_PROMPT", promptText);

      const r2 = await tryUploadBufferToR2({
        projectKey: pk,
        category: "generated",
        filename: "approved-ui.svg",
        body: Buffer.from(trimmed, "utf8"),
        contentType: "image/svg+xml",
      });

      const codeForStudio = r2?.url
        ? `R2 asset URL: ${r2.url}\n\n${trimmed}`
        : trimmed;
      const withCode = upsertNebulaCommentSection(withPrompt, "NEBULA_UI_STUDIO_CODE", codeForStudio);
      fs.writeFileSync(nebulaUiStudioPath, withCode, "utf8");
      fs.mkdirSync(path.join(nebulaUiStudioOutputDir, "approved"), { recursive: true });
      fs.writeFileSync(path.join(nebulaUiStudioOutputDir, "approved", "approved-ui.svg"), trimmed, "utf8");
      res.json({
        success: true,
        ...(r2 ? { assetKey: r2.key, assetUrl: r2.url } : {}),
        storage: r2 ? "r2" : "local",
      });
    } catch (err) {
      console.error("Failed to save Nebula UI Studio code:", err);
      res.status(500).json({ error: "Failed to save approved code" });
    }
  });

  app.get("/api/nebula-ui-studio/code", (req, res) => {
    try {
      const { nebulaUiStudioPath } = projectPathsFor(req);
      ensureNebulaUiStudioFileAt(nebulaUiStudioPath);
      const existing = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const code = extractNebulaCommentSection(existing, "NEBULA_UI_STUDIO_CODE");
      res.json({ code: code || "" });
    } catch (err) {
      console.error("Failed to read Nebula UI Studio code:", err);
      res.status(500).json({ error: "Failed to read Nebula UI Studio code" });
    }
  });

  const isAllowedVisualEditorWriteRel = (rel: string): boolean => {
    const n = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!n || n.includes("..")) return false;
    const prefixes = ["src/", "app/", "pages/", "components/", "public/"];
    return prefixes.some((p) => n.startsWith(p));
  };

  app.get("/api/visual-ui-editor/eligibility", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      if (process.env.NEBULA_VISUAL_EDITOR_DEV_UNLOCK === "true") {
        return res.json({
          eligible: true,
          reason: "dev_unlock_env",
          dev: true,
          canPersistPreview: true,
          workspaceCodingShell: hasWorkspaceCodingShell(workspaceRoot),
          originalV0FolderRel: resolveOriginalV0FolderRel(workspaceRoot),
        });
      }
      const r = isVisualEditorEligible(workspaceRoot);
      const persist = canPersistVisualPreviewModel(workspaceRoot);
      // UI Studio Beta / post-Go: treat coding shell as preview-eligible even without v0.
      const eligible = r.eligible || persist.ok;
      return res.json({
        eligible,
        reason: eligible ? r.reason || "workspace_coding_shell" : r.reason || persist.reason,
        canPersistPreview: persist.ok,
        workspaceCodingShell: hasWorkspaceCodingShell(workspaceRoot),
        originalV0FolderRel: resolveOriginalV0FolderRel(workspaceRoot),
      });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "eligibility failed" });
    }
  });

  app.post("/api/visual-ui-editor/v0-first-generation-complete", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const body = (req.body || {}) as {
        projectDisplayName?: string;
        files?: Record<string, string>;
        source?: string;
        notes?: string;
      };
      const projectNameSafe = sanitizeProjectNameForVersions(
        typeof body.projectDisplayName === "string" && body.projectDisplayName.trim()
          ? body.projectDisplayName
          : getProjectKeyFromRequest(req)
      );
      const files = body.files && typeof body.files === "object" ? body.files : undefined;
      markV0FirstGenerationComplete(workspaceRoot, projectNameSafe, {
        files,
        source: typeof body.source === "string" ? body.source : "v0-pipeline",
        notes: typeof body.notes === "string" ? body.notes : undefined,
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error("[visual-ui-editor] v0-first-generation-complete", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  app.post("/api/visual-ui-editor/version-snapshot", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const body = (req.body || {}) as { files?: Record<string, string> };
      const files = body.files && typeof body.files === "object" ? body.files : null;
      if (!files || Object.keys(files).length === 0) {
        return res.status(400).json({ error: "files map required" });
      }
      const rel = writeTimestampVersionDir(workspaceRoot, files);
      return res.json({ ok: true, snapshotRel: rel });
    } catch (e) {
      console.error("[visual-ui-editor] version-snapshot", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  app.post("/api/visual-ui-editor/revert-last-coded", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const st = readEditorState(workspaceRoot);
      const target = st.lastApplyVersionFolderRel;
      if (!target || typeof target !== "string") {
        return res.status(400).json({ error: "No per-file backup from the last code apply yet." });
      }
      const { restored } = restoreVersionBackupIntoWorkspace(workspaceRoot, target);
      return res.json({ ok: true, restored });
    } catch (e) {
      console.error("[visual-ui-editor] revert-last-coded", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  app.post("/api/visual-ui-editor/restore-original-v0", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const gate = isVisualEditorEligible(workspaceRoot);
      if (!gate.eligible && process.env.NEBULA_VISUAL_EDITOR_DEV_UNLOCK !== "true") {
        return res.status(403).json({ error: gate.reason || "Visual editor not eligible." });
      }
      const orig = resolveOriginalV0FolderRel(workspaceRoot);
      if (!orig) {
        return res.status(400).json({ error: "No immutable v0 original folder is registered for this project." });
      }
      const { restored } = restoreImmutableV0IntoWorkspace(workspaceRoot, orig);
      return res.json({ ok: true, originalV0FolderRel: orig, restored });
    } catch (e) {
      console.error("[visual-ui-editor] restore-original-v0", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  app.post("/api/visual-ui-editor/apply-visual-changes", async (req, res) => {
    const apiKey = await resolveMainGrokApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        error: `Main AI API key missing. Set ${MAIN_AI_ENV_VAR} in the server .env file and restart.`,
      });
    }
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const gate = isVisualEditorEligible(workspaceRoot);
      if (!gate.eligible && process.env.NEBULA_VISUAL_EDITOR_DEV_UNLOCK !== "true") {
        return res.status(403).json({ error: gate.reason || "Visual editor not eligible." });
      }

      const body = (req.body || {}) as {
        pageId?: string;
        previewModel?: unknown;
        grokApiKey?: string;
      };

      const modelJson = JSON.stringify(body.previewModel ?? {}, null, 2).slice(0, 28000);
      const sys = `You are Grok 4 in Nebula Visual UI Editor APPLY mode.
The user edited a structured preview model (Wix-like) without typing prompts. You must translate those edits into real repository files.

When your JSON is applied, the server first copies the current workspace contents of every path you list in "files" into generated-ui/versions/<timestamp>/ (only those paths), then writes your new contents into src/, app/, pages/, components/, or public/. The immutable v0-original folder is never modified.

OUTPUT CONTRACT (strict):
- Return ONE JSON object only (no markdown fences, no prose). Shape:
  { "files": { "relative/path": "full file utf8 content" } }
- Only include files that actually need edits.
- Allowed relative path prefixes: src/, app/, pages/, components/, public/
- Preserve TypeScript/React validity. Use Tailwind + shadcn patterns when applicable.

PAGE: ${String(body.pageId || "Home")}
VISUAL_MODEL_JSON:
${modelJson}`;

      const visualModel = process.env.GROK_VISUAL_APPLY_MODEL?.trim() || "grok-4-1-fast-reasoning";
      const gRes = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: visualModel,
          messages: [
            { role: "system", content: sys },
            {
              role: "user",
              content:
                "Produce the JSON object { \"files\": { ... } } now. If nothing should change return { \"files\": {} }.",
            },
          ],
          temperature: 0.2,
          max_tokens: 32000,
          ...grokChatCompletionsExtras("go", visualModel),
        }),
      });
      const gData = (await gRes.json()) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      if (!gRes.ok) {
        const errMsg =
          typeof gData?.error?.message === "string"
            ? gData.error.message
            : `Grok apply failed (${gRes.status})`;
        return res.status(502).json({ error: errMsg, detail: JSON.stringify(gData).slice(0, 800) });
      }
      let raw = String(gData.choices?.[0]?.message?.content || "").trim();
      const fence = raw.match(/\{[\s\S]*\}/);
      if (fence) raw = fence[0];
      let parsed: { files?: Record<string, string> };
      try {
        parsed = JSON.parse(raw) as { files?: Record<string, string> };
      } catch {
        return res.status(422).json({ error: "Grok did not return parseable JSON.", raw: raw.slice(0, 2000) });
      }
      const outFiles = parsed.files && typeof parsed.files === "object" ? parsed.files : {};
      const grokPaths = Object.keys(outFiles).filter((rel) => isAllowedVisualEditorWriteRel(rel));

      const preBackup: Record<string, string> = {};
      for (const rel of grokPaths) {
        const dest = path.join(workspaceRoot, rel);
        if (fs.existsSync(dest) && fs.statSync(dest).isFile()) {
          try {
            preBackup[rel] = fs.readFileSync(dest, "utf8");
          } catch {
            /* skip unreadable */
          }
        }
      }
      const newFiles = grokPaths.filter((rel) => !preBackup[rel]);

      let versionBackupRel: string | null = null;
      if (grokPaths.length > 0) {
        const versionManifest = JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            grokPaths,
            backedUpPaths: Object.keys(preBackup),
            newFiles,
          },
          null,
          2
        );
        versionBackupRel = writeTimestampVersionDir(workspaceRoot, {
          ...preBackup,
          "version-manifest.json": versionManifest,
        });
        const st0 = readEditorState(workspaceRoot);
        writeEditorState(workspaceRoot, { ...st0, lastApplyVersionFolderRel: versionBackupRel });
      }

      const written: Record<string, string> = {};
      for (const [rel, content] of Object.entries(outFiles)) {
        if (typeof content !== "string") continue;
        if (!isAllowedVisualEditorWriteRel(rel)) continue;
        const dest = path.join(workspaceRoot, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content, "utf8");
        written[rel] = content;
      }

      return res.json({
        ok: true,
        versionBackupRel,
        writtenPaths: Object.keys(written),
      });
    } catch (e) {
      console.error("[visual-ui-editor] apply-visual-changes", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  app.get("/api/visual-ui-editor/preview-model", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const primary = visualEditorPreviewAbs(workspaceRoot);
      const legacy = path.join(workspaceRoot, "generated-ui", "v0-base", "preview-model.json");
      const p = fs.existsSync(primary) ? primary : legacy;
      if (!fs.existsSync(p)) return res.json({ model: null });
      const raw = fs.readFileSync(p, "utf8");
      return res.json({ model: JSON.parse(raw) });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  app.put("/api/visual-ui-editor/preview-model", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const gate = canPersistVisualPreviewModel(workspaceRoot);
      if (!gate.ok) {
        return res.status(403).json({ error: gate.reason || "not eligible" });
      }
      const m = (req.body as { model?: unknown })?.model;
      if (m === undefined) return res.status(400).json({ error: "model required" });
      const clean = sanitizeEditorModelColors(m);
      const dir = path.dirname(visualEditorPreviewAbs(workspaceRoot));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(visualEditorPreviewAbs(workspaceRoot), JSON.stringify(clean, null, 2), "utf8");
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  /**
   * UI Studio Beta only — Nebulla UI Generation Engine
   * (Master Plan → classify → brief → refs → Grok → Beta preview).
   * Does not touch the original UI Studio / V0 path.
   */
  app.post("/api/ui-studio-beta/generate", async (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = (req.body || {}) as {
        projectName?: string;
        pageName?: string;
        autoTriggered?: boolean;
        regenerate?: boolean;
        preferenceFeedback?: string;
        guidedImprovement?: boolean;
        writtenPaths?: string[];
        uiPhase?: "pre_code" | "post_code" | "manual";
        preferenceHints?: {
          denser?: boolean;
          looser?: boolean;
          moreSections?: boolean;
          strongerCta?: boolean;
          moreContrast?: boolean;
        };
      };
      const uiPhaseRaw = body.uiPhase;
      const uiPhase =
        uiPhaseRaw === "pre_code" || uiPhaseRaw === "post_code" || uiPhaseRaw === "manual"
          ? uiPhaseRaw
          : undefined;
      // Phase 5: IF Foundation Go is preparing/running → do not start a second heavy UI Gen brain.
      const goPending = readGoCodePending(pp.workspaceRoot);
      const goBusy =
        isGoCodeJobActive(pp.workspaceRoot) ||
        goPending?.status === "running" ||
        goPending?.status === "preparing";
      if (goBusy) {
        return res.status(409).json({
          ok: false,
          error:
            "Foundation Go in flight — UI Gen not started in parallel (one heavy job). Wait for the slice, then Generate UI.",
          code: "FOUNDATION_GO_IN_FLIGHT",
        });
      }
      if (isResearchJobActive(pp.workspaceRoot)) {
        return res.status(409).json({
          ok: false,
          error: "Research in flight — UI Gen not started in parallel (one heavy job).",
          code: "RESEARCH_IN_FLIGHT",
        });
      }
      let planForUiGate: Record<string, string> = {};
      try {
        planForUiGate = readMasterPlanFile(pp.masterPlanPath);
      } catch {
        planForUiGate = {};
      }
      const researchGateUi = assessResearchArtifact(pp.workspaceRoot, { plan: planForUiGate });
      if (!researchGateUi.ok) {
        return res.status(409).json({
          ok: false,
          error: RESEARCH_STOPPED.replace("Foundation will not start", "UI Gen not started"),
          code: "RESEARCH_INCOMPLETE",
          reasons: researchGateUi.reasons,
        });
      }
      // Phase 4: IF ui-brief missing/short/no pages THEN do not start UI Gen.
      try {
        const arts = syncUiArtifactsFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
        if (!uiBriefUsable(arts.uiBrief.content)) {
          return res.status(409).json({
            ok: false,
            error: "Finish Master Plan so ui-brief can be generated. UI Gen not started.",
            code: "UI_BRIEF_MISSING",
          });
        }
      } catch {
        return res.status(409).json({
          ok: false,
          error: "Finish Master Plan so ui-brief can be generated. UI Gen not started.",
          code: "UI_BRIEF_MISSING",
        });
      }
      // Grok key optional — seed/template generate works without it; key enables locale polish.
      const apiKey = (await resolveMainGrokApiKey(req)) || undefined;
      const result = await runUiGenerationCycle({
        workspaceRoot: pp.workspaceRoot,
        masterPlanPath: pp.masterPlanPath,
        projectName: typeof body.projectName === "string" ? body.projectName : undefined,
        pageName: typeof body.pageName === "string" ? body.pageName : undefined,
        apiKeyOverride: apiKey,
        autoTriggered: body.autoTriggered === true,
        regenerate: body.regenerate === true,
        preferenceFeedback:
          typeof body.preferenceFeedback === "string" ? body.preferenceFeedback : undefined,
        guidedImprovement: body.guidedImprovement === true,
        writtenPaths: Array.isArray(body.writtenPaths)
          ? body.writtenPaths.filter((p): p is string => typeof p === "string")
          : undefined,
        uiPhase,
        preferenceHints:
          body.preferenceHints && typeof body.preferenceHints === "object"
            ? body.preferenceHints
            : undefined,
      });
      const gateRaw = String(result.quality_gate_result || "unknown");
      const gate =
        gateRaw === "pass" || gateRaw === "repair" || gateRaw === "weak"
          ? gateRaw
          : ("unknown" as const);
      recordContractTelemetry({ event: "ui_gen_gate", gate });
      const matchMeta = readUiGenerationV2PublicMeta(pp.workspaceRoot);
      if (!result.ok) {
        return res.status(result.preference_recovery ? 409 : result.status === "pending_discovery" ? 409 : 422).json({
          ok: false,
          status: result.status,
          error: result.error,
          contextPath: result.contextPath,
          editorModel: result.editorModel,
          preference_recovery: result.preference_recovery === true,
          preference_recovery_question: result.preference_recovery_question,
          regeneration_count: result.regeneration_count,
          max_regenerations: result.max_regenerations,
          user_visible_stage: result.user_visible_stage,
          patternMode: result.patternMode,
          quality_gate_result: result.quality_gate_result,
          figma_fallback_used: result.figma_fallback_used,
          previewApplied: result.previewApplied === true,
          env_guidance: result.env_guidance,
          resource_match: matchMeta.resource_match,
          design_brief_summary: matchMeta.design_brief_summary,
          context: {
            context_id: result.context.context_id,
            current_step: result.context.current_step,
            failure_reason: result.context.failure_reason,
            step_log: result.context.step_log,
            regeneration_count: result.context.regeneration_count,
            max_regenerations: result.context.max_regenerations,
            user_visible_stage: result.context.user_visible_stage,
            quality_gate_result: result.context.quality_gate_result,
            file_scanned: result.context.file_scanned,
            file_routes: result.context.file_routes,
            figma_used: result.context.figma_used,
            figma_status: result.context.figma_status,
            figma_error: result.context.figma_error,
            fallback_used: result.context.fallback_used,
            reference_source: result.context.reference_source,
            env_guidance: result.env_guidance,
            resource_match: matchMeta.resource_match,
            design_brief_summary: matchMeta.design_brief_summary,
          },
        });
      }
      return res.json({
        ok: true,
        status: result.status,
        contextPath: result.contextPath,
        editorModel: sanitizeEditorModelColors(result.editorModel),
        generatedCode: result.generatedCode,
        regeneration_count: result.regeneration_count,
        max_regenerations: result.max_regenerations,
        user_visible_stage: result.user_visible_stage,
        previewApplied: result.previewApplied === true,
        previewWritten: result.previewWritten,
        patternMode: result.patternMode,
        quality_gate_result: result.quality_gate_result,
        figma_fallback_used: result.figma_fallback_used,
        env_guidance: result.env_guidance,
        resource_match: matchMeta.resource_match,
        design_brief_summary: matchMeta.design_brief_summary,
        context: {
          context_id: result.context.context_id,
          page_name: result.context.page_name,
          current_step: result.context.current_step,
          quality_gate_result: result.context.quality_gate_result,
          preview_delivered: result.context.preview_delivered,
          export_available: result.context.export_available,
          reference_source: result.context.reference_source,
          figma_used: result.context.figma_used,
          figma_status: result.context.figma_status,
          figma_error: result.context.figma_error,
          fallback_used: result.context.fallback_used,
          env_guidance: result.env_guidance,
          selected_refs: result.context.selected_refs,
          engine_version: result.context.engine_version,
          template_id: result.context.template_id,
          design_tokens_json: result.context.design_tokens_json,
          model_used: result.context.model_used,
          repair_pass_used: result.context.repair_pass_used,
          regeneration_count: result.context.regeneration_count,
          max_regenerations: result.context.max_regenerations,
          auto_triggered: result.context.auto_triggered,
          user_visible_stage: result.context.user_visible_stage,
          step_log: result.context.step_log,
          resource_match: matchMeta.resource_match,
          design_brief_summary: matchMeta.design_brief_summary,
        },
      });
    } catch (e) {
      console.error("[ui-studio-beta/generate]", e);
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "UI generation engine failed",
      });
    }
  });

  app.post("/api/ui-studio-beta/apply-preview", async (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const metaPath = path.join(workspaceRoot, "nebulla-project", "ui-generation-v2-meta.json");
      if (!fs.existsSync(metaPath)) {
        return res.status(404).json({
          ok: false,
          error: "No generated UI meta yet — run Generate UI first",
        });
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
        template_id?: string;
        tokens?: {
          bg: string;
          surface: string;
          primary: string;
          accent: string;
          text: string;
          mutedText: string;
          border: string;
          radius: number;
          gap: number;
          pad: number;
          shadow: string;
          tone: string;
        };
        slots?: Record<string, string>;
        pattern_mode?: "seed" | "figma";
        quality_gate_result?: string;
        classification?: {
          device?: string;
          page_type?: string;
          navigation_mode?: string;
          product_function?: string;
          industry?: string;
        };
        screens?: Array<{
          page_key?: string;
          template_id?: string;
          slots?: Record<string, string>;
          classification?: {
            device?: string;
            page_type?: string;
            navigation_mode?: string;
            product_function?: string;
            industry?: string;
          };
        }>;
      };
      if (!shouldApplyUiToPreview(meta.quality_gate_result)) {
        return res.status(422).json({
          ok: false,
          error: "Quality gate is weak — Preview not overwritten. Try Generate again.",
          quality_gate_result: meta.quality_gate_result,
        });
      }
      if (!meta.tokens || !meta.slots || !meta.template_id) {
        return res.status(422).json({ ok: false, error: "Incomplete generation meta" });
      }
      const screens = Array.isArray(meta.screens)
        ? meta.screens
            .filter((s) => s && s.slots && s.template_id && s.page_key)
            .map((s) => ({
              pageKey: String(s.page_key),
              templateId: String(s.template_id),
              slots: s.slots as Record<string, string>,
              classification: s.classification,
            }))
        : undefined;
      const codedApp = workspaceHasCodedAppUi(workspaceRoot);
      const written = applyUiGenerationToPreviewShell({
        workspaceRoot,
        projectName: "App",
        templateId: meta.template_id,
        tokens: meta.tokens,
        slots: meta.slots,
        patternMode: meta.pattern_mode === "figma" ? "figma" : "seed",
        classification: meta.classification,
        screens,
        // Post-code: never reclaim live index.html as mockup-only product surface.
        forceLiveMockupEntry: false,
      });
      const authority = resolveAppPreviewAuthority(workspaceRoot);
      return res.json({
        ok: true,
        written,
        quality_gate_result: meta.quality_gate_result,
        codedApp,
        previewMode: authority.mode,
        previewStatusLabel: authority.statusLabel,
        liveIndexOverwritten: written.includes("index.html"),
        mockupOnlyArtifact: codedApp && !written.includes("index.html"),
      });
    } catch (e) {
      console.error("[ui-studio-beta/apply-preview]", e instanceof Error ? e.message : "failed");
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Apply to Preview failed",
      });
    }
  });

  app.get("/api/ui-studio-beta/status", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const policy = readCyclePolicy(workspaceRoot);
      const meta = readUiGenerationV2PublicMeta(workspaceRoot);
      const { model } = readEnginePreviewModel(workspaceRoot);
      const has_loadable_model = isLoadableStudioModel(
        model as { pages?: Record<string, unknown> } | null,
      );
      return res.json({
        ok: true,
        user_visible_stage: policy.user_visible_stage,
        regeneration_count: policy.regeneration_count,
        max_regenerations: policy.max_regenerations,
        auto_triggered: policy.auto_triggered,
        preference_feedback: policy.preference_feedback,
        recovery_path: policy.recovery_path,
        final_status: policy.final_status,
        page_key: policy.page_key,
        updated_at: policy.updated_at,
        patternMode: meta.pattern_mode,
        quality_gate_result: meta.quality_gate_result,
        // Do not advertise preview_applied when Studio has nothing loadable (Phase 7.4 honesty).
        preview_applied: has_loadable_model ? meta.preview_applied : false,
        has_loadable_model,
        figma_used: meta.figma_used,
        figma_status: meta.figma_status,
        figma_error: meta.figma_error,
        figma_fallback_used: meta.figma_fallback_used,
        env_guidance: meta.env_guidance,
        reference_file_keys_configured: meta.reference_file_keys_configured,
        key_diagnostics: meta.key_diagnostics,
        resource_match: meta.resource_match,
        design_brief_summary: meta.design_brief_summary,
      });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  /** Latest engine preview model for UI Studio Beta (never Cosmic Night placeholder). */
  app.get("/api/ui-studio-beta/preview", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const policy = readCyclePolicy(workspaceRoot);
      const { model, source } = readEnginePreviewModel(workspaceRoot);
      const codePath = path.join(workspaceRoot, "nebulla-project", "ui-generation-output.tsx");
      const hasGeneratedCode = fs.existsSync(codePath) && fs.statSync(codePath).size > 0;
      const meta = readUiGenerationV2PublicMeta(workspaceRoot);
      const has_loadable_model = isLoadableStudioModel(
        model as { pages?: Record<string, unknown> } | null,
      );
      return res.json({
        ok: true,
        model,
        source,
        hasGeneratedCode,
        has_loadable_model,
        user_visible_stage: policy.user_visible_stage,
        regeneration_count: policy.regeneration_count,
        max_regenerations: policy.max_regenerations,
        final_status: policy.final_status,
        recovery_path: policy.recovery_path,
        page_key: policy.page_key,
        patternMode: meta.pattern_mode,
        quality_gate_result: meta.quality_gate_result,
        preview_applied: has_loadable_model ? meta.preview_applied : false,
        figma_used: meta.figma_used,
        figma_status: meta.figma_status,
        figma_error: meta.figma_error,
        figma_fallback_used: meta.figma_fallback_used,
        env_guidance: meta.env_guidance,
        reference_file_keys_configured: meta.reference_file_keys_configured,
        key_diagnostics: meta.key_diagnostics,
        resource_match: meta.resource_match,
        design_brief_summary: meta.design_brief_summary,
      });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  /**
   * Persist Beta preview without v0 eligibility.
   * Writes nebulla-project/ui-generation-preview-model.json (authority) and mirrors
   * to visual-editor preview-model when the workspace allows it.
   */
  app.put("/api/ui-studio-beta/preview", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const m = (req.body as { model?: unknown })?.model;
      if (m === undefined) return res.status(400).json({ error: "model required" });
      const clean = sanitizeEditorModelColors(m) as { pages: Record<string, unknown> };
      if (!clean || typeof clean !== "object" || !clean.pages) {
        return res.status(400).json({ error: "model.pages required" });
      }
      writeEnginePreviewModel(workspaceRoot, clean);
      // Soft mirror for tools that still read visual-editor path — never 403 Beta on this.
      try {
        if (canPersistVisualPreviewModel(workspaceRoot).ok) {
          const dir = path.dirname(visualEditorPreviewAbs(workspaceRoot));
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(visualEditorPreviewAbs(workspaceRoot), JSON.stringify(clean, null, 2), "utf8");
        }
      } catch {
        /* ignore mirror failures */
      }
      return res.json({ ok: true, source: "engine" });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  app.get("/api/ui-studio-beta/context", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const p = path.join(workspaceRoot, "nebulla-project", "ui-generation-context.md");
      if (!fs.existsSync(p)) return res.json({ ok: true, exists: false, content: "" });
      return res.json({ ok: true, exists: true, content: fs.readFileSync(p, "utf8") });
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  const readWorkflowFileSafe = (docsRoot: string, relPath: string): string => {
    try {
      const fp = path.join(docsRoot, relPath);
      if (!fs.existsSync(fp)) return `[missing] ${relPath}`;
      const raw = fs.readFileSync(fp, "utf8");
      return raw.length > 20000 ? `${raw.slice(0, 20000)}\n...[truncated]` : raw;
    } catch (e) {
      return `[error reading ${relPath}] ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  const buildProjectWorkflowExecutionContext = (req: express.Request): string => {
    const { workspaceRoot } = projectPathsFor(req);
    const order = [
      "project-workflow.md",
      "master-plan.json",
      "environment-setup.md",
      "nebula-ui-studio.md",
      "project-execution-rules.md",
    ];
    const refs = summarizeDesignReferencesForPrompt(workspaceRoot);
    const refBlock = refs
      ? `\n=== nebulla-ide/design-references.json (summary) ===\n${refs}`
      : "";
    return order.map((p) => `\n=== ${p} ===\n${readWorkflowFileSafe(workspaceRoot, p)}`).join("\n") + refBlock;
  };

  app.post("/api/grok/execute-project-rules", async (req, res) => {
    const { messages, userId, projectName } = req.body || {};
    const apiKey = await resolveMainGrokApiKey(req);

    if (!apiKey) {
      return res.status(401).json({
        error: `Main AI API key is missing. Set ${MAIN_AI_ENV_VAR} in the server .env file and restart.`,
      });
    }
    if (apiKey.length < 20) {
      return res.status(400).json({
        error: `${MAIN_AI_ENV_VAR} in .env appears invalid. Update the value and restart the server.`,
      });
    }

    const convUserId =
      typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";
    const convProject =
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : "Untitled Project";
    const ppExecRules = projectPathsFor(req);
    const convScopeExec = { userId: convUserId, projectKey: ppExecRules.projectKey, projectLabel: convProject };

    try {
      const workflowContext = buildProjectWorkflowExecutionContext(req);
      const memory = buildMemorySystemContent(convScopeExec);
      const incomingMessages: { role: string; content?: string }[] = Array.isArray(messages) ? messages : [];
      const baseMessages = injectMemoryIntoMessages(incomingMessages, memory);
      const executionSystemPrompt = `Execute project-execution-rules.md strictly (single orchestration file).
Read and follow this context in exact order:
${workflowContext}

Rules:
- Trigger source is Q1 approved.
- Start execution immediately; no extra confirmation.
- If coding should start now, include START_CODING in your response.
- Do not output generic planning chat.
- Never paste or restate the full "project-execution-rules.md" content in user-facing output.
- If producing <START_MASTERPLAN>, include only canonical tab content (sections 1..6), never orchestration policy text.`;

      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4-1-fast-reasoning",
          messages: [{ role: "system", content: executionSystemPrompt }, ...baseMessages.slice(-12)],
          stream: false,
          ...grokChatCompletionsExtras("chat", "grok-4-1-fast-reasoning"),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }
      const data = await response.json();
      return res.json(data);
    } catch (error) {
      console.error("Error running project execution rules:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to execute project rules",
      });
    }
  });

  /** Phase 3: mandatory Web Search research stroke (one heavy job). */
  app.post("/api/grok/research", async (req, res) => {
    try {
      const apiKey = await resolveMainGrokApiKey(req);
      if (!apiKey) {
        return res.status(401).json({
          error: `Main AI API key is missing. Set ${MAIN_AI_ENV_VAR} in the server .env file and restart.`,
          code: "RESEARCH_INCOMPLETE",
        });
      }
      const pp = projectPathsFor(req);
      if (isGoCodeJobActive(pp.workspaceRoot)) {
        return res.status(409).json({
          ok: false,
          error: "Foundation Go in flight — research not started in parallel (one heavy job).",
          code: "FOUNDATION_GO_IN_FLIGHT",
        });
      }
      if (isResearchJobActive(pp.workspaceRoot)) {
        return res.json({
          ok: false,
          pending: true,
          error: "Research already running — wait, then continue.",
          code: "RESEARCH_IN_FLIGHT",
        });
      }
      const body = req.body || {};
      const convProject =
        typeof body.projectName === "string" && body.projectName.trim()
          ? String(body.projectName).trim()
          : "Untitled Project";
      let goal =
        typeof body.goal === "string" && body.goal.trim()
          ? String(body.goal).trim()
          : "";
      let plan: Record<string, string> = {};
      try {
        plan = readMasterPlanFile(pp.masterPlanPath);
      } catch {
        plan = {};
      }
      if (!isUsableProjectGoal(goal)) {
        goal = inferGoalFromPlanRecord(plan, [convProject]);
      }
      if (!isUsableProjectGoal(goal)) {
        return res.status(409).json({
          ok: false,
          error: "Write a short usable goal before research.",
          code: "RESEARCH_INCOMPLETE",
        });
      }
      const existingGoal = String(plan["1. Goal of the app"] || "").trim();
      if (!existingGoal || existingGoal.length < 48 || !isUsableProjectGoal(existingGoal)) {
        const seeded = seedGoalOfTheAppSection(plan, [goal, convProject]);
        if (seeded) {
          try {
            const next = { ...plan, "1. Goal of the app": seeded };
            fs.mkdirSync(path.dirname(pp.masterPlanPath), { recursive: true });
            fs.writeFileSync(pp.masterPlanPath, JSON.stringify(next, null, 2), "utf8");
          } catch {
            /* non-fatal — research can still run on inferred goal */
          }
        }
      }
      const result = await runResearchStroke({
        apiKey,
        workspaceRoot: pp.workspaceRoot,
        masterPlanPath: pp.masterPlanPath,
        projectKey: pp.projectKey,
        projectName: convProject,
        goal,
        projectType: typeof body.projectType === "string" ? body.projectType : undefined,
        force: body.force === true,
      });
      if (!result.ok) {
        return res.status(409).json({
          ok: false,
          error: result.error || RESEARCH_STOPPED,
          code: "RESEARCH_INCOMPLETE",
          gate: result.gate,
          wrote: result.wrote,
        });
      }
      return res.json({
        ok: true,
        wrote: result.wrote,
        reused: result.reused === true,
        merged: result.merged,
        gate: result.gate,
      });
    } catch (error) {
      console.error("Error in /api/grok/research:", error);
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Research stroke failed",
        code: "RESEARCH_INCOMPLETE",
      });
    }
  });

  app.get("/api/grok/research/status", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      let plan: Record<string, string> = {};
      try {
        plan = readMasterPlanFile(pp.masterPlanPath);
      } catch {
        plan = {};
      }
      const qGoal = typeof req.query.goal === "string" ? req.query.goal : "";
      const qName = typeof req.query.projectName === "string" ? req.query.projectName : "";
      const goal = inferGoalFromPlanRecord(plan, [qGoal, qName]);
      const gate = assessResearchArtifact(pp.workspaceRoot, {
        goal,
        goalCandidates: [qGoal, qName],
        plan,
      });
      return res.json({
        ok: gate.ok,
        pending: isResearchJobActive(pp.workspaceRoot),
        gate,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Research status failed",
      });
    }
  });

  /** Go: Grok 4 writes a short summary into master-plan.json only, then Grok Code runs (no full execution doc in MP). */
  app.post("/api/grok/go-code", async (req, res) => {
    const { messages, userId, projectName, userNote, continuation: continuationRaw } = req.body || {};
    const continuation = Boolean(continuationRaw);
    const apiKey = await resolveMainGrokApiKey(req);

    if (!apiKey) {
      const blocked = goBlocked(
        "KEY_AUTH",
        `Main AI API key is missing. Set ${MAIN_AI_ENV_VAR} in the server .env file and restart.`,
      );
      return res.status(401).json({
        error: blocked.message,
        code: blocked.code,
        blockedReason: blocked,
      });
    }
    if (apiKey.length < 20) {
      const blocked = goBlocked(
        "KEY_AUTH",
        `${MAIN_AI_ENV_VAR} in .env appears invalid. Update the value and restart the server.`,
      );
      return res.status(400).json({
        error: blocked.message,
        code: blocked.code,
        blockedReason: blocked,
      });
    }

    const convUserId =
      typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";
    const convProject =
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : "Untitled Project";

    const note =
      typeof userNote === "string" && userNote.trim() ? userNote.trim().slice(0, 4000) : "";

    try {
      const ppGo = projectPathsFor(req);
      const { masterPlanPath } = ppGo;
      const convScopeGo = { userId: convUserId, projectKey: ppGo.projectKey, projectLabel: convProject };

      // Phase 5: IF a Go job is already running → join poll only (do not kick again).
      const existingGo = readGoCodePending(ppGo.workspaceRoot);
      if (isResearchJobActive(ppGo.workspaceRoot)) {
        return res.status(409).json({
          ok: false,
          pending: true,
          preparing: true,
          coding: false,
          error: "Research still running — coding waits (one heavy job).",
          code: "RESEARCH_IN_FLIGHT",
        });
      }
      if (existingGo?.status === "running" || isGoCodeJobActive(ppGo.workspaceRoot)) {
        return res.json({
          preCodingSummary: existingGo?.preCodingSummary,
          pending: true,
          coding: true,
          resumed: true,
          hint: "Joining in-flight Foundation job — poll /api/grok/go-code/poll",
        });
      }
      // Gate R before any preparing job — incomplete research must not look like Go started.
      {
        let planForGate: Record<string, string> = {};
        try {
          if (fs.existsSync(masterPlanPath)) {
            const raw = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
            if (raw && typeof raw === "object") {
              for (const [k, v] of Object.entries(raw)) {
                if (typeof v === "string") planForGate[k] = v;
              }
            }
          }
        } catch {
          planForGate = {};
        }
        const goalForResearchEarly = inferGoalFromPlanRecord(planForGate, [note, convProject]);
        const researchGateEarly = assessResearchArtifact(ppGo.workspaceRoot, {
          goal: goalForResearchEarly,
          goalCandidates: [note, convProject],
          plan: planForGate,
        });
        if (!researchGateEarly.ok) {
          const blocked = goBlocked("RESEARCH_INCOMPLETE", [
            goBlocked("RESEARCH_INCOMPLETE").message,
            ...researchGateEarly.reasons.slice(0, 3),
          ].filter(Boolean).join(" "));
          return res.status(409).json({
            ok: false,
            error: blocked.message,
            code: blocked.code,
            blockedReason: blocked,
            reasons: researchGateEarly.reasons,
          });
        }
      }

      if (existingGo?.status === "preparing") {
        if (isGoCodeJobActive(ppGo.workspaceRoot)) {
          return res.json({
            preCodingSummary: existingGo.preCodingSummary,
            pending: true,
            preparing: true,
            coding: false,
            resumed: true,
            hint: "Preparing plan before Grok Code — job not scheduled yet.",
          });
        }
        const prepAge = Date.now() - (existingGo.startedAt || Date.now());
        if (prepAge < 6_000) {
          return res.json({
            preCodingSummary: existingGo.preCodingSummary,
            pending: true,
            preparing: true,
            coding: false,
            resumed: true,
            hint: "Preparing plan before Grok Code — job not scheduled yet.",
          });
        }
        console.warn(
          `[go-code] orphan preparing (${Math.round(prepAge / 1000)}s, no job) — scheduling Foundation with local summary`,
        );
      }

      // Phase 5: mark preparing BEFORE plan-fill so a 55s client abort + poll is not a false “Grok Code running”.
      writeGoCodePending(ppGo.workspaceRoot, {
        status: "preparing",
        startedAt: Date.now(),
        projectDisplayName: convProject,
      });

      let planSnapshot: Record<string, string> = {};
      try {
        if (fs.existsSync(masterPlanPath)) {
          const raw = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
          if (raw && typeof raw === "object") {
            for (const [k, v] of Object.entries(raw)) {
              if (typeof v === "string") planSnapshot[k] = v;
            }
          }
        }
      } catch {
        planSnapshot = {};
      }

      const compact: Record<string, string> = {};
      for (const [k, v] of Object.entries(planSnapshot)) {
        compact[k] = v.length > 2500 ? `${v.slice(0, 2500)}\n…[truncated]` : v;
      }

      const memory = buildMemorySystemContent(convScopeGo);

      let mpFill: {
        written: string[];
        source: string;
        completeness?: ReturnType<typeof assessMasterPlanCompletenessWithWorkspace>;
      } = { written: [], source: "skipped" };
      if (!continuation) {
        // Local fill only — Grok plan synthesis here used to burn the 55s kick abort
        // and leave poll on "preparing" until GO_TIMEOUT (no Grok Code job).
        try {
          const local = fillMissingMasterPlanSectionsLocal({
            workspaceRoot: ppGo.workspaceRoot,
            masterPlanPath,
            projectName: convProject,
            userNote: note,
          });
          mpFill = { written: local.updated || [], source: "local" };
          if (mpFill.written.length > 0) {
            console.log(`[go-code] Master Plan local fill: ${mpFill.written.join(", ")}`);
            try {
              const refreshed = readMasterPlanFile(masterPlanPath);
              for (const [k, v] of Object.entries(refreshed)) {
                if (typeof v === "string") planSnapshot[k] = v;
              }
            } catch {
              /* ignore */
            }
          }
        } catch {
          mpFill = { written: [], source: "skipped" };
        }
      }

      // Phase 3: auto-build ui-brief from plan before completeness (so UI_BRIEF_MISSING is not a false fail).
      let uiArts = syncUiArtifactsFromMasterPlan(ppGo.workspaceRoot, masterPlanPath);
      console.log(
        `[go-code] Wrote ui-brief.md (${uiArts.uiBrief.content.length} chars) + v0-prompt.md (${uiArts.v0Prompt.content.length} chars)`,
      );
      try {
        mirrorV0PromptToStudioFile(ppGo, uiArts.uiBrief.content || uiArts.v0Prompt.content);
      } catch {
        /* ignore */
      }

      // Industry-standard security baseline before Go — never leave SEC gaps as a hard stop for MVP.
      try {
        const ensured = ensureSecurityBaselineInPlan(planSnapshot);
        if (ensured.applied) {
          planSnapshot = { ...planSnapshot, ...ensured.plan };
          try {
            fs.mkdirSync(path.dirname(masterPlanPath), { recursive: true });
            fs.writeFileSync(masterPlanPath, JSON.stringify(ensured.plan, null, 2), "utf8");
            console.log("[go-code] Applied industry security baseline draft to §2 (MVP continue)");
          } catch {
            /* in-memory plan still used for gate */
          }
        }
      } catch {
        /* non-fatal */
      }

      let completeness = assessMasterPlanCompletenessWithWorkspace({
        plan: planSnapshot,
        mode: resolveMasterPlanStrictMode(ppGo.workspaceRoot),
        workspaceRoot: ppGo.workspaceRoot,
        checkUiBrief: true,
      });
      completeness = softenSecurityBlocksForMvpGo(completeness);
      const blockGaps = completeness.gaps.filter((g) => g.severity === "block");
      const goGateOutcome =
        !completeness.allowGo
          ? "blocked"
          : blockGaps.length > 0 || completeness.gaps.length > 0
            ? "warned"
            : "ok";
      recordContractTelemetry({
        event: "master_plan_go_gate",
        mode: completeness.mode,
        shape: completeness.shape,
        allowGo: completeness.allowGo,
        outcome: goGateOutcome,
        gapCount: completeness.gaps.length,
      });
      if (completeness.gaps.length > 0) {
        console.log(
          `[go-code] Master Plan gaps mode=${completeness.mode} shape=${completeness.shape} count=${completeness.gaps.length} allowGo=${completeness.allowGo}`,
        );
      }
      const gateWarnings: string[] = [];
      if (!completeness.allowGo) {
        const blocked = goBlocked("MASTER_PLAN_INCOMPLETE");
        gateWarnings.push(blocked.message);
        console.warn("[go-code] bypass MASTER_PLAN_INCOMPLETE — continuing Foundation", blocked.message);
      }

      // Phase 2: IF after fill the plan is still unusable — warn and continue (status bar owns the issue).
      if (!isMasterPlanReadyForUiMockup(planSnapshot)) {
        gateWarnings.push(
          "Master Plan is still thin after fill — continuing Foundation anyway.",
        );
        console.warn("[go-code] bypass thin Master Plan — continuing Foundation");
      }

      // Gate R: do not await Web Search on this request — that left Foundation unscheduled.
      const goalForResearch = inferGoalFromPlanRecord(planSnapshot, [note, convProject]);
      const researchGate = assessResearchArtifact(ppGo.workspaceRoot, {
        goal: goalForResearch,
        goalCandidates: [note, convProject],
        plan: planSnapshot,
      });
      if (!researchGate.ok) {
        const blocked = goBlocked("RESEARCH_INCOMPLETE");
        failGoCodePreparing(ppGo.workspaceRoot, blocked.message, blocked);
        return res.status(409).json({
          ok: false,
          error: blocked.message,
          code: blocked.code,
          blockedReason: blocked,
        });
      }

      // Phase 4: ui-brief preferred; missing brief does not 409 the coding agent.
      if (!uiBriefUsable(uiArts.uiBrief.content)) {
        const blocked = goBlocked("UI_BRIEF_MISSING");
        gateWarnings.push(blocked.message);
        console.warn("[go-code] bypass UI_BRIEF_MISSING — continuing Foundation");
      }
      if (gateWarnings.length) {
        console.warn(`[go-code] ${gateWarnings.length} gate warning(s) — coding continues`);
      }

      let summary = "";
      let v0Sync = {
        content: uiArts.v0Prompt.content,
        written: uiArts.v0Prompt.written,
        plan: uiArts.plan,
      };

      if (!continuation) {
      let plan: Record<string, unknown> = {};
      if (fs.existsSync(masterPlanPath)) {
        try {
          plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
        } catch {
          plan = {};
        }
      }
      const existingSummary = String(plan[PRE_CODING_SUMMARY_KEY] ?? "").trim();
      const skipPhaseA = true;

      if (skipPhaseA) {
        summary = isUsablePreCodingSummary(existingSummary)
          ? existingSummary.slice(0, 2000)
          : buildLocalPreCodingSummary({
              workspaceRoot: ppGo.workspaceRoot,
              userNote: note,
              existingSummary,
              projectName: convProject,
            });
        console.log(
          `[go-code] Local ${PRE_CODING_SUMMARY_KEY} (skipped Grok-4 Phase A; ${summary.length} chars)`,
        );
      } else {
      const phaseASystem = `You are Grok 4 (planning only). The user pressed **Go** to run a coding pass with Grok Code.

Your ONLY output for this turn: a **short** pre-coding summary for the Master Plan file.

Strict rules:
- Emit EXACTLY one block: <PRE_CODING_SUMMARY>...</PRE_CODING_SUMMARY>
- Inside: maximum 1200 characters. **First line MUST be** \`SLICE: Foundation|Auth|Data+API|Primary|Secondary|Polish\` (exactly one). Then bullets: Project Type, assumptions, files for THIS slice only, risks, and what to validate before the next Go.
- Architecture-first + Incremental Development (nebulla-project/incremental-development.md): one coherent slice — never plan dumping the entire §4 route map in one Go.
- Do NOT paste project-execution-rules.md or long policy text.
- Do NOT replace full Master Plan sections; this is a session brief only.
- Do NOT emit START_CODING, ANSWER_Qn, or <START_MASTERPLAN> here.`;

      const phaseAUser = `Current master-plan.json values (truncated per field):\n${JSON.stringify(compact, null, 2)}\n\nOptional user focus for this coding session:\n${note || "(none — infer next concrete steps from the plan)"}`;

      let phaseAMessages: { role: string; content: string }[] = [
        { role: "system", content: phaseASystem },
        { role: "user", content: phaseAUser },
      ];
      phaseAMessages = injectMemoryIntoMessages(phaseAMessages, memory) as { role: string; content: string }[];

      const g4Res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4-1-fast-reasoning",
          messages: phaseAMessages,
          stream: false,
          ...grokChatCompletionsExtras("plan", "grok-4-1-fast-reasoning"),
        }),
      });

      if (!g4Res.ok) {
        const errText = await g4Res.text();
        const blocked = classifyGoFailure({
          httpStatus: g4Res.status,
          error: `Grok 4 summary phase failed: ${errText.slice(0, 500)}`,
        });
        failGoCodePreparing(ppGo.workspaceRoot, blocked.message, blocked);
        return res.status(g4Res.status).json({
          error: blocked.message,
          code: blocked.code,
          blockedReason: blocked,
        });
      }

      const g4Data = await g4Res.json();
      const g4Text = g4Data.choices?.[0]?.message?.content || "";
      const sumMatch = g4Text.match(/<PRE_CODING_SUMMARY>([\s\S]*?)<\/PRE_CODING_SUMMARY>/i);
      summary = sumMatch ? sumMatch[1].trim() : "";
      if (!summary) {
        summary = g4Text
          .replace(/<REASONING>[\s\S]*?<\/REASONING>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 1200);
      }
      if (!summary) {
        summary = buildLocalPreCodingSummary({
          workspaceRoot: ppGo.workspaceRoot,
          userNote: note,
          existingSummary,
          projectName: convProject,
        });
      }
      summary = summary.slice(0, 2000);
      summary = applyClampedSliceToSummary(summary, ppGo.workspaceRoot);
      }

      // Session notes belong only in PRE_CODING_SUMMARY — never pollute §1 Goal
      // (Project Type parsing + v0 one-liner depend on a clean goal).
      plan[PRE_CODING_SUMMARY_KEY] = summary;
      fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
      uiArts = syncUiArtifactsFromMasterPlan(ppGo.workspaceRoot, masterPlanPath);
      v0Sync = {
        content: uiArts.v0Prompt.content,
        written: uiArts.v0Prompt.written,
        plan: uiArts.plan,
      };
      mirrorV0PromptToStudioFile(ppGo, uiArts.uiBrief.content || v0Sync.content);
      console.log(`[go-code] Wrote ${PRE_CODING_SUMMARY_KEY} (${summary.length} chars)`);
      console.log(
        `[go-code] Refreshed ui-brief.md (${uiArts.uiBrief.content.length} chars) + v0-prompt.md (${v0Sync.content.length} chars)`,
      );
      } else {
        let plan: Record<string, unknown> = {};
        if (fs.existsSync(masterPlanPath)) {
          try {
            plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
          } catch {
            plan = {};
          }
        }
        summary = String(plan[PRE_CODING_SUMMARY_KEY] ?? "").trim();
        if (!summary) {
          summary = "Continue implementation from master-plan.json and project-execution-rules.md.";
        }
        summary = applyClampedSliceToSummary(summary, ppGo.workspaceRoot);
        uiArts = syncUiArtifactsFromMasterPlan(ppGo.workspaceRoot, masterPlanPath);
        v0Sync = {
          content: uiArts.v0Prompt.content,
          written: uiArts.v0Prompt.written,
          plan: uiArts.plan,
        };
        mirrorV0PromptToStudioFile(ppGo, uiArts.uiBrief.content || v0Sync.content);
        console.log(`[go-code] Continuation pass — skipping Grok 4 summary (${summary.length} chars from plan)`);
      }

      const workflowContext = buildProjectWorkflowExecutionContext(req);
      const codeModel = process.env.GROK_CODE_MODEL?.trim() || "grok-code-fast-1";
      const codeQualityContract = `ARCHITECTURE-FIRST + INCREMENTAL DEVELOPMENT (mandatory):
- Nebulla wins on pure logic + clean architecture — not agent count. Prefer maintainable, typed, smallest-safe code.
- Mentally apply nebulla-project/code-review-checklist.md before every file (imports, nulls, env, HTTP, security, boundaries, hydration, loops).
- Follow nebulla-project/incremental-development.md: Build one slice → Debug/Validate (NDM) → Next. Never dump the entire app when it can be sliced.
- Typical slice order: Foundation (shell/routes/layout) → Auth (if needed) → Core data/API → Primary feature → Secondary (one at a time) → Polish.
- Implement ONLY routes/features from Master Plan §3/§4 that belong to the **current slice**; respect Project Type in §1.
- Foundation: real \`app/**/page.tsx\` or \`pages/\` routes. src/App.tsx + src/main.tsx alone is a failed Foundation for multi-page plans.
- No hallucinated packages, APIs, env vars, or paths — create them explicitly in this response if needed.
- Prefer smallest safe change over clever refactors. No temporary hacks. Explicit error handling on I/O.
- UI: §2 research patterns + §5 visuals + Project Type — NEVER Nebulla IDE chrome (#080A14 / #00D4D4).
- Larger generation only if the slice is naturally tiny, the user explicitly asks for a broader pass, or risk is clearly low.
MOCKUP VS FINAL UI (mandatory):
${MOCKUP_NON_AUTHORITATIVE_GO_BULLETS}
${MVP_STACK_GO_BULLETS}
${RUNNABLE_SKELETON_GO_BULLETS}
${INTERACTIVE_PREVIEW_GO_BULLETS}`;

      const codeSystemPrompt = continuation
        ? `You are Grok Code (CONTINUATION pass). master-plan.json was updated but the **Foundation slice** (runnable shell) is still missing.

${codeQualityContract}

Output the Foundation slice in THIS response (not the entire §4 app):
- \`package.json\` (private, scripts.dev/build/start) + \`app/layout.tsx\`, \`app/globals.css\`, root \`app/page.tsx\`
- For multi-page kids/education plans: also emit at least one more \`app/<route>/page.tsx\` (practice/home/parent) — never only \`src/App.tsx\` + \`src/main.tsx\`
- Minimal routing shell for the primary entry route(s) only
- Shared scaffolding \`components/\` / \`lib/\` only if required for that shell
- Short \`README.md\` with npm install / npm run dev / npm run build
- Do NOT implement every §4 route yet — leave Auth / Data / Primary feature for later Go presses
- Do NOT return only master-plan.json
- Auth-only login is not Foundation when the plan has Home/practice/parent screens

File blocks only: \`\`\`file:relative/path\` … \`\`\` — no chat prose.

${lockedUserConstraintsFromPlan(planSnapshot)}

${workflowContext}`
        : `You are Grok Code (coding phase; same ${MAIN_AI_ENV_VAR} as the main brain). The user pressed **Go** in the Nebulla assistant.

A short pre-coding summary was just saved to master-plan.json under the key "${PRE_CODING_SUMMARY_KEY}" (it appears again inside the master-plan snapshot below).

Follow project-execution-rules.md and nebulla-project/incremental-development.md strictly. Use the workflow context in order.

${codeQualityContract}

Master Plan (project-execution-rules — MUST be complete before code):
- master-plan.json below MUST satisfy the Master Plan contract (page fields in §4, security baseline when auth/data, §5 tokens).
- If **"1. Goal of the app"** is empty, a coding command (continue/go/START_CODING), or a page-contract dump: write a real §1 (purpose, users/roles, in/out of scope) from the user brief / fast-prototype-memory.md into master-plan.json. Never leave §1 blank or set it to "continue".
- If ANY of §1–§5 are still thin, emit \`\`\`file:master-plan.json\`\`\` FIRST with the full JSON object (preserve existing keys, fill from discovery), then still emit the current slice's app files in the SAME response when possible.
- §4: full page contracts (route, purpose, primary_actions, data_entities, authz, empty/error, nav). §5: 15–25 lines tokens only.
- Also keep \`nebula-ui-studio/ui-brief.md\` in sync when §4/§5 change (primary UI input). V0/\`v0-prompt.md\` is optional legacy only.

Implementation (ONE SLICE per Go — Build → Debug → Next):
- Implement only the slice named in "${PRE_CODING_SUMMARY_KEY}" (or infer next incomplete slice: Foundation first if no app shell exists).
- Foundation for a multi-page plan: \`app/layout.tsx\` + root \`app/page.tsx\` + at least one more \`app/<route>/page.tsx\` from §4, with working primary controls (mock data OK). Do not stop at a single static dashboard. Home must be the core user job (for tutoring/ADHD: child's next short lesson), not Dashboard + Settings + "Who are you today?".
- Later slices: smallest coherent set (often 3–8 file blocks). Do NOT emit every §4 route in one pass.
- Include master-plan.json updates IN THE SAME response if needed — never as the only file when app code is due.
- Honor security baseline (RLS/tenant filters) in Auth/Data slices.

Master Plan UI:
- If **"4. Pages and navigation"** or **"5. UI/UX design"** need updates, include them in master-plan.json first, then refresh ui-brief.md.
- **UI styling:** Follow §2 research + §5 tokens + ui-brief. **Do NOT** copy Nebulla IDE / nebulla.dev product chrome (#080A14, #00D4D4, builder sidebar layout).

CRITICAL OUTPUT CONTRACT (no deviation):
- Do NOT paste implementation as casual markdown code fences in chat — use file blocks the server can apply.
- Output real code artifacts only: \`\`\`file:relative/path\` … \`\`\` or \`File: path\` + fenced body (see /api/files/apply-generated).
- Do NOT output plain-language planning, recap, policy restatement, or narrative explanation.
- If a file must be created/updated, include explicit path + full content or patch for that file.
- Prefer one or more clear file blocks over prose.
- If information is missing, make minimal safe assumptions and proceed with best-effort code for THIS slice.

${lockedUserConstraintsFromPlan(planSnapshot)}

${workflowContext}`;

      const sliceFromNote = parseGoSliceLabel(note);
      const sliceFromSummary = parseGoSliceLabel(summary);
      const sliceLine = formatSlicePromptLine(sliceFromNote || sliceFromSummary || "Foundation");
      const briefPages = parsePagesFromUiBrief(uiArts.uiBrief.content || "")
        .slice(0, 14)
        .map((p) => `- ${p.name} \`${p.route}\``)
        .join("\n");
      const compactUser = buildCompactGoCodeUserPrompt({
        sliceLine,
        goal: inferGoalFromPlanRecord(planSnapshot, [note, convProject]),
        pagesSection: String(planSnapshot["4. Pages and navigation"] || ""),
        constraints: lockedUserConstraintsFromPlan(planSnapshot),
        uiBriefPageList: briefPages,
        sessionFocus: note || (continuation ? "(foundation shell)" : "(next incomplete slice)"),
        continuation,
      });
      const codeMessages: { role: string; content: string }[] = [
        { role: "system", content: codeSystemPrompt },
        { role: "user", content: compactUser },
      ];

      const kicked = scheduleGoCodeJob({
        workspaceRoot: ppGo.workspaceRoot,
        apiKey,
        codeModel,
        codeMessages,
        preCodingSummary: summary,
        projectDisplayName: convProject,
      });

      if (!kicked) {
        const existing = readGoCodePending(ppGo.workspaceRoot);
        if (existing?.status === "running" || isGoCodeJobActive(ppGo.workspaceRoot)) {
          return res.json({
          preCodingSummary: summary,
          summarySaved: true,
            pending: true,
            coding: true,
            resumed: true,
            v0PromptWritten: v0Sync.written,
            v0PromptLength: v0Sync.content.length,
            hint: "Joining in-flight Foundation job — poll /api/grok/go-code/poll",
          });
        }
        if (existing?.status === "preparing") {
          return res.json({
            preCodingSummary: summary,
            summarySaved: true,
            pending: true,
            preparing: true,
            coding: false,
            resumed: true,
            hint: "Preparing plan before Grok Code — job not scheduled yet.",
          });
        }
      }

      try {
        if (!continuation) {
        appendConversationTurn(convScopeGo, "user", `[Go] ${note || "start coding"}`);
        } else {
          appendConversationTurn(convScopeGo, "user", `[Go continuation] foundation slice`);
        }
      } catch (logErr) {
        console.error("go-code memory append failed:", logErr);
      }

      return res.json({
        preCodingSummary: summary,
        summarySaved: !continuation || Boolean(summary),
        pending: true,
        coding: true,
        codeModel,
        continuation,
        masterPlanFilled: mpFill.written,
        masterPlanFillSource: mpFill.source,
        v0PromptWritten: v0Sync.written,
        v0PromptLength: v0Sync.content.length,
        gateWarnings: gateWarnings.length ? gateWarnings : undefined,
        hint: continuation
          ? "Grok Code continuation running — wait for Go complete (do not press Go again)."
          : "Master Plan synced from discovery. Grok Code is running — wait for Go complete (1–3 min); do not press Go again.",
      });
    } catch (error) {
      console.error("Error in /api/grok/go-code:", error);
      const blocked = classifyGoFailure({
        error: error instanceof Error ? error.message : "Failed to run Go (code) pipeline",
      });
      try {
        const ppFail = projectPathsFor(req);
        failGoCodePreparing(ppFail.workspaceRoot, blocked.message, blocked);
      } catch {
        /* workspace unresolved */
      }
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/grok/go-code",
      });
      return res.status(500).json({
        error: blocked.message,
        code: blocked.code,
        blockedReason: blocked,
      });
    }
  });

  app.post("/api/grok/go-code/poll", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const body = req.body || {};
      // Client ack after successful apply — clears pending; result stays durable until then.
      if (body.consume === true || body.ack === true) {
        const consumed = consumeGoCodeResult(pp.workspaceRoot);
        return res.json({
          ok: true,
          pending: false,
          idle: true,
          consumed,
          hint: consumed
            ? "Go Code result acknowledged — safe to start a new Go pass."
            : "No pending Go Code result to consume.",
        });
      }

      const jobActive = isGoCodeJobActive(pp.workspaceRoot);
      let pending = readGoCodePending(pp.workspaceRoot);
      const payload = goCodePendingToPollResponse(pending, jobActive, pp.workspaceRoot);
      pending = readGoCodePending(pp.workspaceRoot);
      if (pending && !payload.pending && (pending.status === "done" || pending.status === "error")) {
        try {
          const convProject =
            typeof body.projectName === "string" && body.projectName.trim()
              ? String(body.projectName).trim()
              : "Untitled Project";
          fillMissingMasterPlanSectionsLocal({
            workspaceRoot: pp.workspaceRoot,
            masterPlanPath: pp.masterPlanPath,
            projectName: convProject,
          });
          const arts = syncUiArtifactsFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
          mirrorV0PromptToStudioFile(pp, arts.uiBrief.content || arts.v0Prompt.content);
          Object.assign(payload, {
            uiBriefWritten: arts.uiBrief.written,
            uiBriefLength: arts.uiBrief.content.length,
            v0PromptWritten: arts.v0Prompt.written,
            v0PromptLength: arts.v0Prompt.content.length,
          });
        } catch (syncErr) {
          console.warn("[go-code poll] ui-brief / v0 prompt sync failed:", syncErr);
        }
      }
      // Log once while result remains available for re-poll / apply.
      if (
        pending &&
        !payload.pending &&
        pending.status === "done" &&
        pending.codeText &&
        !pending.conversationLogged
      ) {
        try {
          const uid = readNebulaSessionUserId(req) || "anonymous";
          const convProject =
            typeof body.projectName === "string" && body.projectName.trim()
              ? String(body.projectName).trim()
              : "Untitled Project";
          appendConversationTurn(
            { userId: uid, projectKey: pp.projectKey, projectLabel: convProject },
            "assistant",
            pending.codeText.trim().slice(0, 8000),
          );
          writeGoCodePending(pp.workspaceRoot, {
            ...pending,
            conversationLogged: true,
          });
        } catch {
          /* ignore */
        }
      }
      if (payload.error && !payload.pending && (pending?.status === "error" || payload.codeError)) {
        return res.status(422).json(payload);
      }
      // Do NOT clear on first successful poll — client must consume after apply.
      return res.json(payload);
    } catch (err: unknown) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "go-code poll failed",
      });
    }
  });

  app.get("/api/nebula-swarm/state", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const swarmState = readNebulaSwarmState(pp.workspaceRoot);
      return res.json({ swarmState });
    } catch (err) {
      console.error("/api/nebula-swarm/state:", err);
      captureError(err instanceof Error ? err : new Error(String(err)), {
        source: "server",
        route: "/api/nebula-swarm/state",
      });
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to read Nebula Swarm state",
      });
    }
  });

  app.post("/api/nebula-swarm/handoff", async (req, res) => {
    try {
      /** Lean swarm: chat never runs agents. Inspect uses GROK_SWARM_API_KEY or MAIN_API_KEY_GROK (xAI). */
      const body = (req.body || {}) as Record<string, unknown>;
      const manualRunAndTest = Boolean(body.manualRunAndTest);
      const swarmKey = readPlatformSwarmApiKey();
      const swarmModel = process.env.GROK_SWARM_MODEL?.trim() || "grok-3-mini";

      const rawIntensity = typeof body.swarmIntensity === "string" ? body.swarmIntensity.trim() : "";
      const swarmIntensity =
        rawIntensity === "light" || rawIntensity === "balanced" || rawIntensity === "full_quality"
          ? rawIntensity
          : "full_quality";

      let userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";
      if (manualRunAndTest && !userMessage) {
        userMessage =
          "Manual Run and Test: run code review and test suggestions scoped to recently modified files only.";
      }
      if (!userMessage) {
        return res.status(400).json({ error: "userMessage is required" });
      }

      const phase = typeof body.phase === "string" && body.phase.trim() ? body.phase.trim() : "pre_phase_0";
      const projectName =
        typeof body.projectName === "string" && body.projectName.trim()
          ? body.projectName.trim()
          : typeof req.query.projectName === "string"
            ? String(req.query.projectName).trim()
            : "Untitled Project";
      const runId =
        typeof body.runId === "string" && body.runId.trim() ? body.runId.trim() : `swarm-${Date.now()}`;
      const contextSummary =
        typeof body.contextSummary === "string" ? body.contextSummary.trim().slice(0, 2000) : "";
      let focusPaths: string[] | undefined;
      if (Array.isArray(body.focusPaths)) {
        const fp = body.focusPaths
          .slice(0, 12)
          .map((p) => (typeof p === "string" ? p.trim().slice(0, 240) : ""))
          .filter(Boolean);
        if (fp.length > 0) focusPaths = fp;
      }
      let focusSnippets: Record<string, string> | undefined;
      if (
        body.focusSnippets &&
        typeof body.focusSnippets === "object" &&
        !Array.isArray(body.focusSnippets)
      ) {
        const raw = body.focusSnippets as Record<string, unknown>;
        const out: Record<string, string> = {};
        let total = 0;
        for (const [k, v] of Object.entries(raw).slice(0, 3)) {
          const key = String(k || "")
            .trim()
            .slice(0, 240);
          const val = typeof v === "string" ? v.slice(0, 1800) : "";
          if (!key || !val) continue;
          if (total + val.length > 4500) break;
          out[key] = val;
          total += val.length;
        }
        if (Object.keys(out).length > 0) focusSnippets = out;
      }
      let swarmHints:
        | import("./lib/nebulaSwarmExecutionPlan").SwarmHandoffHints
        | undefined;
      const rawHints = body.swarmHints;
      if (rawHints && typeof rawHints === "object" && !Array.isArray(rawHints)) {
        const h = rawHints as Record<string, unknown>;
        swarmHints = {
          priorUserMessageCount:
            typeof h.priorUserMessageCount === "number" && Number.isFinite(h.priorUserMessageCount)
              ? h.priorUserMessageCount
              : undefined,
          afterCodingTurn: Boolean(h.afterCodingTurn),
          finalDeliveryCandidate: Boolean(h.finalDeliveryCandidate),
        };
      }
      const pp = projectPathsFor(req);

      let qualityLane: { apiKey: string; model: string } | undefined;
      if (manualRunAndTest) {
        if (!swarmKey || swarmKey.length < 20) {
          return res.status(401).json({
            error:
              `Inspect (Quality) needs an xAI key: set ${MAIN_AI_ENV_VAR} (preferred) or optional GROK_SWARM_API_KEY override in the server .env.`,
          });
        }
        qualityLane = { apiKey: swarmKey, model: swarmModel };
      }

      const laneKey = swarmKey.length >= 20 ? swarmKey : "unused-lean-swarm-placeholder-key";

      const handoff = await buildSwarmHandoffParallel(
        {
          planner: laneKey,
          researcher: laneKey,
          tester: laneKey,
          swarmModel,
        },
        {
          repoRoot: REPO_ROOT,
          workspaceRoot: pp.workspaceRoot,
          userMessage,
          phase,
          projectName,
          runId,
          intensity: swarmIntensity,
          manualRunAndTest,
          ...(qualityLane ? { qualityLane } : {}),
          ...(contextSummary ? { contextSummary } : {}),
          ...(focusPaths ? { focusPaths } : {}),
          ...(focusSnippets ? { focusSnippets } : {}),
          ...(swarmHints ? { swarmHints } : {}),
        }
      );
      return res.json({ handoff });
    } catch (err) {
      console.error("/api/nebula-swarm/handoff:", err);
      captureError(err instanceof Error ? err : new Error(String(err)), {
        source: "server",
        route: "/api/nebula-swarm/handoff",
      });
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Swarm handoff failed",
      });
    }
  });

  app.post("/api/grok/chat", async (req, res) => {
    const body = req.body || {};
    const { messages, userId, projectName, onboardingAutopilot } = body;
    const buildMode = Boolean(body.buildMode);
    const workspaceContextFromClient =
      typeof body.workspaceContext === "string" ? body.workspaceContext.trim() : "";
    const clientChatModel = typeof body.chatModel === "string" ? body.chatModel.trim() : "";
    const clientAiProviderRaw =
      typeof body.aiProvider === "string" ? body.aiProvider.trim().toLowerCase() : "";
    const preferredProvider =
      clientAiProviderRaw === "anthropic" ||
      clientAiProviderRaw === "openai" ||
      clientAiProviderRaw === "xai"
        ? clientAiProviderRaw
        : clientChatModel.toLowerCase().includes("claude")
          ? "anthropic"
          : clientChatModel.toLowerCase().includes("gpt")
            ? "openai"
            : "xai";

    const keyRes = await resolveMainGrokApiKeyDetailed(req, preferredProvider);
    if (keyRes.ok === false) {
      const status = keyRes.code === "INVALID_LENGTH" ? 400 : 401;
      console.error(`[grok/chat] ${keyRes.code}: ${keyRes.message}`);
      return res.status(status).json({
        error: keyRes.message,
        code: keyRes.code,
        hint: keyRes.hint,
      });
    }
    const mainAiProvider =
      keyRes.ok === true ? keyRes.provider : preferredProvider;
    const chatApiKeyOverride = keyRes.apiKey;
    const convUserId =
      typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";
    const convProject =
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : "Untitled Project";
    const ppChat = projectPathsFor(req);
    const convScopeChat = { userId: convUserId, projectKey: ppChat.projectKey, projectLabel: convProject };

    let messagesForApi: { role: string; content?: string }[] = Array.isArray(messages) ? messages : [];

    if (Boolean(onboardingAutopilot)) {
      const rawMsgs = Array.isArray(messages) ? messages : [];
      const lastUser = [...rawMsgs].reverse().find((m) => m.role === "user");
      const answer =
        typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
      if (!answer) {
        return res.status(400).json({ error: "User answer required for onboarding autopilot" });
      }
      const wf = buildProjectWorkflowExecutionContext(req);
      const autopilotSystem = `ONBOARDING_AUTOPILOT — single model turn. No conversational filler. No permission questions. Do not ask follow-ups.

The user answered ONLY the first discovery question (core feature of their app). Infer reasonable defaults for audience, stack, pages, integrations, and environment (aligned with project-execution-rules.md) without asking the user.

Output in ONE reply, in this order:
1) <START_MASTERPLAN> ... </END_MASTERPLAN> with ALL five canonical sections using these exact headings:
   ### 1. Goal of the app
   ### 2. Tech and Research
   ### 3. Features and KPIs
   ### 4. Pages and navigation
   ### 5. UI/UX design
   Each section must be substantive (not placeholders).
   - §1: Project Type (Web App / Mobile App / Landing Page — infer best fit) + goal/users/scope.
   - §2: Research Pillars — **8–12 real competitor names** (never invent), ranked features, evidence or "No supporting studies found for this feature.", UI patterns. **Auto-inject security baseline** if auth/private data (auth model, tenant/RLS, roles, secrets, PII, deny-by-default) even if user never asked.
   - §3: MVP features + measurable KPIs (testable, not slogans).
   - §4: each page with name, \`/route\`, purpose, primary_actions, data_entities, authz, empty_state, error_state, nav_links (min 5 routes when Web/Mobile App).
   - §5: 15–25 lines tokens — hex palette, typography, density, nav (no vague "modern/clean" alone; no §4 dump).
2) Immediately also emit \`\`\`file:nebula-ui-studio/ui-brief.md\` … \`\`\` combining full §4 page contracts + §5 tokens (primary UI input). V0/\`v0-prompt.md\` is optional legacy only.
3) <FINISH_MASTERPLAN>
4) <START_CODING> only if implementing; prefer plan+ui-brief first when greenfield.

Optional: include ANSWER_Qn + <GROK_B_SUMMARY_Qn> for tabs as needed. After the tags, no extra user-visible prose.

Hard guard:
- Never copy/paste orchestration policy text from project-execution-rules.md into any Master Plan section.
- Master Plan sections must contain product-specific app content only (goal/research/features/pages/ui), not internal workflow instructions.
- Research must visibly shape §4/§5 (not generic SaaS filler).

Workflow reference (read order; do not paste verbatim into chat output):
${wf}

User's only answer (core feature):
${answer.slice(0, 8000)}`;

      messagesForApi = [
        { role: "system", content: autopilotSystem },
        { role: "user", content: answer },
      ];
    }

    try {
      const memory = buildMemorySystemContent(convScopeChat);
      messagesForApi = injectMemoryIntoMessages(messagesForApi, memory);
    } catch (memErr) {
      console.error("Conversation memory load failed:", memErr);
    }

    let serverFileIndexBlock = "";
    try {
      const allFiles = collectWorkspaceFiles(ppChat.workspaceRoot);
      const productPaths = allFiles
        .filter((f) => isUserAppProductPath(f.relativePath))
        .map((f) => f.relativePath);
      serverFileIndexBlock = formatWorkspaceFileIndexBlock(productPaths);
    } catch (fileIdxErr) {
      console.warn("[grok/chat] workspace file index:", fileIdxErr);
    }

    const workspaceBlock =
      workspaceContextFromClient ||
      [
        "ACTIVE_WORKSPACE (authoritative):",
        `- projectName: ${convProject}`,
        `- projectKey: ${ppChat.projectKey}`,
        `- workspaceRoot: ${ppChat.workspaceRoot}`,
        `- All \`\`\`file:relative/path\`\`\` paths are relative to workspaceRoot.`,
      ].join("\n");
    const rulesExcerpt = readWorkflowFileSafe(ppChat.workspaceRoot, "project-execution-rules.md").slice(
      0,
      4500,
    );
    const rulesBlock = rulesExcerpt
      ? [
          "PROJECT_EXECUTION_RULES (workspace copy — chat vs build, onboarding, TTS). If anything conflicts with the main system prompt INSTRUCTION HIERARCHY / INITIAL ONBOARDING / CODING QUALITY CONTRACT, those win:",
          rulesExcerpt,
        ].join("\n")
      : "";
    const modeBlock = buildMode
      ? "BUILD_MODE: ON — architecture-first implementation. Master Plan only inside <START_MASTERPLAN>…</END_MASTERPLAN>. After plan save write ```file:nebula-ui-studio/ui-brief.md``` (§4 + §5 tokens; primary UI input). Code only as ```file:path``` blocks or START_CODING; never paste implementation as ```typescript``` in chat. Prefer smallest safe change; no hallucinated APIs. Optional legacy: concise ```file:nebula-ui-studio/v0-prompt.md``` only if V0 path is used — NEVER paste UI brief / v0 prompt text in visible chat prose."
      : "CONVERSATION_MODE: ON — short natural prose only; no markdown code fences, UI briefs, v0 prompts, Master Plan bodies, or full file bodies in chat.";
    const includeServerFileIndex =
      serverFileIndexBlock && !workspaceContextFromClient.includes("WORKSPACE_FILE_INDEX");
    const workspaceSystem = [workspaceBlock, rulesBlock, modeBlock, includeServerFileIndex ? serverFileIndexBlock : ""]
      .filter(Boolean)
      .join("\n");
    const sysIdx = messagesForApi.findIndex((m) => m.role === "system");
    if (sysIdx >= 0 && typeof messagesForApi[sysIdx].content === "string") {
      messagesForApi[sysIdx] = {
        role: "system",
        content: `${workspaceSystem}\n\n${messagesForApi[sysIdx].content}`,
      };
    } else {
      messagesForApi.unshift({ role: "system", content: workspaceSystem });
    }

    // Nebulla Free monthly cap: skip when disabled (default) or when the request uses user BYOK.
    // Platform-metered Free usage only applies to platform-key traffic under ENFORCE_FREE_TIER_TOKEN_LIMIT.
    const usingUserByok =
      keyRes.ok === true && (keyRes.source === "user_db" || keyRes.source === "client");
    if (!usingUserByok) {
      try {
        await checkAndEnforceLimit(convUserId);
      } catch (limitErr: unknown) {
        if (limitErr instanceof TokenLimitExceededError) {
          if (mainAiProvider === "xai" && (await respondWithClaudeQuotaFallback(messagesForApi, convScopeChat, res))) {
            return;
          }
          return res.status(402).json({
            error: FREE_TIER_MONTHLY_LIMIT_MESSAGE,
            code: limitErr.code,
          });
        }
        console.warn("[grok/chat] Unexpected limit check error (continuing):", limitErr);
      }
    }

    try {
      const completion = await runAiChatCompletion({
        messages: messagesForApi,
        preferredProvider: mainAiProvider === "xai" ? "xai" : preferredProvider,
        clientChatModel,
        apiKeyOverride: chatApiKeyOverride,
        stroke: "chat",
      });

      if (completion.ok === false) {
        console.error(
          `[main-ai/chat] ${completion.provider} error (${completion.status}):`,
          completion.error,
        );
        if (
          preferredProvider === "xai" &&
          isGrokQuotaLimitError(completion.status, completion.error)
        ) {
          if (await respondWithClaudeQuotaFallback(messagesForApi, convScopeChat, res)) {
            return;
          }
        }
        const isAuthKeyError =
          completion.status === 401 ||
          /invalid.*api.*key|incorrect.*api.*key|unauthor/i.test(completion.error);
        const onRender =
          process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID?.trim());
        const renderKeyHint = onRender
          ? ` On Render: open your web service → Environment → set MAIN_API_KEY_GROK (and optional CLAUDE_API_KEY / OPENAI_API_KEY), save, then redeploy.`
          : "";
        const keyTail =
          chatApiKeyOverride.length >= 4 ? chatApiKeyOverride.slice(-4) : undefined;
        const keySourceLabel =
          keyRes.source === "user_db"
            ? "account"
            : keyRes.source === "client"
              ? "browser"
              : "platform";
        const keyMeta =
          keyTail != null
            ? ` (Nebulla used your ${keySourceLabel} key …${keyTail})`
            : ` (Nebulla used your ${keySourceLabel} key)`;
        const quotaLike = isGrokQuotaLimitError(completion.status, completion.error);
        const permissionLike =
          completion.status === 403 ||
          /forbidden|permission|acl|team admin|not (?:been )?granted|ask your team admin/i.test(
            completion.error,
          );
        const baseError =
          completion.status === 401
            ? `AI provider rejected this API key (401). ${completion.error}${renderKeyHint}`
            : completion.error;
        const aclHint =
          "xAI 403 usually means the API key has no chat/model permissions. In console.x.ai edit the key → enable all endpoints/models (or chat + grok models) → save → paste again in Secrets.";
        return res
          .status(completion.status >= 400 && completion.status < 600 ? completion.status : 502)
          .json({
            error:
              quotaLike || isAuthKeyError || permissionLike ? `${baseError}${keyMeta}` : baseError,
            provider: completion.provider,
            keySource: keyRes.source,
            ...(keyTail ? { keyTail } : {}),
            ...(isAuthKeyError ? { hint: `${MAIN_AI_KEY_SETUP_HINT}${renderKeyHint}` } : {}),
            ...(permissionLike && !quotaLike ? { hint: aclHint } : {}),
            ...(quotaLike && keyRes.source === "user_db"
              ? {
                  hint: "This is your Secrets/account xAI key, not Nebulla Free plan. Top up that key at console.x.ai or paste a different key with credits in Secrets.",
                }
              : {}),
          });
      }

      const responseText = completion.content;
      /** Planning text — used for Master Plan + Grok B summaries (provider-agnostic). */
      const planningCapture = responseText;

  // Grok B (writer): run as soon as meaningful summary content appears.
      const summarySource = planningCapture;
  const answerTabMatches = [...summarySource.matchAll(/\bANSWER_Q([1-6])\b/gi)];
  const answerTabs = [...new Set(answerTabMatches.map((m) => parseInt(m[1], 10)))].sort(
        (a, b) => a - b,
  );
  const summaries = extractGrokBSummaries(summarySource);
  const blockFallbackSummaries = extractSummariesFromMasterPlanBlock(summarySource);
  const mergedSummaries: Partial<Record<number, string>> = {
    ...blockFallbackSummaries,
    ...summaries,
  };
  const summaryTabs = Object.keys(mergedSummaries)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6)
    .sort((a, b) => a - b);
  const shouldRunWriter = answerTabs.length > 0 || summaryTabs.length > 0;
  if (shouldRunWriter) {
    const targetTabs = answerTabs.length > 0 ? answerTabs : summaryTabs;
    const summaryEntries = targetTabs
      .map((idx) => {
        const summary = mergedSummaries[idx];
        return summary ? ({ tabIndex: idx, summary } as const) : null;
      })
      .filter((entry): entry is { tabIndex: number; summary: string } => entry !== null);

    if (summaryEntries.length === 0) {
      console.warn("[GROK B] Trigger ignored: missing <GROK_B_SUMMARY_Qn> payload.");
    } else {
      appendWriterAuditEvent({
        userId: convUserId,
        projectKey: ppChat.projectKey,
        projectName: convProject,
        triggeredQn: summaryEntries.map((x) => x.tabIndex),
      });
      console.log(
            `[GROK B] Trigger: ANSWER_Q tabs=${summaryEntries.map((x) => x.tabIndex).join(",")}`,
      );
      runGrokB(projectPathsFor(req).masterPlanPath, summaryEntries).catch((err) => {
        console.error("[GROK B] Failed to update Master Plan:", err);
      });
    }
  }

      const cleanText = stripAssistantTagsForMemory(responseText);
      if (cleanText) {
        console.log("[TTS] Response ready for speech:", cleanText.substring(0, 50) + "...");
      }

      try {
        const lastUser = [...messagesForApi].reverse().find((m) => m.role === "user");
        if (lastUser && typeof lastUser.content === "string" && lastUser.content.length > 0) {
          appendConversationTurn(convScopeChat, "user", lastUser.content);
        }
        if (cleanText) {
          appendConversationTurn(convScopeChat, "assistant", cleanText);
        }
      } catch (logErr) {
        console.error("Conversation memory append failed:", logErr);
      }

      try {
        const mainTok = completion.usage.totalTokens;
        if (convUserId !== "anonymous" && mainTok > 0) {
          await addTokens(
            convUserId,
            mainTok,
            completion.provider === "xai" ? "grok-4" : "grok-4",
          );
        }
      } catch (btErr) {
        console.warn("[billing] addTokens:", btErr);
      }

      const payload = toOpenAiStyleChatResponse(completion);
      if (completion.fallbackNotice) {
        (payload as { claudeFallbackNotice?: string }).claudeFallbackNotice =
          completion.fallbackNotice;
      }
      res.json(payload);
    } catch (error) {
      console.error("Error calling main AI chat:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/grok/chat",
      });
      res.status(500).json({
        error: "Failed to call AI chat API",
        details: error instanceof Error ? error.message : String(error),
        provider: mainAiProvider,
      });
    }
  });

  const handleSpeak = async (req: express.Request, res: express.Response) => {
    const textFromQuery = typeof req.query.text === "string" ? req.query.text : "";
    const textFromBody = typeof req.body?.text === "string" ? req.body.text : "";
    const text = (textFromBody || textFromQuery || "").trim();
    if (!text) return res.status(400).json({ error: "Text is required" });
    const languageRaw =
      (typeof req.body?.language === "string" && req.body.language) ||
      (typeof req.query.language === "string" && req.query.language) ||
      "en";
    const language = String(languageRaw).trim().toLowerCase().slice(0, 2) || "en";

    try {
      const t0 = Date.now();
      const upstream = await speakUpstream(text, language);
      if (!upstream.body) {
        const audio = Buffer.from(await upstream.arrayBuffer());
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audio.length.toString(),
          "Cache-Control": "no-store",
      });
      res.send(audio);
        console.log(`[TTS] buffered speak ${Date.now() - t0}ms (${audio.length}b)`);
        return;
      }

      res.status(200);
      res.set({
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        // Discourage reverse-proxy buffering so the browser can start sooner.
        "X-Accel-Buffering": "no",
      });
      // Chunked transfer — do not set Content-Length.
      const nodeStream = Readable.fromWeb(upstream.body as import("stream/web").ReadableStream);
      console.log(`[TTS] streaming speak start ${Date.now() - t0}ms (chars=${text.length})`);
      nodeStream.on("error", (err) => {
        console.error("[TTS] upstream stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "TTS failed" });
        } else {
          res.destroy(err);
        }
      });
      nodeStream.pipe(res);
    } catch (error) {
      console.error("TTS endpoint failed:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/speak",
      });
      if (!res.headersSent) {
      res.status(500).json({ error: "TTS failed" });
      }
    }
  };

  app.get("/api/speak", handleSpeak);
  app.post("/api/speak", handleSpeak);

  registerGuardianRoutes(app);
  app.use(guardianExpressErrorHandler);

  // 404 for unknown /api/* only (avoid Express 4 `app.use('/api/*')` quirks with `*`)
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    res.status(404).json({ error: `Path ${req.originalUrl} not found on this server` });
  });

  // Development: Vite middleware (HMR). Production: serve `dist/` SPA from the same process.
  if (process.env.NODE_ENV !== "production") {
    const hmrPort = Number(process.env.VITE_HMR_PORT) || 24678;
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr:
          process.env.DISABLE_HMR === "true"
            ? false
            : {
                overlay: false,
                port: hmrPort,
              },
      },
      appType: "spa",
    });
    app.use((vite.middlewares) as any);
  } else {
    const distPath = path.join(REPO_ROOT, "dist");
    const spaIndexHtml = path.join(distPath, "index.html");
    if (!fs.existsSync(spaIndexHtml)) {
      const msg = `[nebula] Production SPA missing: ${spaIndexHtml}. Run \`npm run build\` in the image/build step and ensure dist/ is copied into the runtime container.`;
      console.error(msg);
      captureError(new Error(msg), { source: "server", route: "startup", detail: "missing-dist" });
      process.exit(1);
    }
    const sendSpaIndex = (_req: express.Request, res: express.Response) => {
      // Never cache the SPA shell — stale index.html keeps users on old JS after deploy (CDN/browser).
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.sendFile(spaIndexHtml);
    };
    app.get("/privacy", sendSpaIndex);
    app.get("/terms", sendSpaIndex);
    app.get("/legal/dpa", sendSpaIndex);
    app.get("/dpa", sendSpaIndex);
    app.get("/reset-password", sendSpaIndex);
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders(res, filePath) {
          const name = path.basename(filePath);
          if (name === "index.html") {
            res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
            return;
          }
          if (filePath.includes(`${path.sep}assets${path.sep}`) && /\.(js|css|mjs|woff2?)$/.test(name)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }) as any,
    );
    app.get("*", (req, res) => {
      sendSpaIndex(req, res);
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nebulla server listening on http://0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`);
  });
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    captureError(err, { source: "server", route: `listen:${PORT}`, detail: err.code });
    if (err.code === "EADDRINUSE") {
      console.error(
        `[nebula] Port ${PORT} is already in use. Quit the other dev server, or run: PORT=${PORT + 1} npm run dev`
      );
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  captureError(err instanceof Error ? err : new Error(String(err)), {
    source: "process",
    detail: "startServer",
  });
  process.exit(1);
});

/** Open upstream Grok TTS and return the Response (body streamed — do not buffer). */
async function speakUpstream(text: string, language = "en"): Promise<Response> {
  const apiKey = readPlatformTtsApiKey();
  const lang = ["en", "fr", "it", "es", "de"].includes(language) ? language : "en";

  if (!apiKey) {
    throw new Error(
      `TTS needs an xAI key: set ${MAIN_AI_ENV_VAR} (preferred) or optional GROK_TTS_NEW_API_KEY in the server .env.`,
    );
  }

  const response = await fetch("https://api.x.ai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-tts-1",
      input: text,
      voice: "Eve",
      response_format: "mp3",
      // Best-effort; ignored if upstream does not support it yet.
      language: lang,
    }),
  });

  if (response.ok) {
    return response;
  }

  const primaryError = await response.text();
  console.warn(`[TTS] New endpoint failed (${response.status}). Trying compatibility fallback.`);

  const fallback = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: "Eve",
      output_format: {
        codec: "mp3",
        sample_rate: 44100,
        bit_rate: 128000,
      },
      language: lang,
    }),
  });

  if (!fallback.ok) {
    const fallbackError = await fallback.text();
    throw new Error(
      `TTS Error (new=${response.status}, fallback=${fallback.status}) new="${primaryError}" fallback="${fallbackError}"`,
    );
  }

  return fallback;
}

/** Buffered helper for any non-streaming callers. */
async function speak(text: string): Promise<Buffer> {
  const upstream = await speakUpstream(text);
  return Buffer.from(await upstream.arrayBuffer());
}

function extractGrokBSummaries(responseText: string): Partial<Record<number, string>> {
  const out: Partial<Record<number, string>> = {};
  const re = /<GROK_B_SUMMARY_Q([1-6])>([\s\S]*?)<\/GROK_B_SUMMARY_Q\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(responseText)) !== null) {
    const tabIndex = parseInt(m[1], 10);
    const summary = m[2].trim();
    if (summary) out[tabIndex] = summary;
  }
  return out;
}

function extractSummariesFromMasterPlanBlock(responseText: string): Partial<Record<number, string>> {
  const blockMatch = responseText.match(/<START_MASTERPLAN>([\s\S]*?)<\/?END_MASTERPLAN>/i);
  if (!blockMatch) return {};
  return parseMasterPlanBlock(blockMatch[1]);
}

/** Grok B — writer. Copies Grok 4 summaries into mapped Master Plan sections. */
async function runGrokB(
  masterPlanPath: string,
  entries: { tabIndex: number; summary: string }[]
) {
  if (entries.length === 0) return;

  try {
    let plan: Record<string, string> = {};

    if (fs.existsSync(masterPlanPath)) {
      try {
        plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
      } catch {
        plan = {};
      }
    }

    for (const entry of entries) {
      const title = masterPlanKeyForTabIndex(entry.tabIndex);
      if (!title) continue;
      const summary = entry.summary.trim();
      if (summary) {
        plan[title] = summary;
      }
    }

    fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
    console.log(
      `[GROK B] Master plan updated from Grok 4 summaries (tabs: ${entries
        .map((e) => e.tabIndex)
        .join(",")}).`
    );
  } catch (err) {
    console.error("Grok B processing failed:", err);
  }
}