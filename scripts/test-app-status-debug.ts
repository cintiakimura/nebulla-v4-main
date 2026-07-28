/**
 * Contract checks for App Status → NDM debugging.
 * Run: npx tsx scripts/test-app-status-debug.ts
 */
import assert from 'node:assert/strict';
import {
  __resetAppRuntimeStoreForTests,
  assistantSkippedNdmVerify,
  formatAppStatusDebugMessage,
  getAppRuntimeSnapshot,
  getAppStatusDebugIssues,
  looksLikeBrokenAppComplaint,
  mapRuntimeToFriendly,
  markAppRuntimePendingValidation,
  relativeAppStatusTime,
  reportAppRuntimeIssue,
  scheduleAppRuntimeHealthyCheck,
  shouldMarkAppStatusValidation,
} from '../src/lib/ideAppRuntimeStatus.ts';
import { matchBugDatabaseSnippets } from '../src/lib/bugDatabaseSnippet.ts';
import { chatModeSystemAppendix } from '../src/lib/grokChatArtifacts.ts';
import { tLocale } from '../src/lib/i18n/t.ts';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

__resetAppRuntimeStoreForTests();

section('looksLikeBrokenAppComplaint — multilingual');
assert.equal(looksLikeBrokenAppComplaint("it's broken"), true);
assert.equal(looksLikeBrokenAppComplaint('ça marche pas'), true);
assert.equal(looksLikeBrokenAppComplaint('non funziona'), true);
assert.equal(looksLikeBrokenAppComplaint('no funciona'), true);
assert.equal(looksLikeBrokenAppComplaint('funktioniert nicht'), true);
assert.equal(looksLikeBrokenAppComplaint('schermo bianco'), true);
assert.equal(looksLikeBrokenAppComplaint('What should we build next?'), false);

section('formatAppStatusDebugMessage — multi-issue');
{
  const primary = {
    id: 'a',
    fingerprint: 'cannot read|/',
    severity: 'error' as const,
    friendlyTitle: 'Broke',
    friendlyBody: 'Missing',
    technicalMessage: 'Cannot read properties of undefined',
    route: '/home',
    source: 'preview' as const,
    at: Date.now(),
  };
  const related = {
    ...primary,
    id: 'b',
    fingerprint: 'typeerror|/',
    technicalMessage: 'TypeError: x is not a function',
  };
  const msg = formatAppStatusDebugMessage({ primary, related: [related], openFilePath: 'app/page.tsx' });
  assert.match(msg, /\[APP_STATUS_DEBUG\]/);
  assert.match(msg, /--- primary ---/);
  assert.match(msg, /--- related 1 ---/);
  assert.match(msg, /Cannot read properties/);
  assert.match(msg, /route: \/home/);
  assert.match(msg, /ide_open_file: app\/page\.tsx/);
}

section('getAppStatusDebugIssues related affinity');
{
  __resetAppRuntimeStoreForTests();
  reportAppRuntimeIssue({
    technicalMessage: 'Cannot read properties of undefined (reading foo)',
    route: '/dash',
    source: 'preview',
  });
  reportAppRuntimeIssue({
    technicalMessage: 'TypeError: bar is not a function',
    route: '/dash',
    source: 'preview',
  });
  reportAppRuntimeIssue({
    technicalMessage: 'Unrelated elsewhere',
    route: '/other',
    source: 'network',
  });
  const { primary, related } = getAppStatusDebugIssues(3);
  assert.ok(primary);
  assert.ok(related.length >= 1);
  assert.ok(related.some((r) => r.route === '/dash' || r.source === primary!.source));
}

section('mapRuntimeToFriendly network + build');
{
  const net = mapRuntimeToFriendly({
    technicalMessage: 'GET /api/x → 500',
    source: 'network',
  });
  assert.equal(net.severity, 'warn');
  assert.match(net.friendlyTitle, /server|serveur|servidor|Server|server/i);
  const build = mapRuntimeToFriendly({
    technicalMessage: 'Preview iframe failed to load',
    source: 'build',
  });
  assert.equal(build.severity, 'error');
}

section('relativeAppStatusTime uses catalog (en)');
{
  const now = Date.now();
  assert.equal(relativeAppStatusTime(now - 2000, now), tLocale('en', 'appStatus.time.justNow'));
  assert.equal(relativeAppStatusTime(now - 30_000, now), tLocale('en', 'appStatus.time.secondsAgo', { count: 30 }));
  assert.equal(relativeAppStatusTime(now - 120_000, now), tLocale('en', 'appStatus.time.minutesAgo', { count: 2 }));
}

section('bug database snippets');
{
  const hints = matchBugDatabaseSnippets(['Cannot read properties of undefined']);
  assert.match(hints, /BUG_DATABASE_HINTS/);
  assert.match(hints, /Runtime Errors/);
}

