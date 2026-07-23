/**
 * Voice + TTS helpers aligned with `nebula-project/project-execution-rules.md`:
 * - TTS starts as soon as Grok text is available (chunked playback for latency).
 * - First chunk is kept short so synthesis + first audio start sooner.
 * - Mic stays off while TTS runs; re-enable only after `MIC_REENABLE_AFTER_TTS_MS` quiet period.
 * - IDE Open Talk: min speaking window, pause grace, then silence before auto-send.
 */

export const MIC_REENABLE_AFTER_TTS_MS = 1000;

/** IDE Open Talk — keep listening at least this long once the user starts speaking. */
export const OPEN_TALK_MIN_SPEAKING_MS = 10_000;
/** After the user pauses, wait this long for them to continue before counting silence. */
export const OPEN_TALK_PAUSE_GRACE_MS = 3_000;
/** After pause grace with no new speech, wait this long then auto-send to chat. */
export const OPEN_TALK_SILENCE_SEND_MS = 2_800;

/** Push-to-talk / Assistant sidebar single-shot silence before send. */
export const VOICE_SILENCE_BEFORE_SEND_MS = 1800;
/** First audio chunk: start immediately once Grok body is ready (no artificial delay). */
export const TTS_START_DEBOUNCE_MS = 0;
/** Keep follow-up chunks reasonably sized for fewer round-trips. */
export const MAX_TTS_CHUNK_CHARS = 420;
/**
 * First spoken unit — short so xAI TTS returns faster and playback can start
 * while later chunks are prefetched.
 */
export const FIRST_TTS_CHUNK_CHARS = 140;

export function stripForTtsSpokenText(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`+/g, '')
    .replace(/^#{1,6}\s+/gm, '');
}

function pushChunked(chunks: string[], text: string, maxChars: number): void {
  const t = text.trim();
  if (!t) return;
  if (t.length <= maxChars) {
    chunks.push(t);
    return;
  }
  for (let i = 0; i < t.length; i += maxChars) {
    const piece = t.slice(i, i + maxChars).trim();
    if (piece) chunks.push(piece);
  }
}

/**
 * Split spoken text into TTS requests. The first chunk is biased short so
 * audio can start within ~first sentence while the rest is synthesized.
 */
export function splitTextForTts(text: string): string[] {
  const t = stripForTtsSpokenText(text).replace(/\s+/g, ' ').trim();
  if (!t) return [];

  const chunks: string[] = [];

  // Prefer a natural first break: sentence end, then comma/semicolon, then hard cut.
  let firstEnd = -1;
  const sentenceHit = t.slice(0, FIRST_TTS_CHUNK_CHARS + 80).match(/^[\s\S]{20,}?[.!?](?:\s|$)/);
  if (sentenceHit) {
    firstEnd = sentenceHit[0].trimEnd().length;
  } else {
    const soft = t.slice(0, FIRST_TTS_CHUNK_CHARS + 40).match(/^[\s\S]{24,}?[,;:](?:\s|$)/);
    if (soft) firstEnd = soft[0].trimEnd().length;
    else firstEnd = Math.min(FIRST_TTS_CHUNK_CHARS, t.length);
  }
  if (firstEnd < 12) firstEnd = Math.min(FIRST_TTS_CHUNK_CHARS, t.length);

  const first = t.slice(0, firstEnd).trim();
  const rest = t.slice(firstEnd).trim();
  if (first) chunks.push(first);
  if (!rest) return chunks;

  const paras = rest
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  let buf = '';
  for (const s of paras) {
    const next = buf ? `${buf} ${s}` : s;
    if (next.length <= MAX_TTS_CHUNK_CHARS) {
      buf = next;
    } else {
      if (buf) chunks.push(buf);
      if (s.length <= MAX_TTS_CHUNK_CHARS) {
        buf = s;
      } else {
        pushChunked(chunks, s, MAX_TTS_CHUNK_CHARS);
        buf = '';
      }
    }
  }
  if (buf) chunks.push(buf);
  return chunks.filter(Boolean);
}

/** Strip orchestration / markup tags for display + TTS (IDE assistant reply). */
export function stripAssistantTagsForVoice(raw: string): string {
  return raw
    .replace(/<REASONING>[\s\S]*?<\/REASONING>/gi, '')
    .replace(/<START_MASTERPLAN>[\s\S]*?<\/END_MASTERPLAN>/gi, '')
    .replace(/<START_MASTERPLAN>/gi, '')
    .replace(/<\/END_MASTERPLAN>/gi, '')
    .replace(/<START_CODING>/gi, '')
    .replace(/\bSTART_CODING\b/gi, '')
    .replace(/<FINISH_MASTERPLAN>/gi, '')
    .trim();
}
