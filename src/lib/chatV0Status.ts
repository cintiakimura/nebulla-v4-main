import { fetchJson } from './apiFetch';
import { withProjectQuery } from './nebulaProjectApi';
import { hasLocalV0ApiKey } from './v0Key';
import { computeV0Readiness, type V0ReadinessResult } from './v0Readiness';

export type ChatV0StudioStatus = {
  hasV0ApiKey?: boolean;
  v0PromptExists?: boolean;
  v0PromptLength?: number;
  v0Starting?: boolean;
  v0PendingChatId?: string;
  v0StartError?: string;
  hasRealV0?: boolean;
  v0DemoUrl?: string;
};

export type ChatV0StatusSnapshot = {
  readiness: V0ReadinessResult;
  studio: ChatV0StudioStatus;
  line: string;
  detail: string;
  /** True while v0-pro is starting or polling on the server. */
  live: boolean;
};

function formatV0StatusLine(
  studio: ChatV0StudioStatus,
  readiness: V0ReadinessResult,
  liveHint?: string,
): string {
  if (liveHint?.trim()) return liveHint.trim();
  if (studio.hasRealV0) {
    return 'v0 UI generated — open UI Studio for live preview';
  }
  if (studio.v0Starting) {
    return 'v0 generating UI on server — polling for files (1–4 min)…';
  }
  if (readiness.resumeOnly) {
    return 'v0 session active — use Resume in chat, or Cancel / Clear if stuck';
  }
  if (studio.v0StartError && !studio.v0PendingChatId) {
    return `v0 error: ${studio.v0StartError.slice(0, 100)}`;
  }
  if (!readiness.ready) {
    return readiness.blockReason
      ? `v0 not ready — ${readiness.blockReason.slice(0, 120)}`
      : 'v0 not ready — add API key and save Master Plan §4+§5';
  }
  const promptLen = studio.v0PromptLength ?? 0;
  return `v0 ready — prompt ${promptLen} chars; manual Generate in original UI Studio only (Beta is auto path)`;
}

function formatV0StatusDetail(studio: ChatV0StudioStatus, readiness: V0ReadinessResult): string {
  const checks = readiness.checks
    .map((c) => `${c.ok ? '✓' : '○'} ${c.label}${c.hint ? ` (${c.hint})` : ''}`)
    .join(' · ');
  if (studio.hasRealV0 && studio.v0DemoUrl?.trim()) {
    return `${checks} · Demo URL available`;
  }
  return checks || 'Check My services for v0 API key';
}

/** Load v0 readiness for the chat activity status strip. */
export async function fetchChatV0StatusSnapshot(): Promise<ChatV0StatusSnapshot> {
  let studio: ChatV0StudioStatus = {};
  let serverHasV0Key = false;
  try {
    const cfg = await fetchJson<{ hasV0ApiKey?: boolean }>(withProjectQuery('/api/config'), {
      credentials: 'include',
    });
    serverHasV0Key = Boolean(cfg.hasV0ApiKey);
  } catch {
    /* ignore */
  }
  try {
    studio = await fetchJson<ChatV0StudioStatus>(withProjectQuery('/api/nebula-ui-studio/status'), {
      credentials: 'include',
    });
  } catch {
    /* ignore */
  }
  const readiness = computeV0Readiness({
    hasV0ApiKey: serverHasV0Key || studio.hasV0ApiKey,
    hasLocalV0ApiKey: hasLocalV0ApiKey(),
    v0ServerReady: serverHasV0Key,
    v0PromptExists: studio.v0PromptExists,
    v0PromptLength: studio.v0PromptLength,
    v0Starting: studio.v0Starting,
    v0PendingChatId: studio.v0PendingChatId,
    v0StartError: studio.v0StartError,
    hasRealV0: studio.hasRealV0,
  });
  return {
    readiness,
    studio,
    line: formatV0StatusLine(studio, readiness),
    detail: formatV0StatusDetail(studio, readiness),
    live: Boolean(studio.v0Starting || readiness.resumeOnly),
  };
}

/** Push live v0 status into the IDE chat strip (UI Studio + chat share this). */
export function emitChatV0Progress(line: string, detail?: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent('nebula-chat-v0-progress', {
        detail: { line: line.trim(), detail: detail?.trim() || undefined },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function emitChatV0Watch(active: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent('nebula-chat-v0-watch', { detail: { active } }));
  } catch {
    /* ignore */
  }
}
