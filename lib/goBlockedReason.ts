/**
 * Stable Go / Foundation blockedReason codes.
 * Chat and poll must show these — never as App Preview “something broke.”
 */

export const GO_BLOCKED_CODES = [
  "RESEARCH_INCOMPLETE",
  "UI_BRIEF_MISSING",
  "MASTER_PLAN_INCOMPLETE",
  "GO_MODEL_REJECTED",
  "GO_TIMEOUT",
  "GO_EMPTY_OUTPUT",
  "APPLY_EMPTY_PRODUCT",
  "KEY_AUTH",
  "GO_FAILED",
] as const;

export type GoBlockedCode = (typeof GO_BLOCKED_CODES)[number];

export type GoBlockedReason = {
  code: GoBlockedCode;
  message: string;
};

export const GO_BLOCKED_MESSAGES: Record<GoBlockedCode, string> = {
  RESEARCH_INCOMPLETE: "Stopped: research not complete — Foundation will not start.",
  UI_BRIEF_MISSING:
    "Stopped: ui-brief.md missing, too short, or has no pages. Finish Master Plan §§1–5, then Generate UI.",
  MASTER_PLAN_INCOMPLETE: "Stopped: Master Plan is too thin for Foundation. Finish §§1–5, then try Go again.",
  GO_MODEL_REJECTED: "Stopped: coding model rejected the request (invalid parameters). Retry Go — Foundation did not start.",
  GO_TIMEOUT: "Stopped: Grok Code timed out after 3 minutes. Try Go again with a narrower slice.",
  GO_EMPTY_OUTPUT: "Stopped: Grok Code returned no file output. Try Go again.",
  APPLY_EMPTY_PRODUCT:
    "Stopped: Foundation wrote no product routes (app/ or pages/). Not a product shell — retry Go.",
  KEY_AUTH: "Stopped: Main AI API key is missing or rejected. Set the key on the server and retry.",
  GO_FAILED: "Stopped: Foundation coding failed. See the message in chat — this is not a preview crash.",
};

const KNOWN = new Set<string>(GO_BLOCKED_CODES);

export function isGoBlockedCode(raw: unknown): raw is GoBlockedCode {
  return typeof raw === "string" && KNOWN.has(raw);
}

export function goBlocked(code: GoBlockedCode, message?: string): GoBlockedReason {
  const msg = String(message || "").trim();
  return { code, message: msg || GO_BLOCKED_MESSAGES[code] };
}

/** Parse xAI / kick error bodies (JSON or plain). */
export function extractGoFailureText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return "";
    try {
      return extractGoFailureText(JSON.parse(t));
    } catch {
      return t.slice(0, 800);
    }
  }
  if (typeof raw !== "object") return String(raw).slice(0, 800);
  const rec = raw as Record<string, unknown>;
  if (typeof rec.error === "string" && rec.error.trim()) return rec.error.trim().slice(0, 800);
  if (rec.error && typeof rec.error === "object") {
    const inner = rec.error as Record<string, unknown>;
    if (typeof inner.message === "string" && inner.message.trim()) {
      return inner.message.trim().slice(0, 800);
    }
  }
  if (typeof rec.message === "string" && rec.message.trim()) return rec.message.trim().slice(0, 800);
  if (typeof rec.codeError === "string" && rec.codeError.trim()) {
    return extractGoFailureText(rec.codeError);
  }
  try {
    return JSON.stringify(rec).slice(0, 800);
  } catch {
    return "";
  }
}

/**
 * Map kick / poll / job / apply failure → one blockedReason.
 */
export function classifyGoFailure(input: {
  httpStatus?: number;
  code?: unknown;
  error?: unknown;
  codeError?: unknown;
  blockedReason?: unknown;
}): GoBlockedReason {
  const existing = input.blockedReason;
  if (existing && typeof existing === "object") {
    const rec = existing as Record<string, unknown>;
    if (isGoBlockedCode(rec.code)) {
      return goBlocked(rec.code, typeof rec.message === "string" ? rec.message : undefined);
    }
  }
  if (isGoBlockedCode(input.code)) {
    return goBlocked(input.code, extractGoFailureText(input.error) || extractGoFailureText(input.codeError));
  }

  const status = Number(input.httpStatus) || 0;
  const text = [
    extractGoFailureText(input.error),
    extractGoFailureText(input.codeError),
    typeof input.code === "string" ? input.code : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lower = text.toLowerCase();

  if (status === 401 || status === 403 || /api key|unauthorized|invalid api key|401|403/i.test(lower)) {
    if (/invalid-argument|reasoning.?effort|does not support parameter/i.test(lower)) {
      return goBlocked("GO_MODEL_REJECTED", text);
    }
    return goBlocked("KEY_AUTH", text);
  }
  if (
    status === 400 ||
    /invalid-argument|invalid_request|does not support parameter|reasoning.?effort/i.test(lower)
  ) {
    return goBlocked("GO_MODEL_REJECTED", text);
  }
  if (/timed out after 3 minutes|go_timeout|abort(?:ed)?|timeout/i.test(lower)) {
    return goBlocked("GO_TIMEOUT", text);
  }
  if (/research not complete|research_incomplete/i.test(lower)) {
    return goBlocked("RESEARCH_INCOMPLETE", text);
  }
  if (/ui-brief|ui_brief_missing/i.test(lower)) {
    return goBlocked("UI_BRIEF_MISSING", text);
  }
  if (/master plan (incomplete|too thin)|master_plan_incomplete/i.test(lower)) {
    return goBlocked("MASTER_PLAN_INCOMPLETE", text);
  }
  if (/zero app\/ or pages\/ routes|no product routes|apply_empty_product|not a product shell/i.test(lower)) {
    return goBlocked("APPLY_EMPTY_PRODUCT", text);
  }
  if (/empty output|no file output|returned no files|go_empty_output/i.test(lower)) {
    return goBlocked("GO_EMPTY_OUTPUT", text);
  }
  return goBlocked("GO_FAILED", text || undefined);
}

export function formatBlockedReasonLine(reason: GoBlockedReason): string {
  return `${reason.message} [${reason.code}]`;
}
