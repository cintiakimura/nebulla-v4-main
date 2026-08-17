/**
 * Fast Prototype: auto primary slice after Foundation (once).
 * Run: npx tsx scripts/test-fast-prototype-next-slice.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  looksLikeFoundationSlice,
  resetFastPrototypePrimaryAutoRunForTests,
  shouldAutoRunPrimarySliceAfterFoundation,
  markFastPrototypePrimaryAutoRun,
  FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION,
  userNoteRequestsNextSlice,
  workspaceHasProductAppRoutes,
  looksLikePostApplyCodingStall,
  looksLikeApplyInFlightStall,
  APPLY_IN_FLIGHT_STALL_MS,
  FOUNDATION_APPLY_STALL_MS,
  nextAutopilotSliceLabel,
  shouldAutopilotAdvance,
  MAX_AUTOPILOT_SLICES,
  buildAutopilotSliceInstruction,
} from '../src/lib/fastPrototypeNextSlice.ts';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  resolveActiveProjectIds,
  setBrowserProjectKey,
  setBrowserProjectName,
} from '../src/lib/nebulaProjectApi.ts';

resetFastPrototypePrimaryAutoRunForTests();

assert.equal(looksLikeFoundationSlice('Foundation'), true);
assert.equal(looksLikeFoundationSlice('Primary'), false);
assert.equal(looksLikeFoundationSlice(null), true);

assert.equal(
  shouldAutoRunPrimarySliceAfterFoundation({
    fastPrototypeTurn: true,
    codingOk: true,
    projectKey: 'p1',
    sliceLabel: 'Foundation',
  }),
  false,
  'same-session autopilot is off — Foundation must not auto-start Primary',
);

markFastPrototypePrimaryAutoRun('p1');
assert.equal(
  shouldAutoRunPrimarySliceAfterFoundation({
    fastPrototypeTurn: true,
    codingOk: true,
    projectKey: 'p1',
    sliceLabel: 'Foundation',
  }),
  false,
  'second auto must not loop',
);

assert.equal(
  shouldAutoRunPrimarySliceAfterFoundation({
    fastPrototypeTurn: false,
    codingOk: true,
    projectKey: 'p2',
    sliceLabel: 'Foundation',
  }),
  false,
);

assert.equal(
  shouldAutoRunPrimarySliceAfterFoundation({
    fastPrototypeTurn: true,
    codingOk: true,
    projectKey: 'p3',
    sliceLabel: 'Primary',
  }),
  false,
);

// First Go often returns Auth for shell+login — still do not auto Primary in the same wait.
assert.equal(
  shouldAutoRunPrimarySliceAfterFoundation({
    fastPrototypeTurn: true,
    codingOk: true,
    projectKey: 'p-auth',
    sliceLabel: 'Auth',
  }),
  false,
);

assert.match(FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION, /SLICE: Primary/);
assert.match(FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION, /do NOT rewrite it/i);

assert.equal(nextAutopilotSliceLabel('Foundation'), 'Primary');
assert.equal(nextAutopilotSliceLabel('Auth'), 'Primary');
assert.equal(nextAutopilotSliceLabel('Primary'), 'Secondary');
assert.equal(nextAutopilotSliceLabel('Secondary'), 'Polish');

{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Foundation',
    autoCount: 0,
    autopilotKickoff: true,
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'session_complete');
  assert.match(d.message, /not started automatically/i);
}
{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Polish',
    autoCount: 1,
    autopilotKickoff: true,
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'session_complete');
}
{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Primary',
    autoCount: MAX_AUTOPILOT_SLICES,
    autopilotKickoff: true,
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'session_complete');
}
{
  const d = shouldAutopilotAdvance({
    codingOk: false,
    lastSlice: 'Foundation',
    autoCount: 0,
    autopilotKickoff: true,
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'failed');
}
{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Secondary',
    autoCount: 0,
    autopilotKickoff: true,
    productRouteCount: 2,
  });
  assert.equal(d.advance, false);
  assert.equal(d.nextLabel, null);
}
assert.match(buildAutopilotSliceInstruction('Secondary'), /SLICE: Secondary/);

assert.equal(userNoteRequestsNextSlice('continue building'), true);
assert.equal(userNoteRequestsNextSlice('keep building the app'), true);
assert.equal(userNoteRequestsNextSlice('next slice'), true);
assert.equal(userNoteRequestsNextSlice('build next'), true);
assert.equal(userNoteRequestsNextSlice(FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION), true);
assert.equal(userNoteRequestsNextSlice('go'), false);
assert.equal(userNoteRequestsNextSlice('start coding'), false);
assert.equal(userNoteRequestsNextSlice(''), false);
assert.equal(
  userNoteRequestsNextSlice(
    'START_CODING — continue building.\nStop after this slice. Do not auto-start the next slice.',
  ),
  true,
);

assert.equal(
  workspaceHasProductAppRoutes(['index.html', 'postcss.config.js', 'tailwind.config.ts', 'README.md']),
  false,
);
assert.equal(workspaceHasProductAppRoutes(['app/page.tsx', 'app/layout.tsx']), false);
assert.equal(workspaceHasProductAppRoutes(['app/teacher/page.tsx', 'app/layout.tsx']), true);

assert.equal(looksLikePostApplyCodingStall('Runnable skeleton filled: next-env.d.ts'), true);
assert.equal(looksLikePostApplyCodingStall('Wrote 14 file(s) to workspace'), false);
assert.equal(looksLikePostApplyCodingStall('Writing files to cloud workspace'), false);
assert.equal(looksLikeApplyInFlightStall('Writing files to cloud workspace'), true);
assert.equal(looksLikeApplyInFlightStall('Applying 3 file(s) to workspace'), true);
assert.equal(looksLikeApplyInFlightStall('Wrote 14 file(s) to workspace'), false);
assert.ok(FOUNDATION_APPLY_STALL_MS >= 3000 && FOUNDATION_APPLY_STALL_MS <= 8000);
assert.equal(APPLY_IN_FLIGHT_STALL_MS, 15_000);

{
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const chat = fs.readFileSync(path.join(root, 'src/components/ide/AIChat.tsx'), 'utf8');
  assert.equal(
    /Starting Primary slice automatically/.test(chat),
    false,
    'same wait must not auto-start Primary',
  );
  assert.equal(
    /queueAutopilotAfterUnlock = true/.test(chat),
    false,
    'sendChat must not queue a same-session autopilot Go',
  );
  assert.equal(
    /sendChatRef\.current\('continue building'\)/.test(chat),
    false,
    'must not inject a continue-building chat turn',
  );
  assert.match(chat, /workspaceHasProductAppRoutes/);
  assert.match(
    chat,
    /Explicit coding request — skipping Grok chat, starting coding/,
    'START_CODING / continue building must not spend the heavy job on a confirm chat',
  );
  assert.match(
    chat,
    /else if \(userForcedCoding \|\| assistantCodingPromise\)/,
    'explicit coding must defer mockup instead of regenerating UI Gen',
  );
  const pipeline = fs.readFileSync(path.join(root, 'src/lib/nebulaGrokCodingPipeline.ts'), 'utf8');
  assert.match(
    pipeline,
    /userNoteRequestsNextSlice\(userNote\)/,
    'explicit Continue may request Primary, not rewrite Foundation',
  );
  assert.match(pipeline, /shouldRunGoCodeSecondPass/);
  assert.match(pipeline, /clearCodingLocks/);
  const applyFn = pipeline.slice(pipeline.indexOf('export async function applyGeneratedFiles'));
  assert.match(
    applyFn,
    /window\.setTimeout/,
    'post-apply preview events must be deferred so they cannot stall coding',
  );
  assert.match(applyFn, /dispatchStudioShowLiveApp/);

  const stallBlock = chat.slice(
    chat.indexOf('Foundation apply used to freeze'),
    chat.indexOf('Detect natural language project creation'),
  );
  assert.match(chat, /if \(!FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT\)/);
  assert.equal(
    /scheduleAutopilotHandoff\(\)/.test(stallBlock),
    false,
    'post-apply stall must not start Primary in the same wait',
  );
  assert.match(stallBlock, /looksLikeApplyInFlightStall/);
  assert.match(stallBlock, /APPLY_IN_FLIGHT_STALL_MS/);
  assert.match(stallBlock, /Apply wait timed out/);
  assert.match(stallBlock, /Coding complete/);
  assert.equal(
    /Still writing files/.test(stallBlock),
    false,
    'apply-in-flight recovery must not wait forever',
  );
  assert.equal(
    /sendChatRef\.current\(/.test(stallBlock),
    false,
    'stall recovery must not send a chat message',
  );
  assert.equal(
    /auto-starting the next slice/.test(stallBlock),
    false,
  );

  assert.equal(
    /diskProjectKey\s*\|\|\s*getBrowserProjectName\(\)/.test(chat),
    false,
    'workspace key must not fall back to display name',
  );
  assert.equal(
    /ackConsumedGoCodeResult\(getBrowserProjectName\(\)/.test(chat),
    false,
    'ack must not use a mixed display-name / projectKey fallback',
  );
  assert.match(chat, /abortGoCodeWait\(projectName\)/);
}

{
  const prevKey = getBrowserProjectKey();
  const prevName = getBrowserProjectName();
  try {
    setBrowserProjectKey('23e6c2fd-1802-493f-9973-7bf0cd0c93dc');
    setBrowserProjectName('children aged 710 to practice');
    const same = resolveActiveProjectIds('23e6c2fd-1802-493f-9973-7bf0cd0c93dc');
    assert.equal(same.projectKey, '23e6c2fd-1802-493f-9973-7bf0cd0c93dc');
    assert.equal(same.projectName, 'children aged 710 to practice');
    assert.notEqual(same.projectKey, same.projectName);

    const noDisk = resolveActiveProjectIds('');
    assert.equal(
      noDisk.projectKey,
      '23e6c2fd-1802-493f-9973-7bf0cd0c93dc',
      'empty disk key must fall back to browser projectKey, not display name',
    );
    assert.equal(noDisk.projectName, 'children aged 710 to practice');

    const otherDisk = resolveActiveProjectIds('disk-workspace-key');
    assert.equal(otherDisk.projectKey, 'disk-workspace-key');
    assert.equal(otherDisk.projectName, 'children aged 710 to practice');
  } finally {
    setBrowserProjectKey(prevKey);
    setBrowserProjectName(prevName);
  }
}

console.log('\n✓ fast-prototype next-slice auto-continue passed\n');
