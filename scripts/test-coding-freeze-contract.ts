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
import {
  isApplyTransportFailure,
  shouldSkipGoCodeSecondPassAfterApply,
} from '../src/lib/applyTransportFailure.ts';
import { grokActivityStripVisible } from '../src/lib/nebulaGrokActivityBus.ts';

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
assert.equal(
  /generating all files in one pass/.test(pipeline),
  false,
  'Go wait copy must not say generating all files in one pass',
);
assert.equal(
  /Grok Code running on server/.test(pipeline),
  false,
  'must not label Grok Code running until poll.coding is true',
);
assert.match(pipeline, /Code pass 1|GO_CODE_PASS1_LABEL/);
assert.match(pipeline, /GO_CONSUME_TIMEOUT_MS/, 'consume ack must time out');
assert.match(pollFn, /GO_POLL_TIMEOUT_MESSAGE/);
assert.match(pollFn, /onProgress\?\.\(formatBlockedReasonLine\(timedOut\), 'error'\)/);
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
assert.match(applyFn, /signal: applyAbort\.signal/);
assert.match(applyFn, /applyAbortByProject/);
assert.match(pollFn, /pollTimed\.signal|signal: pollTimed/);
assert.match(goFn, /isGoSessionAborted\(projectName\)/);

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
assert.match(chat, /APPLY_IN_FLIGHT_STALL_MS/);
assert.match(chat, /checking disk \(not stopping coding\)/);
assert.match(chat, /abortApplyWait\(projectName\)/);
assert.equal(
  /sendChatRef\.current\('continue building'\)/.test(chat),
  false,
  'stall recovery must not wait for a chat message',
);
assert.equal(
  /scheduleAutopilotHandoff\(\)/.test(chat),
  false,
  'same wait must not hand off into Primary autopilot',
);
assert.match(chat, /abortGoCodeWait\(projectName\)/);
assert.match(chat, /publishGrokActivity/);
assert.match(chat, /holdCodingFailure/);
assert.match(chat, /errorGrokActivity/);
assert.match(chat, /finishGrokActivityWithProblems/);
assert.equal(
  /if \(coding\.ok === false\) \{\s*resetCodingActivity\(\)/.test(chat),
  false,
  'Go/coding failure must keep the error on the status strip — not idle-wipe',
);
assert.match(
  fs.readFileSync(path.join(root, 'src/components/ide/NebullaIDE.tsx'), 'utf8'),
  /ShellGrokActivityStrip/,
);
assert.match(
  fs.readFileSync(path.join(root, 'src/components/ide/shell/ShellGrokActivityStrip.tsx'), 'utf8'),
  /IdeGrokActivityPanel/,
);
assert.equal(
  /IdeGrokActivityPanel/.test(chat),
  false,
  'chat-only activity panel hid coding status on Code/Plan',
);
assert.match(chat, /ChatGrokStatusPane/);
{
  const pane = fs.readFileSync(path.join(root, 'src/components/ide/ChatGrokStatusPane.tsx'), 'utf8');
  assert.match(pane, /max-h-\[50%\]/);
  assert.match(pane, /chat-grok-status-pane/);
}
{
  const codeScreen = fs.readFileSync(path.join(root, 'src/components/ide/shell/CodeScreen.tsx'), 'utf8');
  assert.match(codeScreen, /TerminalPanel/);
  assert.match(codeScreen, /code-terminal-dock/);
  const term = fs.readFileSync(path.join(root, 'src/components/ide/TerminalPanel.tsx'), 'utf8');
  assert.match(term, /\/api\/terminal\/exec/);
  assert.match(term, /onToggleCollapse/);
}
assert.equal(
  /diskProjectKey\s*\|\|\s*getBrowserProjectName\(\)/.test(chat),
  false,
  'stall recovery must not mix workspace key with display name',
);

const applyRoute = server.slice(server.indexOf('app.post("/api/files/apply-generated"'));
assert.match(applyRoute, /res\.json\(/);
assert.match(server, /app\.get\("\/api\/files\/apply-generated"/);
assert.match(server, /METHOD_NOT_ALLOWED/);
assert.match(server, /contentBase64/);
assert.match(pipeline, /buildApplyGeneratedPayload/);
assert.match(pipeline, /shouldSkipGoCodeSecondPassAfterApply/);
assert.match(pipeline, /abortApplyWait/);
assert.match(pipeline, /\/api\/files\/exists/);
assert.match(pipeline, /Files already on disk/);
assert.match(server, /app.post\("\/api\/files\/exists"/);
assert.match(goFn, /Not starting Code pass 2/);
assert.match(applyRoute, /writtenCount: written\.length/);
assert.equal(
  /fetchJson\(withProjectQuery\('\/api\/files\/apply-generated'\)/.test(applyFn),
  false,
  'apply POST must not use a GET-shaped query URL (DevTools opens it as GET 404)',
);
{
  const jsonIdx = applyRoute.indexOf('res.json(');
  const previewIdx = applyRoute.indexOf('ensureInteractiveProductPreview');
  const listUiIdx = applyRoute.indexOf('listProductUiFiles');
  const inspectIdx = applyRoute.indexOf('inspectRunnableSkeleton');
  assert.ok(jsonIdx >= 0, 'apply-generated must res.json');
  assert.ok(
    previewIdx < 0 || previewIdx > jsonIdx,
    'res.json must run before ensureInteractiveProductPreview',
  );
  assert.ok(
    listUiIdx < 0 || listUiIdx > jsonIdx,
    'res.json must run before listProductUiFiles',
  );
  assert.ok(
    inspectIdx < 0 || inspectIdx > jsonIdx,
    'res.json must run before inspectRunnableSkeleton',
  );
}
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

assert.equal(
  isApplyTransportFailure(
    'HTTP 403: host returned HTML instead of JSON (often Cloudflare 403/challenge). The file POST did not land.',
  ),
  true,
);
assert.equal(isApplyTransportFailure('Invalid JSON (502): <html>'), true);
assert.equal(isApplyTransportFailure('No file blocks found'), false);
assert.equal(
  shouldSkipGoCodeSecondPassAfterApply({
    ok: false,
    writtenCount: 0,
    error: 'HTTP 403: host returned HTML instead of JSON',
  }),
  true,
);
assert.equal(
  shouldSkipGoCodeSecondPassAfterApply({
    ok: false,
    writtenCount: 0,
    message: 'Apply timed out after 12s — checking whether files already landed on disk.',
  }),
  true,
);
assert.equal(
  shouldSkipGoCodeSecondPassAfterApply({
    ok: true,
    writtenCount: 11,
    message: 'Applied 11 file(s)',
  }),
  false,
);
assert.equal(
  shouldSkipGoCodeSecondPassAfterApply({
    ok: false,
    writtenCount: 0,
    error: 'No file blocks found',
  }),
  false,
);
assert.match(chat, /if \(!FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT\)/);
assert.match(chat, /isAbortLikeError\(e\) && mpSaved > 0/);
assert.match(chat, /looksLikeApplyInFlightStall\(last\) && goStarted/);
assert.match(chat, /applyStallStartedAtRef/);
assert.match(pipeline, /not starting Code pass 2 \(product files already landed\)/);
assert.match(chat, /Code pass 1 \(waiting for generated files\)/);
assert.equal(
  /holdCodingFailure\(line\).*signal is aborted/.test(chat),
  false,
);
assert.match(
  fs.readFileSync(path.join(root, 'src/lib/apiFetch.ts'), 'utf8'),
  /host returned HTML instead of JSON/,
);

{
  const idle = {
    activity: {
      headline: 'Ready',
      liveLog: [],
      steps: [],
      activeStepIndex: 0,
      tone: 'ready' as const,
    },
  };
  const waiting = { ...idle, activity: { ...idle.activity, tone: 'work' as const, currentAction: 'Code pass 1' } };
  const timedOut = { ...idle, activity: { ...idle.activity, tone: 'error' as const, currentAction: 'Grok Code timed out' } };
  const applying = {
    ...idle,
    activity: {
      ...idle.activity,
      tone: 'ready' as const,
      currentAction: 'Applying 9 file(s) to workspace',
      liveLog: [{ id: '1', at: 1, message: 'Applying 9 file(s) to workspace', kind: 'info' as const }],
    },
  };
  assert.equal(grokActivityStripVisible(null), false);
  assert.equal(grokActivityStripVisible(idle), false);
  assert.equal(grokActivityStripVisible(waiting), true);
  assert.equal(grokActivityStripVisible(timedOut), true);
  assert.equal(grokActivityStripVisible(applying), true);
}

console.log('\n✓ coding freeze contract passed\n');
