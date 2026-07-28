/**
 * Sanitize assistant text for user-visible chat / conversation memory.
 * Master Plan bodies, file blocks, and raw CSS/code must never appear in chat bubbles.
 */

const MASTER_PLAN_SECTION_DUMP_RE =
  /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\d+[.)]\s*)?(?:Goal of the app|Tech(?:nology)? and [Rr]esearch|Features and KPIs|Pages and navigation|UI\/?UX design)\b[\s\S]*?(?=(?:\n\s*(?:#{1,4}\s*)?(?:\d+[.)]\s*)?(?:Goal of the app|Tech(?:nology)? and [Rr]esearch|Features and KPIs|Pages and navigation|UI\/?UX design)\b)|$)/gi;

/** Heuristic: block looks like CSS / code dump, not conversational prose. */
export function looksLikeCodeOrStyleDump(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/```/.test(t)) return true;
  if (/<START_MASTERPLAN>/i.test(t)) return true;
  const cssSignals =
    (t.match(/\{[^}]*\}/g) || []).length >= 2 &&
    (/var\(--|border-radius\s*:|background(-color)?\s*:|\.btn-|font-size\s*:/i.test(t) ||
      /--[a-z][\w-]*\s*:/i.test(t));
  if (cssSignals) return true;
  const codeSignals =
    (/^(?:import|export|const|function|class|interface)\b/m.test(t) && t.length > 120) ||
    (/;\s*$/m.test(t) && (t.match(/;/g) || []).length >= 4 && t.length > 160);
  if (codeSignals) return true;
  // Long master-plan-ish dumps
  if (
    /1\.\s*Goal of the app|5\.\s*UI\/?UX/i.test(t) &&
    t.length > 400
  ) {
    return true;
  }
  return false;
}

export function stripOrchestrationTags(text: string): string {
  return text
    .replace(/<REASONING>[\s\S]*?<\/REASONING>/gi, "")
    .replace(/<START_MASTERPLAN>[\s\S]*?<\/?END_MASTERPLAN>/gi, "")
    .replace(/<START_MASTERPLAN>[\s\S]*$/gi, "")
    .replace(/<\/?END_MASTERPLAN>/gi, "")
    .replace(/<\s*START_CODING\s*>/gi, "")
    .replace(/\bSTART_CODING\b/gi, "")
    .replace(/<FINISH_MASTERPLAN>/gi, "")
    .replace(/<APPROVE_MASTERPLAN>/gi, "")
    .replace(/<APPROVE_MINDMAP>/gi, "")
    .replace(/<APPROVE_UI>/gi, "")
    .replace(/<START_UIUX>/gi, "")
    .replace(/<NEBULA_UI_STUDIO_PROMPT>[\s\S]*?<\/NEBULA_UI_STUDIO_PROMPT>/gi, "")
    .replace(/<GROK_B_SUMMARY_Q([1-6])>[\s\S]*?<\/GROK_B_SUMMARY_Q\1>/gi, "")
    .replace(/\bANSWER_Q[1-6]\b/gi, "")
    .replace(/Already fill up the question tab\./gi, "");
}

/** Remove fenced code and common unfenced CSS rule blocks. */
export function stripCodeAndCssDumps(text: string): string {
  let t = text;
  // Fenced blocks (any language)
  t = t.replace(/```[\w.+-]*\n[\s\S]*?```/g, "");
  t = t.replace(/```[\w.+-]*[\s\S]*?```/g, "");
  // Unfenced CSS: selector { ... } repeated
  t = t.replace(
    /(?:^|\n)[ \t]*[.#]?[a-zA-Z][\w:-]*(?:\s*:\s*[a-zA-Z][\w-]*)?(?:\s*,\s*[.#]?[a-zA-Z][\w:-]*)*\s*\{[\s\S]*?\}/g,
    "\n",
  );
  // CSS custom property blocks often dumped as :root { --x: ... }
  t = t.replace(/(?:^|\n)\s*:root\s*\{[\s\S]*?\}/gi, "\n");
  // Master Plan section dumps without tags
  t = t.replace(MASTER_PLAN_SECTION_DUMP_RE, "\n");
  return t;
}

export type SanitizeChatOptions = {
  /** Short fallback when everything was stripped as artifacts. */
  fallback?: string;
  hadMasterPlan?: boolean;
  filePaths?: string[];
};

/**
 * Produce user-safe chat text. Never leaves Master Plan prose, CSS, or code fences.
 */
export function sanitizeAssistantChatText(
  raw: string,
  opts: SanitizeChatOptions = {},
): string {
  const fallback =
    opts.fallback ||
    (opts.hadMasterPlan
      ? "Master Plan saved. Open the Master Plan tab to review it."
      : opts.filePaths && opts.filePaths.length
        ? "Updates are in your project files — check the explorer."
        : "");

  let text = stripOrchestrationTags(raw || "");
  text = stripCodeAndCssDumps(text);
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  if (!text) return fallback;

  if (looksLikeCodeOrStyleDump(text)) {
    // Still mostly code after stripping — do not show it.
    return (
      fallback ||
      "I’ve updated the project quietly. Open Master Plan, UI Studio, or the explorer for details — or ask me a question in plain language."
    );
  }

  // Cap extremely long assistant bubbles (plan/code leakage)
  if (text.length > 1200 && /\{|;\s*$|var\(--|border-radius/m.test(text)) {
    return (
      fallback ||
      "I’ve saved the detailed plan and styles in the project. Ask me anything in chat — I won’t dump the full plan or CSS here."
    );
  }

  return text;
}
