/**
 * Stress test for Nebulla hardened core pipeline.
 * Uses real TS modules + live /api/grok/chat when available.
 *
 * Usage: npx tsx scripts/stress-test-hardened-pipeline.mts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectChatMode } from '../src/lib/chatModeDetector.ts';
import { handleSmartChatMessage } from '../src/lib/smartChatHandler.ts';
import { chatModeSystemAppendix } from '../src/lib/grokChatArtifacts.ts';
import { buildNebulaAssistantSystemPrompt } from '../src/lib/nebulaAssistantSystemPrompt.ts';
import { isMasterPlanCompleteForDiscovery } from '../lib/masterPlanSections.ts';
import { buildV0PromptMarkdown } from '../lib/nebulaUiStudioPipeline.ts';
import { buildDiscoveryBootstrap } from '../src/lib/ideChatBootstrap.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const base = (process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');
const CHAT_TIMEOUT = Number(process.env.STRESS_CHAT_TIMEOUT_MS) || 120_000;
const projectKey = `stress-${Date.now().toString(36)}`;
const projectName = 'Stress Habit Tracker';

type ScenarioReport = {
  id: number;
  name: string;
  what: string;
  mode: string;
  correct: 'PASS' | 'FAIL' | 'PARTIAL' | 'SKIP';
  quality: 'Good' | 'Acceptable' | 'Weak' | 'N/A';
  notes: string[];
  failures: string[];
};

const reports: ScenarioReport[] = [];
let cookie = '';

function section(title: string) {
  console.log(`\n${'═'.repeat(72)}\n${title}\n${'═'.repeat(72)}`);
}

async function api(pathname: string, opts: RequestInit & { timeoutMs?: number } = {}) {
  const url = new URL(pathname, base);
  if (!url.searchParams.has('projectKey')) url.searchParams.set('projectKey', projectKey);
  if (!url.searchParams.has('projectName')) url.searchParams.set('projectName', projectName);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, {
    ...opts,
    headers,
    signal: AbortSignal.timeout(opts.timeoutMs || 25_000),
  });
  const setCookie = (res.headers as any).getSetCookie?.() || [];
  if (setCookie.length) cookie = setCookie.map((c: string) => c.split(';')[0]).join('; ');
  else {
    const single = res.headers.get('set-cookie');
    if (single) cookie = single.split(';')[0];
  }
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 800) };
  }
  return { res, body, text };
}

async function chatWithSystem(
  systemPrompt: string,
  userText: string,
  history: { role: string; content: string }[] = [],
  extra: { buildMode?: boolean } = {},
) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userText },
  ];
  const { res, body } = await api('/api/grok/chat', {
    method: 'POST',
    timeoutMs: CHAT_TIMEOUT,
    body: JSON.stringify({
      userId: 'stress-tester',
      projectName,
      projectKey,
      chatModel: 'grok-4.1',
      aiProvider: 'xai',
      buildMode: Boolean(extra.buildMode),
      onboardingAutopilot: false,
      messages,
    }),
  });
  const content = String(body?.choices?.[0]?.message?.content || body?.error || '');
  return { status: res.status, body, content };
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) || []).length;
}

function hasStartCoding(text: string): boolean {
  return /START_CODING/i.test(text);
}

function hasMasterPlan(text: string): boolean {
  return /<START_MASTERPLAN>/i.test(text);
}

function hasFileBlocks(text: string): boolean {
  return /```(?:file|filepath)\s*:/i.test(text);
}

const emptyPlan: Record<string, string> = {
  '1. Goal of the app': '',
  '2. Tech and Research': '',
  '3. Features and KPIs': '',
  '4. Pages and navigation': '',
  '5. UI/UX design': '',
};

const thinPlan = {
  '1. Goal of the app': 'A habit tracker. Project Type: Web App. Help users build habits with streaks and reminders every day.',
  '2. Tech and Research': 'We looked at some apps. Features include tracking and reminders. Modern UI is important for retention and engagement overall.',
  '3. Features and KPIs': 'Habit check-in. Streaks. Reminders. Dashboard. Settings. Each feature should have measurable KPIs for success tracking.',
  '4. Pages and navigation': 'Home page for overview. Dashboard for habits. Settings page for preferences. Profile page for the user account.',
  '5. UI/UX design': 'Modern clean friendly UI with nice colors and spacing. User-friendly and beautiful for everyone who uses the app daily.',
};

const solidPlan = {
  '1. Goal of the app':
    'Help beginners build daily habits with streak accountability.\nProject Type: Web App\nUsers: busy professionals who abandon apps after a week.\nCore: one-tap check-in, streak, gentle reminders.',
  '2. Tech and Research':
    'Competitors: Habitica, Streaks, Productive, Loop Habit Tracker, Habitify, Way of Life, Done, Momentum, StickK, Fabulous, Coach.me, Forest.\nMost used features: daily check-ins, streaks, reminders, simple dashboards, habit categories.\nEvidence: No supporting studies found for this feature. for gamified XP; streaks show mixed retention in consumer apps.\nUI patterns: phone-like simplicity even on web; bottom or sidebar nav; large tap targets; calm palette.',
  '3. Features and KPIs':
    'Daily check-in — KPI: check-ins/day, 7-day retention, miss rate.\nStreaks — KPI: avg streak length, streak recovery rate, churn after break.\nReminders — KPI: reminder open rate, check-in within 1h of reminder.\nDashboard — KPI: sessions/week, time-to-check-in.\nCategories — KPI: habits created, active habits/user.',
  '4. Pages and navigation':
    '- **Landing** (`/`) — marketing + CTA\n- **Login** (`/login`) — email/password\n- **Home** (`/home`) — today habits + check-in buttons\n- **Habit detail** (`/habits/[id]`) — history + streak\n- **Stats** (`/stats`) — weekly chart\n- **Settings** (`/settings`) — reminders, theme\nNav: left sidebar on desktop, bottom tabs on mobile widths.',
  '5. UI/UX design':
    'Palette: #0B1220 background, #22C55E success/check, #F8FAFC text, #334155 borders.\nTypography: Source Sans 3 / IBM Plex Sans.\nNav: sidebar on Web App desktop; density comfortable.\nComponents: large check buttons, streak badge, calm cards.\nshadcn + Tailwind. Avoid Nebulla IDE chrome.',
};

async function main() {
  console.log(`Nebulla hardened pipeline stress test → ${base}`);
  console.log(`projectKey=${projectKey}`);
  console.log(`cwd root=${root}`);

  const health = await api('/api/health');
  if (!health.res.ok) {
    console.error('Server not healthy — aborting live tests');
    process.exit(1);
  }
  const cfg = await api('/api/config');
  console.log(
    `config: mainAi=${cfg.body?.mainAiProvider}/${cfg.body?.mainAiChatModel} key=${cfg.body?.hasMainAiApiKey}`,
  );

  // ── Scenario 5 first (local, deterministic) then 2,4, then live 1,3,6,7 ──

  // ===================== Scenario 5 =====================
  section('Scenario 5 — Thin vs Solid Master Plan gate');
  const thinComplete = isMasterPlanCompleteForDiscovery(thinPlan);
  const solidComplete = isMasterPlanCompleteForDiscovery(solidPlan);
  const emptyComplete = isMasterPlanCompleteForDiscovery(emptyPlan);
  const s5fail: string[] = [];
  if (thinComplete) s5fail.push('Thin plan incorrectly marked COMPLETE');
  if (!solidComplete) s5fail.push('Solid plan incorrectly marked INCOMPLETE');
  if (emptyComplete) s5fail.push('Empty plan incorrectly marked COMPLETE');
  console.log(`thin → complete=${thinComplete} (expect false)`);
  console.log(`solid → complete=${solidComplete} (expect true)`);
  console.log(`empty → complete=${emptyComplete} (expect false)`);
  reports.push({
    id: 5,
    name: 'Thin vs Solid Master Plan',
    what: 'Ran isMasterPlanCompleteForDiscovery on empty, thin, and solid fixtures',
    mode: 'gate',
    correct: s5fail.length ? 'FAIL' : 'PASS',
    quality: s5fail.length ? 'Weak' : 'Good',
    notes: [
      `thin=${thinComplete}`,
      `solid=${solidComplete}`,
      `empty=${emptyComplete}`,
      'Thin lacks routes, evidence phrase, concrete UI tokens',
    ],
    failures: s5fail,
  });

  // ===================== Scenario 2 =====================
  section('Scenario 2 — Vague “just build” / make me an app');
  const vagueCases = [
    'just build a habit tracker',
    'make me an app',
    'just build something',
    'build an app for habits',
  ];
  const s2notes: string[] = [];
  const s2fail: string[] = [];
  for (const text of vagueCases) {
    const r = detectChatMode(text, { masterPlanComplete: false });
    const appendix = chatModeSystemAppendix({
      mode: r.mode,
      codingHint: r.mode === 'guided' ? 'guided-onboarding' : 'discovery-required',
      discoveryRequired: r.discoveryRequired,
    });
    const okMode = r.mode === 'guided' && r.discoveryRequired === true;
    const okAppendix = /ACTIVE MODE: DISCOVERY/i.test(appendix);
    s2notes.push(`"${text}" → mode=${r.mode} discoveryRequired=${r.discoveryRequired} appendixDiscovery=${okAppendix}`);
    if (!okMode) s2fail.push(`Expected guided+discovery for: ${text} (got ${r.mode})`);
    if (!okAppendix) s2fail.push(`Missing DISCOVERY appendix for: ${text}`);
    console.log(s2notes[s2notes.length - 1]);
  }
  // Live turn: vague request with empty plan in system prompt
  let liveVague: { status: number; content: string } | null = null;
  try {
    const sys =
      buildNebulaAssistantSystemPrompt(emptyPlan, '', { modelLabel: 'Grok', providerLabel: 'xAI' }) +
      '\n\n' +
      chatModeSystemAppendix({ mode: 'guided', codingHint: 'guided-onboarding', discoveryRequired: true });
    liveVague = await chatWithSystem(sys, 'just build a habit tracker', [], { buildMode: false });
    const q = countQuestions(liveVague.content);
    const jumped =
      hasStartCoding(liveVague.content) ||
      hasFileBlocks(liveVague.content) ||
      (hasMasterPlan(liveVague.content) && q === 0);
    s2notes.push(
      `LIVE HTTP ${liveVague.status}, chars=${liveVague.content.length}, questions=${q}, jumpedToCode=${jumped}`,
    );
    s2notes.push(`LIVE preview: ${liveVague.content.slice(0, 280).replace(/\n/g, ' ')}`);
    if (liveVague.status !== 200) s2fail.push(`Live chat HTTP ${liveVague.status}`);
    if (jumped) s2fail.push('Live model jumped to Master Plan/code without Discovery question');
    if (q === 0 && liveVague.status === 200) s2fail.push('Live reply asked zero questions');
    console.log(s2notes[s2notes.length - 2]);
    console.log(s2notes[s2notes.length - 1]);
  } catch (e) {
    s2fail.push(`Live vague chat failed: ${(e as Error).message}`);
  }
  reports.push({
    id: 2,
    name: 'Vague “just build” request',
    what: 'Mode detection on vague build phrases + live Grok turn with empty Master Plan',
    mode: vagueCases.map((t) => detectChatMode(t, { masterPlanComplete: false }).mode).join('|'),
    correct: s2fail.length ? (s2fail.some((f) => f.startsWith('Live')) && s2fail.length <= 2 ? 'PARTIAL' : 'FAIL') : 'PASS',
    quality: s2fail.length ? 'Weak' : liveVague && countQuestions(liveVague.content) === 1 ? 'Good' : 'Acceptable',
    notes: s2notes,
    failures: s2fail,
  });

  // ===================== Scenario 4 =====================
  section('Scenario 4 — Debugging path (NDM)');
  const debugCases = [
    'fix the login bug',
    'there is a runtime error on login',
    'debug this stack trace crash',
    'the habit check-in is broken',
  ];
  const s4notes: string[] = [];
  const s4fail: string[] = [];
  for (const text of debugCases) {
    const r = detectChatMode(text, { masterPlanComplete: false });
    const appendix = chatModeSystemAppendix({
      mode: r.mode,
      codingHint: 'NDM: Verify → Analyze → Trace → Fix → Validate',
      discoveryRequired: true,
    });
    const ok = r.mode === 'debugging' && /ACTIVE MODE: DEBUGGING/i.test(appendix);
    s4notes.push(`"${text}" → ${r.mode} ndmAppendix=${/DEBUGGING/i.test(appendix)}`);
    if (!ok) s4fail.push(`Expected debugging+NDM for: ${text} (got ${r.mode})`);
    console.log(s4notes[s4notes.length - 1]);
  }
  let liveDebug: { status: number; content: string } | null = null;
  try {
    const sys =
      buildNebulaAssistantSystemPrompt(thinPlan, '', { modelLabel: 'Grok', providerLabel: 'xAI' }) +
      '\n\n' +
      chatModeSystemAppendix({
        mode: 'debugging',
        codingHint: 'NDM: Verify → Analyze → Trace → Fix → Validate',
        discoveryRequired: true,
      });
    liveDebug = await chatWithSystem(
      sys,
      'fix the login bug — clicking Sign in does nothing and console shows Cannot read properties of null (reading email)',
      [],
      { buildMode: true },
    );
    const c = liveDebug.content;
    const mentionsNdm =
      /verify|analyze|trace|root cause|null|email/i.test(c) || /expected|actual/i.test(c);
    const restartedDiscovery =
      /what's the main thing your app should do/i.test(c) ||
      /what type of project are you building/i.test(c);
    s4notes.push(
      `LIVE HTTP ${liveDebug.status}, chars=${c.length}, ndmish=${mentionsNdm}, restartedDiscovery=${restartedDiscovery}, hasFileBlocks=${hasFileBlocks(c)}`,
    );
    s4notes.push(`LIVE preview: ${c.slice(0, 320).replace(/\n/g, ' ')}`);
    if (liveDebug.status !== 200) s4fail.push(`Live debug HTTP ${liveDebug.status}`);
    if (restartedDiscovery) s4fail.push('Debugging turn restarted full Discovery interview');
    if (!mentionsNdm && liveDebug.status === 200) s4fail.push('Live debug reply showed little NDM structure');
    console.log(s4notes[s4notes.length - 2]);
    console.log(s4notes[s4notes.length - 1]);
  } catch (e) {
    s4fail.push(`Live debug chat failed: ${(e as Error).message}`);
  }
  reports.push({
    id: 4,
    name: 'Debugging path (NDM)',
    what: 'Mode detection for bug language + live Grok debug turn with thin plan',
    mode: 'debugging',
    correct: s4fail.length ? 'FAIL' : 'PASS',
    quality: s4fail.length ? 'Weak' : hasFileBlocks(liveDebug?.content || '') ? 'Good' : 'Acceptable',
    notes: s4notes,
    failures: s4fail,
  });

  // ===================== Scenario 3 =====================
  section('Scenario 3 — Open file then expand project');
  const s3notes: string[] = [];
  const s3fail: string[] = [];
  const openLocal = detectChatMode('Please open nebulla-project/full-bug-database.md', {
    masterPlanComplete: false,
  });
  s3notes.push(`open local → mode=${openLocal.mode} discoveryRequired=${openLocal.discoveryRequired}`);
  if (openLocal.mode !== 'file') s3fail.push(`Expected file mode, got ${openLocal.mode}`);
  if (!openLocal.discoveryRequired) s3fail.push('Expected discoveryRequired after file open with incomplete plan');

  const smart = await handleSmartChatMessage('Please open nebulla-project/full-bug-database.md', {
    masterPlanComplete: false,
  });
  s3notes.push(
    `smartChat handledLocally=${smart.handledLocally} hint=${smart.codingHint} preview=${Boolean(smart.filePreview)}`,
  );
  s3notes.push(`smartChat msg preview: ${smart.assistantMessage.slice(0, 220).replace(/\n/g, ' ')}`);
  if (!smart.handledLocally) s3fail.push('File open was not handled locally');
  if (smart.codingHint !== 'discovery-required-after-file') {
    s3fail.push(`Expected codingHint discovery-required-after-file, got ${smart.codingHint}`);
  }
  if (!/Discovery/i.test(smart.assistantMessage)) s3fail.push('File-open reply missing Discovery nudge');

  // After file: ask to expand project
  const expand = detectChatMode('improve and expand this into a full habit tracker app', {
    masterPlanComplete: false,
  });
  s3notes.push(`expand after file → mode=${expand.mode} discoveryRequired=${expand.discoveryRequired}`);
  if (!(expand.mode === 'guided' || expand.mode === 'coding') || !expand.discoveryRequired) {
    // coding with discoveryRequired may be remapped by smart handler to guided-onboarding
    if (expand.mode === 'coding' && expand.discoveryRequired) {
      s3notes.push('expand detected as coding+discoveryRequired (smart handler maps to guided-onboarding)');
    } else if (expand.mode !== 'guided') {
      s3fail.push(`Expand intent should force Discovery; got ${expand.mode}`);
    }
  }
  // Force guided for build intents when incomplete — "improve and expand" may be free/coding
  const expandSmart = await handleSmartChatMessage('build out a full app from this file', {
    masterPlanComplete: false,
  });
  s3notes.push(`expand smart → mode=${expandSmart.mode} hint=${expandSmart.codingHint}`);
  if (expandSmart.mode !== 'guided' && expandSmart.codingHint !== 'guided-onboarding' && expandSmart.codingHint !== 'discovery-required') {
    s3fail.push(`Expand/build after incomplete plan did not route to Discovery (mode=${expandSmart.mode} hint=${expandSmart.codingHint})`);
  }

  // GitHub open
  const gh = detectChatMode(
    'Open https://github.com/facebook/react/blob/main/README.md',
    { masterPlanComplete: false },
  );
  s3notes.push(`github open → mode=${gh.mode} discoveryRequired=${gh.discoveryRequired}`);
  if (gh.mode !== 'file') s3fail.push(`GitHub open expected file, got ${gh.mode}`);

  let localApiOk = false;
  try {
    const local = await api('/api/files/open', {
      method: 'POST',
      body: JSON.stringify({ path: 'nebulla-project/full-bug-database.md' }),
    });
    localApiOk = local.res.ok && Boolean(local.body?.content || local.body?.success !== false);
    s3notes.push(`API open local HTTP ${local.res.status} ok=${localApiOk}`);
    if (!local.res.ok) s3fail.push(`API file open failed HTTP ${local.res.status}`);
  } catch (e) {
    s3fail.push(`API file open error: ${(e as Error).message}`);
  }

  console.log(s3notes.join('\n'));
  reports.push({
    id: 3,
    name: 'Open file then expand',
    what: 'Local/GitHub file mode + smartChat Discovery nudge + expand/build intent with incomplete plan',
    mode: `${openLocal.mode}→${expandSmart.mode}`,
    correct: s3fail.length ? 'FAIL' : 'PASS',
    quality: s3fail.length ? 'Weak' : localApiOk ? 'Good' : 'Acceptable',
    notes: s3notes,
    failures: s3fail,
  });

  // ===================== Scenario 1 =====================
  section('Scenario 1 — New Project Full Discovery (live multi-turn)');
  const s1notes: string[] = [];
  const s1fail: string[] = [];
  const history: { role: string; content: string }[] = [];
  const bootstrap = buildDiscoveryBootstrap(null); // should ask goal first, then project type
  const sys1 =
    buildNebulaAssistantSystemPrompt(emptyPlan, '', { modelLabel: 'Grok', providerLabel: 'xAI' }) +
    '\n\n' +
    chatModeSystemAppendix({ mode: 'guided', codingHint: 'guided-onboarding', discoveryRequired: true });

  async function turn(user: string, label: string) {
    const r = await chatWithSystem(sys1, user, history, { buildMode: false });
    history.push({ role: 'user', content: user });
    history.push({ role: 'assistant', content: r.content.slice(0, 8000) });
    s1notes.push(
      `${label}: HTTP ${r.status}, q=${countQuestions(r.content)}, mp=${hasMasterPlan(r.content)}, coding=${hasStartCoding(r.content)} | ${r.content.slice(0, 180).replace(/\n/g, ' ')}`,
    );
    console.log(s1notes[s1notes.length - 1]);
    return r;
  }

  let t1, t2, t3, t4, t5, t6, t7;
  try {
    t1 = await turn(bootstrap, 'T1 bootstrap');
    if (t1.status !== 200) s1fail.push(`T1 HTTP ${t1.status}: ${t1.content.slice(0, 120)}`);
    const t1ok =
      /main thing your app should do|core feature/i.test(t1.content) || countQuestions(t1.content) >= 1;
    if (!t1ok) s1fail.push('T1 did not ask main goal question');
    if (countQuestions(t1.content) > 2) s1notes.push('WARN: T1 asked multiple questions');

    t2 = await turn('Daily habit check-ins with a simple streak.', 'T2 goal answer');
    const askedType = /web\s*app|mobile\s*app|landing\s*page|what type of project/i.test(t2.content);
    s1notes.push(`T2 asked Project Type: ${askedType}`);
    if (!askedType) s1fail.push('T2 did not ask for Project Type after goal');

    t3 = await turn('Web App', 'T3 project type');
    if (hasStartCoding(t3.content) || hasFileBlocks(t3.content)) {
      s1fail.push('T3 jumped to coding too early');
    }

    t4 = await turn('Busy professionals who forget habits.', 'T4 audience');
    t5 = await turn('Habitica and Streaks are similar. No special HIPAA needs. Small personal scale.', 'T5 competitors/scale');
    t6 = await turn('Call it StreakLite. Design references: none.', 'T6 name+design');
    t7 = await turn(
      "I believe that's everything — nothing else to add. Please proceed.",
      'T7 final check / proceed',
    );

    const producedMp = history.some((h) => h.role === 'assistant' && hasMasterPlan(h.content));
    const producedCoding = history.some((h) => h.role === 'assistant' && hasStartCoding(h.content));
    s1notes.push(`produced Master Plan tags: ${producedMp}; START_CODING: ${producedCoding}`);

    // Inspect last assistant for research quality if MP present
    const lastAsst = [...history].reverse().find((h) => h.role === 'assistant')?.content || '';
    if (hasMasterPlan(lastAsst)) {
      const inner = lastAsst.match(/<START_MASTERPLAN>([\s\S]*?)<\/?END_MASTERPLAN>/i)?.[1] || lastAsst;
      const competitors =
        /Habitica|Streaks|Productive|Habitify|Loop|Fabulous|Forest|Done|Momentum/i.test(inner);
      const routes = (inner.match(/`\/[^`]+`/g) || []).length;
      const hex = /#[0-9a-fA-F]{3,8}/.test(inner);
      const evidence = /no supporting studies|stud(?:y|ies)|evidence/i.test(inner);
      s1notes.push(`MP research competitors=${competitors} routes=${routes} hex=${hex} evidence=${evidence}`);
      if (!competitors) s1fail.push('Master Plan missing recognizable competitor names');
      if (routes < 2) s1fail.push(`Master Plan has only ${routes} route markers`);
      if (!hex) s1notes.push('WARN: no hex palette in MP (may still be Acceptable)');
      if (!evidence) s1fail.push('Master Plan missing evidence / studies language');
    } else {
      // Maybe still in closing questions — check if still interviewing
      const stillAsking = countQuestions(lastAsst) >= 1 && !hasMasterPlan(lastAsst);
      if (stillAsking) {
        s1notes.push('Still in Discovery after 7 turns — did not reach silent Master Plan yet');
        s1fail.push('Did not emit Master Plan within 7 turns (slow/incomplete Discovery close)');
      } else {
        s1fail.push('No Master Plan produced and not clearly continuing Discovery');
      }
    }
  } catch (e) {
    s1fail.push(`Discovery live flow error: ${(e as Error).message}`);
  }

  // Persist check
  try {
    const mp = await api('/api/master-plan/read');
    const keys = mp.body && typeof mp.body === 'object' ? Object.keys(mp.body) : [];
    s1notes.push(`master-plan/read HTTP ${mp.res.status} keys=${keys.slice(0, 8).join(',')}`);
  } catch {
    /* ignore */
  }

  reports.push({
    id: 1,
    name: 'New Project – Full Discovery',
    what: 'Live multi-turn Discovery from bootstrap with natural short answers (no My Projects type preselect)',
    mode: 'guided/Discovery',
    correct: s1fail.length === 0 ? 'PASS' : s1fail.length <= 2 ? 'PARTIAL' : 'FAIL',
    quality:
      s1fail.length === 0
        ? 'Good'
        : hasMasterPlan(history.filter((h) => h.role === 'assistant').pop()?.content || '')
          ? 'Acceptable'
          : 'Weak',
    notes: s1notes,
    failures: s1fail,
  });

  // ===================== Scenario 7 (v0 prompt — can run without v0 API) =====================
  section('Scenario 7 — v0 / UI prompt quality');
  const s7notes: string[] = [];
  const s7fail: string[] = [];
  const v0Thin = buildV0PromptMarkdown(thinPlan);
  const v0Solid = buildV0PromptMarkdown(solidPlan);
  s7notes.push(`thin prompt chars=${v0Thin.length}`);
  s7notes.push(`solid prompt chars=${v0Solid.length}`);
  s7notes.push(`solid preview:\n${v0Solid.slice(0, 700)}`);
  console.log('--- solid v0 prompt ---\n' + v0Solid + '\n--- end ---');

  if (!/Project type:\s*Web App/i.test(v0Solid)) s7fail.push('Solid v0 prompt missing Project Type');
  if (!/Habitica|Streaks|Productive|Competitors:/i.test(v0Solid)) {
    s7fail.push('Solid v0 prompt missing competitor grounding');
  }
  if (!/`\/home`|`\/login`|`\/stats`|\(\/`/.test(v0Solid) && !/\/home|\/login|\/stats/.test(v0Solid)) {
    s7fail.push('Solid v0 prompt missing concrete routes');
  }
  if (!/#22C55E|#0B1220|Source Sans|sidebar/i.test(v0Solid)) {
    s7fail.push('Solid v0 prompt missing concrete visual tokens from §5');
  }
  if (/modern clean friendly/i.test(v0Solid) && !/#/.test(v0Solid)) {
    s7fail.push('v0 prompt stayed generic');
  }
  if (v0Solid.length < 400) s7fail.push('v0 prompt too short to be specific');
  if (v0Solid.length > 1500) s7fail.push(`v0 prompt exceeds hard cap (${v0Solid.length})`);

  // Thin prompt should still be generated but weaker
  const thinGeneric = /modern clean friendly/i.test(v0Thin) || !/Project type/i.test(v0Thin);
  s7notes.push(`thin looks generic/weak=${thinGeneric}`);

  reports.push({
    id: 7,
    name: 'v0 / UI prompt quality',
    what: 'buildV0PromptMarkdown on thin vs solid Master Plans (no v0 API call — prompt grounding only)',
    mode: 'ui',
    correct: s7fail.length ? 'FAIL' : 'PASS',
    quality: s7fail.length ? 'Weak' : 'Good',
    notes: s7notes,
    failures: s7fail,
  });

  // ===================== Scenario 6 =====================
  section('Scenario 6 — Go Code / Implementation (live)');
  const s6notes: string[] = [];
  const s6fail: string[] = [];

  // Seed solid master plan into workspace
  try {
    const upd = await api('/api/master-plan/update', {
      method: 'POST',
      body: JSON.stringify({
        projectKey,
        projectName,
        plan: solidPlan,
      }),
      timeoutMs: 20_000,
    });
    // try alternate shapes used by app
    let seeded = upd.res.ok;
    if (!seeded) {
      for (const [tabIndex, key] of Object.entries({
        1: '1. Goal of the app',
        2: '2. Tech and Research',
        3: '3. Features and KPIs',
        4: '4. Pages and navigation',
        5: '5. UI/UX design',
      })) {
        const one = await api('/api/master-plan/update', {
          method: 'POST',
          body: JSON.stringify({
            projectKey,
            projectName,
            tabIndex: Number(tabIndex),
            content: solidPlan[key as keyof typeof solidPlan],
          }),
        });
        s6notes.push(`seed tab ${tabIndex} HTTP ${one.res.status}`);
        if (one.res.ok) seeded = true;
      }
    } else {
      s6notes.push(`seed plan HTTP ${upd.res.status}`);
    }
    if (!seeded) s6fail.push('Could not seed Master Plan for Go Code');
  } catch (e) {
    s6fail.push(`Seed plan failed: ${(e as Error).message}`);
  }

  // Inspect go-code system prompt contract in source (static) + attempt go-code kickoff
  const goPromptHasQuality =
    /ARCHITECTURE-FIRST CODING QUALITY/i.test(
      await import('node:fs').then((fs) =>
        fs.readFileSync(path.join(root, 'server.ts'), 'utf8'),
      ),
    );
  s6notes.push(`server go-code includes ARCHITECTURE-FIRST contract: ${goPromptHasQuality}`);
  if (!goPromptHasQuality) s6fail.push('Go Code system prompt missing architecture-first contract');

  let goStarted = false;
  try {
    const go = await api('/api/grok/go-code', {
      method: 'POST',
      timeoutMs: 180_000,
      body: JSON.stringify({
        userId: 'stress-tester',
        projectName,
        projectKey,
        userNote: 'Implement the Web App from Master Plan — habit home + login + settings routes.',
        messages: [
          {
            role: 'user',
            content: 'Go — implement from Master Plan. Web App habit tracker.',
          },
        ],
      }),
    });
    s6notes.push(`go-code HTTP ${go.res.status} keys=${Object.keys(go.body || {}).join(',')}`);
    s6notes.push(`go-code body preview: ${JSON.stringify(go.body).slice(0, 400)}`);
    goStarted = go.res.ok && (go.body?.pending || go.body?.coding || go.body?.preCodingSummary);
    if (!go.res.ok) {
      s6fail.push(`go-code failed HTTP ${go.res.status}: ${go.body?.error || go.text?.slice(0, 160)}`);
    } else {
      // Poll a few times for completion (may be long)
      let written: string[] = [];
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        const poll = await api('/api/grok/go-code/poll', { timeoutMs: 30_000 });
        const st = poll.body?.status || poll.body?.state || poll.body?.phase;
        s6notes.push(`poll[${i}] HTTP ${poll.res.status} status=${st} written=${(poll.body?.written || []).length || poll.body?.writtenCount || 0}`);
        if (poll.body?.done || poll.body?.status === 'complete' || poll.body?.status === 'done') {
          written = poll.body?.written || poll.body?.writtenPaths || [];
          break;
        }
        if (poll.body?.error || poll.body?.status === 'error') {
          s6fail.push(`go-code poll error: ${poll.body?.error || poll.body?.message || 'error'}`);
          break;
        }
        if (poll.body?.content && hasFileBlocks(poll.body.content)) {
          written = ['(content present)'];
          break;
        }
      }
      s6notes.push(`final written count/signal: ${Array.isArray(written) ? written.length : written}`);
      // List workspace app files
      const list = await api('/api/fs/list?dir=app');
      const files = list.body?.entries || list.body?.files || list.body?.items || [];
      s6notes.push(`app/ listing HTTP ${list.res.status} entries=${Array.isArray(files) ? files.length : 'n/a'}`);
      if (Array.isArray(files) && files.length) {
        s6notes.push(`app files sample: ${files.slice(0, 12).map((f: any) => f.name || f.path || f).join(', ')}`);
      }
    }
  } catch (e) {
    s6fail.push(`go-code request error: ${(e as Error).message}`);
  }

  reports.push({
    id: 6,
    name: 'Go Code / Implementation',
    what: 'Seeded solid Master Plan, verified go-code contract in server, kicked /api/grok/go-code and polled',
    mode: 'coding/Go',
    correct: !goPromptHasQuality ? 'FAIL' : s6fail.length ? 'PARTIAL' : goStarted ? 'PASS' : 'PARTIAL',
    quality: s6fail.length > 2 ? 'Weak' : goStarted ? 'Acceptable' : 'Weak',
    notes: s6notes,
    failures: s6fail,
  });

  // ===================== Summary =====================
  section('REPORT SUMMARY');
  reports.sort((a, b) => a.id - b.id);
  for (const r of reports) {
    console.log(`\n### Scenario ${r.id}: ${r.name}`);
    console.log(`What: ${r.what}`);
    console.log(`Mode: ${r.mode}`);
    console.log(`Correct: ${r.correct}`);
    console.log(`Quality: ${r.quality}`);
    if (r.failures.length) {
      console.log('Failures:');
      for (const f of r.failures) console.log(`  - ${f}`);
    }
    console.log('Notes:');
    for (const n of r.notes.slice(0, 12)) console.log(`  - ${n}`);
  }

  const pass = reports.filter((r) => r.correct === 'PASS').length;
  const partial = reports.filter((r) => r.correct === 'PARTIAL').length;
  const fail = reports.filter((r) => r.correct === 'FAIL').length;
  console.log(`\nTotals: PASS=${pass} PARTIAL=${partial} FAIL=${fail} / ${reports.length}`);

  // Write JSON report
  const fs = await import('node:fs');
  const out = path.join(root, 'scripts/stress-test-hardened-pipeline.report.json');
  fs.writeFileSync(out, JSON.stringify({ projectKey, base, reports }, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
