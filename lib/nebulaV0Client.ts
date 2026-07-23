/**
 * v0 Platform API client for Nebula UI Studio (server-side).
 * @see https://v0.app/docs/api/platform/overview
 */

const V0_API_BASE = "https://api.v0.dev/v1";

/** Platform API model ids (@see https://v0.dev/docs/api/platform/chats/create). */
export const V0_PLATFORM_MODEL_IDS = [
  "v0-auto",
  "v0-mini",
  "v0-pro",
  "v0-max",
  "v0-max-fast",
] as const;

export type V0PlatformModelId = (typeof V0_PLATFORM_MODEL_IDS)[number];

const LEGACY_MODEL_MAP: Record<string, V0PlatformModelId> = {
  "v0-1.5-md": "v0-pro",
  "v0-1.5-lg": "v0-max",
  "v0-1.0-md": "v0-mini",
};

/** Resolve model for POST /chats — defaults to v0-pro (not deprecated v0-1.5-md). */
export function resolveV0PlatformModelId(): V0PlatformModelId {
  const raw = process.env.V0_MODEL_ID?.trim();
  if (!raw) return "v0-pro";
  if ((V0_PLATFORM_MODEL_IDS as readonly string[]).includes(raw)) return raw as V0PlatformModelId;
  const mapped = LEGACY_MODEL_MAP[raw];
  if (mapped) return mapped;
  console.warn(`[v0] Invalid V0_MODEL_ID "${raw}" — using v0-pro. Valid: ${V0_PLATFORM_MODEL_IDS.join("|")}`);
  return "v0-pro";
}

export type V0FileEntry = { name: string; content: string };

export type V0ChatResult = {
  chatId: string;
  files: V0FileEntry[];
  demoUrl?: string;
  versionId?: string;
  versionStatus?: "pending" | "completed" | "failed";
  raw: Record<string, unknown>;
};

function normalizeFileName(name: string): string {
  return name.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

function readMetaPath(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const m = meta as Record<string, unknown>;
  for (const key of ["path", "name", "fileName"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function parseFileRow(row: Record<string, unknown>): V0FileEntry | null {
  const meta = row.meta;
  const metadata = row.metadata;
  const metaPath =
    readMetaPath(meta) ??
    (metadata && typeof metadata === "object"
      ? readMetaPath(metadata)
      : undefined);

  const nameRaw =
    row.name ?? row.path ?? row.fileName ?? metaPath;
  const contentRaw = row.content ?? row.text ?? row.code;
  let content = typeof contentRaw === "string" ? contentRaw : "";
  if (!content.trim() && typeof row.source === "string") {
    const src = row.source.trim();
    if (src.length > 0 && !/^[\w./-]+\.(tsx|jsx|ts|js|css|html|json|md)$/i.test(src)) {
      content = src;
    }
  }

  if (typeof nameRaw !== "string" || !content.trim()) return null;
  const name = normalizeFileName(nameRaw.trim());
  if (!name) return null;
  return { name, content };
}

function readDemoUrl(data: Record<string, unknown>): string | undefined {
  const latest = data.latestVersion as Record<string, unknown> | undefined;
  for (const key of ["demoUrl", "demo", "url", "webUrl"]) {
    const v = latest?.[key] ?? data[key];
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  return undefined;
}

function collectFilesFromArray(files: unknown, out: V0FileEntry[], seen: Set<string>): void {
  if (!Array.isArray(files)) return;
  for (const f of files) {
    if (!f || typeof f !== "object") continue;
    const parsed = parseFileRow(f as Record<string, unknown>);
    if (!parsed || seen.has(parsed.name)) continue;
    seen.add(parsed.name);
    out.push(parsed);
  }
}

function extractFilesFromChatPayload(data: Record<string, unknown>): V0FileEntry[] {
  const out: V0FileEntry[] = [];
  const seen = new Set<string>();

  const latest = data.latestVersion as Record<string, unknown> | undefined;
  const version = (latest ?? data.version ?? data) as Record<string, unknown>;

  collectFilesFromArray(version.files, out, seen);
  collectFilesFromArray(data.files, out, seen);

  // Some payloads nest files under data / result
  const nestedData = data.data as Record<string, unknown> | undefined;
  if (nestedData && typeof nestedData === "object") {
    collectFilesFromArray(nestedData.files, out, seen);
    const nestedLatest = nestedData.latestVersion as Record<string, unknown> | undefined;
    if (nestedLatest) collectFilesFromArray(nestedLatest.files, out, seen);
  }

  const messages = data.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (!msg || typeof msg !== "object") continue;
      const row = msg as Record<string, unknown>;
      collectFilesFromArray(row.files, out, seen);
    }
  }

  return out;
}

function readVersionStatus(data: Record<string, unknown>): V0ChatResult["versionStatus"] {
  const latest = data.latestVersion as Record<string, unknown> | undefined;
  const raw = latest?.status ?? data.status;
  if (typeof raw !== "string") return undefined;
  const s = raw.toLowerCase().trim();
  if (s === "failed" || s === "error") return "failed";
  if (s === "completed" || s === "complete" || s === "ready" || s === "success") return "completed";
  if (
    s === "pending" ||
    s === "generating" ||
    s === "streaming" ||
    s === "in_progress" ||
    s === "processing" ||
    s === "running"
  ) {
    return "pending";
  }
  return undefined;
}

function readVersionId(data: Record<string, unknown>): string | undefined {
  const latest = data.latestVersion as Record<string, unknown> | undefined;
  for (const key of ["id", "versionId"]) {
    const v = latest?.[key] ?? data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

async function parseV0Error(res: Response, text: string): Promise<string> {
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof j.message === "string" && j.message) return j.message;
    if (typeof j.error === "string") return j.error;
    if (j.error && typeof j.error === "object" && typeof j.error.message === "string") {
      return j.error.message;
    }
  } catch {
    /* ignore */
  }
  return text.slice(0, 400) || `v0 API HTTP ${res.status}`;
}

export async function v0CreateChat(
  apiKey: string,
  message: string,
  signal?: AbortSignal,
): Promise<{ ok: true; result: V0ChatResult } | { ok: false; status: number; error: string }> {
  const modelId = resolveV0PlatformModelId();
  const res = await fetch(`${V0_API_BASE}/chats`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      message,
      modelConfiguration: { modelId, imageGenerations: false },
    }),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: await parseV0Error(res, text) };
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 502, error: "v0 returned invalid JSON" };
  }
  const chatId = typeof data.id === "string" ? data.id : "";
  if (!chatId) {
    return { ok: false, status: 502, error: "v0 response missing chat id" };
  }
  const latest = data.latestVersion as Record<string, unknown> | undefined;
  const demoUrl = readDemoUrl(data);
  const files = extractFilesFromChatPayload(data);
  return {
    ok: true,
    result: {
      chatId,
      files,
      demoUrl,
      versionId: readVersionId(data),
      versionStatus: readVersionStatus(data),
      raw: data,
    },
  };
}

