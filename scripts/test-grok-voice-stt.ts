/**
 * Grok Voice Transcribe 2.0 contract + optional live smoke (same xAI key as chat).
 * Run: npx tsx scripts/test-grok-voice-stt.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GROK_VOICE_TRANSCRIBE_MODEL,
  VOICE_ACL_HINT,
  XAI_STT_HTTP,
  buildSttKeyterms,
  buildStreamingSttUrl,
  isVoiceAclError,
  normalizeSttLanguage,
} from "../lib/grokVoiceStt.ts";
import { isSttBatchFail, proxyBatchStt } from "../lib/grokVoiceSttProxy.ts";
import {
  applyDictationLive,
  commitDictationUtterance,
  foldSttComposerEvents,
  VOICE_FAILED_TYPE_HINT,
} from "../src/lib/grokVoiceDictation.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(GROK_VOICE_TRANSCRIBE_MODEL, "grok-voice-transcribe-2.0");
assert.equal(normalizeSttLanguage("fr-FR"), "fr");
assert.equal(normalizeSttLanguage("pt-BR"), "pt");
assert.equal(normalizeSttLanguage("en-US"), "en");

const terms = buildSttKeyterms({ productName: "MyDossier" });
assert.ok(terms.includes("MyDossier"));
assert.ok(terms.includes("Nebulla"));
assert.ok(terms.includes("Master Plan"));
assert.ok(terms.includes("dossier"));
assert.ok(terms.includes("handoff"));
assert.ok(terms.includes("accountant"));
assert.ok(terms.length <= 100);

const ws = buildStreamingSttUrl({ language: "en", keyterms: terms, smartTurn: true });
assert.match(ws, /^wss:\/\/api\.x\.ai\/v1\/stt\?/);
assert.match(ws, /model=grok-voice-transcribe-2\.0/);
assert.match(ws, /interim_results=true/);
assert.match(ws, /language=en/);
assert.match(ws, /smart_turn=0\.7/);
assert.match(ws, /keyterm=/);
assert.equal(isVoiceAclError(403, "Voice endpoint not permitted"), true);
assert.equal(isVoiceAclError(403, "team spending limit"), false);

{
  const chat = fs.readFileSync(path.join(root, "src/components/ide/AIChat.tsx"), "utf8");
  assert.match(chat, /startGrokDictation/);
  assert.equal(/api\.x\.ai\/v1\/stt/.test(chat), false);
  const client = fs.readFileSync(path.join(root, "src/lib/grokVoiceDictation.ts"), "utf8");
  assert.match(client, /\/api\/stt\/stream/);
  assert.equal(/Authorization:\s*`Bearer/.test(client), false);
  assert.equal(/api\.x\.ai/.test(client), false);
  const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  assert.match(server, /\/api\/stt/);
  assert.match(server, /attachGrokSttWebSocket/);
  assert.match(chat, /applyDictationLive/);
  assert.match(chat, /commitDictationUtterance/);
  assert.match(chat, /silenceBrowserSpeechRecognition/);
  assert.match(chat, /VOICE_FAILED_TYPE_HINT/);
  assert.match(chat, /lastComposerSendRef/);
  assert.equal(/webkitSpeechRecognition/.test(chat), false);
  assert.equal(/new SpeechRecognition/.test(chat), false);
  assert.match(client, /sameUtterance|lastUtterance/);
  assert.match(client, /silenceBrowserSpeechRecognition/);
  assert.match(client, /buildSttKeyterms/);
}

assert.equal(applyDictationLive("", "no"), "no");
assert.equal(applyDictationLive("hello", "no"), "hello no");
assert.equal(applyDictationLive("I want an app", "I want an app"), "I want an app");
assert.equal(commitDictationUtterance("", "no"), "no");
assert.equal(commitDictationUtterance("no", "no"), "no");
assert.equal(commitDictationUtterance("no", "no"), "no");
assert.equal(commitDictationUtterance(commitDictationUtterance("no", "no"), "no"), "no");
assert.equal(commitDictationUtterance("hello", "world"), "hello world");
assert.equal(commitDictationUtterance("Visual", "Visualual"), "Visual");
assert.equal(commitDictationUtterance("Visualual", "Visual"), "Visual");
assert.equal(commitDictationUtterance("no", "no it"), "no it");

{
  const twice = foldSttComposerEvents([
    { kind: "final", text: "I want an app inspired by Llama Life" },
    { kind: "final", text: "I want an app inspired by Llama Life" },
  ]);
  assert.equal(twice.composer, "I want an app inspired by Llama Life");
  assert.equal(twice.finalsAccepted, 1);
  const partialThenTwoFinals = foldSttComposerEvents([
    { kind: "partial", text: "I want an app inspired by Llama Life" },
    { kind: "final", text: "I want an app inspired by Llama Life" },
    { kind: "final", text: "I want an app inspired by Llama Life" },
  ]);
  assert.equal(partialThenTwoFinals.composer, "I want an app inspired by Llama Life");
  assert.equal(partialThenTwoFinals.finalsAccepted, 1);
}
assert.equal(VOICE_FAILED_TYPE_HINT, "voice failed — type instead");

function readEnvKey(): string {
  const fromProc =
    process.env.XAI_API_KEY?.trim() ||
    process.env.MAIN_API_KEY_GROK?.trim() ||
    process.env.MAIN_AI_API_KEY?.trim() ||
    "";
  if (fromProc) return fromProc;
  for (const rel of [".env.local", ".env"]) {
    const envPath = path.join(root, rel);
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const name of ["XAI_API_KEY", "MAIN_API_KEY_GROK", "MAIN_AI_API_KEY"]) {
      const m = raw.match(new RegExp(`^${name}=(.+)$`, "m"));
      if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

function pcmWavSilence(seconds = 0.4, sampleRate = 16000): Buffer {
  const n = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(n * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

let voiceAclBlocker = false;
let smoke = "skipped (no xAI key in env)";

const apiKey = readEnvKey();
if (apiKey) {
  const phrase = "MyDossier handoff to the accountant";
  let clip = pcmWavSilence();
  let ttsOk = false;
  for (const attempt of [
    () =>
      fetch("https://api.x.ai/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "grok-tts-1",
          input: phrase,
          voice: "Zenith",
          response_format: "mp3",
          language: "en",
        }),
      }),
    () =>
      fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: phrase,
          voice_id: "Zenith",
          output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 128000 },
          language: "en",
        }),
      }),
  ]) {
    try {
      const tts = await attempt();
      if (tts.ok) {
        clip = Buffer.from(await tts.arrayBuffer());
        ttsOk = clip.length > 800;
        break;
      }
    } catch {
      /* next */
    }
  }
  const result = await proxyBatchStt({
    apiKey,
    file: clip,
    filename: ttsLooksMp3(clip) ? "spoken.mp3" : "silence.wav",
    mime: ttsLooksMp3(clip) ? "audio/mpeg" : "audio/wav",
    language: "en",
    productName: "MyDossier",
  });
  if (isSttBatchFail(result)) {
    voiceAclBlocker = result.voiceAcl;
    smoke = `failed HTTP: ${result.error}`;
    if (result.voiceAcl) {
      assert.match(result.error, /Voice|STT|type instead/i);
    }
  } else if (result.ok) {
    smoke = `ok tts=${ttsOk} text=${JSON.stringify(result.text)}`;
    if (ttsOk && result.text) {
      const t = result.text.toLowerCase();
      assert.equal(/mydossier|dossier/.test(t), true, `expected dossier terms in: ${result.text}`);
      assert.equal(/handoff|accountant/.test(t), true, `expected handoff/accountant in: ${result.text}`);
    } else if (ttsOk && !result.text) {
      smoke = "STT 200 but empty transcript on spoken TTS clip";
    } else if (!ttsOk) {
      smoke = "STT reachable (not Voice ACL); TTS clip unavailable so spoken words were not checked";
    }
  }
}

function ttsLooksMp3(buf: Buffer): boolean {
  return buf.length > 800 && (buf[0] === 0xff || buf.toString("utf8", 0, 3) === "ID3");
}

console.log(`✓ grok voice STT contract`);
console.log(`  smoke: ${smoke}`);
console.log(`  Voice ACL blocker: ${voiceAclBlocker ? "yes — " + VOICE_ACL_HINT : "no"}`);
