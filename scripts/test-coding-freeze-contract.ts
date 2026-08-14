/**
 * Freeze contract: Go/apply must not await unbounded HTTP after files land.
 * Repro: chat stuck on "Runnable skeleton filled" / "Writing files to cloud workspace".
 * Run: npx tsx scripts/test-coding-freeze-contract.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pipeline = fs.readFileSync(path.join(root, 'src/lib/nebulaGrokCodingPipeline.ts'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'src/components/ide/AIChat.tsx'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const applyFn = pipeline.slice(pipeline.indexOf('export async function applyGeneratedFiles'));
const goFn = pipeline.slice(pipeline.indexOf('export async function runGoCodeAndApply'));
const pollFn = pipeline.slice(
  pipeline.indexOf('async function pollGoCodeUntilDoneInner'),
  pipeline.indexOf('async function kickGoCodeJob'),
);

assert.match(pipeline, /APPLY_GENERATED_TIMEOUT_MS/, 'apply-generated fetch must time out');
assert.match(pipeline, /GO_POLL_FETCH_TIMEOUT_MS/, 'each Go poll HTTP call must time out');
assert.match(pipeline, /GO_CONSUME_TIMEOUT_MS/, 'consume ack must time out');
const ackFn = pipeline.slice(
  pipeline.indexOf('export function ackConsumedGoCodeResult'),
  pipeline.indexOf('export function hasGrokFileBlocks'),
);
assert.match(ackFn, /abortAfter\(GO_CONSUME_TIMEOUT_MS\)/);
assert.match(ackFn, /consumeTimed\.cancel\(\)/);
assert.equal(
  /window\.clearTimeout/.test(ackFn),
  false,
  'consume ack finally must not touch window without a guard (Node / non-browser)',
);
assert.match(applyFn, /applyTimed\.signal|signal: applyTimed/);
assert.match(pollFn, /pollTimed\.signal|signal: pollTimed/);

assert.equal(
  /await fetch\(withProjectQuery\('\/api\/grok\/go-code\/poll'\)/.test(goFn),
  false,
  'runGoCodeAndApply must not await consume poll (hangs on Runnable skeleton filled)',
);
assert.match(goFn, /ackConsumedGoCodeResult/);
assert.match(
  goFn,
  /afterFilesAppliedArtifacts/,
  'Go success must refresh mind map / Plan (not skip client events)',
);
assert.match(pipeline, /APPLY_GENERATED_TIMEOUT_MS = 12_000/);

assert.match(
  applyFn,
  /window\.setTimeout/,
  'nebula-files-applied must be deferred — sync preview/tree refresh stalls coding',
);
const interactiveBlock = applyFn.slice(
  applyFn.indexOf('if (apply.interactivePreview)'),
  applyFn.indexOf('if (apply.baasSkippedReason)'),
);
assert.equal(
  /dispatchEvent/.test(interactiveBlock),
  false,
  'interactivePreview must not dispatch preview events on the coding stack',
);

assert.match(chat, /looksLikePostApplyCodingStall/);
assert.match(chat, /looksLikeApplyInFlightStall/);
assert.match(chat, /runAutoNextSliceRef\.current\(\)/);
assert.equal(
  /sendChatRef\.current\('continue building'\)/.test(chat),
  false,
  'skeleton recovery must auto-run next Go, not wait for a chat message',
);
assert.match(chat, /autopilotHandoffScheduledRef/);
assert.match(chat, /scheduleAutopilotHandoff\(\)/);
assert.equal(
  /diskProjectKey\s*\|\|\s*getBrowserProjectName\(\)/.test(chat),
  false,
  'stall recovery must not mix workspace key with display name',
);

const applyRoute = server.slice(server.indexOf('app.post("/api/files/apply-generated"'));
assert.match(applyRoute, /res\.json\(/);
assert.match(
  applyRoute,
  /setTimeout\(/,
  'post-apply mind-map hydrate must not run on the apply request stack',
);
assert.equal(
  /setImmediate\(/.test(applyRoute.slice(0, applyRoute.indexOf('app.get("/api/workspace/runnable-status"') || applyRoute.length)),
  false,
  'apply-generated must yield before hydrate so poll/consume can be served',
);

const ide = fs.readFileSync(path.join(root, 'src/components/ide/NebullaIDE.tsx'), 'utf8');
assert.match(
  ide,
  /addEventListener\('nebula-open-mind-map'/,
  'shell must open Plan when coding asks for the mind map',
);

const figma = fs.readFileSync(
  path.join(root, 'lib/uiGenerationEngine/v2/figmaReferences.ts'),
  'utf8',
);
assert.match(figma, /controller\.abort\(\), 4000\)/, 'live Figma fetch must time out (non-blocking)');

console.log('\n✓ coding freeze contract passed\n');