export async function v0GetChat(
  apiKey: string,
  chatId: string
): Promise<{ ok: true; result: V0ChatResult } | { ok: false; status: number; error: string }> {
  const res = await fetch(`${V0_API_BASE}/chats/${encodeURIComponent(chatId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: await parseV0Error(res, text) };
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 502, error: "v0 returned invalid JSON" };
  }
  const id = typeof data.id === "string" ? data.id : chatId;
  const demoUrl = readDemoUrl(data);
  const files = extractFilesFromChatPayload(data);
  return {
    ok: true,
    result: {
      chatId: id,
      files,
      demoUrl,
      versionId: readVersionId(data),
      versionStatus: readVersionStatus(data),
      raw: data,
    },
  };
}

/** GET /chats/{chatId}/versions/{versionId} — often has files when chat.latestVersion.files is empty. */
export async function v0GetVersionFiles(
  apiKey: string,
  chatId: string,
  versionId: string,
): Promise<V0FileEntry[]> {
  const res = await fetch(
    `${V0_API_BASE}/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}`,
    { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) return [];
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(await res.text()) as Record<string, unknown>;
  } catch {
    return [];
  }
  const direct = extractFilesFromChatPayload(data);
  if (direct.length > 0) return direct;
  return extractFilesFromChatPayload({ latestVersion: data });
}

/** List recent versions — fallback when latestVersion.files is empty. */
export async function v0FindChatVersionFiles(
  apiKey: string,
  chatId: string
): Promise<V0FileEntry[]> {
  const res = await fetch(
    `${V0_API_BASE}/chats/${encodeURIComponent(chatId)}/versions?limit=5`,
    { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) return [];
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(await res.text()) as Record<string, unknown>;
  } catch {
    return [];
  }
  const rows = (payload.data ?? payload.versions ?? payload) as unknown;
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const files = extractFilesFromChatPayload(rec);
    if (files.length > 0) return files;
    const vid = typeof rec.id === "string" ? rec.id.trim() : "";
    if (vid) {
      const byId = await v0GetVersionFiles(apiKey, chatId, vid);
      if (byId.length > 0) return byId;
    }
  }
  return [];
}

/**
 * Resolve files aggressively: chat payload → version by id → versions list.
 * Call whenever inline files are empty (not only when status === completed).
 */
export async function v0ResolveChatFiles(
  apiKey: string,
  chatId: string,
  hint?: { versionId?: string; files?: V0FileEntry[] },
): Promise<{ files: V0FileEntry[]; demoUrl?: string; versionStatus?: V0ChatResult["versionStatus"]; versionId?: string }> {
  const got = hint?.files?.length
    ? null
    : await v0GetChat(apiKey, chatId);
  if (got && got.ok === false) {
    return { files: [] };
  }
  let files = hint?.files?.length ? hint.files : got?.ok ? got.result.files : [];
  let demoUrl = got?.ok ? got.result.demoUrl : undefined;
  let versionStatus = got?.ok ? got.result.versionStatus : undefined;
  let versionId = hint?.versionId || (got?.ok ? got.result.versionId : undefined);

  if (files.length === 0 && versionId) {
    files = await v0GetVersionFiles(apiKey, chatId, versionId);
  }
  if (files.length === 0) {
    files = await v0FindChatVersionFiles(apiKey, chatId);
  }
  return { files, demoUrl, versionStatus, versionId };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type V0WaitResult =
  | { ok: true; files: V0FileEntry[]; demoUrl?: string }
  | { ok: false; error: string };

/** Poll until v0 marks the version completed/failed, then return files. */
export async function v0WaitForChatGeneration(
  apiKey: string,
  chatId: string,
  opts?: { maxAttempts?: number; intervalMs?: number }
): Promise<V0WaitResult> {
  const maxAttempts = opts?.maxAttempts ?? 120;
  const intervalMs = opts?.intervalMs ?? 2500;

  for (let i = 0; i < maxAttempts; i++) {
    const resolved = await v0ResolveChatFiles(apiKey, chatId);
    const status = resolved.versionStatus;
    const files = resolved.files;

    if (status === "failed" && files.length === 0) {
      return { ok: false, error: "v0 generation failed on the v0 side. Open v0.dev and retry with a shorter prompt." };
    }

    if (files.length > 0) {
      return { ok: true, files, demoUrl: resolved.demoUrl };
    }

    if (status === "completed") {
      return {
        ok: false,
        error:
          "v0 finished but returned no files. Check nebula-ui-studio/v0-prompt.md or regenerate on v0.dev.",
      };
    }

    if (i < maxAttempts - 1) await sleep(intervalMs);
  }

  return {
    ok: false,
    error:
      "v0 is still generating after 30 minutes. Use Resume v0 in UI Studio — do not click Generate again (same chat, no new charge).",
  };
}

/** @deprecated Use v0WaitForChatGeneration */
export async function v0WaitForChatFiles(
  apiKey: string,
  chatId: string,
  opts?: { maxAttempts?: number; intervalMs?: number }
): Promise<V0FileEntry[]> {
  const wait = await v0WaitForChatGeneration(apiKey, chatId, opts);
  return wait.ok ? wait.files : [];
}

export async function v0SendChatMessage(
  apiKey: string,
  chatId: string,
  message: string
): Promise<{ ok: true; result: V0ChatResult } | { ok: false; status: number; error: string }> {
  const res = await fetch(`${V0_API_BASE}/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ message }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: await parseV0Error(res, text) };
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 502, error: "v0 returned invalid JSON" };
  }
  let files = extractFilesFromChatPayload(data);
  if (files.length === 0) files = extractFilesFromChatPayload({ latestVersion: data });
  const latest = data.latestVersion as Record<string, unknown> | undefined;
  const demoUrl = typeof latest?.demoUrl === "string" ? latest.demoUrl : undefined;
  return {
    ok: true,
    result: {
      chatId,
      files,
      demoUrl,
      versionStatus: readVersionStatus(data),
      raw: data,
    },
  };
}

