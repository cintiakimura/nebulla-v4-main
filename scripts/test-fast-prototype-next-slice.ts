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
  workspaceFoundationLanded,
  countWorkspaceProductRoutes,
  resolveNextContinueSlice,
  policyAFailedMessage,
  policyAStopMessage,
  policyATimeoutMessage,
  FOUNDATION_RETRY_ACTIVITY,
  looksLikePostApplyCodingStall,
  looksLikeApplyInFlightStall,
  APPLY_IN_FLIGHT_STALL_MS,
  FOUNDATION_APPLY_STALL_MS,
  nextAutopilotSliceLabel,
  shouldAutopilotAdvance,
  MAX_AUTOPILOT_SLICES,
  FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT,
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

assert.equal(FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT, false);
assert.equal(
  shouldAutoRunPrimarySliceAfterFoundation({
    fastPrototypeTurn: true,
    codingOk: true,
    projectKey: 'p1',
    sliceLabel: 'Foundation',
  }),
  false,
  'Mode A: Foundation success does not auto-start Primary',
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

assert.equal(
  shouldAutoRunPrimarySliceAfterFoundation({
    fastPrototypeTurn: true,
    codingOk: true,
    projectKey: 'p-auth',
    sliceLabel: 'Auth',
  }),
  false,
  'Mode A: Auth/shell does not auto-start Primary',
);

assert.match(FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION, /SLICE: Primary/);
assert.match(FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION, /do NOT rewrite (it|them)/i);

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
    productRouteCount: 5,
  });
  assert.equal(d.advance, false);
  assert.equal(d.nextLabel, null);
  assert.equal(d.stopReason, 'session_complete');
  assert.match(d.message, /Foundation applied — send Continue for the next slice/i);
}
{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Polish',
    autoCount: 1,
    autopilotKickoff: true,
    productRouteCount: 6,
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'session_complete');
  assert.match(d.message, /Polish applied/i);
}
{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Primary',
    autoCount: MAX_AUTOPILOT_SLICES,
    autopilotKickoff: true,
    productRouteCount: 5,
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
  assert.equal(d.nextLabel, null);
  assert.equal(d.stopReason, 'failed');
  assert.match(d.message, /Foundation did not land/i);
  assert.equal(/Foundation applied/i.test(d.message), false);
  assert.equal(/bypassing/i.test(d.message), false);
}
{
  const d = shouldAutopilotAdvance({
    codingOk: false,
    lastSlice: 'Foundation',
    autoCount: 0,
    autopilotKickoff: true,
    blockedCode: 'RESEARCH_INCOMPLETE',
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'failed');
  assert.match(d.message, /research not complete/i);
  assert.equal(/Send Go to retry/i.test(d.message), false);
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
  assert.equal(d.stopReason, 'failed');
  assert.match(d.message, /Foundation did not land/i);
  assert.equal(/send Continue for the next slice/i.test(d.message), false);
}
{
  const d = shouldAutopilotAdvance({
    codingOk: true,
    lastSlice: 'Foundation',
    autoCount: 0,
    autopilotKickoff: true,
    productRouteCount: 0,
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'failed');
  assert.equal(d.message, FOUNDATION_RETRY_ACTIVITY);
}
{
  const d = shouldAutopilotAdvance({
    codingOk: false,
    lastSlice: 'Primary',
    autoCount: 0,
    autopilotKickoff: true,
    productRouteCount: 0,
    productRoutesOnDisk: true,
    blockedCode: 'GO_TIMEOUT',
  });
  assert.equal(d.advance, false);
  assert.equal(d.stopReason, 'failed');
  assert.match(d.message, /GO_TIMEOUT/);
  assert.match(d.message, /Primary did not land/);
  assert.match(d.message, /Foundation is already on disk/);
  assert.equal(/Retry Go for Foundation — not Continue for Primary/i.test(d.message), false);
}
{
  const d = shouldAutopilotAdvance({
    codingOk: false,
    lastSlice: 'Primary',
    autoCount: 0,
    autopilotKickoff: true,
    productRouteCount: 0,
    productRoutesOnDisk: false,
    blockedCode: 'GO_TIMEOUT',
  });
  assert.match(d.message, /Foundation did not land/);
  assert.match(d.message, /GO_TIMEOUT/);
}
assert.match(policyATimeoutMessage('Primary', true), /Primary did not land/);
assert.equal(
  resolveNextContinueSlice({ productRoutesOnDisk: false, lastSlice: 'Primary' }),
  'Foundation',
);
assert.equal(
  resolveNextContinueSlice({ productRoutesOnDisk: false }),
  'Foundation',
);
assert.equal(
  resolveNextContinueSlice({ productRoutesOnDisk: true, lastSlice: 'Foundation' }),
  'Primary',
);
assert.equal(
  resolveNextContinueSlice({ productRoutesOnDisk: true, lastSlice: 'Primary' }),
  'Secondary',
);
assert.match(policyAFailedMessage('Foundation'), /Retry Go for Foundation/);
assert.match(policyAStopMessage('Foundation'), /Foundation applied — send Continue/);
assert.equal(countWorkspaceProductRoutes(['app/teacher/page.tsx']), 1);
assert.equal(workspaceFoundationLanded(['app/teacher/page.tsx']), false);
assert.equal(
  workspaceFoundationLanded(['app/a/page.tsx', 'app/b/page.tsx', 'app/c/page.tsx']),
  true,
);
{
  const firstGo = [
    'package.json',
    'app/globals.css',
    'app/layout.tsx',
    'app/page.tsx',
    'app/teacher/dashboard/page.tsx',
    'app/parent/dashboard/page.tsx',
  ];
  assert.equal(countWorkspaceProductRoutes(firstGo), 3);
  assert.equal(workspaceFoundationLanded(firstGo), true);
  assert.equal(
    resolveNextContinueSlice({ productRoutesOnDisk: workspaceFoundationLanded(firstGo), lastSlice: 'Foundation' }),
    'Primary',
  );
}
assert.equal(
  workspaceFoundationLanded(['app/teacher/dashboard/page.tsx', 'app/parent/dashboard/page.tsx'], {
    lastSlice: 'Foundation',
  }),
  true,
  'persisted Foundation + nested routes must not redo Foundation on Continue',
);
assert.equal(
  workspaceFoundationLanded([], { lastSlice: 'Foundation' }),
  true,
  'stale empty explorer must not redo Foundation after a slice was persisted',
);
assert.equal(workspaceFoundationLanded([]), false);
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
assert.equal(
  workspaceHasProductAppRoutes([
    'app/layout.tsx',
    'src/screens/KidHomeScreen.tsx',
    'src/screens/TeacherDashboardScreen.tsx',
  ]),
  true,
);

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
  assert.match(chat, /foundationLandedOnDisk/);
  assert.match(chat, /\/api\/source-control\/overview/);
  assert.match(chat, /stale empty explorer|diskPaths/);
  assert.match(chat, /FOUNDATION_RETRY_ACTIVITY/);
  assert.match(chat, /productRoutesOnDisk: foundationOnDisk/);
  assert.match(chat, /Retry research/);
  assert.match(chat, /fetchResearchStatus\(projectName\)/);
  assert.match(
    chat,
    /messagesRef\.current\.length > 0\) return/,
    'refresh must not redo Fast Prototype when chat history already exists',
  );
  assert.match(
    chat,
    /Research \+ mockup already done — coding the next slice/,
    'Continue must not re-run Web Search / UI Gen',
  );
  assert.match(chat, /resolveNextContinueSlice/);
  assert.match(chat, /persistLastAppliedSlice/);
  assert.match(
    chat,
    /skipping Grok chat; research next \(not coding yet\)/,
    'retry / go must skip Grok chat but must not claim coding started before Gate R',
  );
  assert.match(
    chat,
    /No usable Master Plan goal yet — drafting the plan first/,
    'empty §1 must not skip Grok chat or hang on mockup waiting',
  );
  assert.match(
    chat,
    /Master Plan already on disk — skipping Grok chat/,
    'retry / go / build must not spend 90s on Grok chat when the plan is already saved',
  );
  assert.match(chat, /buildMode\)/);
  assert.match(chat, /Grok chat timed out after 90s — Master Plan is saved/);
  assert.match(
    chat,
    /persistedMockup &&/,
    'skip pre-code mockup only when a loadable mockup is already on disk',
  );
  assert.match(
    chat,
    /alreadyHasProduct &&[\s\S]*!fastPrototypeTurn/,
    'leftover app routes must not skip UI Gen on the first Fast Prototype turn',
  );
  assert.match(
    chat,
    /UI mockup already on disk — mockup deferred — coding Foundation/,
  );
  assert.equal(
    /UI mockup timed out — mockup deferred — coding Foundation/.test(chat),
    false,
    '45s UI abandon must not start Code pass 1',
  );
  const pipeline = fs.readFileSync(path.join(root, 'src/lib/nebulaGrokCodingPipeline.ts'), 'utf8');
  assert.match(
    pipeline,
    /userNoteRequestsNextSlice\(userNote\)/,
    'explicit Continue may request Primary, not rewrite Foundation',
  );
  assert.equal(
    /productRoutesOnDisk:\s*true/.test(pipeline),
    false,
    'Continue must not assume product routes exist',
  );
  assert.match(pipeline, /fetchResearchStatus/);
  assert.match(pipeline, /FOUNDATION_RETRY_ACTIVITY/);
  assert.match(pipeline, /goBlocked\('NO_FILE_BLOCKS'\)/);
  assert.match(pipeline, /goBlocked\('APPLY_FAILED'\)/);
  assert.match(pipeline, /shouldRunGoCodeSecondPass/);
  assert.match(pipeline, /clearCodingLocks/);
  const applyFn = pipeline.slice(pipeline.indexOf('export async function applyGeneratedFiles'));
  assert.match(
    applyFn,
    /window\.setTimeout/,
    'post-apply preview events must be deferred so they cannot stall coding',
  );
  assert.match(applyFn, /dispatchStudioShowLiveApp/);
  const handoff = pipeline.slice(pipeline.indexOf('export async function handlePostGrokCodingTurn'));
  assert.match(
    handoff,
    /launchGoAfterThinHandoff/,
    'index.html-only chat handoff must launch Foundation Go, not APPLY_EMPTY_PRODUCT stop',
  );
  assert.match(handoff, /Chat handoff was not a product shell — launching Foundation Go/);
  assert.equal(
    /ok: exit\.ok/.test(handoff.slice(0, 1800)),
    false,
    'thin chat apply must not return APPLY_EMPTY_PRODUCT as the coding result',
  );

  const stallBlock = chat.slice(
    chat.indexOf('Foundation apply used to freeze'),
    chat.indexOf('Detect natural language project creation'),
  );
assert.equal(FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT, false);
assert.match(
  fs.readFileSync(path.join(root, 'src/lib/fastPrototypeNextSlice.ts'), 'utf8'),
  /FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT = false/,
  'Mode A: autopilot stays off',
);
assert.match(chat, /if \(!FAST_PROTOTYPE_SAME_SESSION_AUTOPILOT\)/);
assert.match(chat, /policyAStopMessage/);
assert.match(chat, /codingOk: coding.ok !== false && wroteFiles/);
assert.equal(
  /foundationGate = \{ ok: true, reason: 'explicit_skip' \}/.test(chat),
  false,
  'blocked Gate R/mockup must not force Foundation',
);
assert.equal(/continuing Foundation anyway/.test(chat), false);
  assert.equal(
    /scheduleAutopilotHandoff\(\)/.test(stallBlock),
    false,
    'post-apply stall must not start Primary in the same wait',
  );
  assert.match(stallBlock, /looksLikeApplyInFlightStall/);
  assert.match(stallBlock, /APPLY_IN_FLIGHT_STALL_MS/);
  assert.match(stallBlock, /checking disk \(not stopping coding\)/);
  assert.match(stallBlock, /abortApplyWait\(projectName\)/);
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
