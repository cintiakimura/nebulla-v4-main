/**
 * Voice + TTS helpers aligned with `nebula-project/project-execution-rules.md`:
 * - TTS starts as soon as Grok text is available (chunked playback for latency).
 * - Mic stays off while TTS runs; re-enable only after `MIC_REENABLE_AFTER_TTS_MS` quiet period.
 * - ~2.5s silence after speech before auto-send (hands-free / voice turn).
 */

export const MIC_REENABLE_AFTER_TTS_MS = 5000;
export const VOICE_SILENCE_BEFORE_SEND_MS = 2500;
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
