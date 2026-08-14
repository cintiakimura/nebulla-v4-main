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
} from '../src/lib/fastPrototypeNextSlice.ts';

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

assert.equal(userNoteRequestsNextSlice('continue building'), true);
assert.equal(userNoteRequestsNextSlice('keep building the app'), true);
assert.equal(userNoteRequestsNextSlice('next slice'), true);
assert.equal(userNoteRequestsNextSlice('build next'), true);
assert.equal(userNoteRequestsNextSlice(FAST_PROTOTYPE_PRIMARY_SLICE_INSTRUCTION), true);
assert.equal(userNoteRequestsNextSlice('go'), false);
assert.equal(userNoteRequestsNextSlice('start coding'), false);
assert.equal(userNoteRequestsNextSlice(''), false);

{
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const chat = fs.readFileSync(path.join(root, 'src/components/ide/AIChat.tsx'), 'utf8');
  assert.match(
    chat,
    /sendChatRef\.current\('continue building'\)/,
    'Foundation success must queue a new continue-building turn (not nest await Go)',
  );
  const pipeline = fs.readFileSync(path.join(root, 'src/lib/nebulaGrokCodingPipeline.ts'), 'utf8');
  assert.match(
    pipeline,
    /userNoteRequestsNextSlice\(userNote\)/,
    'Go after continue building must request Primary, not rewrite Foundation',
  );
}

console.log('\n✓ fast-prototype next-slice auto-continue passed\n');
