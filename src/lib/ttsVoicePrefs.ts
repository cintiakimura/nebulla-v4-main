/**
 * Persist TTS voice: device localStorage + optional per-account key.
 * Never ask in chat — resolve silently to Zenith when missing/invalid.
 */

import { DEFAULT_TTS_VOICE, resolveTtsVoice, type TtsVoiceId } from '../../lib/ttsVoice';
import { fetchSessionUser } from './nebulaCloud';

export const TTS_VOICE_STORAGE_KEY = 'nebula-tts-voice-v1';
export const TTS_VOICE_CHANGED_EVENT = 'nebula-tts-voice-changed';

function accountKey(uid: string): string {
  return `${TTS_VOICE_STORAGE_KEY}:account:${uid}`;
}

function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStoredTtsVoice(): TtsVoiceId {
  return resolveTtsVoice(readRaw(TTS_VOICE_STORAGE_KEY));
}

export function writeStoredTtsVoice(voice: TtsVoiceId, accountUid?: string | null): TtsVoiceId {
  const resolved = resolveTtsVoice(voice);
  writeRaw(TTS_VOICE_STORAGE_KEY, resolved);
  const uid = String(accountUid || '').trim();
  if (uid) writeRaw(accountKey(uid), resolved);
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(TTS_VOICE_CHANGED_EVENT, { detail: { voice: resolved } }));
    } catch {
      /* ignore */
    }
  }
  return resolved;
}

/** Prefer account-scoped pick when signed in, else device, else Zenith. */
export function readTtsVoiceForAccount(accountUid?: string | null): TtsVoiceId {
  const uid = String(accountUid || '').trim();
  if (uid) {
    const account = readRaw(accountKey(uid));
    if (account) return resolveTtsVoice(account);
  }
  return readStoredTtsVoice();
}

export function getTtsVoiceForRequest(): TtsVoiceId {
  return readStoredTtsVoice();
}

/** Hydrate device key from account pick when a session exists. */
export async function hydrateTtsVoiceFromAccount(): Promise<TtsVoiceId> {
  const session = await fetchSessionUser().catch(() => null);
  const uid = session?.uid?.trim() || '';
  const voice = readTtsVoiceForAccount(uid || null);
  writeStoredTtsVoice(voice, uid || null);
  return voice;
}

export { DEFAULT_TTS_VOICE, resolveTtsVoice };
export type { TtsVoiceId };
