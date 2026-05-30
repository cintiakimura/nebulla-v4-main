import dotenv from "dotenv";
import path from "path";
import express from "express";
import fs from "fs";
import { exec, execFile, spawn } from "child_process";
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
import {
  initGuardianProcessHandlers,
  registerGuardianRoutes,
  guardianExpressErrorHandler,
  captureError,
} from "./lib/nebulaGuardian";
import { mountRenderStack, getRenderPublicConfig, resolveNebulaProjectDiskKey, readNebulaSessionUserId } from "./renderStack";
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
  readMainAiApiKeyFromEnv,
  tryClaudeQuotaFallback,
  detectMainAiProvider,
  resolveMainAiChatModel,
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
} from "./lib/nebulaMainGrokResolver";
import { callClaudeChatCompletion } from "./lib/nebulaClaudeFallback";
import { formatWorkspaceFileIndexBlock } from "./lib/ideAiContextBlocks";
import {
  bootstrapMasterPlanFromWorkspace,
  ensurePreviewIndexHtml,
  fillMissingMasterPlanSectionsLocal,
  hydrateAndPersistMasterPlan,
  readMasterPlanFile,
  syncMindMapFromMasterPlan,
  syncV0PromptFromMasterPlan,
  unlockVisualEditorFromWorkspaceCoding,
  writeBasicUiScaffold,
} from "./lib/nebulaIdeWorkspaceArtifacts";
import { ensureMasterPlanBeforeGo } from "./lib/nebulaMasterPlanSynthesis";
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
  masterPlanKeyForTabIndex,
  normalizeMasterPlanRecord,
  parseMasterPlanBlock,
} from "./lib/masterPlanSections";
import {
  isAllowedV0WriteRel,
  normalizeV0WriteRel,
  pickPrimaryUiFile,
  v0CreateChat,
  v0FindChatVersionFiles,
  v0GetChat,
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
import { clearGoCodePending, readGoCodePending } from "./lib/nebulaGoCodePending";
import {
  callGrokGenerateUiSvg,
  heuristicSvgEditRisks,
  callGrokAnalyzeSvgEdit,
  callGrokAdaptUserSvg,
} from "./lib/nebulaUiStudioGrok";
import { getNebullaPersistRoot, getNebulaProjectDocsRoot } from "./lib/nebulaWorkspaceRoot";
import { ensureCloudProjectWorkspace } from "./lib/nebulaCloudProjectRoot";
import { getProjectKeyFromRequest } from "./lib/nebulaProjectKey";
import {
  isVisualEditorEligible,
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

/** Strip orchestration tags before persisting assistant text to conversation memory. */
function stripAssistantTagsForMemory(text: string): string {
  return text
    .replace(/<REASONING>[\s\S]*?<\/REASONING>/g, "")
    .replace(/<START_MASTERPLAN>[\s\S]*?<\/?END_MASTERPLAN>/g, "")
    .replace(/<START_MASTERPLAN>/g, "")
    .replace(/<END_MASTERPLAN>/g, "")
    .replace(/<START_CODING>/g, "")
    .replace(/START_CODING/g, "")
    .replace(/<START_UIUX>/g, "")
    .replace(/<FINISH_MASTERPLAN>/g, "")
    .replace(/<APPROVE_MASTERPLAN>/g, "")
    .replace(/<APPROVE_MINDMAP>/g, "")
    .replace(/<APPROVE_UI>/g, "")
    .replace(/<GROK_B_SUMMARY_Q([1-6])>[\s\S]*?<\/GROK_B_SUMMARY_Q\1>/g, "")
    .replace(/\bANSWER_Q[1-6]\b/g, "")
    .trim();
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
  const reason =
    process.env.RENDER === "true" || process.env.RENDER_SERVICE_ID
      ? "Render host default (set ENFORCE_FREE_TIER_TOKEN_LIMIT=true to re-enable)"
      : "DISABLE_FREE_TIER_TOKEN_LIMIT or non-production NODE_ENV";
  console.warn(`[nebula] Free plan monthly AI token cap is OFF — ${reason}.`);
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

  // Behind Railway / Render / Fly / nginx / Docker — correct client IPs and secure cookies.
  app.set("trust proxy", 1);

  app.use(express.json({ limit: '50mb' }) as any);
  app.use(express.urlencoded({ extended: true, limit: '50mb' }) as any);

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
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

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

  app.get("/api/config", (req, res) => {
    const grok = readMainAiApiKeyFromEnv();
    const mainAiProvider = grok.length >= 20 ? detectMainAiProvider(grok) : "unknown";
    const mainAiChatModel = grok.length >= 20 ? resolveMainAiChatModel(mainAiProvider) : undefined;
    const grokSwarm = process.env.GROK_SWARM_API_KEY?.trim() ?? "";
    const tts = process.env.GROK_TTS_NEW_API_KEY?.trim() ?? "";
    const writer = process.env.GROK_3_API_KEY?.trim() ?? "";
    const render = getRenderPublicConfig();
    const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim() || "";
    const pencilKey = resolvePencilApiKey();
    const v0KeyRes = resolveV0ApiKeyFromRequest(req);
    const pp = ensureCloudProjectWorkspace(REPO_ROOT, NEBULA_PROJECT_ROOT, projectDiskKey(req));
    res.json({
      ...render,
      publicSiteUrl,
      githubClientId: process.env.GITHUB_CLIENT_ID || process.env.github_client_id,
      builderPublicKey: process.env.BUILDER_PUBLIC_KEY,
      hasMainAiApiKey: grok.length >= 20,
      hasGrokApiKey: grok.length >= 20,
      mainAiKeyTail: mainAiApiKeyTail(),
      freeTierTokenLimitDisabled: isFreeTierTokenLimitDisabled(),
      mainAiProvider,
      mainAiChatModel,
      hasGrokSwarmApiKey: grokSwarm.length >= 20,
      mainAiKeyHint: MAIN_AI_KEY_SETUP_HINT,
      grokKeyHint: MAIN_AI_KEY_SETUP_HINT,
      hasGrokTtsKey: tts.length >= 20,
      hasGrokWriterKey: writer.length >= 20,
      hasV0ApiKey: v0KeyRes.ok === true,
      v0KeyHint: NEBULA_V0_KEY_SETUP_HINT,
      hasR2Storage: isR2Configured(),
      r2MissingEnv: r2MissingOnBoot,
      r2StorageHint:
        r2MissingOnBoot.length > 0
          ? `Set ${r2MissingOnBoot.join(", ")} in .env for Cloudflare R2 uploads.`
          : undefined,
      pencilMockupsReady: Boolean(pencilKey),
      nebulaUiStudioDemo: Boolean(!pencilKey && useBundledDemoMockupWithoutKey()),
      workspaceMode: "cloud",
      hasActiveWorkspace: true,
      activeWorkspacePath: null,
      cloudProjectKey: pp.projectKey,
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

  const V0_PROMPT_MIN_LEN = 80;

  /** Rebuild v0-prompt.md from Master Plan §4+§5 (and app routes when §4 is empty). */
  const ensureV0PromptSynced = (
    pp: ReturnType<typeof projectPathsFor>,
  ): { content: string; synced: boolean } => {
    let content = readV0PromptMarkdown(pp.workspaceRoot).trim();
    if (content.length > V0_PROMPT_MIN_LEN) {
      return { content, synced: false };
    }
    try {
      const v0Sync = syncV0PromptFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      mirrorV0PromptToStudioFile(pp, v0Sync.content);
      content = v0Sync.content.trim();
      return { content, synced: true };
    } catch (e) {
      console.warn("[ensureV0PromptSynced]", e);
      return { content, synced: false };
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
    const { content: canonicalPrompt } = ensureV0PromptSynced(pp);
    const skillExcerpt = readSkillDesignSystemExcerpt(pp.workspaceRoot);
    const extra = typeof body.message === "string" ? body.message.trim() : "";
    const projectDisplayName =
      typeof body.projectDisplayName === "string" && body.projectDisplayName.trim()
        ? String(body.projectDisplayName).trim()
        : undefined;
    const skillBlock = skillExcerpt
      ? `Design system (SKILL.md):\n${skillExcerpt.slice(0, 280)}`
      : "";
    const promptTextRaw = [canonicalPrompt, skillBlock, extra].filter(Boolean).join("\n\n");
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
    const allFilesMap: Record<string, string> = {};
    for (const f of v0Files) {
      const rel = normalizeV0WriteRel(f.name);
      if (rel) allFilesMap[rel] = f.content;
    }
    if (Object.keys(allFilesMap).length === 0) {
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
    markV0FirstGenerationComplete(workspaceRoot, projectNameSafe, {
      files: allFilesMap,
      source: "v0-api",
      notes: "Nebula UI Studio v0 generation",
    });
    saveCanonicalV0OriginalCopy(workspaceRoot, allFilesMap);
    seedPreviewModelFromMasterPlan(
      workspaceRoot,
      masterPlanPath,
      opts.projectDisplayName?.trim() || "Untitled Project",
    );

    const { written, skipped } = writeV0FilesToWorkspace(
      workspaceRoot,
      v0Files.map((f) => ({ name: normalizeV0WriteRel(f.name), content: f.content })),
    );

    if (written.length === 0 && skipped.length > 0) {
      return {
        ok: false,
        status: 422,
        error: `v0 returned ${v0Files.length} file(s) but none matched allowed paths (src/, app/, components/, etc.). Skipped: ${skipped.slice(0, 6).join(", ")}`,
      };
    }

    ensureNebulaUiStudioFileAt(nebulaUiStudioPath);
    const existing = fs.readFileSync(nebulaUiStudioPath, "utf8");
    const promptFromDisk = readV0PromptMarkdown(workspaceRoot) || opts.message.slice(0, 120000);
    const withPrompt = upsertNebulaCommentSection(existing, "NEBULA_UI_STUDIO_PROMPT", promptFromDisk);
    const primaryCode = pickPrimaryUiFile(v0Files);
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
    | { ok: true; pending: true; chatId: string; versionStatus?: string }
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

    const got = await v0GetChat(keyRes.apiKey, chatId);
    if (got.ok === false) {
      return { ok: false, status: got.status, error: got.error };
    }

    let v0Files = got.result.files;
    let demoUrl = got.result.demoUrl;
    const status = got.result.versionStatus;

    if (v0Files.length === 0 && status === "completed") {
      v0Files = await v0FindChatVersionFiles(keyRes.apiKey, chatId);
    }

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
        return { ok: true, pending: true, chatId, versionStatus: status ?? "pending" };
      }
      return {
        ok: false,
        status: 422,
        error:
          "v0 finished but returned no files. Check nebula-ui-studio/v0-prompt.md or regenerate on v0.dev.",
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
      2: "2. Text & Search",
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

  /** Save UTF-8 workspace file (same path rules as source-control product files). */
  app.put("/api/files/content", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const relRaw = typeof req.body?.path === "string" ? req.body.path : "";
      const content = typeof req.body?.content === "string" ? req.body.content : undefined;
      const rel = relRaw.replace(/^\.\/+/, "").replace(/\\/g, "/");
      if (!rel) return res.status(400).json({ error: "path is required" });
      if (content === undefined) return res.status(400).json({ error: "content is required" });
      if (!isUserAppProductPath(rel)) {
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
      const { workspaceRoot } = projectPathsFor(req);
      const target = resolveWorkspaceRelative(workspaceRoot, MIND_MAP_WORKSPACE_REL);
      if (!fs.existsSync(target)) {
        return res.json({ pages: [], edges: [] });
      }
      const raw = fs.readFileSync(target, "utf8");
      const j = JSON.parse(raw) as { pages?: unknown; edges?: unknown };
      const pages = Array.isArray(j.pages) ? j.pages : [];
      const edges = Array.isArray(j.edges) ? j.edges : [];
      res.json({ pages, edges });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "mind map read failed" });
    }
  });

  app.put("/api/workspace/mind-map", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      const pages = req.body?.pages;
      const edges = req.body?.edges;
      if (!Array.isArray(pages) || !Array.isArray(edges)) {
        return res.status(400).json({ error: "pages and edges must be arrays" });
      }
      const payload = JSON.stringify({ version: 1, pages, edges });
      if (payload.length > 900_000) {
        return res.status(413).json({ error: "Mind map payload too large" });
      }
      const target = resolveWorkspaceRelative(workspaceRoot, MIND_MAP_WORKSPACE_REL);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, payload, "utf8");
      res.json({ ok: true });
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
      res.json({
        ok: true,
        pages: graph.pages,
        edges: graph.edges,
        routeCount: graph.routeCount,
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
      return res.json({ ok: true, unlocked, eligible: gate.eligible, reason: gate.reason });
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
      ensurePreviewIndexHtml(pp.workspaceRoot, projectName || "Untitled Project");
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
      const autoV0 = body.autoV0 !== false;

      const plan = hydrateAndPersistMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
      const v0Prompt = writeV0PromptMarkdown(pp.workspaceRoot, plan);
      ensureNebulaUiStudioFileAt(pp.nebulaUiStudioPath);
      const studioExisting = fs.readFileSync(pp.nebulaUiStudioPath, "utf8");
      fs.writeFileSync(
        pp.nebulaUiStudioPath,
        upsertNebulaCommentSection(studioExisting, "NEBULA_UI_STUDIO_PROMPT", v0Prompt.content),
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
        v0PromptWritten: v0Prompt.written,
        v0PromptPath: "nebula-ui-studio/v0-prompt.md",
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

  /** Preview metadata: prefer v0.dev live URL when available, else workspace HTML bootstrap. */
  app.get("/api/app-preview/meta", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const demoUrl = readV0DemoUrl(pp.workspaceRoot);
      const hasReal = hasRealV0ApiGeneration(pp.workspaceRoot);
      res.json({
        ok: true,
        v0DemoUrl: demoUrl,
        preferV0: Boolean(demoUrl && hasReal),
        hasRealV0: hasReal,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "preview meta failed" });
    }
  });

  /** Bootstrap HTML for in-IDE preview: inject base + rewrite root-relative URLs under this project. */
  app.get("/api/app-preview/bootstrap", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const idx = path.join(pp.workspaceRoot, "index.html");
      if (!fs.existsSync(idx)) {
        return res
          .status(200)
          .type("html")
          .send(
            `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>No preview</title></head><body style="background:#0a1628;color:#94a3b8;font-family:system-ui;padding:2rem">No <code>index.html</code> in this workspace yet.</body></html>`,
          );
      }
      let html = fs.readFileSync(idx, "utf8");
      const xfProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
      const proto = xfProto || req.protocol || "http";
      const host = req.get("host") || `localhost:${PORT}`;
      const baseHref = `${proto}://${host}/api/app-preview/p/${encodeURIComponent(pp.projectKey)}/`;
      if (!/<base\s/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
      }
      html = html.replace(/(src|href)=(["'])\/(?!\/)/gi, "$1=$2");
      res.type("html").send(html);
    } catch (err: unknown) {
      res.status(500).type("text/plain").send(err instanceof Error ? err.message : "bootstrap failed");
    }
  });

  /** Raw workspace file for preview assets (URL path must match active project key). */
  app.use((req, res, next) => {
    if (req.method !== "GET" || !req.path.startsWith("/api/app-preview/p/")) return next();
    try {
      const asterisk = req.path.slice("/api/app-preview/p/".length);
      const slash = asterisk.indexOf("/");
      const projectKey = slash === -1 ? asterisk : asterisk.slice(0, slash);
      const relEncoded = slash === -1 ? "" : asterisk.slice(slash + 1);
      let relPath = relEncoded ? decodeURIComponent(relEncoded.replace(/\+/g, " ")) : "";
      relPath = relPath.replace(/^\.\/+/, "").replace(/^\/+/, "");
      if (!relPath) relPath = "index.html";

      const diskKey = projectDiskKey(req as NebulaRequest);
      if (projectKey !== diskKey) {
        res.status(403).type("text/plain").send("Project key mismatch");
        return;
      }
      const { workspaceRoot } = projectPathsFor(req);
      const target = path.resolve(workspaceRoot, relPath);
      if (!target.startsWith(workspaceRoot)) {
        res.status(403).end();
        return;
      }
      if (!fs.existsSync(target)) {
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

  app.post("/api/files/apply-generated", (req, res) => {
    try {
      const { workspaceRoot } = projectPathsFor(req);
      let raw = typeof req.body?.content === "string" ? req.body.content : "";
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
          fallbackPath = "src/App.tsx";
        } else if (/^<!DOCTYPE html>/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
          fallbackPath = "index.html";
        } else if (/^import\s+.*from\s+['"][^'"]+['"]/m.test(trimmed) && /export\s+default/m.test(trimmed)) {
          fallbackPath = "src/App.tsx";
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

      for (const b of blocks) {
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

      res.json({
        success: true,
        written,
        skipped,
        parsedBlocks: blocks.length,
        usedFallbackPath: fallbackPath || undefined,
      });

      if (written.length > 0) {
        try {
          const pp = projectPathsFor(req);
          const body = req.body || {};
          const projectName =
            typeof body.projectName === "string" && body.projectName.trim()
              ? String(body.projectName).trim()
              : "Untitled Project";
          const userNote = typeof body.userNote === "string" ? body.userNote.trim() : "";
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
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to apply generated files" });
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

  /** Bundled Nebula / planning files — not the user app Grok writes under src/, public/, etc. */
  function isNebulaOrchestrationPath(relPath: string): boolean {
    const p = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!p) return true;
    const exact = new Set([
      "master-plan.json",
      "project-execution-rules.md",
      "environment-setup.md",
      "Nebula Architecture Spec.md",
      "SKILL.md",
      "nebula-ui-studio.md",
      "conversation-log.md",
      "project-workflow.md",
    ]);
    if (exact.has(p)) return true;
    const prefixes = [
      "generated-ui/",
      "nebulla-version-history/",
      "nebulla-ide/",
      "nebula-project/",
      "nebula-ui-studio/",
      ".cursor/",
      "conversation-logs/",
      "dist/",
      "build/",
      "coverage/",
    ];
    for (const pre of prefixes) {
      if (p.startsWith(pre)) return true;
    }
    return false;
  }

  function isUserAppProductPath(relPath: string): boolean {
    const p = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!p || p.includes("..")) return false;
    if (p.startsWith("node_modules/") || p.includes("/node_modules/")) return false;
    if (p.startsWith(".git/")) return false;
    return !isNebulaOrchestrationPath(p);
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

  // Stripe Integration (DISABLED until further notice)
  app.post("/api/create-checkout-session", (req, res) => {
    res.status(503).json({ 
      error: "Payments are currently disabled", 
      message: "Stripe integration is kept in the codebase but inactive per project settings." 
    });
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
        return res.status(422).json({
          error: existing.startError,
          chatId: existing.chatId,
          hint: "Poll /v0-poll to retry fetching files, or clear and Generate again.",
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

  app.post("/api/nebula-ui-studio/v0-start", handleV0Start);
  /** Legacy bundles called this before v0-start/v0-poll (Render-safe background start). */
  app.post("/api/nebulla-v0-generate", handleV0Start);
  app.post("/api/nebula-v0-generate", handleV0Start);

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
        return res.status(422).json({
          error: pending.startError,
          chatId: pending.chatId,
          hint: "Poll /v0-poll to retry fetching files, or clear and Generate again.",
        });
      }
      if (pending?.startError && !pending.chatId) {
        clearV0Pending(workspaceRoot);
        pending = null;
      }
      if ((pending?.starting && !pending.chatId) || isV0StartJobActive(workspaceRoot)) {
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
          starting: true,
          chatId: pending?.chatId || undefined,
          elapsedMs,
          recovered: stale,
          hint: stale
            ? "Recovered stalled v0 start — keep polling (no new charge)."
            : elapsedMs > 120_000
              ? "v0-pro is still working — keep polling (typically 1–4 min, no new charge)."
              : "v0 is still starting on the server — keep polling (no new charge).",
        });
      }
      const chatId =
        typeof body.chatId === "string" && body.chatId.trim()
          ? body.chatId.trim()
          : pending?.chatId?.trim() || "";
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
        });
      }
      return res.json({ ok: true, pending: false, source: pass.source, ...pass });
    } catch (e) {
      console.error("[nebula-ui-studio/v0-poll]", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "v0 poll failed" });
    }
  };

  app.post("/api/nebula-ui-studio/v0-poll", handleV0Poll);
  app.post("/api/nebulla-v0-poll", handleV0Poll);
  app.post("/api/nebula-v0-poll", handleV0Poll);

  app.post("/api/nebula-ui-studio/v0-generate", handleV0Start);

  app.post("/api/nebula-ui-studio/v0-update", async (req, res) => {
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
  });

  app.post("/api/nebula-ui-studio/generate", async (req, res) => {
    const { pagesText, branding } = req.body;
    const pencilKey = resolvePencilApiKey();
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

      const v0KeyRes = resolveV0ApiKeyFromRequest(req);
      if (v0KeyRes.ok) {
        const v0Pass = await runV0UiStudioPass({
          req,
          message: `${promptText}\n\nVariation index: ${variationIndex}. Deliver shadcn/Tailwind UI files under src/ or app/.`,
          projectDisplayName:
            typeof req.body?.projectDisplayName === "string" ? req.body.projectDisplayName : undefined,
        });
        if (v0Pass.ok === true) {
          const svg = loadBundledDemoMockupSvg();
          const r2 = await r2FieldsForSvg(projectDiskKey(req), svg, `v0-variation-${variationIndex}.svg`);
          return res.json({
            svg,
            usedPrompt: storedPrompt || "",
            source: "v0",
            chatId: v0Pass.chatId,
            written: v0Pass.written,
            demoUrl: v0Pass.demoUrl,
            ...r2,
          });
        }
        console.warn("[nebula-ui-studio/generate] v0 failed, falling back:", v0Pass.error);
      } else if (Boolean(req.body?.requireV0)) {
        return res.status(401).json({ error: NEBULA_V0_KEY_SETUP_HINT, hint: NEBULA_V0_KEY_SETUP_HINT });
      }

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
          console.warn("[nebula-ui-studio/generate] Grok failed, fallback if Pencil key:", grokErr);
          if (!pencilKey) {
            return res.status(502).json({
              error:
                grokErr instanceof Error ? grokErr.message : "Grok UI generation failed and no Pencil fallback is configured.",
            });
          }
        }
      }

      if (pencilKey) {
        const result = await callPencilMockupsGenerate({ apiKey: pencilKey, apiUrl: pencilUrl, body });
        if (result.ok === false) {
          console.error("Nebula UI Studio Engine Error:", result.error);
          return res.status(result.status).json({ error: result.error });
        }
        const raw = result.raw as Record<string, unknown>;
        const r2 = await r2FieldsForSvg(
          projectDiskKey(req),
          result.svg,
          `pencil-variation-${variationIndex}.svg`
        );
        return res.json({ ...raw, svg: result.svg, usedPrompt: storedPrompt || "", source: "pencil", ...r2 });
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
          originalV0FolderRel: resolveOriginalV0FolderRel(workspaceRoot),
        });
      }
      const r = isVisualEditorEligible(workspaceRoot);
      return res.json({
        eligible: r.eligible,
        reason: r.reason,
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

      const gRes = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.GROK_VISUAL_APPLY_MODEL?.trim() || "grok-4-1-fast-reasoning",
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
      const gate = isVisualEditorEligible(workspaceRoot);
      if (!gate.eligible && process.env.NEBULA_VISUAL_EDITOR_DEV_UNLOCK !== "true") {
        return res.status(403).json({ error: gate.reason || "not eligible" });
      }
      const m = (req.body as { model?: unknown })?.model;
      if (m === undefined) return res.status(400).json({ error: "model required" });
      const dir = path.dirname(visualEditorPreviewAbs(workspaceRoot));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(visualEditorPreviewAbs(workspaceRoot), JSON.stringify(m, null, 2), "utf8");
      return res.json({ ok: true });
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

  /** Go: Grok 4 writes a short summary into master-plan.json only, then Grok Code runs (no full execution doc in MP). */
  app.post("/api/grok/go-code", async (req, res) => {
    const { messages, userId, projectName, userNote, continuation: continuationRaw } = req.body || {};
    const continuation = Boolean(continuationRaw);
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

    const note =
      typeof userNote === "string" && userNote.trim() ? userNote.trim().slice(0, 4000) : "";

    try {
      const ppGo = projectPathsFor(req);
      const { masterPlanPath } = ppGo;
      const convScopeGo = { userId: convUserId, projectKey: ppGo.projectKey, projectLabel: convProject };
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

      let mpFill: { written: string[]; source: string } = { written: [], source: "skipped" };
      if (!continuation) {
        mpFill = await ensureMasterPlanBeforeGo({
          apiKey,
          workspaceRoot: ppGo.workspaceRoot,
          masterPlanPath,
          planSnapshot,
          memoryContent: memory,
          projectName: convProject,
          userNote: note,
        });
        if (mpFill.written.length > 0) {
          console.log(
            `[go-code] Master Plan filled (${mpFill.source}): ${mpFill.written.join(", ")}`,
          );
          try {
            const refreshed = readMasterPlanFile(masterPlanPath);
            for (const [k, v] of Object.entries(refreshed)) {
              if (typeof v === "string") planSnapshot[k] = v;
            }
          } catch {
            /* ignore */
          }
        }
      }

      let summary = "";
      let v0Sync = syncV0PromptFromMasterPlan(ppGo.workspaceRoot, masterPlanPath);

      if (!continuation) {
      const phaseASystem = `You are Grok 4 (planning only). The user pressed **Go** to run a coding pass with Grok Code.

Your ONLY output for this turn: a **short** pre-coding summary for the Master Plan file.

Strict rules:
- Emit EXACTLY one block: <PRE_CODING_SUMMARY>...</PRE_CODING_SUMMARY>
- Inside: maximum 1200 characters. Use bullets or tight prose: scope, assumptions, first areas to implement, risks.
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
        }),
      });

      if (!g4Res.ok) {
        const errText = await g4Res.text();
        return res.status(g4Res.status).json({ error: `Grok 4 summary phase failed: ${errText.slice(0, 500)}` });
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
        summary = "No summary generated; proceed from master plan tabs and project-execution-rules.md.";
      }
      summary = summary.slice(0, 2000);

      let plan: Record<string, unknown> = {};
      if (fs.existsSync(masterPlanPath)) {
        try {
          plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
        } catch {
          plan = {};
        }
      }
      plan[PRE_CODING_SUMMARY_KEY] = summary;
      const goalKey = "1. Goal of the app";
      const existingGoal = String(plan[goalKey] ?? "").trim();
      if (!existingGoal) {
        plan[goalKey] = summary;
      } else if (!existingGoal.includes(summary.slice(0, 80))) {
        plan[goalKey] = `${existingGoal}\n\n**Latest coding session (Go):**\n${summary}`;
      }
      fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
      v0Sync = syncV0PromptFromMasterPlan(ppGo.workspaceRoot, masterPlanPath);
      mirrorV0PromptToStudioFile(ppGo, v0Sync.content);
      console.log(`[go-code] Wrote ${PRE_CODING_SUMMARY_KEY} (${summary.length} chars)`);
      console.log(`[go-code] Wrote v0-prompt.md (${v0Sync.content.length} chars) from Master Plan §4+§5`);
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
        v0Sync = syncV0PromptFromMasterPlan(ppGo.workspaceRoot, masterPlanPath);
        mirrorV0PromptToStudioFile(ppGo, v0Sync.content);
        console.log(`[go-code] Continuation pass — skipping Grok 4 summary (${summary.length} chars from plan)`);
      }

      const workflowContext = buildProjectWorkflowExecutionContext(req);
      const codeModel = process.env.GROK_CODE_MODEL?.trim() || "grok-code-fast-1";
      const codeSystemPrompt = continuation
        ? `You are Grok Code (CONTINUATION pass). master-plan.json is ready but app files are missing.

Output the COMPLETE application in THIS single response:
- Every route page under \`app/\` from Master Plan §4
- \`app/layout.tsx\`, \`app/globals.css\`, root \`app/page.tsx\`
- Shared \`components/\` and \`lib/\` as needed
- Minimum 8 file blocks; do NOT return only master-plan.json

File blocks only: \`\`\`file:relative/path\` … \`\`\` — no chat prose.

${workflowContext}`
        : `You are Grok Code (coding phase; same ${MAIN_AI_ENV_VAR} as the main brain). The user pressed **Go** in the Nebulla assistant.

A short pre-coding summary was just saved to master-plan.json under the key "${PRE_CODING_SUMMARY_KEY}" (it appears again inside the master-plan snapshot below).

Follow project-execution-rules.md strictly. Use the workflow context in order.

Master Plan (project-execution-rules § A — MUST be complete before code):
- master-plan.json below MUST have all five sections populated before you output app files.
- If ANY of §2–§5 are still thin, emit \`\`\`file:master-plan.json\`\`\` FIRST with the full JSON object (preserve existing keys, fill empty sections from discovery).
- §4: routes as \`- **Name** (\`/route\`)\`; §5: 15–25 lines max (palette, typography, nav — no §4 copy).

Implementation (single pass — do NOT stop after 1–2 files):
- Emit ALL required app files in ONE response: layout, globals, every route page under \`app/\`, shared components, lib/, package.json if missing.
- Match every route in §4. Prefer 8–20 file blocks in one pass rather than incremental partial output.
- Include master-plan.json updates IN THE SAME response if needed — never as the only file.
- Then sync \`nebula-ui-studio/v0-prompt.md\` if §4/§5 changed (800–1200 chars).

Master Plan UI / v0:
- If **"4. Pages and navigation"** or **"5. UI/UX design"** need updates, include them in master-plan.json first.
- The server already wrote \`nebula-ui-studio/v0-prompt.md\`; refresh it if routes/design changed.

CRITICAL OUTPUT CONTRACT (no deviation):
- Do NOT paste implementation as casual markdown code fences in chat — use file blocks the server can apply.
- Output real code artifacts only: \`\`\`file:relative/path\` … \`\`\` or \`File: path\` + fenced body (see /api/files/apply-generated).
- Do NOT output plain-language planning, recap, policy restatement, or narrative explanation.
- If a file must be created/updated, include explicit path + full content or patch for that file.
- Prefer one or more clear file blocks over prose.
- If information is missing, make minimal safe assumptions and proceed with best-effort code.

${workflowContext}`;

      const incomingMessages: { role: string; content?: string }[] = Array.isArray(messages) ? messages : [];
      const normalized = incomingMessages.map((m) => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: typeof m.content === "string" ? m.content : "",
      }));
      const withMem = injectMemoryIntoMessages(normalized, memory);
      const codeUserContent = continuation
        ? `CONTINUATION — output the full app now (all app/ routes + layout + components). Master plan is ready. Focus: ${note || "(implement every §4 route)"}`
        : `Run the coding pass now. Output the FULL app in one response — all app/ files, not master-plan.json only. Respect "${PRE_CODING_SUMMARY_KEY}" and Master Plan §4 routes. Session focus: ${note || "(none)"}`;
      const codeMessages = [
        { role: "system", content: codeSystemPrompt },
        ...withMem.slice(-16),
        {
          role: "user",
          content: codeUserContent,
        },
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
            hint: "Grok Code already running — poll /api/grok/go-code/poll",
          });
        }
      }

      try {
        if (!continuation) {
          appendConversationTurn(convScopeGo, "user", `[Go] ${note || "start coding"}`);
        } else {
          appendConversationTurn(convScopeGo, "user", `[Go continuation] full app implementation`);
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
        hint: continuation
          ? "Grok Code continuation running — wait for Go complete (do not press Go again)."
          : "Master Plan synced from discovery. Grok Code is running — wait for Go complete (1–3 min); do not press Go again.",
      });
    } catch (error) {
      console.error("Error in /api/grok/go-code:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/grok/go-code",
      });
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to run Go (code) pipeline",
      });
    }
  });

  app.post("/api/grok/go-code/poll", (req, res) => {
    try {
      const pp = projectPathsFor(req);
      const jobActive = isGoCodeJobActive(pp.workspaceRoot);
      let pending = readGoCodePending(pp.workspaceRoot);
      const payload = goCodePendingToPollResponse(pending, jobActive, pp.workspaceRoot);
      pending = readGoCodePending(pp.workspaceRoot);
      if (pending && !payload.pending && (pending.status === "done" || pending.status === "error")) {
        try {
          const body = req.body || {};
          const convProject =
            typeof body.projectName === "string" && body.projectName.trim()
              ? String(body.projectName).trim()
              : "Untitled Project";
          fillMissingMasterPlanSectionsLocal({
            workspaceRoot: pp.workspaceRoot,
            masterPlanPath: pp.masterPlanPath,
            projectName: convProject,
          });
          const v0Sync = syncV0PromptFromMasterPlan(pp.workspaceRoot, pp.masterPlanPath);
          mirrorV0PromptToStudioFile(pp, v0Sync.content);
          Object.assign(payload, {
            v0PromptWritten: v0Sync.written,
            v0PromptLength: v0Sync.content.length,
          });
        } catch (syncErr) {
          console.warn("[go-code poll] v0 prompt sync failed:", syncErr);
        }
      }
      if (pending && !payload.pending && pending.status === "done" && pending.codeText) {
        try {
          const uid = readNebulaSessionUserId(req) || "anonymous";
          const body = req.body || {};
          const convProject =
            typeof body.projectName === "string" && body.projectName.trim()
              ? String(body.projectName).trim()
              : "Untitled Project";
          appendConversationTurn(
            { userId: uid, projectKey: pp.projectKey, projectLabel: convProject },
            "assistant",
            pending.codeText.trim().slice(0, 8000),
          );
        } catch {
          /* ignore */
        }
      }
      if (payload.error && !payload.pending && pending?.status === "error") {
        return res.status(422).json(payload);
      }
      if (pending?.status === "done" && !payload.pending && payload.choices) {
        try {
          clearGoCodePending(pp.workspaceRoot);
        } catch {
          /* ignore */
        }
      }
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
      /** Lean swarm: chat never runs agents. `manualRunAndTest` → single Quality (Inspect) call using `GROK_SWARM_API_KEY` + `grok-3-mini` (or `GROK_SWARM_MODEL`). */
      const body = (req.body || {}) as Record<string, unknown>;
      const manualRunAndTest = Boolean(body.manualRunAndTest);
      const swarmKey = process.env.GROK_SWARM_API_KEY?.trim() ?? "";
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
              `Inspect (Quality) requires GROK_SWARM_API_KEY (20+ characters) in the server .env. Normal chat uses ${MAIN_AI_ENV_VAR} only — do not use the swarm key for /api/grok/chat.`,
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
    const keyRes = await resolveMainGrokApiKeyDetailed(req);

    if (keyRes.ok === false) {
      const status = keyRes.code === "INVALID_LENGTH" ? 400 : 401;
      console.error(`[grok/chat] ${keyRes.code}: ${keyRes.message}`);
      return res.status(status).json({
        error: keyRes.message,
        code: keyRes.code,
        hint: keyRes.hint,
      });
    }
    const apiKey = keyRes.apiKey;
    const mainAiProvider = detectMainAiProvider(apiKey);
    const convUserId =
      typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";
    const convProject =
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : "Untitled Project";
    const ppChat = projectPathsFor(req);
    const convScopeChat = { userId: convUserId, projectKey: ppChat.projectKey, projectLabel: convProject };

    /** Default chat model for detected provider; override with MAIN_AI_CHAT_MODEL. */
    let resolvedModel = resolveMainAiChatModel(mainAiProvider);
    const clientChatModel = typeof body.chatModel === "string" ? body.chatModel.trim() : "";
    if (mainAiProvider === "xai" && (clientChatModel === "grok-4" || clientChatModel === "grok-4.1")) {
      resolvedModel = process.env.GROK_CHAT_MODEL_GROK41?.trim() || "grok-4";
    }

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
1) <START_MASTERPLAN> ... </END_MASTERPLAN> with ALL six sections using these exact headings inside the block:
   ### 1. Goal of the app
   ### 2. Tech Research
   ### 3. Features and KPIs
   ### 4. Pages and navigation
   ### 5. UI/UX design
   ### 6. Environment Setup
   Each section must be substantive (not placeholders).
2) <FINISH_MASTERPLAN>
3) <START_CODING>

Optional: include ANSWER_Qn + <GROK_B_SUMMARY_Qn> for tabs as needed. After the tags, no extra user-visible prose.

Hard guard:
- Never copy/paste orchestration policy text from project-execution-rules.md into any Master Plan section.
- Master Plan sections must contain product-specific app content only (goal/research/features/pages/ui/environment), not internal workflow instructions.

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
          "PROJECT_EXECUTION_RULES (workspace copy — authoritative for chat vs build, onboarding one question at a time, TTS brevity):",
          rulesExcerpt,
        ].join("\n")
      : "";
    const modeBlock = buildMode
      ? "BUILD_MODE: ON — user wants implementation. Master Plan only inside <START_MASTERPLAN>…</END_MASTERPLAN>. Code only as ```file:path``` blocks or START_CODING; never paste implementation as ```typescript``` in chat. v0-prompt.md only as ```file:nebula-ui-studio/v0-prompt.md``` (concise); NEVER paste the v0 prompt text in visible chat prose."
      : "CONVERSATION_MODE: ON — short natural prose only; no markdown code fences, v0 prompts, Master Plan bodies, or full file bodies in chat.";
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

    if (mainAiProvider === "anthropic") {
      const claudeResult = await callClaudeChatCompletion(messagesForApi, apiKey, resolvedModel);
      if (claudeResult.ok === false) {
        console.error(`[main-ai/chat] Anthropic error (${claudeResult.status}):`, claudeResult.error);
        return res.status(claudeResult.status >= 400 && claudeResult.status < 600 ? claudeResult.status : 502).json({
          error: claudeResult.error,
          provider: "anthropic",
        });
      }
      const responseText = claudeResult.content;
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
        console.error("Conversation memory append failed (Anthropic):", logErr);
      }
      return res.json({
        choices: [{ message: { content: responseText } }],
        mainAiProvider: "anthropic",
        mainAiModel: resolvedModel,
      });
    }

    if (mainAiProvider === "openai") {
      return res.status(501).json({
        error:
          "OpenAI keys in MAIN_API_KEY_GROK are not wired yet. Use an xAI (xai-…) or Anthropic (sk-ant-…) key, or set CLAUDE_API_KEY for Grok quota fallback.",
        provider: "openai",
      });
    }

    try {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages: messagesForApi,
          stream: false,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`GROK API error (${response.status}):`, errorText.slice(0, 500));
        if (mainAiProvider === "xai" && isGrokQuotaLimitError(response.status, errorText)) {
          if (await respondWithClaudeQuotaFallback(messagesForApi, convScopeChat, res)) {
            return;
          }
        }
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(errorText) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
        const upstreamMsg =
          (typeof parsed.error === "string" && parsed.error) ||
          (typeof parsed.message === "string" && parsed.message) ||
          errorText.slice(0, 400);
        const isAuthKeyError =
          response.status === 401 ||
          /invalid.*api.*key|incorrect.*api.*key|unauthor/i.test(String(upstreamMsg));
        const onRender = process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID?.trim());
        const renderKeyHint = onRender
          ? ` On Render: open your web service → Environment → set MAIN_API_KEY_GROK to a fresh key from https://console.x.ai (no quotes), save, then redeploy.`
          : "";
        const hint = isAuthKeyError ? `${MAIN_AI_KEY_SETUP_HINT}${renderKeyHint}` : undefined;
        return res.status(response.status).json({
          ...parsed,
          error:
            response.status === 401
              ? `Main AI provider rejected this API key (401). ${upstreamMsg}${renderKeyHint}`
              : upstreamMsg,
          provider: mainAiProvider,
          ...(hint ? { hint } : {}),
        });
      }

      const data = await response.json();
      let responseText = data.choices?.[0]?.message?.content || "";
      /** Grok 4 planning text — used for Master Plan + Grok B summaries. */
      const grok4PlanningCapture = responseText;

      // START_CODING: return Grok-4 planning immediately; IDE runs Grok Code via /api/grok/go-code
      // with live activity (avoids blocking this request for minutes with no client feedback).

  // Grok B (writer): run as soon as meaningful summary content appears.
  // ANSWER_Qn still works, but summaries alone are enough to start writing immediately.
  const summarySource = grok4PlanningCapture;
  const answerTabMatches = [...summarySource.matchAll(/\bANSWER_Q([1-6])\b/gi)];
  const answerTabs = [...new Set(answerTabMatches.map((m) => parseInt(m[1], 10)))].sort(
    (a, b) => a - b
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
        `[GROK B] Trigger: ANSWER_Q tabs=${summaryEntries.map((x) => x.tabIndex).join(",")}`
      );
      runGrokB(projectPathsFor(req).masterPlanPath, summaryEntries).catch((err) => {
        console.error("[GROK B] Failed to update Master Plan:", err);
      });
    }
  }

      const cleanText = stripAssistantTagsForMemory(responseText);

      if (cleanText) {
        // Voice chat flow: Audio is now handled via direct /api/speak endpoint to avoid base64 overhead
        console.log("[TTS] Response ready for speech:", cleanText.substring(0, 50) + "...");
      }

      try {
        const lastUser = [...messagesForApi]
          .reverse()
          .find((m) => m.role === "user");
        if (lastUser && typeof lastUser.content === "string" && lastUser.content.length > 0) {
          appendConversationTurn(convScopeChat, "user", lastUser.content);
        }
        if (cleanText) {
          // Persist only user-visible assistant text; never store internal control tags in memory logs.
          appendConversationTurn(convScopeChat, "assistant", cleanText);
        }
      } catch (logErr) {
        console.error("Conversation memory append failed:", logErr);
      }

      // We return the full responseText to the frontend so it can maintain state.
      // The frontend will be responsible for stripping tags for display.
      try {
        const mainTok = xaiUsageTotal(data.usage);
        if (convUserId !== "anonymous" && mainTok > 0) {
          await addTokens(convUserId, mainTok, "grok-4");
        }
      } catch (btErr) {
        console.warn("[billing] addTokens:", btErr);
      }
      res.json(data);
    } catch (error) {
      console.error("Error calling GROK API:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/grok/chat",
      });
      res.status(500).json({ error: "Failed to call GROK API", details: error instanceof Error ? error.message : String(error) });
    }
  });

  const handleSpeak = async (req: express.Request, res: express.Response) => {
    const textFromQuery = typeof req.query.text === "string" ? req.query.text : "";
    const textFromBody = typeof req.body?.text === "string" ? req.body.text : "";
    const text = (textFromBody || textFromQuery || "").trim();
    if (!text) return res.status(400).json({ error: "Text is required" });

    try {
      const audio = await speak(text);
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audio.length.toString(),
        "Cache-Control": "public, max-age=3600",
      });
      res.send(audio);
    } catch (error) {
      console.error("TTS endpoint failed:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/speak",
      });
      res.status(500).json({ error: "TTS failed" });
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

async function speak(text: string): Promise<Buffer> {
  // Use new Grok TTS API key for speech generation.
  const apiKey = process.env.GROK_TTS_NEW_API_KEY;
  
  if (!apiKey) {
    throw new Error("GROK_TTS_NEW_API_KEY is not set. Please check your environment variables.");
  }

  const response = await fetch("https://api.x.ai/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-tts-1",
      input: text,
      voice: "Eve",
      response_format: "mp3",
    }),
  });

  if (response.ok) {
    return Buffer.from(await response.arrayBuffer());
  }

  const primaryError = await response.text();
  console.warn(`[TTS] New endpoint failed (${response.status}). Trying compatibility fallback.`);

  // Compatibility fallback while Grok TTS rollout stabilizes across accounts/regions.
  const fallback = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
      language: "en",
    }),
  });

  if (!fallback.ok) {
    const fallbackError = await fallback.text();
    throw new Error(
      `TTS Error (new=${response.status}, fallback=${fallback.status}) new="${primaryError}" fallback="${fallbackError}"`
    );
  }

  return Buffer.from(await fallback.arrayBuffer());
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