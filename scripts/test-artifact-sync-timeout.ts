/**
 * Artifact sync hard-timeout + soft-fail contract (no live network).
 * Run: npm run test:artifact-sync
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTIFACT_SYNC_TIMEOUT_MS,
  isArtifactSyncTimeoutError,
  resetArtifactSyncInFlightForTests,
  withHardTimeout,
} from '../src/lib/ideArtifactSync.ts';
import { startGrokActivityWaitTicker, GROK_WAIT_HEARTBEAT_TICKS } from '../src/lib/ideGrokActivityStatus.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

{
  assert.ok(ARTIFACT_SYNC_TIMEOUT_MS >= 45_000 && ARTIFACT_SYNC_TIMEOUT_MS <= 90_000);
  assert.equal(isArtifactSyncTimeoutError(new Error('Artifact sync timed out')), true);
  assert.equal(isArtifactSyncTimeoutError(new Error('The operation was aborted')), true);
  assert.equal(isArtifactSyncTimeoutError(new Error('ENOENT')), false);
}

{
  const t0 = Date.now();
  let timedOut = false;
  try {
    await withHardTimeout(
      new Promise(() => {
        /* never settles */
      }),
      80,
      'Artifact sync timed out',
    );
  } catch (e) {
    timedOut = isArtifactSyncTimeoutError(e);
  }
  assert.equal(timedOut, true);
  assert.ok(Date.now() - t0 < 2_000, 'hard timeout must settle quickly');
}

{
  const resolved = await withHardTimeout(Promise.resolve({ ok: true }), 500, 'timeout');
  assert.deepEqual(resolved, { ok: true });
}

{
  // Wait ticker stop must not emit a spin-able "— done" info line.
  const lines: Array<{ msg: string; kind?: string; currentOnly?: boolean }> = [];
  const stop = startGrokActivityWaitTicker('Syncing project artifacts (Master Plan, mind map)', (msg, kind, opts) => {
    lines.push({ msg, kind, currentOnly: opts?.currentOnly });
  }, 10_000);
  stop();
  assert.ok(lines.some((l) => l.kind === 'wait' && /Syncing project artifacts/.test(l.msg)));
  assert.ok(
    !lines.some((l) => /— done/.test(l.msg)),
    'stopWait must not overwrite terminal status with info "— done"',
  );
}

{
  const lines: Array<{ msg: string; kind?: string; currentOnly?: boolean }> = [];
  const stop = startGrokActivityWaitTicker('Code pass 1', (msg, kind, opts) => {
    lines.push({ msg, kind, currentOnly: opts?.currentOnly });
  }, 20);
  await new Promise((r) => setTimeout(r, GROK_WAIT_HEARTBEAT_TICKS * 20 + 80));
  stop();
  assert.ok(
    lines.some((l) => l.kind === 'info' && l.currentOnly === false && /still waiting/.test(l.msg)),
    'wait ticker must commit a still-waiting heartbeat so chat is not silent on Code pass 1',
  );
}

{
  const syncSrc = fs.readFileSync(path.join(root, 'src/lib/ideArtifactSync.ts'), 'utf8');
  assert.match(syncSrc, /withHardTimeout/);
  assert.match(syncSrc, /Artifact sync timed out\/skipped/);
  assert.match(syncSrc, /artifactSyncInFlight/);
  assert.match(syncSrc, /startGrokActivityWaitTicker/);

  const pipeline = fs.readFileSync(path.join(root, 'src/lib/nebulaGrokCodingPipeline.ts'), 'utf8');
  assert.match(pipeline, /skipPostSync: true/);
  assert.match(pipeline, /afterFilesAppliedArtifacts/);
  const goFn = pipeline.slice(pipeline.indexOf('export async function runGoCodeAndApply'));
  assert.equal(
    /await afterFilesAppliedArtifacts/.test(goFn),
    false,
    'runGoCodeAndApply must not await artifact sync after files land',
  );
  assert.match(pipeline, /GO_CONSUME_TIMEOUT_MS/);
  assert.match(goFn, /ackConsumedGoCodeResult/);
  assert.equal(
    /await fetch\(withProjectQuery\('\/api\/grok\/go-code\/poll'\)/.test(goFn),
    false,
    'consume poll after apply must not be awaited (hangs on Runnable skeleton filled)',
  );

  const chat = fs.readFileSync(path.join(root, 'src/components/ide/AIChat.tsx'), 'utf8');
  // Direct Go path must not re-await a second post-coding workspace sync after Go already synced.
  const goHandler = chat.slice(chat.indexOf('runGoCodeAndApply({'));
  const secondGoBlock = goHandler.includes('const go = await runGoCodeAndApply')
    ? chat.slice(chat.lastIndexOf('const go = await runGoCodeAndApply'))
    : chat.slice(chat.indexOf('await runGoCodeAndApply'));
  // After the dedicated Go button handler returns ok, it must not call runPostCodingWorkspaceSync again.
  const goBtnIdx = chat.indexOf('Grok Code on server — summary then implementation');
  assert.ok(goBtnIdx > 0);
  const goBtnSection = chat.slice(goBtnIdx, goBtnIdx + 4500);
  assert.ok(
    !/await runPostCodingWorkspaceSync/.test(goBtnSection),
    'Go button path must not start a second artifact sync after runGoCodeAndApply',
  );
  void secondGoBlock;
}

resetArtifactSyncInFlightForTests();
console.log('\n✓ artifact sync timeout / soft-fail contract passed\n');
