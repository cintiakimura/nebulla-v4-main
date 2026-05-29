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
};

const V0_HEADERS = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...getV0RequestHeaders(),
});

const POLL_MS = 3500;
const MAX_POLLS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** Short HTTP requests — safe on Render (avoids 30s gateway timeout during long v0 runs). */
export async function runV0GenerationWithPolling(options?: {
  projectDisplayName?: string;
  onProgress?: GrokActivityProgressFn;
  resumeOnly?: boolean;
}): Promise<V0GenerationResult> {
  const onProgress = options?.onProgress;
  const body = withProjectBody({
    projectDisplayName: options?.projectDisplayName?.trim() || undefined,
  });

  if (!options?.resumeOnly) {
    onProgress?.('Starting v0 generation on server…', 'info');
    try {
      const start = await fetchJson<V0GenerationResult>(
        withProjectQuery('/api/nebula-ui-studio/v0-start'),
        { method: 'POST', headers: V0_HEADERS(), credentials: 'include', body: JSON.stringify(body) },
      );
      if (start.error && !start.chatId) {
        return { ok: false, error: formatV0UiError(start.error, hasLocalV0ApiKey()) };
      }
      if (start.written?.length) {
        onProgress?.(`v0 wrote ${start.written.length} file(s)`, 'success');
        return start;
      }
      if (start.pending && start.chatId) {
        onProgress?.('v0 chat started — waiting for files (this can take 1–3 min)', 'info');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'v0 start failed';
      onProgress?.(
        /fetch failed|failed to fetch/i.test(msg)
          ? 'Request timed out — resuming in-progress v0 chat if one exists…'
          : `v0 start failed (${msg}) — trying resume…`,
        'warn',
      );
    }
  } else {
    onProgress?.('Resuming v0 generation…', 'info');
  }

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
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(28_000),
          },
        );
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
            error: `${formatV0UiError(msg, hasLocalV0ApiKey())} Credits may already have been used — open UI Studio and click Generate again to resume.`,
          };
        }
      }
      if (i < MAX_POLLS - 1) await sleep(POLL_MS);
    }
    return {
      ok: false,
      error:
        'v0 is still running after several minutes. Credits may have been used — wait a moment, then click Generate UI with v0 to resume.',
    };
  } finally {
    stopWait();
  }
}
