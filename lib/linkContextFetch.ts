/**
 * Server-side URL fetch → nebula-project/linked-context.md for chat/plan only.
 * Does not enable built-in browse tools. Go must not call live fetch.
 */

import fs from "fs";
import path from "path";

export const LINKED_CONTEXT_REL = "nebula-project/linked-context.md";
export const LINK_FETCH_TIMEOUT_MS = 10_000;
export const LINK_FETCH_MAX_BYTES = 500_000;
export const LINKED_CONTEXT_MAX_CHARS = 60_000;
export const LINK_FETCH_MAX_URLS = 3;
export const LINK_CONTEXT_LOAD_FAIL =
  "Could not load linked page — continuing without it.";

const DEFAULT_ALLOW_HOSTS = [
  "github.com",
  "www.github.com",
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
  "gist.github.com",
];

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|svg|bmp|pdf|zip|gz|tgz|tar|rar|7z|woff2?|ttf|eot|mp[34]|wav|mov|mp4|avi|exe|dmg|wasm)(\?|#|$)/i;

const DOCS_HINT =
  /\/(docs|blob|raw|readme)(\/|$)|[.]md(\?|#|$)|notion|github|readme/i;

export type LinkFetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export function linkedContextPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, LINKED_CONTEXT_REL);
}

export function readLinkedContext(workspaceRoot: string): string {
  const p = linkedContextPath(workspaceRoot);
  if (!fs.existsSync(p)) return "";
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

export function writeLinkedContext(workspaceRoot: string, content: string): string {
  const p = linkedContextPath(workspaceRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return LINKED_CONTEXT_REL;
}

export function extractHttpUrls(text: string): string[] {
  const src = String(text || "");
  const found: string[] = [];
  const seen = new Set<string>();
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let raw = m[0].replace(/[),.;:!?]+$/g, "");
    if (!raw) continue;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (/^(data|javascript|file|blob):/i.test(raw)) continue;
    const key = parsed.href;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(parsed.href);
    if (found.length >= 12) break;
  }
  return found;
}

export function looksLikeDocsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return DOCS_HINT.test(`${u.hostname}${u.pathname}`);
  } catch {
    return false;
  }
}

/** Prefer 1–2 docs-like links; otherwise first URL only. Cap 1–3. */
export function selectUrlsToFetch(urls: string[]): string[] {
  const unique = [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const docs = unique.filter(looksLikeDocsUrl);
  if (docs.length > 0) return docs.slice(0, 2);
  return unique.slice(0, 1);
}

export function rewriteGithubBlobUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return url;
    const parts = u.pathname.split("/").filter(Boolean);
    // /owner/repo/blob/ref/path
    if (parts.length >= 5 && parts[2] === "blob") {
      const owner = parts[0];
      const repo = parts[1];
      const ref = parts[3];
      const rest = parts.slice(4).join("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest}`;
    }
  } catch {
    /* keep original */
  }
  return url;
}

function extraAllowHosts(): string[] {
  return String(process.env.NEBULLA_LINK_FETCH_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

export function allowedLinkHosts(): string[] {
  return [...DEFAULT_ALLOW_HOSTS, ...extraAllowHosts()];
}

export function hostMatchesAllowlist(hostname: string, allow = allowedLinkHosts()): boolean {
  const h = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!h) return false;
  return allow.some((a) => h === a || h.endsWith(`.${a}`));
}

export function isBlockedHostname(hostname: string): boolean {
  const h = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

export function isBlockedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    if (BINARY_EXT.test(u.pathname)) return true;
    if (isBlockedHostname(u.hostname)) return true;
    return false;
  } catch {
    return true;
  }
}