/** Normalize bare filenames (e.g. page.tsx) into allowed workspace paths. */
export function normalizeV0WriteRel(rel: string): string {
  const n = normalizeFileName(rel);
  if (!n || n.includes("..")) return n;
  if (isAllowedV0WriteRel(n)) return n;
  if (/\.(tsx|jsx|ts|js|css|html|json)$/i.test(n) && !n.includes("/")) return `src/${n}`;
  if (n.startsWith("lib/")) return `src/${n}`;
  if (n.startsWith("hooks/")) return `src/${n}`;
  if (n.startsWith("styles/")) return `src/${n}`;
  if (n === "index.html") return "public/index.html";
  return n;
}

/** Allowed workspace-relative prefixes for v0 output (aligned with visual editor apply). */
export function isAllowedV0WriteRel(rel: string): boolean {
  const n = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n || n.includes("..")) return false;
  const prefixes = ["src/", "app/", "pages/", "components/", "public/"];
  return prefixes.some((p) => n.startsWith(p));
}

export function pickPrimaryUiFile(files: V0FileEntry[]): string {
  const priority = [/page\.tsx$/i, /page\.jsx$/i, /App\.tsx$/i, /layout\.tsx$/i];
  for (const re of priority) {
    const hit = files.find((f) => re.test(f.name));
    if (hit) return hit.content;
  }
  const first = files.find((f) => /\.(tsx|jsx|ts|js|html)$/i.test(f.name));
  return first?.content ?? files.map((f) => `// ${f.name}\n${f.content}`).join("\n\n").slice(0, 120000);
}
