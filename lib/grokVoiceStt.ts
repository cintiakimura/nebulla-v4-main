/**
 * Grok Voice Transcribe 2.0 — server-side request shape.
 * Never put XAI_API_KEY in the browser. Pin the model; do not rely on a silent default.
 */

export const GROK_VOICE_TRANSCRIBE_MODEL = "grok-voice-transcribe-2.0";
export const XAI_STT_HTTP = "https://api.x.ai/v1/stt";
export const XAI_STT_WS = "wss://api.x.ai/v1/stt";

export const STT_CORE_KEYTERMS = [
  "Nebulla",
  "Master Plan",
  "dossier",
  "handoff",
  "accountant",
  "MyDossier",
] as const;

export function normalizeSttLanguage(code?: string | null): "en" | "fr" | "pt" {
  const raw = String(code || "en")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  if (raw === "fr") return "fr";
  if (raw === "pt") return "pt";
  return "en";
}

export function buildSttKeyterms(opts?: { productName?: string | null; extra?: string[] }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const t = String(raw || "").trim().slice(0, 50);
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const term of STT_CORE_KEYTERMS) add(term);
  add(opts?.productName || "");
  for (const term of opts?.extra || []) add(term);
  return out.slice(0, 100);
}

export function buildStreamingSttUrl(opts: {
  language?: string | null;
  keyterms?: string[];
  smartTurn?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("model", GROK_VOICE_TRANSCRIBE_MODEL);
  params.set("sample_rate", "16000");
  params.set("encoding", "pcm");
  params.set("interim_results", "true");
  params.set("language", normalizeSttLanguage(opts.language));
  if (opts.smartTurn !== false) {
    params.set("smart_turn", "0.7");
    params.set("smart_turn_timeout", "3000");
  }
  for (const term of (opts.keyterms || []).slice(0, 100)) {
    params.append("keyterm", term);
  }
  return `${XAI_STT_WS}?${params.toString()}`;
}

export function isVoiceAclError(status: number, body = ""): boolean {
  if (status !== 403 && status !== 401) return false;
  const t = String(body || "");
  if (/spending limit|credits|quota/i.test(t)) return false;
  return (
    /voice|stt|speech to text|transcri/i.test(t) ||
    /permission|forbidden|acl|not authorized|endpoint/i.test(t) ||
    status === 403
  );
}

export const VOICE_ACL_HINT =
  "Chat key is missing Voice / STT permission. In console.x.ai edit the same xAI key → grant the Voice endpoint. Chat can still work without it — type instead.";
