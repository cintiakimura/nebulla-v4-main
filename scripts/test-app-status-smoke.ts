/**
 * Phase 4 smoke: App Status capture → ingest → Validate loop contracts.
 * Run: npx tsx scripts/test-app-status-smoke.ts
 * (Also wired as npm run test:app-status-smoke)
 */
import assert from 'node:assert/strict';
import {
  __resetAppRuntimeStoreForTests,
  getAppRuntimeSnapshot,
  markAppRuntimePendingValidation,
  scheduleAppRuntimeHealthyCheck,
  shouldMarkAppStatusValidation,
} from '../src/lib/ideAppRuntimeStatus.ts';
import {
  emptyPreviewHtmlWithBridge,
  ingestPreviewRuntimeMessage,
  PREVIEW_RUNTIME_MSG_SOURCE,
  wrapHtmlWithPreviewRuntimeBridge,
} from '../src/lib/previewRuntimeBridge.ts';
import { PREVIEW_RUNTIME_BOOTSTRAP_MARKER } from '../src/lib/previewRuntimeBridgeScript.ts';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

section('bootstrap HTML wraps with early bridge');
{
  const html = '<!DOCTYPE html><html><head><title>x</title></head><body>hi</body></html>';
  const out = wrapHtmlWithPreviewRuntimeBridge(html);
  assert.ok(out.includes(PREVIEW_RUNTIME_BOOTSTRAP_MARKER));
  assert.ok(out.includes('__nebullaPreviewRuntimeBridge'));
  assert.ok(out.includes('network-error'));
  // idempotent
  const twice = wrapHtmlWithPreviewRuntimeBridge(out);
  assert.equal(twice, out);
}

section('empty preview shell reports build-error payload shape');
{
  const empty = emptyPreviewHtmlWithBridge();
  assert.ok(empty.includes('build-error') || empty.includes('No index.html'));
  assert.ok(empty.includes(PREVIEW_RUNTIME_MSG_SOURCE));
}

section('ingest runtime / network / build messages');
{
  __resetAppRuntimeStoreForTests();
  assert.equal(
    ingestPreviewRuntimeMessage({
      source: PREVIEW_RUNTIME_MSG_SOURCE,
      type: 'runtime-error',
      message: 'Cannot read properties of undefined',
      route: '/home',
    }),
    true,
  );
  assert.equal(
    ingestPreviewRuntimeMessage({
      source: PREVIEW_RUNTIME_MSG_SOURCE,
      type: 'network-error',
      message: 'GET /api/x → 500',
      route: '/home',
    }),
    true,
  );
  assert.equal(
    ingestPreviewRuntimeMessage({
      source: PREVIEW_RUNTIME_MSG_SOURCE,
      type: 'build-error',
      message: 'No index.html in workspace — preview shell only',
    }),
    true,
  );
  assert.equal(ingestPreviewRuntimeMessage({ source: 'other' }), false);
  const snap = getAppRuntimeSnapshot();
  assert.ok(snap.issues.length >= 3);
  assert.ok(snap.issues.some((i) => i.source === 'network'));
  assert.ok(snap.issues.some((i) => i.source === 'build'));
  assert.ok(snap.issues.some((i) => i.source === 'preview'));
}

section('shouldMarkAppStatusValidation gates failed apply');
{
  assert.equal(shouldMarkAppStatusValidation({ ran: true, ok: true }), true);
  assert.equal(shouldMarkAppStatusValidation({ ran: true, ok: false }), false);
  assert.equal(shouldMarkAppStatusValidation({ ran: false }), false);
  assert.equal(shouldMarkAppStatusValidation({ ran: true }), true); // ok undefined = success path
}

section('smoke Validate: fixed path clears without Clear');
{
  __resetAppRuntimeStoreForTests();
  ingestPreviewRuntimeMessage({
    source: PREVIEW_RUNTIME_MSG_SOURCE,
    type: 'runtime-error',
    message: 'Smoke bug A',
    route: '/a',
  });
  const fp = getAppRuntimeSnapshot().issues[0]!.fingerprint;
  markAppRuntimePendingValidation([fp]);
  scheduleAppRuntimeHealthyCheck({ quietMs: 20 });
  await sleep(50);
  assert.equal(getAppRuntimeSnapshot().issues.length, 0);
  assert.equal(getAppRuntimeSnapshot().pendingValidation, false);
}

section('smoke Validate: reappear keeps pending');
{
  __resetAppRuntimeStoreForTests();
  ingestPreviewRuntimeMessage({
    source: PREVIEW_RUNTIME_MSG_SOURCE,
    type: 'runtime-error',
    message: 'Smoke bug B',
    route: '/b',
  });
  const fp = getAppRuntimeSnapshot().issues[0]!.fingerprint;
  markAppRuntimePendingValidation([fp]);
  scheduleAppRuntimeHealthyCheck({ quietMs: 30 });
  await sleep(5);
  ingestPreviewRuntimeMessage({
    source: PREVIEW_RUNTIME_MSG_SOURCE,
    type: 'runtime-error',
    message: 'Smoke bug B',
    route: '/b',
  });
  await sleep(50);
  assert.ok(getAppRuntimeSnapshot().issues.length >= 1);
  assert.equal(getAppRuntimeSnapshot().pendingValidation, true);
}

section('smoke Validate: load-time reappear before schedule keeps pending');
{
  __resetAppRuntimeStoreForTests();
  ingestPreviewRuntimeMessage({
    source: PREVIEW_RUNTIME_MSG_SOURCE,
    type: 'runtime-error',
    message: 'Smoke bug load',
    route: '/load',
  });
  const fp = getAppRuntimeSnapshot().issues[0]!.fingerprint;
  markAppRuntimePendingValidation([fp]);
  await sleep(5);
  // Error during page boot, before iframe onLoad schedules the check
  ingestPreviewRuntimeMessage({
    source: PREVIEW_RUNTIME_MSG_SOURCE,
    type: 'runtime-error',
    message: 'Smoke bug load',
    route: '/load',
  });
  scheduleAppRuntimeHealthyCheck({ quietMs: 30 });
  await sleep(50);
  assert.ok(getAppRuntimeSnapshot().issues.length >= 1);
  assert.equal(getAppRuntimeSnapshot().pendingValidation, true);
}

console.log('\nAll app-status smoke checks passed.\n');
