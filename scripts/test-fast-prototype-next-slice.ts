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
  FOUNDATION_APPLY_STALL_MS,
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

assert.equal(looksLikePostApplyCodingStall('Runnable skeleton filled: next-env.d.ts'), true);
assert.equal(looksLikePostApplyCodingStall('Wrote 14 file(s) to workspace'), false);
assert.ok(FOUNDATION_APPLY_STALL_MS >= 3000 && FOUNDATION_APPLY_STALL_MS <= 8000);

{
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const chat = fs.readFileSync(path.join(root, 'src/components/ide/AIChat.tsx'), 'utf8');
  assert.match(
    chat,
    /sendChatRef\.current\('continue building'\)/,
    'Foundation success must queue a new continue-building turn (not nest await Go)',
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
}

console.log('\n✓ fast-prototype next-slice auto-continue passed\n');
