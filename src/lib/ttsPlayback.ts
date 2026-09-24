/**
 * Low-latency TTS playback for Nebulla (AIChat + AssistantSidebar).
 * - Prefetches the next chunk while the current one plays
 * - Plays a complete MP3 blob (MediaSource + piped MPEG often lands silent on Safari/WebKit)
 * - Unlocks the shared audio element on the user's mic / send gesture
 */

import { splitTextForTts } from './voiceTtsShared';
import { getTtsVoiceForRequest } from './ttsVoicePrefs';
import type { TtsVoiceId } from '../../lib/ttsVoice';

/** Tiny valid WAV — used only to unlock autoplay during a user gesture. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let sharedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

function ensureSharedAudio(): HTMLAudioElement {
  if (sharedAudio) return sharedAudio;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.setAttribute('playsinline', 'true');
  audio.muted = false;
  audio.volume = 1;
  sharedAudio = audio;
  return audio;
}

/** Call from a click / mic tap so later TTS is allowed to play. */
export function unlockTtsAudio(): void {
  if (typeof window === 'undefined') return;
  const audio = ensureSharedAudio();
  if (audioUnlocked) return;
  audio.muted = true;
  audio.src = SILENT_WAV;
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      audioUnlocked = true;
    })
    .catch(() => {
      audio.muted = false;
    });
}

export type TtsPlaybackOptions = {
  text: string;
  /** POST target — include project query when needed. */
  speakUrl: string;
  signal?: AbortSignal;
  /** Called with the active HTMLAudioElement (for interrupt / Hand). */
  onAudio?: (audio: HTMLAudioElement | null) => void;
  /** Optional credentials for IDE speak route. */
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  /** Content locale code (en|fr|it|es|de) — passed to /api/speak. */
  language?: string;
  /** xAI voice name. Defaults to the persisted pick (Zenith). */
  voice?: TtsVoiceId | string;
};

function mseMpegSupported(): boolean {
  // Piped MP3 frames into MediaSource often fail silently (Safari/WebKit; split frames).
  return false;
}

function appendBuffer(sb: SourceBuffer, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onUpdate = () => {
      sb.removeEventListener('updateend', onUpdate);
      sb.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      sb.removeEventListener('updateend', onUpdate);
      sb.removeEventListener('error', onErr);
      reject(new Error('SourceBuffer append failed'));
    };
    sb.addEventListener('updateend', onUpdate);
    sb.addEventListener('error', onErr);
    try {
      const copy = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
      sb.appendBuffer(copy);
    } catch (e) {
      sb.removeEventListener('updateend', onUpdate);
      sb.removeEventListener('error', onErr);
      reject(e);
    }
  });
}

async function playMpegViaMediaSource(
  response: Response,
  audio: HTMLAudioElement,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body || !mseMpegSupported()) {
    throw new Error('MSE unavailable');
  }

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  audio.src = objectUrl;
  audio.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve();
    };

    const onAbort = () => {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      finish();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    mediaSource.addEventListener(
      'sourceopen',
      () => {
        void (async () => {
          try {
            const sb = mediaSource.addSourceBuffer('audio/mpeg');
            const reader = response.body!.getReader();
            let started = false;
            const t0 = performance.now();

            while (true) {
              if (signal?.aborted) break;
              const { done, value } = await reader.read();
              if (done) break;
              if (!value?.byteLength) continue;
              await appendBuffer(sb, value);
              if (!started) {
                started = true;
                console.debug(
                  `[TTS] stream first-bytes→play ${Math.round(performance.now() - t0)}ms`,
                );
                try {
                  await audio.play();
                } catch (playErr) {
                  if ((playErr as { name?: string })?.name !== 'AbortError') throw playErr;
                }
              }
            }

            const end = () => {
              try {
                if (mediaSource.readyState === 'open') mediaSource.endOfStream();
              } catch {
                /* ignore */
              }
            };
            if (sb.updating) {
              sb.addEventListener('updateend', end, { once: true });
            } else {
              end();
            }

            if (signal?.aborted) {
              finish();
              return;
            }

            if (audio.ended || audio.paused) {
              // Very short clips may end before we attach onended.
              if (audio.ended) {
                finish();
                return;
              }
              try {
                await audio.play();
              } catch {
                /* ignore */
              }
            }

            audio.onended = () => finish();
            audio.onerror = () => finish(new Error('audio element error'));
          } catch (e) {
            finish(e);
          }
        })();
      },
      { once: true },
    );
  });
}

