/**
 * Persistent conversation memory (official store for chat history per project).
 * One Markdown log per (userId, projectKey) under conversation-logs/.
 * `projectLabel` is stored in the file header for humans only; the path uses `projectKey`.
 * Entries older than RETENTION_MS are removed on read/write.
 */

import fs from "fs";
import path from "path";
import { getNebullaPersistRoot } from "./lib/nebulaWorkspaceRoot";

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_MEMORY_PROMPT_CHARS = 100_000;
export const CONVERSATION_LOGS_ROOT = path.join(getNebullaPersistRoot(), "conversation-logs");
const WRITER_AUDIT_FILE = path.join(CONVERSATION_LOGS_ROOT, "writer-audit.jsonl");

export type LogRole = "user" | "assistant" | "system";

export interface LogEntry {
  iso: string;
  role: LogRole;
  body: string;
}

/** Scope for all read/write operations — aligns with cloud workspace `projectKey`. */
export type ConversationLogScope = {
  userId: string;
  /** Guest UUID, `default`, or cloud workspace id (same as `projectPathsFor(req).projectKey`). */
  projectKey: string;
  /** Display name for the Markdown header only. */
  projectLabel: string;
};

export function safePathSegment(s: string, maxLen: number): string {
  const t = s.trim().replace(/[^a-zA-Z0-9._@-]+/g, "_").replace(/_+/g, "_");
  const cut = t.slice(0, maxLen);
  return cut || "default";
}

export function getConversationLogPath(scope: ConversationLogScope): string {
  const u = safePathSegment(scope.userId, 80);
  const k = safePathSegment(scope.projectKey, 120);
  return path.join(CONVERSATION_LOGS_ROOT, u, `${k}.md`);
}

/** Legacy layout (pre projectKey): file named from project display name only. */
function getLegacyConversationLogPath(userId: string, projectLabel: string): string {
  const u = safePathSegment(userId, 80);
  const p = safePathSegment(projectLabel, 100);
  return path.join(CONVERSATION_LOGS_ROOT, u, `${p}.md`);
}

function retentionCutoff(): number {
  return Date.now() - RETENTION_MS;
}

function parseEntries(markdown: string): LogEntry[] {
  const marker = "## Transcript";
  const idx = markdown.indexOf(marker);
  let section = idx >= 0 ? markdown.slice(idx + marker.length).trim() : markdown.trim();
  if (!section) return [];

  const parts = section.split(/\n(?=### )/);
  const out: LogEntry[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith("###")) continue;
    const sep = trimmed.indexOf("\n\n");
    if (sep === -1) continue;
    const head = trimmed.slice(0, sep);
    const body = trimmed.slice(sep + 2).trim();
    const hm = /^### (.+?) • (user|assistant|system)\s*$/.exec(head);
    if (!hm) continue;
    out.push({ iso: hm[1].trim(), role: hm[2] as LogRole, body });
  }
  return out;
}

function filterByRetention(entries: LogEntry[]): LogEntry[] {
  const cut = retentionCutoff();
  return entries.filter((e) => {
    const t = Date.parse(e.iso);
    return !Number.isNaN(t) && t >= cut;
  });
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderFile(scope: ConversationLogScope, entries: LogEntry[]): string {
  const header = `# Nebula conversation memory

| Field | Value |
|:------|:------|
| **User** | ${escapeCell(scope.userId)} |
| **Project key** | ${escapeCell(scope.projectKey)} |
| **Project** | ${escapeCell(scope.projectLabel)} |
| **Retention** | 30 days (older entries removed on save) |

---

## Transcript

`;
  const blocks = entries.map((e) => `### ${e.iso} • ${e.role}\n\n${e.body}\n`);
  return header + blocks.join("\n");
}

function formatTranscriptForPrompt(entries: LogEntry[]): string {
  if (entries.length === 0) return "";
  return entries.map((e) => `### ${e.iso} · ${e.role}\n${e.body}`).join("\n\n---\n\n");
}

function readAndPruneFile(filePath: string, scope: ConversationLogScope): LogEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const entries = parseEntries(raw);
  const pruned = filterByRetention(entries);
  if (pruned.length !== entries.length) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, renderFile(scope, pruned), "utf8");
  }
  return pruned;
}

