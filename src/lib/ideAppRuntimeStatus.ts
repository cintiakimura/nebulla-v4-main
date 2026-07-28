/**
 * App Status — beginner-friendly preview runtime health.
 * Single source of truth for chat popover + preview badge + NDM Verify input.
 */

import { t } from './i18n/t';

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
};

const MAX_ISSUES = 20;
const STACK_MAX = 2500;
const MSG_MAX = 800;

const ISSUE_EVENT = 'nebula-app-runtime-issue';
const CLEARED_EVENT = 'nebula-app-runtime-cleared';
const OPEN_MENU_EVENT = 'nebula-open-app-status';
const LAST_SEEN_LS = 'nebula-app-status-last-seen-id';

type Listener = () => void;

let issues: AppRuntimeIssue[] = [];
let lastSeenId: string | null = readLastSeen();
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
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function fingerprintOf(message: string, route?: string): string {
  return `${truncate(message, 200)}|${(route || '').trim()}`.toLowerCase();
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

  if (input.source === 'build' || /failed to load|preview couldn't load|net::|err_connection/i.test(msg)) {
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
  return { issues: [...issues], unreadCount, lastSeenId };
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
  writeLastSeen(null);
  emit(CLEARED_EVENT);
  notify();
}

export function clearAppRuntimeIssue(id: string): void {
  issues = issues.filter((i) => i.id !== id);
  notify();
  emit(CLEARED_EVENT, { id });
}

/** Clear when switching projects. */
export function resetAppRuntimeForProject(): void {
  clearAppRuntimeIssues();
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
    issues = [{ ...existing, at: Date.now(), stack: truncate(input.stack || existing.stack || '', STACK_MAX) || existing.stack }, ...issues.filter((i) => i.id !== existing.id)].slice(0, MAX_ISSUES);
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

/** Structured payload for Agent / NDM Verify (visible or send as user turn). */
export function formatAppStatusDebugMessage(issue: AppRuntimeIssue): string {
  const lines = [
    '[APP_STATUS_DEBUG]',
    `friendly: ${issue.friendlyTitle} — ${issue.friendlyBody}`,
    `technical: ${issue.technicalMessage}`,
    issue.route ? `route: ${issue.route}` : null,
    issue.href ? `href: ${issue.href}` : null,
    `source: ${issue.source}`,
    `at: ${new Date(issue.at).toISOString()}`,
    issue.stack ? `stack:\n${issue.stack}` : null,
    '',
    'Please follow NDM (Verify → Analyze → Trace → Fix → Validate). Do not ask what error I see — App Status already provided it. Ask only if you need the expected behavior.',
  ];
  return lines.filter((l) => l != null).join('\n');
}

export function looksLikeBrokenAppComplaint(text: string): boolean {
  return /\b(it('?s| is)?\s+(broken|not working)|doesn'?t work|does not work|nothing works|blank screen|white screen|preview (is )?(broken|blank)|something('?s| is) wrong)\b/i.test(
    String(text || ''),
  );
}

export function openAppStatusMenu(): void {
  emit(OPEN_MENU_EVENT);
}

export const APP_STATUS_EVENTS = {
  issue: ISSUE_EVENT,
  cleared: CLEARED_EVENT,
  openMenu: OPEN_MENU_EVENT,
} as const;

export function relativeAppStatusTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