async function playMpegViaBlob(
  response: Response,
  audio: HTMLAudioElement,
  signal?: AbortSignal,
): Promise<() => void> {
  const t0 = performance.now();
  const blob = await response.blob();
  if (signal?.aborted) return () => {};
  if (!blob.size) throw new Error('TTS returned empty audio');
  const url = URL.createObjectURL(blob);
  console.debug(`[TTS] blob ready ${Math.round(performance.now() - t0)}ms (${blob.size}b)`);
  audio.muted = false;
  audio.volume = 1;
  audio.setAttribute('playsinline', 'true');
  audio.src = url;
  audio.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (err?: unknown) => {
      if (done) return;
      done = true;
      audio.onended = null;
      audio.onerror = null;
      if (err) reject(err);
      else resolve();
    };
    const onAbort = () => {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      finish();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error('audio element error'));
    // Play as soon as enough data is buffered (blob is local → near-instant).
    const startPlay = () =>
      audio.play().then(
        () => {
          console.debug(`[TTS] blob play started ${Math.round(performance.now() - t0)}ms`);
        },
        (err) => {
          const name = (err as { name?: string })?.name;
          if (name === 'AbortError') {
            finish();
            return;
          }
          if (name === 'NotAllowedError') {
            unlockTtsAudio();
            void audio.play().then(
              () => {
                console.debug(`[TTS] blob play started after unlock ${Math.round(performance.now() - t0)}ms`);
              },
              finish,
            );
            return;
          }
          finish(err);
        },
      );
    startPlay();
  });
  return () => {
    try {
      if (audio.src === url) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };
}

async function fetchSpeakChunk(
  speakUrl: string,
  text: string,
  signal: AbortSignal | undefined,
  credentials: RequestCredentials | undefined,
  headers: Record<string, string> | undefined,
  language?: string,
  voice?: string,
): Promise<Response> {
  const t0 = performance.now();
  const res = await fetch(speakUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    credentials,
    body: JSON.stringify({
      text,
      language: language || 'en',
      voice: voice || getTtsVoiceForRequest(),
    }),
    signal,
  });
  console.debug(`[TTS] /api/speak TTFB ${Math.round(performance.now() - t0)}ms status=${res.status}`);
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`TTS failed (${res.status}): ${errBody.slice(0, 140)}`);
  }
  return res;
}

async function playSpeakResponse(
  response: Response,
  audio: HTMLAudioElement,
  signal?: AbortSignal,
): Promise<() => void> {
  // Prefer MediaSource so playback can start before the full MP3 arrives.
  // Do not clone/fallback after reading starts (body is one-shot).
  if (mseMpegSupported() && response.body) {
    await playMpegViaMediaSource(response, audio, signal);
    return () => {};
  }
  return playMpegViaBlob(response, audio, signal);
}

/**
 * Speak text with chunked TTS, prefetch, and streaming start when possible.
 * Resolves when all chunks finished or aborted.
 */
export async function playTtsText(options: TtsPlaybackOptions): Promise<void> {
  const chunks = splitTextForTts(options.text);
  if (!chunks.length) return;

  const signal = options.signal;
  let prefetch: Promise<Response> | null = null;
  let revokeLast: (() => void) | null = null;

  const startPrefetch = (index: number) => {
    if (index >= chunks.length) return;
    prefetch = fetchSpeakChunk(
      options.speakUrl,
      chunks[index],
      signal,
      options.credentials,
      options.headers,
      options.language,
      options.voice,
    );
  };

  // Kick first request immediately.
  startPrefetch(0);

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) break;

      const resPromise = prefetch ?? fetchSpeakChunk(
        options.speakUrl,
        chunks[i],
        signal,
        options.credentials,
        options.headers,
        options.language,
        options.voice,
      );
      prefetch = null;
      // Prefetch the next chunk while this one downloads/plays.
      if (i + 1 < chunks.length) startPrefetch(i + 1);

      const res = await resPromise;
      if (signal?.aborted) break;

      const audio = ensureSharedAudio();
      audio.muted = false;
      audio.volume = 1;
      audio.setAttribute('playsinline', 'true');
      options.onAudio?.(audio);
      revokeLast?.();
      revokeLast = null;

      try {
        revokeLast = await playSpeakResponse(res, audio, signal);
      } finally {
        options.onAudio?.(null);
      }
    }
  } finally {
    revokeLast?.();
    options.onAudio?.(null);
  }
}