export function stripHtmlToText(html: string): string {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

export function extractReadableText(body: string, contentType: string): string {
  const ct = String(contentType || "").toLowerCase();
  const raw = String(body || "");
  if (ct.includes("application/json") || ct.includes("+json")) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  if (ct.includes("text/html") || ct.includes("application/xhtml")) {
    return stripHtmlToText(raw);
  }
  return raw;
}

export function truncateLinkedText(text: string, maxChars = LINKED_CONTEXT_MAX_CHARS): string {
  const t = String(text || "");
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n… [linked context truncated]`;
}

export function formatLinkedContextSection(url: string, text: string, fetchedAt?: string): string {
  const when = fetchedAt || new Date().toISOString();
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  return [
    `## ${url}`,
    `fetched_at: ${when}`,
    host ? `host: ${host}` : "",
    "",
    truncateLinkedText(text),
    "",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

export function mergeLinkedContextFile(existing: string, sections: string[]): string {
  let body = String(existing || "").trim();
  if (!body.startsWith("# Linked document context")) {
    body = "";
  }
  for (const section of sections) {
    const heading = section.match(/^##\s+(\S+)/)?.[1];
    if (heading && body) {
      const re = new RegExp(
        `^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=^##\\s+|\\s*$)`,
        "m",
      );
      body = body.replace(re, "").trim();
    }
    body = [body, section].filter(Boolean).join("\n\n").trim();
  }
  const out = ["# Linked document context", "", body].join("\n").trim() + "\n";
  return truncateLinkedText(out, LINKED_CONTEXT_MAX_CHARS);
}

export function buildLinkedContextAppendix(md: string, maxChars = LINKED_CONTEXT_MAX_CHARS): string {
  const body = String(md || "").trim();
  if (!body) return "";
  return [
    "LINKED DOCUMENT CONTEXT (from user URL — treat as reference, not user identity)",
    truncateLinkedText(body, maxChars),
  ].join("\n\n");
}

function contentTypeAllowed(ct: string): boolean {
  const t = String(ct || "").toLowerCase();
  if (!t) return true;
  return (
    t.includes("text/html") ||
    t.includes("text/plain") ||
    t.includes("text/markdown") ||
    t.includes("application/json") ||
    t.includes("application/xhtml") ||
    t.startsWith("text/")
  );
}

export async function fetchLinkedPage(
  url: string,
  fetchImpl: LinkFetchImpl = fetch,
): Promise<{ ok: true; text: string; url: string } | { ok: false; error: string }> {
  if (isBlockedUrl(url)) {
    return { ok: false, error: "blocked url" };
  }
  let target = rewriteGithubBlobUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (isBlockedUrl(target) || !hostMatchesAllowlist(parsed.hostname)) {
    return { ok: false, error: "host not allowed" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(target, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html, text/plain, text/markdown, application/json;q=0.9, */*;q=0.1",
        "User-Agent": "NebullaLinkContext/1.0 (+https://nebulla.dev)",
      },
    });
    const finalUrl = String(res.url || target);
    try {
      const finalParsed = new URL(finalUrl);
      if (isBlockedUrl(finalUrl) || !hostMatchesAllowlist(finalParsed.hostname)) {
        return { ok: false, error: "redirect host not allowed" };
      }
    } catch {
      return { ok: false, error: "invalid redirect url" };
    }
    if (!res.ok) {
      return { ok: false, error: `http ${res.status}` };
    }
    const ct = res.headers.get("content-type") || "";
    if (!contentTypeAllowed(ct)) {
      return { ok: false, error: "unsupported content-type" };
    }
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > LINK_FETCH_MAX_BYTES) {
      return { ok: false, error: "body too large" };
    }
    const raw = await res.text();
    if (Buffer.byteLength(raw, "utf8") > LINK_FETCH_MAX_BYTES) {
      return { ok: false, error: "body too large" };
    }
    const text = extractReadableText(raw, ct);
    if (!text.trim()) {
      return { ok: false, error: "empty extract" };
    }
    return { ok: true, text: truncateLinkedText(text), url: finalUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort/i.test(msg) ? "timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}

export function lastUserMessageContent(
  messages: Array<{ role?: string; content?: string }> | undefined,
): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string" && m.content.trim()) {
      return m.content;
    }
  }
  return "";
}

function userTextHasWrittenGoal(userText: string): boolean {
  const raw = String(userText || "");
  const tagged = raw.match(/User goal \/ brief:\s*"""([\s\S]*?)"""/i)?.[1];
  const inner = (tagged || raw).replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
  if (inner.length < 24) return false;
  if (!/[a-zA-Z]{3,}/.test(inner)) return false;
  if (/^FAST PROTOTYPE (MODE|CONTINUE)\./i.test(inner) && inner.length < 80) return false;
  return true;
}

/** Honest miss — never imply the product goal was lost when the prompt already states it. */
export function formatLinkedContextMissStatus(userText: string, failReasons: string[]): string {
  const hasGoal = userTextHasWrittenGoal(userText);
  const reasons = [...new Set(failReasons.map((r) => String(r || "").trim()).filter(Boolean))];
  const hostDenied = reasons.some((r) => /host not allowed/i.test(r));
  if (hasGoal) {
    if (hostDenied) {
      return "Linked page skipped (not on GitHub allowlist). Using your written goal — the URL is optional.";
    }
    return "Could not load linked page. Using your written goal — continuing.";
  }
  if (hostDenied) {
    return "Could not load linked page (host not on allowlist). Paste the spec in the prompt, or use a github.com / raw.githubusercontent.com URL.";
  }
  return LINK_CONTEXT_LOAD_FAIL;
}

export async function captureLinkedContextFromUserMessage(opts: {
  workspaceRoot: string;
  userText: string;
  fetchImpl?: LinkFetchImpl;
}): Promise<{
  wrote: boolean;
  skipped: boolean;
  status: string;
  urls: string[];
  failReasons?: string[];
}> {
  const selected = selectUrlsToFetch(extractHttpUrls(opts.userText)).slice(0, LINK_FETCH_MAX_URLS);
  if (selected.length === 0) {
    return { wrote: false, skipped: true, status: "", urls: [] };
  }

  const sections: string[] = [];
  const hosts: string[] = [];
  const failReasons: string[] = [];
  for (const url of selected) {
    const got = await fetchLinkedPage(url, opts.fetchImpl);
    if (!got.ok) {
      failReasons.push(got.error);
      continue;
    }
    sections.push(formatLinkedContextSection(url, got.text));
    try {
      hosts.push(new URL(got.url || url).hostname);
    } catch {
      /* ignore */
    }
  }

  if (sections.length === 0) {
    return {
      wrote: false,
      skipped: false,
      status: formatLinkedContextMissStatus(opts.userText, failReasons),
      urls: selected,
      failReasons,
    };
  }

  const merged = mergeLinkedContextFile(readLinkedContext(opts.workspaceRoot), sections);
  writeLinkedContext(opts.workspaceRoot, merged);
  const host = hosts[0] || "link";
  return {
    wrote: true,
    skipped: false,
    status: `Loaded context from ${host}…`,
    urls: selected,
  };
}
