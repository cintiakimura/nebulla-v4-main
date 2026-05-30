import { fetchJson, readResponseJson } from './apiFetch';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { formatV0UiError } from './v0ErrorMessage';
import { getV0RequestHeaders, hasLocalV0ApiKey } from './v0Key';
import { emitChatV0Progress, emitChatV0Watch } from './chatV0Status';

export type V0GenerationResult = {
  ok?: boolean;
  chatId?: string;
  written?: string[];
  demoUrl?: string;
  source?: string;
  hint?: string;
  error?: string;
  pending?: boolean;
  idle?: boolean;
  starting?: boolean;
  resumed?: boolean;
  elapsedMs?: number;
  recovered?: boolean;
};

const V0_HEADERS = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...getV0RequestHeaders(),
});

const POLL_MS = 5000;
const MAX_POLLS = 120;
const V0_START_TIMEOUT_MS = 20_000;
const STARTING_LOG_EVERY_N_POLLS = 8;

/** Prevent AIChat + UI Studio from running duplicate poll loops. */
let v0GenerationInFlight: Promise<V0GenerationResult> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function emitV0DemoReady(demoUrl?: string): void {
  const url = demoUrl?.trim();
  if (!url) return;
  try {
    window.dispatchEvent(new CustomEvent('nebula-v0-demo-ready', { detail: { demoUrl: url } }));
  } catch {
    /* ignore */
  }
}

type V0StudioStatus = {
  v0Pending?: boolean;
  v0Starting?: boolean;
  v0PendingChatId?: string;
  v0StartError?: string;
  hasRealV0?: boolean;
};

async function fetchV0StudioStatus(): Promise<V0StudioStatus> {
  try {
    return await fetchJson<V0StudioStatus>(withProjectQuery('/api/nebula-ui-studio/status'), {
      credentials: 'include',
    });
  } catch {
    return {};
  }
}

function canResumePollOnly(status: V0StudioStatus, resumeOnly?: boolean): boolean {
  if (resumeOnly !== true) return false;
  if (status.hasRealV0) return false;
  const chatId = status.v0PendingChatId?.trim();
  const starting = Boolean(status.v0Starting);
  return Boolean(chatId || starting || status.v0Pending);
}

