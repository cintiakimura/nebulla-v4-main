/** xAI TTS / Voice API names Nebulla exposes in the picker. */

export const TTS_VOICE_IDS = ['Zenith', 'Leo', 'Eve', 'Ara'] as const;

export type TtsVoiceId = (typeof TTS_VOICE_IDS)[number];

export const DEFAULT_TTS_VOICE: TtsVoiceId = 'Zenith';

const VOICE_SET = new Set<string>(TTS_VOICE_IDS);

export function isTtsVoiceId(value: unknown): value is TtsVoiceId {
  return typeof value === 'string' && VOICE_SET.has(value);
}

/** Missing or unknown names become Zenith. */
export function resolveTtsVoice(raw?: string | null): TtsVoiceId {
  const name = String(raw || '').trim();
  if (isTtsVoiceId(name)) return name;
  const folded = name.replace(/\s+/g, '');
  const match = TTS_VOICE_IDS.find((id) => id.toLowerCase() === folded.toLowerCase());
  return match || DEFAULT_TTS_VOICE;
}
