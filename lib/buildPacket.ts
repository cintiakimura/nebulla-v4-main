/**
 * Talk → Build handoff packet. Build reads this file, not the raw chat transcript.
 */
import fs from "fs";
import path from "path";
import { stripTalkCloseQuestion } from "./fullBuildContract";

export const BUILD_PACKET_REL = "nebula-project/build-packet.md";

export type BuildPacketFields = {
  wrapText: string;
  goalSection: string;
  pagesSection: string;
  explicitOuts: string;
  sliceName: string;
};

export function extractWrapFromAssistant(text: string): string {
  return stripTalkCloseQuestion(String(text || "")).replace(/\s+/g, " ").trim().slice(0, 4000);
}

/** Outs spoken in wrap / Talk — generic markers only (no demo-app product rules). */
export function extractExplicitOuts(text: string): string {
  const raw = String(text || "");
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) =>
      /\b(out of scope|not in v1|won'?t |will not |explicit out|no public |closed group|must not)\b/i.test(l),
    );
  if (lines.length) return lines.join("\n").slice(0, 1200);
  const blob = raw.replace(/\s+/g, " ").trim();
  const m = blob.match(
    /(?:out of scope|not in v1|won'?t include|will not include|must not)[:\s]+([^.]{8,200})/i,
  );
  return m ? m[0].slice(0, 400) : "(none named in wrap)";
}

export function formatBuildPacketMarkdown(fields: BuildPacketFields): string {
  const wrap = String(fields.wrapText || "").trim() || "(missing wrap)";
  const goal = String(fields.goalSection || "").trim() || "(missing §1)";
  const pages = String(fields.pagesSection || "").trim() || "(missing §4)";
  const outs = String(fields.explicitOuts || "").trim() || "(none named in wrap)";
  const slice = String(fields.sliceName || "Foundation").trim() || "Foundation";
  return [
    "# Build packet",
    "",
    "Implement only this packet. Do not add /dashboard /settings /NFT /vendor unless the packet names them.",
    "No user-facing questions. No “what do you think?”. File blocks only.",
    "",
    "## Approved wrap (verbatim)",
    wrap,
    "",
    "## Master Plan §1 Goal (from wrap / Talk — not the first seed box)",
    goal,
    "",
    "## §4 Pages / routes named in Talk",
    pages,
    "",
    "## Explicit outs from Talk",
    outs,
    "",
    "## Current slice",
    slice,
    "",
  ].join("\n");
}

export function buildPacketIsStructuredHandoff(md: string): boolean {
  const t = String(md || "");
  if (!t.trim()) return false;
  if (/continue the conversation/i.test(t)) return false;
  return (
    /Approved wrap/i.test(t) &&
    /§1 Goal/i.test(t) &&
    /Implement only this packet/i.test(t)
  );
}

export function formatGoBuildUserPrompt(packet: string, fileList: string): string {
  return [String(packet || "").trim(), "", String(fileList || "").trim()].filter(Boolean).join("\n");
}

export function persistBuildPacket(workspaceRoot: string, markdown: string): string {
  const rel = BUILD_PACKET_REL;
  const abs = path.join(workspaceRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, markdown, "utf8");
  return rel;
}

export function readBuildPacket(workspaceRoot: string): string {
  const abs = path.join(workspaceRoot, BUILD_PACKET_REL);
  try {
    if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
  } catch {
    /* missing */
  }
  return "";
}

export function persistBuildPacketFromPlan(
  workspaceRoot: string,
  plan: Record<string, unknown>,
  wrapText: string,
  sliceName = "Foundation",
): string {
  const md = formatBuildPacketMarkdown({
    wrapText: extractWrapFromAssistant(wrapText),
    goalSection: extractWrapFromAssistant(wrapText) || String(plan["1. Goal of the app"] || "").trim(),
    pagesSection: String(plan["4. Pages and navigation"] || "").trim(),
    explicitOuts: extractExplicitOuts(wrapText),
    sliceName,
  });
  return persistBuildPacket(workspaceRoot, md);
}