/**
 * Load log for scope, prune expired entries, migrate legacy name-based file once if present.
 */
export function loadPrunedEntries(scope: ConversationLogScope): LogEntry[] {
  const primary = getConversationLogPath(scope);
  if (fs.existsSync(primary)) {
    return readAndPruneFile(primary, scope);
  }
  const leg = getLegacyConversationLogPath(scope.userId, scope.projectLabel);
  if (fs.existsSync(leg)) {
    const raw = fs.readFileSync(leg, "utf8");
    let entries = filterByRetention(parseEntries(raw));
    fs.mkdirSync(path.dirname(primary), { recursive: true });
    fs.writeFileSync(primary, renderFile(scope, entries), "utf8");
    try {
      fs.unlinkSync(leg);
    } catch {
      /* ignore */
    }
    return entries;
  }
  return [];
}

/**
 * System message text to inject so the model sees prior turns (bounded by MAX_MEMORY_PROMPT_CHARS).
 */
export function buildMemorySystemContent(scope: ConversationLogScope): string {
  let entries = loadPrunedEntries(scope);
  let text = formatTranscriptForPrompt(entries);
  while (text.length > MAX_MEMORY_PROMPT_CHARS && entries.length > 1) {
    entries = entries.slice(1);
    text = formatTranscriptForPrompt(entries);
  }
  if (!text.trim()) return "";
  const note =
    `[Persisted conversation memory — user "${scope.userId}" / project key "${scope.projectKey}" (${scope.projectLabel}). ` +
    `Treat this as continuity from past sessions; do not contradict without reason.]\n\n`;
  if (text.length > MAX_MEMORY_PROMPT_CHARS) {
    return note + text.slice(-MAX_MEMORY_PROMPT_CHARS);
  }
  return note + text;
}

export function appendConversationTurn(
  scope: ConversationLogScope,
  role: "user" | "assistant",
  content: string
): void {
  const fp = getConversationLogPath(scope);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  let entries: LogEntry[] = [];
  if (fs.existsSync(fp)) {
    entries = filterByRetention(parseEntries(fs.readFileSync(fp, "utf8")));
  } else {
    const leg = getLegacyConversationLogPath(scope.userId, scope.projectLabel);
    if (fs.existsSync(leg)) {
      entries = filterByRetention(parseEntries(fs.readFileSync(leg, "utf8")));
    }
  }
  const iso = new Date().toISOString();
  entries.push({ iso, role, body: content.trim() });
  fs.writeFileSync(fp, renderFile(scope, entries), "utf8");
}

export function injectMemoryIntoMessages(
  messages: { role: string; content?: string }[],
  memoryContent: string
): { role: string; content?: string }[] {
  if (!memoryContent.trim()) return messages;
  const memoryMessage = { role: "system", content: memoryContent };
  const m = [...messages];
  const firstSystem = m.findIndex((x) => x.role === "system");
  if (firstSystem === 0) {
    return [m[0], memoryMessage, ...m.slice(1)];
  }
  if (firstSystem > 0) {
    return [...m.slice(0, firstSystem + 1), memoryMessage, ...m.slice(firstSystem + 1)];
  }
  return [memoryMessage, ...m];
}

export function appendWriterAuditEvent(params: {
  userId: string;
  projectKey: string;
  projectName: string;
  triggeredQn: number[];
}): void {
  fs.mkdirSync(CONVERSATION_LOGS_ROOT, { recursive: true });
  const event = {
    timestamp: new Date().toISOString(),
    userId: params.userId,
    projectKey: params.projectKey,
    project: params.projectName,
    triggeredQn: [...new Set(params.triggeredQn)].sort((a, b) => a - b),
  };
  fs.appendFileSync(WRITER_AUDIT_FILE, `${JSON.stringify(event)}\n`, "utf8");
}
