/**
 * Voice + TTS helpers aligned with `nebula-project/project-execution-rules.md`:
 * - TTS starts as soon as Grok text is available (chunked playback for latency).
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
/** First audio chunk: start immediately once Grok body is ready. */
export const TTS_START_DEBOUNCE_MS = 0;
export const MAX_TTS_CHUNK_CHARS = 560;

export function stripForTtsSpokenText(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`+/g, '')
    .replace(/^#{1,6}\s+/gm, '');
}

export function splitTextForTts(text: string): string[] {
  const t = stripForTtsSpokenText(text);
  const paras = t
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const para of paras) {
    if (para.length <= MAX_TTS_CHUNK_CHARS) {
      chunks.push(para);
      continue;
    }
    const sentences = para.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [para];
    let buf = '';
    for (const raw of sentences) {
      const s = raw.trim();
      if (!s) continue;
      const next = buf ? `${buf} ${s}` : s;
      if (next.length <= MAX_TTS_CHUNK_CHARS) {
        buf = next;
      } else {
        if (buf) chunks.push(buf);
        if (s.length <= MAX_TTS_CHUNK_CHARS) {
          buf = s;
        } else {
          for (let i = 0; i < s.length; i += MAX_TTS_CHUNK_CHARS) {
            chunks.push(s.slice(i, i + MAX_TTS_CHUNK_CHARS).trim());
          }
          buf = '';
        }
      }
    }
    if (buf) chunks.push(buf);
  }
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
