#!/usr/bin/env node
/**
 * End-to-end API journey for Nebulla (guest-safe when DB/OAuth are down).
 *
 * Covers:
 * 1) Config / auth readiness (Login + Stay signed in prerequisites)
 * 2) Mode detection (guided / file / coding / free)
 * 3) My Projects-style guest project key persistence
 * 4) Guided Master Plan chat (≥2 turns)
 * 5) Open local file (nebulla-project/full-bug-database.md)
 * 6) Open public GitHub file
 * 7) Coding turn with a null-bug React component request
 * 8) Refresh simulation (reuse cookie / projectKey)
 * 9) Free chat general question
 *
 * Usage: node scripts/e2e-user-journey.mjs
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const base = (process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(
  /\/$/,
  '',
);

const CHAT_TIMEOUT = Number(process.env.E2E_CHAT_TIMEOUT_MS) || 90_000;
const projectKey = `e2e-${Date.now().toString(36)}`;
const projectName = 'E2E Journey App';

const results = [];
let cookie = '';

function log(mark, name, detail = '') {
  const line = `${mark} ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  results.push({ mark, name, detail, pass: mark === '✓' });
}

function ok(name, pass, detail = '') {
  log(pass ? '✓' : '✗', name, detail);
  return pass;
}

function note(name, detail) {
  log('○', name, detail);
}

async function api(pathname, opts = {}) {
  const url = new URL(pathname, base);
  if (!url.searchParams.has('projectKey')) url.searchParams.set('projectKey', projectKey);
  if (!url.searchParams.has('projectName')) url.searchParams.set('projectName', projectName);

  const headers = {
    Accept: 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers || {}),
  };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(url, {
    ...opts,
    headers,
    signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs || 25_000),
  });

  const setCookie = res.headers.getSetCookie?.() || [];
  if (setCookie.length) {
    cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  } else {
    const single = res.headers.get('set-cookie');
    if (single) cookie = single.split(';')[0];
  }

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 500) };
  }
  return { res, body, text };
}

async function loadModeDetector() {
  // chatModeDetector is TS — use dynamic import via tsx if needed; fallback to inline copy of rules.
  try {
    const require = createRequire(import.meta.url);
    // Prefer compiled-free evaluation by reading the pure logic via node --experimental
    const modPath = path.join(root, 'src/lib/chatModeDetector.ts');
    // Inline mirror of public rules for Node without a TS loader:
    const { pathToFileURL: toUrl } = await import('node:url');
    void modPath;
    void toUrl;
  } catch {
    /* use inline */
  }

  // Keep in sync with src/lib/chatModeDetector.ts (simplified for e2e smoke)
  const GUIDED_RE =
    /\b(new project|create (an? )?app|start from scratch|build (an? )?app|start a project)\b/i;
  const DEBUG_RE =
    /\b(debug|debugging|bug|broken|not working|failing test|fix (this |the )?(bug|error|issue|crash))\b/i;
  const UI_RE =
    /\b(ui studio|nebula ui|v0(\.dev)?|mockup|ui\/ux|generate ui)\b/i;
  const ARCHITECTURE_RE =
    /\b(master plan|architecture|pages and navigation)\b/i;
  const CODING_RE =
    /\b(write code|implement|add feature|refactor|edit (the )?code|generate (a )?component|paste|go code)\b/i;
  const GITHUB_URL_RE = /https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\//i;
  const LOCAL_PATH_HINT_RE =
    /(?:^|\s)((?:nebulla-project|nebula-project|src|app|lib|components)\/[\w./-]+|[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css))\b/i;

  return function detectChatMode(input) {
    const text = String(input || '').trim();
    if (!text) return { mode: 'free' };
    const looksGuided = GUIDED_RE.test(text);
    const looksDebug = DEBUG_RE.test(text);
    const looksUi = UI_RE.test(text);
    const looksArchitecture = ARCHITECTURE_RE.test(text);
    const looksCoding = CODING_RE.test(text) || /```/.test(text) || /\bfix\b/i.test(text);
    const hasGitHubUrl = GITHUB_URL_RE.test(text);
    const hasOpenVerb = /\b(open|load|show|read)\b/i.test(text);
    const hasFilePath =
      LOCAL_PATH_HINT_RE.test(text) || /\b[\w./-]+\.(?:ts|tsx|js|jsx|md|json|css)\b/i.test(text);
    if (hasGitHubUrl || (hasOpenVerb && hasFilePath && !looksGuided && !looksArchitecture)) return { mode: 'file' };
    if (looksGuided) return { mode: 'guided' };
    if (looksDebug) return { mode: 'debugging' };
    if (looksUi) return { mode: 'ui' };
    if (looksArchitecture) return { mode: 'architecture' };
    if (looksCoding) return { mode: 'coding' };
    return { mode: 'free' };
  };
}

async function chatTurn(userText, history = [], extra = {}) {
  const system = {
    role: 'system',
    content:
      'You are Nebula. For guided discovery ask ONE short beginner-friendly question. Keep Master Plan tags when appropriate. Be warm and concise.',
  };
  const messages = [
    system,
    ...history,
    { role: 'user', content: userText },
  ];
  const { res, body } = await api('/api/grok/chat', {
    method: 'POST',
    timeoutMs: CHAT_TIMEOUT,
    body: JSON.stringify({
      userId: 'e2e-tester',
      projectName,
      projectKey,
      chatModel: 'grok-4.1',
      aiProvider: 'xai',
      buildMode: Boolean(extra.buildMode),
      messages,
    }),
  });
  const content = body?.choices?.[0]?.message?.content || body?.error || '';
  return { status: res.status, body, content: String(content) };
}

async function main() {
  console.log(`\nNebulla E2E journey → ${base}`);
  console.log(`projectKey=${projectKey}\n`);

  // ── 1) Login prerequisites ──────────────────────────────────────────
  const health = await api('/api/health');
  ok('Health', health.res.ok, `HTTP ${health.res.status}`);

  const cfg = await api('/api/config');
  const c = cfg.body || {};
  ok('Config loads', cfg.res.ok, `mainAi=${c.mainAiProvider}/${c.mainAiChatModel}`);
  ok('Main AI key present', Boolean(c.hasMainAiApiKey), c.hasMainAiApiKey ? 'ready' : 'missing');

  if (c.databaseConnectionFailed) {
    note(
      'Login (Stay signed in)',
      'BLOCKED locally: PostgreSQL connection failed — cloud login/session persistence needs External DATABASE_URL',
    );
  } else {
    ok('Database', true, 'connected');
  }

  if (!c.githubOAuthReady) {
    note(
      'GitHub OAuth / onboarding GitHub button',
      'BLOCKED: GITHUB_CLIENT_SECRET missing (CLIENT_ID alone is not enough)',
    );
  } else {
    ok('GitHub OAuth ready', true);
  }

  if (!c.cloudStorageReady) {
    note('Cloud project storage', 'Unavailable while DB is down — guest workspace path used for journey');
  }

  // Session endpoint (if any)
  for (const p of ['/api/auth/session', '/api/session', '/api/me']) {
    try {
      const s = await api(p);
      if (s.res.status !== 404) {
        note(`Session probe ${p}`, `HTTP ${s.res.status}`);
      }
    } catch {
      /* ignore */
    }
  }

  // ── 2) Mode detection ───────────────────────────────────────────────
  const detect = await loadModeDetector();
  ok('Mode: New Project → guided', detect('I want to create a new project').mode === 'guided');
  ok(
    'Mode: open local md → file',
    detect('Please open file nebulla-project/full-bug-database.md').mode === 'file',
  );
  ok(
    'Mode: GitHub URL → file',
    detect('Open https://github.com/facebook/react/blob/main/README.md').mode === 'file',
  );
  ok(
    'Mode: write component → coding',
    detect('Please write a React component with a potential null bug and fix it').mode === 'coding',
  );
  ok('Mode: general question → free', detect('What is the capital of France?').mode === 'free');

  // ── 3) Guest project bootstrap (My Projects analogue) ───────────────
  const mpRead0 = await api('/api/master-plan/read');
  ok(
    'Guest project workspace reachable',
    mpRead0.res.status === 200 || mpRead0.res.status === 404 || mpRead0.res.ok,
    `master-plan/read HTTP ${mpRead0.res.status}`,
  );

  // ── 4) Guided Master Plan (≥2 questions) ────────────────────────────
  let history = [];
  const g1 = await chatTurn(
    'I want to create a new project — a simple habit tracker for beginners.',
    history,
    { buildMode: true },
  );
  const guidedOk1 = g1.status === 200 && g1.content.length > 20;
  ok('Guided turn 1 (new project)', guidedOk1, `HTTP ${g1.status}, ${g1.content.length} chars`);
  if (guidedOk1) {
    history.push({ role: 'user', content: 'I want to create a new project — a simple habit tracker for beginners.' });
    history.push({ role: 'assistant', content: g1.content.slice(0, 6000) });
  }

  const asksQuestion = /\?/.test(g1.content) || /what|who|which|tell me/i.test(g1.content);
  ok('Guided turn 1 asks / advances discovery', asksQuestion || /MASTERPLAN|START_/i.test(g1.content), asksQuestion ? 'question present' : 'tags/progress present');

  const g2 = await chatTurn(
    'The core feature is daily habit check-ins with a friendly streak.',
    history,
    { buildMode: true },
  );
  const guidedOk2 = g2.status === 200 && g2.content.length > 20;
  ok('Guided turn 2 (answer Q1)', guidedOk2, `HTTP ${g2.status}, ${g2.content.length} chars`);
  if (guidedOk2) {
    history.push({
      role: 'user',
      content: 'The core feature is daily habit check-ins with a friendly streak.',
    });
    history.push({ role: 'assistant', content: g2.content.slice(0, 6000) });
  }

  const mpAfter = await api('/api/master-plan/read');
  note(
    'Master Plan persistence after guided turns',
    `HTTP ${mpAfter.res.status}${mpAfter.body && typeof mpAfter.body === 'object' ? ` keys=${Object.keys(mpAfter.body).slice(0, 8).join(',')}` : ''}`,
  );

  // ── 5) Open local file ──────────────────────────────────────────────
  const local = await api('/api/files/open', {
    method: 'POST',
    body: JSON.stringify({ path: 'nebulla-project/full-bug-database.md', projectKey, projectName }),
  });
  const localOk =
    local.res.ok &&
    local.body?.success === true &&
    typeof local.body?.content === 'string' &&
    local.body.content.length > 50;
  ok(
    'Open local file nebulla-project/full-bug-database.md',
    localOk,
    localOk
      ? `${local.body.content.length} chars, lang=${local.body.language || '?'}`
      : `HTTP ${local.res.status} ${local.body?.error || ''}`,
  );
  if (localOk) {
    const preview = local.body.content.slice(0, 160).replace(/\s+/g, ' ');
    note('Local file preview sample', preview + (local.body.content.length > 160 ? '…' : ''));
  }

  // ── 6) Open GitHub file ─────────────────────────────────────────────
  const gh = await api('/api/files/open-github', {
    method: 'POST',
    timeoutMs: 30_000,
    body: JSON.stringify({
      url: 'https://github.com/facebook/react/blob/main/README.md',
      projectKey,
      projectName,
    }),
  });
  const ghOk =
    gh.res.ok &&
    gh.body?.success === true &&
    typeof gh.body?.content === 'string' &&
    /react/i.test(gh.body.content);
  ok(
    'Open GitHub file (facebook/react README)',
    ghOk,
    ghOk
      ? `${gh.body.content.length} chars`
      : `HTTP ${gh.res.status} ${gh.body?.error || ''}`,
  );

  // ── 7) Coding / null-bug component ──────────────────────────────────
  const codingPrompt =
    'Please implement a small React component UserBadge.tsx that shows user.name. There might be a null bug if user is null — detect and fix it with a safe fallback. Output only ```file:src/components/UserBadge.tsx blocks if you write code, otherwise tell me to press Go.';
  const codeMode = detect(codingPrompt).mode;
  ok('Coding intent detected', codeMode === 'coding', codeMode);

  const coding = await chatTurn(codingPrompt, history.slice(-4), { buildMode: true });
  const codingOk = coding.status === 200 && coding.content.length > 20;
  ok('Coding chat turn', codingOk, `HTTP ${coding.status}, ${coding.content.length} chars`);
  const hasFileBlock = /```(?:file|filepath)\s*:/i.test(coding.content);
  const mentionsNullSafe =
    /null|optional|fallback|UserBadge|safe/i.test(coding.content) || hasFileBlock;
  ok(
    'Null-safety / component guidance present',
    mentionsNullSafe,
    hasFileBlock ? 'file block emitted' : 'guidance / prose present',
  );
  if (hasFileBlock) {
    note('Coding output', 'Assistant emitted ```file: blocks (rich apply path)');
  } else if (/START_CODING|\bGo\b/i.test(coding.content)) {
    note('Coding output', 'Directed user to Go / START_CODING (expected chat contract)');
  }

  // Apply a tiny safe component ourselves to verify file apply path
  const apply = await api('/api/files/apply-generated', {
    method: 'POST',
    body: JSON.stringify({
      projectKey,
      projectName,
      content: [
        '```file:src/components/UserBadge.tsx',
        "type User = { name?: string | null } | null | undefined;",
        '',
        'export function UserBadge({ user }: { user: User }) {',
        "  const label = user?.name?.trim() || 'Guest';",
        '  return <span className="user-badge">{label}</span>;',
        '}',
        '```',
      ].join('\n'),
    }),
  });
  const applyOk = apply.res.ok && (apply.body?.ok === true || Array.isArray(apply.body?.written));
  ok(
    'Apply generated UserBadge.tsx',
    applyOk,
    applyOk
      ? `written=${JSON.stringify(apply.body?.written || apply.body)}`
      : `HTTP ${apply.res.status} ${apply.body?.error || apply.body?._raw || ''}`,
  );

  const reopen = await api('/api/files/open', {
    method: 'POST',
    body: JSON.stringify({ path: 'src/components/UserBadge.tsx', projectKey, projectName }),
  });
  ok(
    'Re-open applied component',
    reopen.res.ok && /UserBadge/.test(reopen.body?.content || ''),
    reopen.res.ok ? 'content present' : `HTTP ${reopen.res.status}`,
  );

  // ── 8) Refresh simulation (same projectKey) ─────────────────────────
  const refreshMp = await api('/api/master-plan/read');
  const refreshFile = await api('/api/files/open', {
    method: 'POST',
    body: JSON.stringify({ path: 'src/components/UserBadge.tsx', projectKey, projectName }),
  });
  ok(
    'After refresh: project files still exist',
    refreshFile.res.ok && /Guest/.test(refreshFile.body?.content || ''),
    `projectKey=${projectKey}`,
  );
  note(
    'After refresh: login session',
    c.databaseConnectionFailed
      ? 'Cloud login cannot persist without DB — guest projectKey persistence verified instead'
      : `master-plan HTTP ${refreshMp.res.status}`,
  );

  // ── 9) Free chat ────────────────────────────────────────────────────
  const freePrompt = 'In one short friendly sentence, what is a REST API?';
  ok('Free mode detection', detect(freePrompt).mode === 'free');
  const free = await chatTurn(freePrompt, [], { buildMode: false });
  const freeOk = free.status === 200 && free.content.length > 10;
  ok('Free chat answer', freeOk, freeOk ? free.content.slice(0, 180).replace(/\s+/g, ' ') : `HTTP ${free.status}`);
  const forcedPlan = /<START_MASTERPLAN>/i.test(free.content);
  ok('Free chat does not force Master Plan', !forcedPlan, forcedPlan ? 'unexpected tags' : 'clean free reply');

  // ── Summary ─────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.mark === '✗');
  const passed = results.filter((r) => r.mark === '✓');
  const notes = results.filter((r) => r.mark === '○');
  console.log('\n──────── E2E summary ────────');
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Notes / blockers: ${notes.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  }
  console.log(`\nGuest projectKey for manual UI follow-up: ${projectKey}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(2);
});
