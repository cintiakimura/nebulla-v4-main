/**
 * App Status — beginner-friendly preview runtime health.
 * Single source of truth for chat popover + preview badge + NDM Verify input.
 */

import { t } from './i18n/t';
import { reportAppStatusFixOutcome } from './contractTelemetryClient';

export type AppRuntimeIssueSource = 'preview' | 'build' | 'network';

export type AppRuntimeSeverity = 'error' | 'warn' | 'info';

export type AppRuntimeIssue = {
  id: string;
  fingerprint: string;
  severity: AppRuntimeSeverity;
  friendlyTitle: string;
  friendlyBody: string;
  technicalMessage: string;
  stack?: string;
  href?: string;
  route?: string;
  source: AppRuntimeIssueSource;
  at: number;
};

export type AppRuntimeSnapshot = {
  issues: AppRuntimeIssue[];
  unreadCount: number;
  lastSeenId: string | null;
  pendingValidation: boolean;
};

const MAX_ISSUES = 20;
const STACK_MAX = 2500;
const MSG_MAX = 800;
const DEBUG_PAYLOAD_MAX = 5500;
const HEALTHY_QUIET_DEFAULT_MS = 4000;

const ISSUE_EVENT = 'nebula-app-runtime-issue';
const CLEARED_EVENT = 'nebula-app-runtime-cleared';
const OPEN_MENU_EVENT = 'nebula-open-app-status';
const LOOKS_FIXED_EVENT = 'nebula-app-runtime-looks-fixed';
const RELOAD_PREVIEW_EVENT = 'nebula-reload-app-preview';
const LAST_SEEN_LS = 'nebula-app-status-last-seen-id';

type Listener = () => void;

let issues: AppRuntimeIssue[] = [];
let lastSeenId: string | null = readLastSeen();
let pendingValidationFingerprints: string[] | null = null;
let pendingValidationStartedAt = 0;
let healthyTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_LS);
  } catch {
    return null;
  }
}

function writeLastSeen(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_SEEN_LS, id);
    else localStorage.removeItem(LAST_SEEN_LS);
  } catch {
    /* ignore */
  }
}

function emit(name: string, detail?: unknown): void {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* ignore */
  }
}

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