section('chatModeSystemAppendix APP_STATUS + bug hints');
{
  const appendix = chatModeSystemAppendix({
    hasAppStatusPayload: true,
    interactionMode: 'agent',
    appStatusTechnicalMessages: ['Cannot read properties of undefined'],
    ideLocale: 'en',
    contentLocale: 'en',
  });
  assert.match(appendix, /APP_STATUS_RUNTIME/);
  assert.match(appendix, /BUG_DATABASE_HINTS/);
  assert.match(appendix, /Verify/);
}

section('assistantSkippedNdmVerify soft check');
assert.equal(
  assistantSkippedNdmVerify('```file:app/x.tsx\nexport const x = 1\n```'),
  true,
);
assert.equal(
  assistantSkippedNdmVerify(
    'Verify: undefined on /home. Analyze: missing prop. Trace: Page.tsx.\n```file:app/page.tsx\nfix\n```',
  ),
  false,
);
// CONTENT_LOCALE / Grok detection — FR Verify language must not soft-nudge
assert.equal(
  assistantSkippedNdmVerify(
    'Vérifier: erreur undefined. Analyser: prop manquante.\n```file:app/page.tsx\nfix\n```',
  ),
  false,
);

section('shouldMarkAppStatusValidation');
assert.equal(shouldMarkAppStatusValidation({ ran: true, ok: false }), false);
assert.equal(shouldMarkAppStatusValidation({ ran: true, ok: true }), true);

section('Validate healthy check — stale issues do not block');
{
  __resetAppRuntimeStoreForTests();
  const first = reportAppRuntimeIssue({
    technicalMessage: 'Cannot read properties of undefined (reading foo)',
    route: '/home',
    source: 'preview',
  });
  assert.ok(first);
  markAppRuntimePendingValidation([first!.fingerprint]);
  // Stale issue still in store — must still clear after quiet window
  scheduleAppRuntimeHealthyCheck({ quietMs: 25 });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(getAppRuntimeSnapshot().issues.length, 0);
  assert.equal(getAppRuntimeSnapshot().pendingValidation, false);
}

section('Validate healthy check — reappear blocks clear');
{
  __resetAppRuntimeStoreForTests();
  const first = reportAppRuntimeIssue({
    technicalMessage: 'TypeError: x is not a function',
    route: '/dash',
    source: 'preview',
  });
  assert.ok(first);
  markAppRuntimePendingValidation([first!.fingerprint]);
  scheduleAppRuntimeHealthyCheck({ quietMs: 40 });
  // Re-report during window (bumps `at`)
  await new Promise((r) => setTimeout(r, 5));
  reportAppRuntimeIssue({
    technicalMessage: 'TypeError: x is not a function',
    route: '/dash',
    source: 'preview',
  });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(getAppRuntimeSnapshot().issues.length >= 1);
  assert.equal(getAppRuntimeSnapshot().pendingValidation, true);
}

section('Validate healthy check — load-time reappear before schedule still blocks');
{
  __resetAppRuntimeStoreForTests();
  const first = reportAppRuntimeIssue({
    technicalMessage: 'ReferenceError: boom is not defined',
    route: '/boot',
    source: 'preview',
  });
  assert.ok(first);
  markAppRuntimePendingValidation([first!.fingerprint]);
  // Simulate page-load error arriving before iframe onLoad → schedule
  await new Promise((r) => setTimeout(r, 5));
  reportAppRuntimeIssue({
    technicalMessage: 'ReferenceError: boom is not defined',
    route: '/boot',
    source: 'preview',
  });
  scheduleAppRuntimeHealthyCheck({ quietMs: 40 });
  await new Promise((r) => setTimeout(r, 70));
  assert.ok(
    getAppRuntimeSnapshot().issues.length >= 1,
    'load-time reappear must not be treated as stale leftover',
  );
  assert.equal(getAppRuntimeSnapshot().pendingValidation, true);
}

section('Validate healthy check — after blocked window, clean reload can clear');
{
  __resetAppRuntimeStoreForTests();
  const first = reportAppRuntimeIssue({
    technicalMessage: 'RangeError: invalid',
    route: '/x',
    source: 'preview',
  });
  assert.ok(first);
  markAppRuntimePendingValidation([first!.fingerprint]);
  reportAppRuntimeIssue({
    technicalMessage: 'RangeError: invalid',
    route: '/x',
    source: 'preview',
  });
  scheduleAppRuntimeHealthyCheck({ quietMs: 25 });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(getAppRuntimeSnapshot().pendingValidation, true);
  // Failed window advanced the mark anchor — clean schedule with no new report clears
  scheduleAppRuntimeHealthyCheck({ quietMs: 25 });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(getAppRuntimeSnapshot().issues.length, 0);
  assert.equal(getAppRuntimeSnapshot().pendingValidation, false);
}

console.log('\nAll app-status debug contract checks passed.\n');
