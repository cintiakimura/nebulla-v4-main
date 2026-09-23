/**
 * TTS voice resolve + picker contract.
 * Run: npx tsx scripts/test-tts-voice.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TTS_VOICE, resolveTtsVoice, TTS_VOICE_IDS } from '../lib/ttsVoice.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(DEFAULT_TTS_VOICE, 'Zenith');
assert.deepEqual([...TTS_VOICE_IDS], ['Zenith', 'Leo', 'Eve', 'Ara']);
assert.equal(resolveTtsVoice(''), 'Zenith');
assert.equal(resolveTtsVoice(null), 'Zenith');
assert.equal(resolveTtsVoice('not-a-voice'), 'Zenith');
assert.equal(resolveTtsVoice('eve'), 'Eve');
assert.equal(resolveTtsVoice('Leo'), 'Leo');
assert.equal(resolveTtsVoice('Ara'), 'Ara');

const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
assert.match(server, /resolveTtsVoice/);
assert.match(server, /falling back to \$\{DEFAULT_TTS_VOICE\}/);
assert.equal(/voice:\s*"Eve"/.test(server), false);
assert.equal(/voice_id:\s*"Eve"/.test(server), false);

const playback = fs.readFileSync(path.join(root, 'src/lib/ttsPlayback.ts'), 'utf8');
assert.match(playback, /voice: voice \|\| getTtsVoiceForRequest\(\)/);

const chat = fs.readFileSync(path.join(root, 'src/components/ide/AIChat.tsx'), 'utf8');
assert.match(chat, /TtsVoicePicker/);
assert.match(chat, /voice: getTtsVoiceForRequest\(\)/);

console.log('\n✓ tts voice resolve + wiring passed\n');