function truncate(s: string, max: number): string {
  const text = String(s || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function fingerprintOf(message: string, route?: string): string {
  return `${truncate(message, 200)}|${(route || '').trim()}`.toLowerCase();
}

function fingerprintFamily(fp: string): string {
  const msg = (fp.split('|')[0] || '').replace(/\d+/g, '#').slice(0, 80);
  return msg;
}

/** Map raw runtime text → beginner-friendly copy (user-communication-rules Tier 1). */
export function mapRuntimeToFriendly(input: {
  technicalMessage: string;
  source?: AppRuntimeIssueSource;
  route?: string;
}): { friendlyTitle: string; friendlyBody: string; severity: AppRuntimeSeverity } {
  const msg = input.technicalMessage || '';
  const lower = msg.toLowerCase();
  const where = input.route?.trim() ? ` on ${input.route.trim()}` : '';

  if (/429|too many requests|rate limit/i.test(lower)) {
    return {
      severity: 'warn',
      friendlyTitle: t('appStatus.friendly.rateLimitTitle'),
      friendlyBody: t('appStatus.friendly.rateLimitBody'),
    };
  }

  if (
    /failed to load|preview couldn't load|net::|err_connection|iframe failed|preview bootstrap/i.test(msg)
  ) {
    return {
      severity: 'error',
      friendlyTitle: t('appStatus.friendly.previewLoadTitle'),
      friendlyBody: t('appStatus.friendly.previewLoadBody'),
    };
  }

  if (/cannot read propert|undefined is not|null is not|is not a function/i.test(lower)) {
    return {
      severity: 'error',
      friendlyTitle: t('appStatus.friendly.brokeTitle'),
      friendlyBody: t('appStatus.friendly.missingPropBody', { where }),
    };
  }

  if (/module not found|cannot find module|failed to resolve|404/i.test(lower)) {
    return {
      severity: 'error',
      friendlyTitle: t('appStatus.friendly.brokeTitle'),
      friendlyBody: t('appStatus.friendly.moduleBody', { where }),
    };
  }

  if (/hydrat|minified react error|react error/i.test(lower)) {
    return {
      severity: 'error',
      friendlyTitle: t('appStatus.friendly.brokeTitle'),
      friendlyBody: t('appStatus.friendly.hydratBody', { where }),
    };
  }

  if (input.source === 'network' || /\b(4\d\d|5\d\d)\b|failed to fetch|networkerror/i.test(lower)) {
    return {
      severity: 'warn',
      friendlyTitle: t('appStatus.friendly.networkTitle'),
      friendlyBody: t('appStatus.friendly.networkBody'),
    };
  }

  return {
    severity: 'error',
    friendlyTitle: t('appStatus.friendly.brokeTitle'),
    friendlyBody: where
      ? t('appStatus.friendly.genericBodyWhere', { where })
      : t('appStatus.friendly.genericBody'),
  };
}

export function getAppRuntimeSnapshot(): AppRuntimeSnapshot {
  let unreadCount = 0;
  if (!lastSeenId) {
    unreadCount = issues.filter((i) => i.severity !== 'info').length;
  } else {
    const idx = issues.findIndex((i) => i.id === lastSeenId);
    const newer = idx === -1 ? issues : issues.slice(0, idx);
    unreadCount = newer.filter((i) => i.severity !== 'info').length;
  }
  return {
    issues: [...issues],
    unreadCount,
    lastSeenId,
    pendingValidation: Boolean(pendingValidationFingerprints?.length),
  };
}

export function getAppRuntimeErrorCount(): number {
  return issues.filter((i) => i.severity === 'error' || i.severity === 'warn').length;
}

export function getLatestAppRuntimeIssue(): AppRuntimeIssue | null {
  return issues[0] ?? null;
}

export function subscribeAppRuntime(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markAppRuntimeSeen(): void {
  lastSeenId = issues[0]?.id ?? null;
  writeLastSeen(lastSeenId);
  notify();
}

export function clearAppRuntimeIssues(): void {
  issues = [];
  lastSeenId = null;
  pendingValidationFingerprints = null;
  clearHealthyTimer();
  writeLastSeen(null);
  emit(CLEARED_EVENT);
  notify();
}

export function clearAppRuntimeIssue(id: string): void {
  issues = issues.filter((i) => i.id !== id);
  notify();
  emit(CLEARED_EVENT, { id });
}

export function clearAppRuntimeByFingerprints(fingerprints: string[]): void {
  const set = new Set(fingerprints.map((f) => f.toLowerCase()));
  if (set.size === 0) return;
  const before = issues.length;
  issues = issues.filter((i) => !set.has(i.fingerprint.toLowerCase()));
  if (issues.length === before) return;
  notify();
  emit(CLEARED_EVENT, { fingerprints: [...set] });
}

/** Clear when switching projects. */
export function resetAppRuntimeForProject(): void {
  clearAppRuntimeIssues();
}

function clearHealthyTimer(): void {
  if (healthyTimer != null) {
    clearTimeout(healthyTimer);
    healthyTimer = null;
  }
}

/**
 * After a successful Agent apply from an App Status turn — watch for a quiet reload.
 * Does not clear issues yet; healthy check treats re-reports after the mark/reload anchor.
 */
export function markAppRuntimePendingValidation(fingerprints?: string[]): void {
  const fps =
    fingerprints && fingerprints.length > 0
      ? fingerprints
      : issues.filter((i) => i.severity !== 'info').map((i) => i.fingerprint);
  pendingValidationFingerprints = fps.length ? fps : null;
  // Anchor for “reappeared”: load-time errors (before iframe onLoad) must still count.
  pendingValidationStartedAt = Date.now();
  clearHealthyTimer();
  notify();
}

/**
 * Call when a preview reload begins while Validate is pending (before navigation).
 * Advances the anchor so a prior failed window’s reappear does not poison this attempt,
 * while errors during the upcoming page load still land after the anchor.
 */
export function noteAppRuntimeValidationReload(): void {
  if (!pendingValidationFingerprints?.length) return;
  pendingValidationStartedAt = Date.now();
  clearHealthyTimer();
}

export function requestAppPreviewReload(): void {
  noteAppRuntimeValidationReload();
  emit(RELOAD_PREVIEW_EVENT);
}

/**
 * Call when same-origin preview loads / bridge injects.
 * Restarts the quiet timer but does NOT move the mark/reload anchor forward —
 * errors during page load arrive before this call and must still block clear.
 */
export function scheduleAppRuntimeHealthyCheck(options?: { quietMs?: number }): void {
  if (!pendingValidationFingerprints?.length) return;
  const quietMs = options?.quietMs ?? HEALTHY_QUIET_DEFAULT_MS;
  clearHealthyTimer();
  const windowStart = pendingValidationStartedAt;
  const watched = [...pendingValidationFingerprints];
  healthyTimer = setTimeout(() => {
    healthyTimer = null;
    if (!pendingValidationFingerprints?.length) return;
    // Superseded by a newer mark / reload note.
    if (pendingValidationStartedAt !== windowStart) return;
    const reappeared = issues.filter(
      (i) =>
        i.severity !== 'info' &&
        watched.includes(i.fingerprint) &&
        i.at > windowStart, // after mark/reload note (includes load-time before onLoad)
    );
    if (reappeared.length > 0) {
      // Advance so the next clean reload (even without note) can clear.
      pendingValidationStartedAt = Date.now();
      reportAppStatusFixOutcome({ outcome: 'stillRed', reloadCycles: 1 });
      return;
    }
    clearAppRuntimeByFingerprints(watched);
    if (getAppRuntimeErrorCount() === 0) {
      issues = [];
      lastSeenId = null;
      writeLastSeen(null);
    }
    pendingValidationFingerprints = null;
    notify();
    emit(CLEARED_EVENT, { reason: 'validated' });
    emit(LOOKS_FIXED_EVENT);
    reportAppStatusFixOutcome({ outcome: 'reachedGreen', reloadCycles: 1 });
  }, quietMs);
}

export function resolveAppRuntimeIfHealthy(options?: { quietMs?: number }): boolean {
  if (!pendingValidationFingerprints?.length) return false;
  scheduleAppRuntimeHealthyCheck(options);
  return true;
}

/** True when an App Status Agent turn should start the Validate/reload loop. */
export function shouldMarkAppStatusValidation(coding: {
  ran?: boolean;
  ok?: boolean;
}): boolean {
  return Boolean(coding.ran) && coding.ok !== false;
}

export function reportAppRuntimeIssue(input: {
  technicalMessage: string;
  stack?: string;
  href?: string;
  route?: string;
  source?: AppRuntimeIssueSource;
}): AppRuntimeIssue | null {
  const technicalMessage = truncate(input.technicalMessage || 'Unknown preview error', MSG_MAX);
  if (!technicalMessage) return null;

  const source = input.source || 'preview';
  const route = input.route?.trim() || undefined;
  const fp = fingerprintOf(technicalMessage, route);
  const existing = issues.find((i) => i.fingerprint === fp);
  if (existing) {
    // Bump to front with fresh timestamp
    issues = [
      {
        ...existing,
        at: Date.now(),
        stack: truncate(input.stack || existing.stack || '', STACK_MAX) || existing.stack,
      },
      ...issues.filter((i) => i.id !== existing.id),
    ].slice(0, MAX_ISSUES);
    notify();
    emit(ISSUE_EVENT, { issue: issues[0], deduped: true });
    return issues[0];
  }

  const friendly = mapRuntimeToFriendly({ technicalMessage, source, route });
  const issue: AppRuntimeIssue = {
    id: `rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fingerprint: fp,
    severity: friendly.severity,
    friendlyTitle: friendly.friendlyTitle,
    friendlyBody: friendly.friendlyBody,
    technicalMessage,
    stack: truncate(input.stack || '', STACK_MAX) || undefined,
    href: input.href,
    route,
    source,
    at: Date.now(),
  };
  issues = [issue, ...issues].slice(0, MAX_ISSUES);
  notify();
  emit(ISSUE_EVENT, { issue, deduped: false });
  try {
    console.info('[AppStatus] issue', { severity: issue.severity, source: issue.source, count: issues.length });
  } catch {
    /* ignore */
  }
  return issue;
}

function formatOneIssueBlock(issue: AppRuntimeIssue, label: string): string {
  return [
    `--- ${label} ---`,
    `friendly: ${issue.friendlyTitle} — ${issue.friendlyBody}`,
    `technical: ${issue.technicalMessage}`,
    issue.route ? `route: ${issue.route}` : null,
    issue.href ? `href: ${issue.href}` : null,
    `source: ${issue.source}`,
    `at: ${new Date(issue.at).toISOString()}`,
    issue.stack ? `stack:\n${issue.stack}` : null,
  ]
    .filter((l) => l != null)
    .join('\n');
}

/**
 * Pick primary (latest) + up to `limit-1` related issues (same route / fingerprint family / source).
 */
export function getAppStatusDebugIssues(limit = 3): {
  primary: AppRuntimeIssue | null;
  related: AppRuntimeIssue[];
} {
  const primary = issues[0] ?? null;
  if (!primary) return { primary: null, related: [] };
  const maxRelated = Math.max(0, limit - 1);
  const related: AppRuntimeIssue[] = [];
  const primaryFamily = fingerprintFamily(primary.fingerprint);
  for (const issue of issues.slice(1)) {
    if (related.length >= maxRelated) break;
    const sameRoute = Boolean(primary.route && issue.route && primary.route === issue.route);
    const sameFamily = fingerprintFamily(issue.fingerprint) === primaryFamily;
    const sameSource = issue.source === primary.source;
    if (sameRoute || sameFamily || sameSource) {
      related.push(issue);
    }
  }
  // If no related by affinity, still include next newest for context
  if (related.length === 0 && issues.length > 1 && maxRelated > 0) {
    related.push(issues[1]);
  }
  return { primary, related };
}

export type FormatAppStatusDebugInput =
  | AppRuntimeIssue
  | { primary: AppRuntimeIssue; related?: AppRuntimeIssue[]; openFilePath?: string };

/** Structured payload for Agent / NDM Verify (visible or send as user turn). */
export function formatAppStatusDebugMessage(input: FormatAppStatusDebugInput): string {
  const primary = 'primary' in input && input.primary ? input.primary : (input as AppRuntimeIssue);
  const related =
    'primary' in input && Array.isArray(input.related) ? input.related : ([] as AppRuntimeIssue[]);
  const openFilePath =
    'primary' in input && typeof input.openFilePath === 'string' ? input.openFilePath.trim() : '';

  const blocks = [formatOneIssueBlock(primary, 'primary')];
  related.forEach((issue, idx) => {
    blocks.push(formatOneIssueBlock(issue, `related ${idx + 1}`));
  });

  let body = [
    '[APP_STATUS_DEBUG]',
    ...blocks,
    openFilePath ? `ide_open_file: ${openFilePath}` : null,
    '',
    'Please follow NDM (Verify → Analyze → Trace → Fix → Validate). Do not ask what error I see — App Status already provided it. Ask only if you need the expected behavior.',
  ]
    .filter((l) => l != null)
    .join('\n');

  if (body.length > DEBUG_PAYLOAD_MAX) {
    body = `${body.slice(0, DEBUG_PAYLOAD_MAX)}…`;
  }
  return body;
}

/** Convenience: format from current store (primary + related). */
export function formatLatestAppStatusDebugMessage(options?: { openFilePath?: string }): string | null {
  const { primary, related } = getAppStatusDebugIssues(3);
  if (!primary) return null;
  return formatAppStatusDebugMessage({
    primary,
    related,
    openFilePath: options?.openFilePath,
  });
}

/**
 * Multilingual “it’s broken” / blank screen phrases (en/fr/it/es/de).
 * Still requires a latest issue before auto-attach.
 */
export function looksLikeBrokenAppComplaint(text: string): boolean {
  const s = String(text || '');
  return (
    /\b(it('?s| is)?\s+(broken|not working)|doesn'?t work|does not work|nothing works|blank screen|white screen|preview (is )?(broken|blank)|something('?s| is) wrong)\b/i.test(
      s,
    ) ||
    // FR (accented letters — avoid \b which is ASCII-only without /u)
    /(c('?est|a)\s+(cass[eé]|cassé)|ça\s+marche\s+pas|ca\s+marche\s+pas|ne\s+fonctionne\s+pas|écran\s+blanc|ecran\s+blanc|ça\s+ne\s+marche\s+pas)/i.test(
      s,
    ) ||
    // IT
    /(non\s+funziona|è\s+rotto|e\s+rotto|schermo\s+bianco|non\s+va\b|qualcosa\s+non\s+va|si\s+è\s+rotto)/i.test(
      s,
    ) ||
    // ES
    /(no\s+funciona|est[aá]\s+roto|pantalla\s+en\s+blanco|algo\s+est[aá]\s+mal|no\s+va\b)/i.test(s) ||
    // DE
    /(funktioniert\s+nicht|kaputt|wei(ß|ss)er?\s+bildschirm|geht\s+nicht|etwas\s+stimmt\s+nicht)/i.test(s)
  );
}

/**
 * Soft check: Agent applied file: but skipped Verify/Analyze/Trace language.
 * Multilingual (CONTENT_LOCALE via device prefs + Grok detection) — do not EN-only gate.
 */
export function assistantSkippedNdmVerify(assistantText: string): boolean {
  const raw = String(assistantText || '');
  const hasFile = /```file:|^\s*file:/im.test(raw);
  if (!hasFile) return false;
  const hasNdm =
    // EN
    /\b(verify|analy[sz]e|trace|ndm|root cause|reproduc)/i.test(raw) ||
    // FR
    /\b(v[eé]rif(ier|ication)?|analyser|analyse|tracer|cause|reproduire)\b/i.test(raw) ||
    // IT
    /\b(verifica(re)?|analizza(re)?|analisi|traccia(re)?|causa|riprodurre)\b/i.test(raw) ||
    // ES
    /\b(verifica(r)?|analiza(r)?|an[aá]lisis|rastrear|causa|reproducir)\b/i.test(raw) ||
    // DE
    /\b(pr[uü]fen|verifizier|analysier|nachvollzieh|ursache|reproduz)/i.test(raw);
  return !hasNdm;
}

export function openAppStatusMenu(): void {
  emit(OPEN_MENU_EVENT);
}

export const APP_STATUS_EVENTS = {
  issue: ISSUE_EVENT,
  cleared: CLEARED_EVENT,
  openMenu: OPEN_MENU_EVENT,
  looksFixed: LOOKS_FIXED_EVENT,
  reloadPreview: RELOAD_PREVIEW_EVENT,
} as const;

export function relativeAppStatusTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 10) return t('appStatus.time.justNow');
  if (s < 60) return t('appStatus.time.secondsAgo', { count: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('appStatus.time.minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  return t('appStatus.time.hoursAgo', { count: h });
}

/** Test-only: reset in-memory store (no DOM required). */
export function __resetAppRuntimeStoreForTests(): void {
  issues = [];
  lastSeenId = null;
  pendingValidationFingerprints = null;
  pendingValidationStartedAt = 0;
  clearHealthyTimer();
}
