/**
 * Freeze contract: Go/apply must not await unbounded HTTP after files land.
 * Repro: chat stuck on "Runnable skeleton filled" / "Writing files to cloud workspace".
 * Run: npx tsx scripts/test-coding-freeze-contract.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expireStaleGoCodePending,
  readGoCodePending,
  writeGoCodePending,
} from '../lib/nebulaGoCodePending.ts';
import { goCodePendingToPollResponse } from '../lib/nebulaGoCodeJob.ts';

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
assert.match(pipeline, /GO_POLL_MAX_WAIT_MS = 180_000/, 'Go generation poll must hard-stop at 3 minutes');
assert.match(pipeline, /GO_CONSUME_TIMEOUT_MS/, 'consume ack must time out');
assert.match(pollFn, /GO_POLL_TIMEOUT_MESSAGE/);
assert.match(pollFn, /onProgress\?\.\(GO_POLL_TIMEOUT_MESSAGE, 'error'\)/);
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
assert.match(goFn, /if \(data\.error && !data\.choices\?\.length\)/);
assert.equal(
  /if \(data\.error && !data\.summarySaved/.test(goFn),
  false,
  'Go timeout/error must fail even when pre-coding summary was saved',
);
{
  const codeErrBlock = goFn.slice(
    goFn.indexOf('if (data.codeError && !codeText)'),
    goFn.indexOf('if (!codeText)'),
  );
  assert.match(codeErrBlock, /ok:\s*false/);
  assert.equal(
    /ok:\s*Boolean\(data\.summarySaved\)/.test(codeErrBlock),
    false,
    'codeError with no files must not count as Go success',
  );
}
assert.match(
  goFn,
  /afterFilesAppliedArtifacts/,
  'Go success must refresh mind map / Plan (not skip client events)',
);
assert.match(pipeline, /APPLY_GENERATED_TIMEOUT_MS = 12_000/);
assert.match(applyFn, /Promise\.race/);
assert.match(applyFn, /confirmAppliedPathsOnDisk|source-control\/overview/);
assert.match(applyFn, /Apply finished —|already on disk/);
assert.match(applyFn, /files were not confirmed on disk/i);
assert.equal(
  /Still writing files to the workspace — waiting for apply to finish/.test(chat),
  false,
  'apply-in-flight stall must not extend writing… forever',
);

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

{
  const job = fs.readFileSync(path.join(root, 'lib/nebulaGoCodeJob.ts'), 'utf8');
  const pending = fs.readFileSync(path.join(root, 'lib/nebulaGoCodePending.ts'), 'utf8');
  assert.match(pending, /GO_CODE_JOB_TIMEOUT_MS = 180_000/);
  assert.match(job, /GO_CODE_JOB_TIMEOUT_MS/);
  assert.equal(/GO_CODE_JOB_TIMEOUT_MS = 600_000/.test(job), false);
  assert.equal(/GO_MAX_POLLS = 90/.test(pipeline), false);
}

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-code-expire-'));
  writeGoCodePending(tmp, {
    status: 'running',
    startedAt: Date.now() - 181_000,
    preCodingSummary: 'SLICE: Primary',
  });
  expireStaleGoCodePending(tmp, { jobActive: true });
  const after = readGoCodePending(tmp);
  assert.equal(after?.status, 'error');
  assert.match(String(after?.codeError || ''), /timed out after 3 minutes/i);

  const errTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-code-poll-err-'));
  writeGoCodePending(errTmp, {
    status: 'error',
    startedAt: Date.now() - 30_000,
    preCodingSummary: 'saved',
    codeError: 'xAI failed',
  });
  const pollErr = goCodePendingToPollResponse(readGoCodePending(errTmp), true, errTmp);
  assert.equal(pollErr.pending, false);
  assert.equal(pollErr.coding, undefined);
  assert.equal(pollErr.codeError, 'xAI failed');
}

console.log('\n✓ coding freeze contract passed\n');
