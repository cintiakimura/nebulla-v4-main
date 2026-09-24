/**
 * Browser dictation: mic PCM → Nebulla /api/stt/stream (server holds the xAI key).
 * Falls back to batch POST /api/stt. Never sends the xAI key or hits the vendor host from the browser.
 */

import { getGrokRequestHeaders } from './grokUserKey';
import { getBrowserProjectName, withProjectQuery } from './nebulaProjectApi';
import { buildSttKeyterms, normalizeSttLanguage } from '../../lib/grokVoiceStt';

export type GrokDictationHandlers = {
  onPartial?: (text: string, isFinal: boolean) => void;
  onUtterance?: (text: string) => void;
  onError?: (message: string, voiceAcl?: boolean) => void;
  onReady?: () => void;
};

export type GrokDictationSession = {
  stop: () => Promise<string>;
};

/** Live box = prior committed words + current partial (never append the same final twice). */
export function applyDictationLive(committed: string, live: string): string {
  const c = String(committed || '').replace(/\s+/g, ' ').trim();
  const liveText = String(live || '').replace(/\s+/g, ' ').trim();
  if (!liveText) return c;
  if (!c) return liveText;
  return `${c} ${liveText}`.trim();
}

/** Commit one utterance. Ignore repeats / growing replacements of the same phrase. */
export function commitDictationUtterance(committed: string, utterance: string): string {
  const c = String(committed || '').replace(/\s+/g, ' ').trim();
  const u = String(utterance || '').replace(/\s+/g, ' ').trim();
  if (!u) return c;
  if (!c) return u;
  if (c === u) return c;
  if (u.startsWith(c) && (u.length === c.length || u[c.length] === ' ')) return u;
  if (c.startsWith(u) && (c.length === u.length || c[u.length] === ' ')) return c;
  if (c.endsWith(` ${u}`) || c.endsWith(u)) return c;
  return `${c} ${u}`.trim();
}

function sameUtterance(a: string, b: string): boolean {
  return String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function downsampleToPcm16(input: Float32Array, inputRate: number, outRate = 16000): Int16Array {
  const ratio = inputRate / outRate;
  const n = inputRate === outRate ? input.length : Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, input[inputRate === outRate ? i : Math.floor(i * ratio)]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

async function mintStreamTicket(): Promise<string> {
  const res = await fetch(withProjectQuery('/api/stt/session'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
    body: JSON.stringify({}),
  });
  if (!res.ok) return '';
  const data = (await res.json()) as { ticket?: string };
  return String(data.ticket || '');
}

export async function transcribeClipBatch(opts: {
  blob: Blob;
  language?: string;
  productName?: string;
}): Promise<{ text: string; voiceAcl?: boolean; error?: string }> {
  const buf = await opts.blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const audioBase64 = btoa(binary);
  const res = await fetch(withProjectQuery('/api/stt'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getGrokRequestHeaders() },
    body: JSON.stringify({
      audioBase64,
      mime: opts.blob.type || 'audio/webm',
      language: normalizeSttLanguage(opts.language),
      productName: opts.productName || getBrowserProjectName(),
      keyterms: buildSttKeyterms({ productName: opts.productName || getBrowserProjectName() }),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
    voiceAcl?: boolean;
  };
  if (!res.ok) {
    return { text: '', error: data.error || `STT HTTP ${res.status}`, voiceAcl: data.voiceAcl };
  }
  return { text: String(data.text || '').trim(), voiceAcl: data.voiceAcl };
}

export async function startGrokDictation(
  opts: GrokDictationHandlers & { language?: string; productName?: string },
): Promise<GrokDictationSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ticket = await mintStreamTicket();
  const language = normalizeSttLanguage(opts.language);
  const productName = opts.productName || getBrowserProjectName();
  const keyterms = buildSttKeyterms({ productName });
  const qs = new URLSearchParams();
  if (ticket) qs.set('ticket', ticket);
  qs.set('language', language);
  qs.set('productName', productName);
  for (const term of keyterms) qs.append('keyterm', term);
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://${window.location.host}/api/stt/stream?${qs.toString()}`;

  let ws: WebSocket | null = null;
  let audioCtx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let recorder: MediaRecorder | null = null;
  const recorded: Blob[] = [];
  let lastText = '';
  let lastUtterance = '';
  let stopped = false;

  const cleanupMic = () => {
    try {
      processor?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      void audioCtx?.close();
    } catch {
      /* ignore */
    }
    for (const t of stream.getTracks()) t.stop();
    processor = null;
    source = null;
    audioCtx = null;
  };

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    cleanupMic();
    throw err;
  }

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    let msg: {
      type?: string;
      text?: string;
      is_final?: boolean;
      speech_final?: boolean;
      message?: string;
      voiceAcl?: boolean;
    };
    try {
      msg = JSON.parse(ev.data) as typeof msg;
    } catch {
      return;
    }
    if (msg.type === 'error') {
      opts.onError?.(msg.message || 'STT failed', msg.voiceAcl);
      return;
    }
    if (msg.type === 'transcript.created') {
      opts.onReady?.();
      return;
    }
    if (msg.type === 'transcript.partial' || msg.type === 'transcript.done') {
      const text = String(msg.text || '').trim();
      if (!text) return;
      lastText = text;
      const isFinal = Boolean(msg.is_final) || msg.type === 'transcript.done';
      opts.onPartial?.(text, isFinal);
      const shouldCommit = msg.speech_final || msg.type === 'transcript.done' || (isFinal && msg.type === 'transcript.partial');
      if (shouldCommit && !sameUtterance(text, lastUtterance)) {
        lastUtterance = text;
        opts.onUtterance?.(text);
      }
    }
  };

  ws.onerror = () => {
    opts.onError?.('STT stream dropped — you can type instead.');
  };

  try {
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recorded.push(e.data);
    };
    recorder.start(400);
  } catch {
    recorder = null;
  }

  audioCtx = new AudioContext();
  source = audioCtx.createMediaStreamSource(stream);
  processor = audioCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || stopped) return;
    const pcm = downsampleToPcm16(e.inputBuffer.getChannelData(0), audioCtx?.sampleRate || 48000);
    if (pcm.length) ws.send(pcm.buffer);
  };
  source.connect(processor);
  const mute = audioCtx.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(audioCtx.destination);

  const stop = async (): Promise<string> => {
    if (stopped) return lastText;
    stopped = true;
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'finalize' }));
        ws.send(JSON.stringify({ type: 'audio.done' }));
      }
    } catch {
      /* ignore */
    }
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder!.onstop = () => resolve();
        try {
          recorder!.stop();
        } catch {
          resolve();
        }
        window.setTimeout(resolve, 800);
      });
    }
    cleanupMic();
    if (!lastText && recorded.length) {
      const blob = new Blob(recorded, { type: recorder?.mimeType || 'audio/webm' });
      const batch = await transcribeClipBatch({ blob, language, productName }).catch((err) => ({
        text: '',
        error: err instanceof Error ? err.message : 'batch STT failed',
        voiceAcl: false,
      }));
      if (batch.text) lastText = batch.text;
      else if (batch.error) opts.onError?.(batch.error, Boolean(batch.voiceAcl));
    }
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    return lastText;
  };

  return { stop };
}
