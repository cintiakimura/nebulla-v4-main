/**
 * Persistent conversation memory: one Markdown log per (user, project) under conversation-logs/.
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

export function safePathSegment(s: string, maxLen: number): string {
  const t = s.trim().replace(/[^a-zA-Z0-9._@-]+/g, "_").replace(/_+/g, "_");
  const cut = t.slice(0, maxLen);
  return cut || "default";
}

export function getLogFilePath(userId: string, projectName: string): string {
  const u = safePathSegment(userId, 80);
  const p = safePathSegment(projectName, 100);
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

function renderFile(userId: string, projectLabel: string, entries: LogEntry[]): string {
  const header = `# Nebula conversation memory

| Field | Value |
|:------|:------|
| **User** | ${escapeCell(userId)} |
| **Project** | ${escapeCell(projectLabel)} |
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

/**
 * Load log, prune expired entries, rewrite file if anything dropped.
 */
export function loadPrunedEntries(userId: string, projectName: string): LogEntry[] {
  const fp = getLogFilePath(userId, projectName);
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, "utf8");
  const entries = parseEntries(raw);
  const pruned = filterByRetention(entries);
  if (pruned.length !== entries.length) {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, renderFile(userId, projectName, pruned), "utf8");
  }
  return pruned;
}

/**
 * System message text to inject so the model sees prior turns (bounded by MAX_MEMORY_PROMPT_CHARS).
 */
export function buildMemorySystemContent(userId: string, projectName: string): string {
  let entries = loadPrunedEntries(userId, projectName);
  let text = formatTranscriptForPrompt(entries);
  while (text.length > MAX_MEMORY_PROMPT_CHARS && entries.length > 1) {
    entries = entries.slice(1);
    text = formatTranscriptForPrompt(entries);
  }
  if (!text.trim()) return "";
  const note =
    `[Persisted conversation memory — user "${userId}" / project "${projectName}". ` +
    `Treat this as continuity from past sessions; do not contradict without reason.]\n\n`;
  if (text.length > MAX_MEMORY_PROMPT_CHARS) {
    return note + text.slice(-MAX_MEMORY_PROMPT_CHARS);
  }
  return note + text;
}

export function appendConversationTurn(
  userId: string,
  projectName: string,
  role: "user" | "assistant",
  content: string
): void {
  const fp = getLogFilePath(userId, projectName);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  let entries: LogEntry[] = [];
  if (fs.existsSync(fp)) {
    entries = filterByRetention(parseEntries(fs.readFileSync(fp, "utf8")));
  }
  const iso = new Date().toISOString();
  entries.push({ iso, role, body: content.trim() });
  fs.writeFileSync(fp, renderFile(userId, projectName, entries), "utf8");
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
  projectName: string;
  triggeredQn: number[];
}): void {
  fs.mkdirSync(CONVERSATION_LOGS_ROOT, { recursive: true });
  const event = {
    timestamp: new Date().toISOString(),
    userId: params.userId,
    project: params.projectName,
    triggeredQn: [...new Set(params.triggeredQn)].sort((a, b) => a - b),
  };
  fs.appendFileSync(WRITER_AUDIT_FILE, `${JSON.stringify(event)}\n`, "utf8");
}