async function postV0Start(
  body: ReturnType<typeof withProjectBody>,
  onProgress?: GrokActivityProgressFn,
): Promise<{ pollChatId?: string; done?: V0GenerationResult }> {
  onProgress?.('Starting v0 generation on server…', 'info');
  try {
    const response = await fetch(withProjectQuery('/api/nebula-ui-studio/v0-start'), {
      method: 'POST',
      headers: V0_HEADERS(),
      credentials: 'include',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(V0_START_TIMEOUT_MS),
    });
    const start = await readResponseJson<V0GenerationResult & { error?: string; hint?: string }>(response);
    if (!response.ok) {
      const msg = start.error || `v0 start failed (${response.status})`;
      if (/v0-prompt\.md is empty|save Master Plan/i.test(msg)) {
        return {
          done: {
            ok: false,
            error: formatV0UiError(msg, hasLocalV0ApiKey()),
            hint: start.hint || 'Save Master Plan §4+§5, then click Generate v0 once.',
          },
        };
      }
      return { done: { ok: false, error: formatV0UiError(msg, hasLocalV0ApiKey()), hint: start.hint } };
    }
    if (start.error && !start.chatId && !start.pending) {
      return { done: { ok: false, error: formatV0UiError(start.error, hasLocalV0ApiKey()) } };
    }
    if (start.written?.length) {
      onProgress?.(`v0 wrote ${start.written.length} file(s)`, 'success');
      return { done: start };
    }
    const pollChatId = start.chatId?.trim() || undefined;
    if (start.resumed) {
      onProgress?.('Resuming in-progress v0 chat (no new charge)…', 'info');
    } else if (start.starting) {
      onProgress?.('v0 chat starting on server — polling for files (1–4 min)', 'info');
    } else if (start.pending && pollChatId) {
      onProgress?.('v0 chat started — waiting for files', 'info');
    }
    return { pollChatId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'v0 start failed';
    onProgress?.(
      /timed out|fetch failed|failed to fetch/i.test(msg)
        ? 'v0 start slow — polling server…'
        : `v0 start issue (${msg}) — polling…`,
      'warn',
    );
    return {};
  }
}

async function postV0Poll(
  pollBody: string,
): Promise<V0GenerationResult | { kind: 'no-chat'; message: string }> {
  const response = await fetch(withProjectQuery('/api/nebula-ui-studio/v0-poll'), {
    method: 'POST',
    headers: V0_HEADERS(),
    credentials: 'include',
    body: pollBody,
    signal: AbortSignal.timeout(28_000),
  });
  const data = await readResponseJson<V0GenerationResult & { error?: string; hint?: string }>(response);
  if (!response.ok) {
    const msg = typeof data.error === 'string' ? data.error : `Request failed: ${response.status}`;
    if (response.status === 400 && /no v0 chat in progress/i.test(msg)) {
      return { kind: 'no-chat', message: msg };
    }
    if (data.idle) {
      return { ok: true, pending: false, idle: true, hint: data.hint };
    }
    if (response.status === 400 && /v0-prompt\.md is empty|save Master Plan/i.test(msg)) {
      return {
        ok: false,
        error: formatV0UiError(msg, hasLocalV0ApiKey()),
        hint: 'Master Plan §4+§5 are synced on save — refresh UI Studio, then click Generate v0 once.',
      };
    }
    const hint = typeof data.hint === 'string' ? data.hint : undefined;
    throw new Error(hint ? `${msg}\n\n${hint}` : msg);
  }
  return data;
}

/** Short HTTP requests — safe on Render (avoids 30s gateway timeout during long v0 runs). */
export async function runV0GenerationWithPolling(options?: {
  projectDisplayName?: string;
  onProgress?: GrokActivityProgressFn;
  resumeOnly?: boolean;
}): Promise<V0GenerationResult> {
  if (v0GenerationInFlight) {
    options?.onProgress?.('v0 already running — joining existing poll…', 'info');
    emitChatV0Watch(true);
    return v0GenerationInFlight;
  }

  emitChatV0Watch(true);
  emitChatV0Progress('v0 starting — preparing generation on server…');
  v0GenerationInFlight = runV0GenerationWithPollingInner(options).finally(() => {
    v0GenerationInFlight = null;
    emitChatV0Watch(false);
  });
  return v0GenerationInFlight;
}

async function runV0GenerationWithPollingInner(options?: {
  projectDisplayName?: string;
  onProgress?: GrokActivityProgressFn;
  resumeOnly?: boolean;
}): Promise<V0GenerationResult> {
  const onProgress = options?.onProgress;
  const body = withProjectBody({
    projectDisplayName: options?.projectDisplayName?.trim() || undefined,
  });

  const status = await fetchV0StudioStatus();
  let pollChatId = status.v0PendingChatId?.trim() || undefined;
  const resumePollOnly = canResumePollOnly(status, options?.resumeOnly);

  if (!resumePollOnly) {
    const started = await postV0Start(body, onProgress);
    if (started.done) return started.done;
    pollChatId = started.pollChatId || pollChatId;
  } else {
    onProgress?.('Resuming v0 generation (poll only, no new charge)…', 'info');
  }

  const pollBody = () =>
    JSON.stringify({
      ...body,
      ...(pollChatId ? { chatId: pollChatId } : {}),
    });

  const stopWait = startGrokActivityWaitTicker('v0 generating UI', (msg, kind, opts) =>
    onProgress?.(msg, kind, opts),
  );

  let autoStartedAfterEmptyPoll = false;

  try {
    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const pollResult = await postV0Poll(pollBody());

        if ('ok' in pollResult && pollResult.ok === false && pollResult.error) {
          return pollResult;
        }

        if ('kind' in pollResult && pollResult.kind === 'no-chat') {
          if (!autoStartedAfterEmptyPoll) {
            autoStartedAfterEmptyPoll = true;
            onProgress?.('No v0 session on server — starting one now…', 'warn');
            const started = await postV0Start(body, onProgress);
            if (started.done) return started.done;
            pollChatId = started.pollChatId || pollChatId;
            await sleep(POLL_MS);
            continue;
          }
          return {
            ok: false,
            error: formatV0UiError(pollResult.message, hasLocalV0ApiKey()),
            hint: 'Save Master Plan §4+§5, then click Generate UI with v0 once.',
          };
        }

        const poll = pollResult;
        if ('idle' in poll && poll.idle) {
          if (i < 24) {
            if (i === 3 || i === 8 || i === 15) {
              onProgress?.('No v0 session yet — re-starting on server…', 'warn');
              const started = await postV0Start(body, onProgress);
              if (started.done) return started.done;
              pollChatId = started.pollChatId || pollChatId;
            }
            await sleep(POLL_MS);
            continue;
          }
          return {
            ok: false,
            error: 'No v0 session on server.',
            hint: 'Click Generate v0 in UI Studio once.',
          };
        }
        if (poll.chatId) pollChatId = poll.chatId;
        if (poll.starting && (i === 0 || i % STARTING_LOG_EVERY_N_POLLS === 0)) {
          const mins = poll.elapsedMs ? Math.round(poll.elapsedMs / 60_000) : undefined;
          const msg = poll.recovered
            ? 'v0 recovered stalled start — still generating…'
            : mins && mins >= 2
              ? `v0-pro still working (~${mins} min) — polling for UI files…`
              : 'v0 generating UI on server — polling…';
          onProgress?.(msg, 'info');
          emitChatV0Progress(msg);
        }
        if (poll.ok && poll.written?.length) {
          onProgress?.(`v0 wrote ${poll.written.length} file(s) to workspace`, 'success');
          emitChatV0Progress(`v0 complete — wrote ${poll.written.length} file(s) to workspace`);
          emitV0DemoReady(poll.demoUrl);
          return poll;
        }
        if (poll.ok && poll.source === 'basic-scaffold') return poll;
        if (poll.error && !poll.pending) {
          emitChatV0Progress(formatV0UiError(poll.error, hasLocalV0ApiKey()).slice(0, 140));
          return { ok: false, error: formatV0UiError(poll.error, hasLocalV0ApiKey()), hint: poll.hint };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'v0 poll failed';
        if (/v0-prompt\.md is empty|save Master Plan/i.test(msg)) {
          return {
            ok: false,
            error: formatV0UiError(msg, hasLocalV0ApiKey()),
            hint: 'Open Master Plan §4+§5 and save, or press Go — then click Generate v0 once.',
          };
        }
        if (i >= MAX_POLLS - 1) {
          return {
            ok: false,
            error: `${formatV0UiError(msg, hasLocalV0ApiKey())} Click Generate UI with v0 once to retry.`,
          };
        }
      }
      if (i < MAX_POLLS - 1) await sleep(POLL_MS);
    }
    return {
      ok: false,
      error:
        'v0 is still running after several minutes. Click Generate UI with v0 once (resume uses the same chat when possible).',
    };
  } finally {
    stopWait();
  }
}
