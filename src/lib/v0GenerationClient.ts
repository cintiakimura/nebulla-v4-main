import { fetchJson } from './apiFetch';
import type { GrokActivityProgressFn } from './ideGrokActivityStatus';
import { startGrokActivityWaitTicker } from './ideGrokActivityStatus';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { formatV0UiError } from './v0ErrorMessage';
import { getV0RequestHeaders, hasLocalV0ApiKey } from './v0Key';

export type V0GenerationResult = {
  ok?: boolean;
  chatId?: string;
  written?: string[];
  demoUrl?: string;
  source?: string;
  hint?: string;
  error?: string;
  pending?: boolean;
  starting?: boolean;
  resumed?: boolean;
  elapsedMs?: number;
  recovered?: boolean;
};

const V0_HEADERS = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...getV0RequestHeaders(),
});

const POLL_MS = 3500;
const MAX_POLLS = 120;
const V0_START_TIMEOUT_MS = 20_000;
const STARTING_LOG_EVERY_N_POLLS = 8;

/** Prevent AIChat + UI Studio from running duplicate poll loops. */
let v0GenerationInFlight: Promise<V0GenerationResult> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

async function fetchV0StudioStatus(): Promise<{
  v0Pending?: boolean;
  v0Starting?: boolean;
  v0PendingChatId?: string;
  hasRealV0?: boolean;
}> {
  try {
    return await fetchJson(withProjectQuery('/api/nebula-ui-studio/status'), {
      credentials: 'include',
    });
  } catch {
    return {};
  }
}

/** Short HTTP requests — safe on Render (avoids 30s gateway timeout during long v0 runs). */
export async function runV0GenerationWithPolling(options?: {
  projectDisplayName?: string;
  onProgress?: GrokActivityProgressFn;
  resumeOnly?: boolean;
}): Promise<V0GenerationResult> {
  if (v0GenerationInFlight) {
    options?.onProgress?.('v0 already running — joining existing poll…', 'info');
    return v0GenerationInFlight;
  }

  v0GenerationInFlight = runV0GenerationWithPollingInner(options).finally(() => {
    v0GenerationInFlight = null;
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
  let pollChatId: string | undefined;

  const status = await fetchV0StudioStatus();
  const shouldResumeOnly =
    options?.resumeOnly === true ||
    Boolean((status.v0Pending || status.v0Starting) && !status.hasRealV0);
  pollChatId = status.v0PendingChatId?.trim() || undefined;

  if (!shouldResumeOnly) {
    onProgress?.('Starting v0 generation on server…', 'info');
    try {
      const start = await fetchJson<V0GenerationResult>(
        withProjectQuery('/api/nebula-ui-studio/v0-start'),
        {
          method: 'POST',
          headers: V0_HEADERS(),
          credentials: 'include',
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(V0_START_TIMEOUT_MS),
        },
      );
      if (start.error && !start.chatId && !start.pending) {
        return { ok: false, error: formatV0UiError(start.error, hasLocalV0ApiKey()) };
      }
      if (start.written?.length) {
        onProgress?.(`v0 wrote ${start.written.length} file(s)`, 'success');
        return start;
      }
      pollChatId = start.chatId?.trim() || pollChatId;
      if (start.resumed) {
        onProgress?.('Resuming in-progress v0 chat (no new charge)…', 'info');
      } else if (start.starting) {
        onProgress?.('v0 chat starting on server — polling for files (1–4 min)', 'info');
      } else if (start.pending && pollChatId) {
        onProgress?.('v0 chat started — waiting for files', 'info');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'v0 start failed';
      onProgress?.(
        /timed out|fetch failed|failed to fetch/i.test(msg)
          ? 'v0 start acknowledged — polling server (no new charge)…'
          : `v0 start issue (${msg}) — polling…`,
        'warn',
      );
    }
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

  try {
    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const poll = await fetchJson<V0GenerationResult>(
          withProjectQuery('/api/nebula-ui-studio/v0-poll'),
          {
            method: 'POST',
            headers: V0_HEADERS(),
            credentials: 'include',
            body: pollBody(),
            signal: AbortSignal.timeout(28_000),
          },
        );
        if (poll.chatId) pollChatId = poll.chatId;
        if (poll.starting && (i === 0 || i % STARTING_LOG_EVERY_N_POLLS === 0)) {
          const mins = poll.elapsedMs ? Math.round(poll.elapsedMs / 60_000) : undefined;
          onProgress?.(
            poll.recovered
              ? 'Recovered stalled v0 start — still polling…'
              : mins && mins >= 2
                ? `v0-pro still working (~${mins} min) — polling…`
                : 'v0 starting on server — polling…',
            'info',
          );
        }
        if (poll.ok && poll.written?.length) {
          onProgress?.(`v0 wrote ${poll.written.length} file(s) to workspace`, 'success');
          return poll;
        }
        if (poll.ok && poll.source === 'basic-scaffold') return poll;
        if (poll.error && !poll.pending) {
          return { ok: false, error: formatV0UiError(poll.error, hasLocalV0ApiKey()), hint: poll.hint };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'v0 poll failed';
        if (i >= MAX_POLLS - 1) {
          return {
            ok: false,
            error: `${formatV0UiError(msg, hasLocalV0ApiKey())} Open UI Studio and click Resume v0 once.`,
          };
        }
      }
      if (i < MAX_POLLS - 1) await sleep(POLL_MS);
    }
    return {
      ok: false,
      error:
        'v0 is still running after several minutes. Click Resume v0 in UI Studio once (no new charge).',
    };
  } finally {
    stopWait();
  }
}
