/**
 * v0 Platform API client for Nebula UI Studio (server-side).
 * @see https://v0.app/docs/api/platform/overview
 */

const V0_API_BASE = "https://api.v0.dev/v1";

export type V0FileEntry = { name: string; content: string };

export type V0ChatResult = {
  chatId: string;
  files: V0FileEntry[];
  demoUrl?: string;
  raw: Record<string, unknown>;
};

function normalizeFileName(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/, "");
}

function extractFilesFromChatPayload(data: Record<string, unknown>): V0FileEntry[] {
  const out: V0FileEntry[] = [];
  const seen = new Set<string>();

  const pushFile = (name: unknown, content: unknown) => {
    if (typeof name !== "string" || typeof content !== "string") return;
    const n = normalizeFileName(name.trim());
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push({ name: n, content });
  };

  const latest = data.latestVersion as Record<string, unknown> | undefined;
  const version = (latest ?? data.version ?? data) as Record<string, unknown>;
  const files = version.files;
  if (Array.isArray(files)) {
    for (const f of files) {
      if (!f || typeof f !== "object") continue;
      const row = f as Record<string, unknown>;
      pushFile(row.name ?? row.path ?? row.fileName, row.content ?? row.source);
    }
  }

  return out;
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
  message: string
): Promise<{ ok: true; result: V0ChatResult } | { ok: false; status: number; error: string }> {
  const res = await fetch(`${V0_API_BASE}/chats`, {
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
  const chatId = typeof data.id === "string" ? data.id : "";
  if (!chatId) {
    return { ok: false, status: 502, error: "v0 response missing chat id" };
  }
  const latest = data.latestVersion as Record<string, unknown> | undefined;
  const demoUrl = typeof latest?.demoUrl === "string" ? latest.demoUrl : undefined;
  const files = extractFilesFromChatPayload(data);
  return { ok: true, result: { chatId, files, demoUrl, raw: data } };
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
  const latest = data.latestVersion as Record<string, unknown> | undefined;
  const demoUrl = typeof latest?.demoUrl === "string" ? latest.demoUrl : undefined;
  const files = extractFilesFromChatPayload(data);
  return { ok: true, result: { chatId: id, files, demoUrl, raw: data } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** v0 sometimes returns chat id before files are ready — poll until files appear. */
export async function v0WaitForChatFiles(
  apiKey: string,
  chatId: string,
  opts?: { maxAttempts?: number; intervalMs?: number }
): Promise<V0FileEntry[]> {
  const maxAttempts = opts?.maxAttempts ?? 45;
  const intervalMs = opts?.intervalMs ?? 2000;
  for (let i = 0; i < maxAttempts; i++) {
    const got = await v0GetChat(apiKey, chatId);
    if (got.ok && got.result.files.length > 0) return got.result.files;
    if (i < maxAttempts - 1) await sleep(intervalMs);
  }
  return [];
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
  const files = extractFilesFromChatPayload(data);
  const latest = data.latestVersion as Record<string, unknown> | undefined;
  const demoUrl = typeof latest?.demoUrl === "string" ? latest.demoUrl : undefined;
  return {
    ok: true,
    result: {
      chatId,
      files: files.length > 0 ? files : extractFilesFromChatPayload({ latestVersion: data }),
      demoUrl,
      raw: data,
    },
  };
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
