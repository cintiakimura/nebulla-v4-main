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
  looksLikePostApplyCodingStall,
  looksLikeApplyInFlightStall,
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
  true,
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

// First Go often returns Auth for shell+login — still auto Primary once.
assert.equal(
  shouldAutoRunPrimarySliceAfterFoundation({
    fastPrototypeTurn: true,
    codingOk: true,
    projectKey: 'p-auth',
    sliceLabel: 'Auth',
  }),
  true,
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
  assert.equal(d.advance, true);
  assert.equal(d.nextLabel, 'Primary');
}
{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Polish',
    autoCount: 1,
    autopilotKickoff: true,
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'done');
}
{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Primary',
    autoCount: MAX_AUTOPILOT_SLICES,
    autopilotKickoff: true,
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'cap');
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
  assert.equal(d.advance, true);
  assert.equal(d.nextLabel, 'Primary');
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

assert.equal(looksLikePostApplyCodingStall('Runnable skeleton filled: next-env.d.ts'), true);
assert.equal(looksLikePostApplyCodingStall('Wrote 14 file(s) to workspace'), false);
assert.equal(looksLikePostApplyCodingStall('Writing files to cloud workspace'), false);
assert.equal(looksLikeApplyInFlightStall('Writing files to cloud workspace'), true);
assert.equal(looksLikeApplyInFlightStall('Applying 3 file(s) to workspace'), true);
assert.equal(looksLikeApplyInFlightStall('Wrote 14 file(s) to workspace'), false);
assert.ok(FOUNDATION_APPLY_STALL_MS >= 3000 && FOUNDATION_APPLY_STALL_MS <= 8000);

{
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const chat = fs.readFileSync(path.join(root, 'src/components/ide/AIChat.tsx'), 'utf8');
  assert.match(
    chat,
    /runAutoNextSliceRef\.current\(\)/,
    'Foundation success must schedule runGoCodeAndApply via autopilot (no user continue-building message)',
  );
  assert.equal(
    /sendChatRef\.current\('continue building'\)/.test(chat),
    false,
    'autopilot must not wait for a continue-building chat turn',
  );
  assert.match(
    chat,
    /looksLikePostApplyCodingStall/,
    'chat must recover when activity freezes on Runnable skeleton filled',
  );
  const pipeline = fs.readFileSync(path.join(root, 'src/lib/nebulaGrokCodingPipeline.ts'), 'utf8');
  assert.match(
    pipeline,
    /userNoteRequestsNextSlice\(userNote\)/,
    'Go after continue building must request Primary, not rewrite Foundation',
  );
  const applyFn = pipeline.slice(pipeline.indexOf('export async function applyGeneratedFiles'));
  assert.match(
    applyFn,
    /window\.setTimeout/,
    'post-apply preview events must be deferred so they cannot stall coding',
  );

  assert.match(
    chat,
    /autopilotHandoffScheduledRef/,
    'stall recovery and sendChat finally must share a single handoff latch',
  );
  const handoffFn = chat.slice(
    chat.indexOf('const scheduleAutopilotHandoff = useCallback'),
    chat.indexOf('/** Manual V0 watch only'),
  );
  assert.match(
    handoffFn,
    /if \(autopilotHandoffScheduledRef\.current\) return/,
    'handoff latch must no-op if already scheduled',
  );
  assert.match(handoffFn, /autopilotHandoffScheduledRef\.current = true/);
  assert.match(
    handoffFn,
    /resolveActiveProjectIds\(diskProjectKey\)/,
    'ack must use resolved ids, not mixed name/key fallbacks',
  );
  assert.match(handoffFn, /ackConsumedGoCodeResult\(projectName\)/);
  assert.equal(
    /getBrowserProjectName\(\)\s*\|\|/.test(handoffFn),
    false,
    'handoff must not ack with getBrowserProjectName() || projectKey',
  );

  const stallBlock = chat.slice(
    chat.indexOf('Foundation apply used to freeze'),
    chat.indexOf('Detect natural language project creation'),
  );
  assert.match(stallBlock, /scheduleAutopilotHandoff\(\)/);
  assert.match(
    stallBlock,
    /autoSliceInFlightRef\.current/,
    'post-apply stall must not start another Go while apply/autopilot is in flight',
  );
  assert.match(stallBlock, /looksLikeApplyInFlightStall/);
  assert.equal(
    /sendChatRef\.current\(/.test(stallBlock),
    false,
    'stall recovery must not send a chat message',
  );

  const autoFn = chat.slice(
    chat.indexOf('const runAutoNextSlice = useCallback'),
    chat.indexOf('runAutoNextSliceRef.current = runAutoNextSlice'),
  );
  assert.match(
    autoFn,
    /setAssistantInteractionMode\('agent'\)/,
    'autopilot Go must switch Chat → Agent without a tap',
  );

  const finallyIdx = chat.lastIndexOf('if (queueAutopilotAfterUnlock)');
  assert.ok(finallyIdx > 0, 'sendChat finally must queue autopilot after unlock');
  const finallyBlock = chat.slice(finallyIdx, finallyIdx + 350);
  assert.match(finallyBlock, /scheduleAutopilotHandoff\(\)/);
  assert.equal(/sendChatRef\.current\(/.test(finallyBlock), false);
  assert.equal(
    /continue building/.test(finallyBlock),
    false,
    'sendChat finally must not queue continue building (duplicate with stall recovery)',
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
