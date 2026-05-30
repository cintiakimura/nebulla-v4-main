export type GrokActivityTone = 'work' | 'ready' | 'error';

export type GrokActivityLogKind = 'info' | 'success' | 'warn' | 'error' | 'file' | 'wait';

export type GrokActivityLogEntry = {
  id: string;
  at: number;
  message: string;
  kind: GrokActivityLogKind;
};

export type GrokActivityStep = {
  label: string;
  detail?: string;
};

export type GrokActivityStatus = {
  headline: string;
  subhead?: string;
  /** One-line “right now” label — updates in place for wait/elapsed ticks. */
  currentAction?: string;
  /** When the current work session started (ms). */
  startedAt?: number;
  liveLog: GrokActivityLogEntry[];
  steps: GrokActivityStep[];
  /** Index of the step currently in progress (0-based). Steps before this are done. */
  activeStepIndex: number;
  footer?: string;
  tone: GrokActivityTone;
  /** v0 UI pipeline status — shown in chat activity strip. */
  v0Status?: string;
  v0StatusDetail?: string;
};

export type GrokActivityProgressOptions = { /** Update current line only — no new log row. */ currentOnly?: boolean };

export type GrokActivityProgressFn = (
  message: string,
  kind?: GrokActivityLogKind,
  options?: GrokActivityProgressOptions,
) => void;

let logSeq = 0;

function nextLogId(): string {
  logSeq += 1;
  return `log-${Date.now()}-${logSeq}`;
}

/** Normalize for dedupe — strip elapsed suffixes and ellipsis. */
export function normalizeActivityMessage(message: string): string {
  return message
    .replace(/\s*\(\d+s\)\s*$/i, '')
    .replace(/\s*\(\d+m \d+s\)\s*$/i, '')
    .replace(/…+$/u, '')
    .trim();
}

export function formatGrokActivityElapsed(startedAt?: number, now = Date.now()): string | null {
  if (!startedAt) return null;
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function createGrokActivity(
  headline: string,
  steps: GrokActivityStep[],
  options?: {
    subhead?: string;
    footer?: string;
    tone?: GrokActivityTone;
    initialLog?: string;
  },
): GrokActivityStatus {
  const startedAt = Date.now();
  const initial = options?.initialLog?.trim();
  return {
    headline,
    subhead: options?.subhead,
    currentAction: initial || headline,
    startedAt,
    liveLog: initial ? [{ id: nextLogId(), at: startedAt, message: initial, kind: 'info' }] : [],
    steps,
    activeStepIndex: 0,
    footer: options?.footer,
    tone: options?.tone ?? 'work',
  };
}

export function appendGrokActivityLog(
  prev: GrokActivityStatus,
  message: string,
  kind: GrokActivityLogKind = 'info',
): GrokActivityStatus {
  const at = Date.now();
  return {
    ...prev,
    liveLog: [...prev.liveLog, { id: nextLogId(), at, message, kind }].slice(-24),
  };
}

/** Update the live status line only (same phase, e.g. elapsed timer). */
export function updateGrokActivityCurrent(
  prev: GrokActivityStatus,
  action: string,
): GrokActivityStatus {
  if (prev.currentAction === action) return prev;
  return { ...prev, currentAction: action };
}

/** New phase — append to history once, then show as current. */
export function commitGrokActivityStatus(
  prev: GrokActivityStatus,
  message: string,
  kind: GrokActivityLogKind = 'info',
): GrokActivityStatus {
  const trimmed = message.trim();
  if (!trimmed) return prev;

  const norm = normalizeActivityMessage(trimmed);
  const last = prev.liveLog[prev.liveLog.length - 1];
  const lastNorm = last ? normalizeActivityMessage(last.message) : '';
  const currentNorm = prev.currentAction ? normalizeActivityMessage(prev.currentAction) : '';

  let next: GrokActivityStatus = { ...prev, currentAction: trimmed };
  if (norm && norm !== lastNorm && norm !== currentNorm) {
    next = appendGrokActivityLog(next, trimmed, kind);
  }
  return next;
}

/** @deprecated Use commitGrokActivityStatus */
export function setGrokActivityAction(
  prev: GrokActivityStatus,
  action: string,
  kind: GrokActivityLogKind = 'info',
): GrokActivityStatus {
  return commitGrokActivityStatus(prev, action, kind);
}

export function advanceGrokActivity(
  prev: GrokActivityStatus,
  activeStepIndex: number,
  patch?: Partial<Pick<GrokActivityStatus, 'headline' | 'subhead' | 'footer' | 'tone' | 'currentAction'>> & {
    stepDetail?: { index: number; detail: string };
    log?: { message: string; kind?: GrokActivityLogKind };
  },
): GrokActivityStatus {
  let next: GrokActivityStatus = {
    ...prev,
    activeStepIndex: Math.min(activeStepIndex, Math.max(0, prev.steps.length - 1)),
    ...patch,
  };
  if (patch?.stepDetail) {
    const steps = [...next.steps];
    const row = steps[patch.stepDetail.index];
    if (row) {
      steps[patch.stepDetail.index] = { ...row, detail: patch.stepDetail.detail };
      next = { ...next, steps };
    }
  }
  if (patch?.log) {
    next = commitGrokActivityStatus(next, patch.log.message, patch.log.kind ?? 'info');
  } else if (patch?.currentAction) {
    next = updateGrokActivityCurrent(next, patch.currentAction);
  }
  return next;
}

export function patchGrokActivityV0Status(
  prev: GrokActivityStatus,
  v0Status: string,
  v0StatusDetail?: string,
): GrokActivityStatus {
  if (prev.v0Status === v0Status && prev.v0StatusDetail === v0StatusDetail) return prev;
  return { ...prev, v0Status, v0StatusDetail };
}

export function finishGrokActivity(
  prev: GrokActivityStatus | null,
  headline: string,
  steps: GrokActivityStep[],
  footer?: string,
  finalLog?: string,
): GrokActivityStatus {
  const base: GrokActivityStatus = {
    headline,
    steps,
    activeStepIndex: steps.length,
    footer,
    tone: 'ready',
    liveLog: prev?.liveLog ?? [],
    startedAt: prev?.startedAt,
    currentAction: undefined,
  };
  if (finalLog) {
    return commitGrokActivityStatus(base, finalLog, 'success');
  }
  return base;
}

export function errorGrokActivity(
  prev: GrokActivityStatus | null,
  headline: string,
  detail: string,
): GrokActivityStatus {
  const steps = prev?.steps?.length
    ? prev.steps.map((s, i) =>
        i === (prev.activeStepIndex ?? 0)
          ? { ...s, detail }
          : s,
      )
    : [{ label: detail }];
  const base: GrokActivityStatus = {
    headline,
    steps,
    activeStepIndex: prev?.activeStepIndex ?? 0,
    footer: 'You can retry with Go or send another message.',
    tone: 'error',
    liveLog: prev?.liveLog ?? [],
    startedAt: prev?.startedAt,
    currentAction: detail,
  };
  return commitGrokActivityStatus(base, detail, 'error');
}

/** Elapsed ticks update current line only; first call commits the phase. */
export function startGrokActivityWaitTicker(
  label: string,
  onTick: GrokActivityProgressFn,
  intervalMs = 2500,
): () => void {
  const started = Date.now();
  onTick(`${label}…`, 'wait');
  const id = window.setInterval(() => {
    const elapsed = formatGrokActivityElapsed(started);
    onTick(elapsed ? `${label} (${elapsed})` : label, 'wait', { currentOnly: true });
  }, intervalMs);
  return () => window.clearInterval(id);
}
