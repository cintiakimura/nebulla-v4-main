/**
 * Brainstorm / name / Slot 4 lookups — silent web_search, spoken finding.
 * Does not write competitor-research.md and does not start Foundation.
 */

export const DISCOVERY_SEARCH_HONEST_MISS =
  "I couldn't check live trademark data.";

export const DISCOVERY_OCR_DEFAULT_LINE =
  "Tesseract runs in the browser, no key. Google Vision is the paid upgrade — console.cloud.google.com.";

const NAME_TURN_RE =
  /\b(name taken|taken as a name|trademark|euipo|uspto|brand (?:available|taken)|is (?:this|the|that|\w+) (?:name )?taken|is (?:this|the|that) name (?:available|free)|can we (?:use|call) (?:it|this)|product name|available as a (?:name|brand))\b/i;

const OCR_TURN_RE =
  /\b(ocr|tesseract|google vision|vision api|extract (?:text|from)|client-?side extract|paste (?:an? |the )?(?:ocr |vision )?api key|do we need (?:an? )?(?:ocr )?api)\b/i;

const API_TURN_RE =
  /\b(do we need an? api|which api|api key|stripe|mapbox|twilio|firebase)\b/i;

const COMPLIANCE_TURN_RE = /\b(hipaa|gdpr|compliance family|privacy (?:law|rule|regulation))\b/i;

const SLOT4_TURN_RE =
  /\b(slot 4|dependencies|we-?build|user (?:must )?choose|user-choice)\b/i;

export function discoverySearchIsNameTurn(text: string): boolean {
  return NAME_TURN_RE.test(String(text || ""));
}

export function discoverySearchIsOcrTurn(text: string): boolean {
  return OCR_TURN_RE.test(String(text || ""));
}

/** Name, OCR/extract, API, compliance, Slot 4 — server may run web_search. */
export function discoveryTurnWantsWebSearch(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || t.length < 6) return false;
  if (/which sounds better|I can build what you have in mind right now/i.test(t)) return false;
  return (
    discoverySearchIsNameTurn(t) ||
    discoverySearchIsOcrTurn(t) ||
    API_TURN_RE.test(t) ||
    COMPLIANCE_TURN_RE.test(t) ||
    SLOT4_TURN_RE.test(t)
  );
}

export function discoveryHonestMissLine(userText: string): string {
  if (discoverySearchIsNameTurn(userText)) return DISCOVERY_SEARCH_HONEST_MISS;
  if (discoverySearchIsOcrTurn(userText)) {
    return `I couldn't verify live vendor docs. ${DISCOVERY_OCR_DEFAULT_LINE}`;
  }
  return "I couldn't verify that live — I'll use the we-build default and you can push back.";
}

export function sanitizeDiscoverySearchFinding(text: string): string {
  return String(text || "")
    .replace(/Searching[.…:]*/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\b(web_search|x_search|tool_calls?|function_call)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

export const DISCOVERY_SEARCH_SYSTEM = `
You look up one fact for a product brainstorm. Silent tool use. Never say Searching. Never print tool JSON.
Reply in 1–2 spoken sentences. Two or three facts that serve THIS product — no competitor catalog.
If the question is OCR/extract: mention in-browser Tesseract (no key) as the default; Vision/cloud is a paid upgrade, not the only path.
If the question is a name/trademark: one availability note or an honest miss (“I couldn't check live trademark data”).
Never tell them to start Foundation or press Go. Never invent EUIPO filings or Vision docs you did not see.
`.trim();

export function buildDiscoverySearchUserPrompt(userText: string): string {
  return String(userText || "").trim().slice(0, 2000);
}

export function buildDiscoverySearchAppendix(
  userText: string,
  result: { ok: boolean; text?: string; error?: string },
): string {
  const kindOcr = discoverySearchIsOcrTurn(userText);
  if (!result.ok) {
    const miss = discoveryHonestMissLine(userText);
    return [
      "DISCOVERY_LOOKUP (silent — do not narrate the tool):",
      miss,
      kindOcr ? DISCOVERY_OCR_DEFAULT_LINE : "",
      "Speak the finding in 1–2 sentences. Do not claim lookups are forbidden.",
      "THIS TURN FORBIDDEN: START_CODING, Foundation, file blocks.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const finding = sanitizeDiscoverySearchFinding(result.text || "");
  const body = finding || discoveryHonestMissLine(userText);
  return [
    "DISCOVERY_LOOKUP (silent — do not narrate the tool; speak this finding):",
    body,
    kindOcr && !/tesseract|in-?browser|no key/i.test(body) ? DISCOVERY_OCR_DEFAULT_LINE : "",
    "1–2 spoken sentences. Do not narrate the lookup. No tool JSON. No competitor dump. No Foundation.",
  ]
    .filter(Boolean)
    .join("\n");
}
