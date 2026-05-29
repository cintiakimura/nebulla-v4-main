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
  /** One-line “right now” label (Cursor-style). */
  currentAction?: string;
  /** When the current work session started (ms). */
  startedAt?: number;
  liveLog: GrokActivityLogEntry[];
  steps: GrokActivityStep[];
  /** Index of the step currently in progress (0-based). Steps before this are done. */
  activeStepIndex: number;
  footer?: string;
  tone: GrokActivityTone;
};

export type GrokActivityProgressFn = (message: string, kind?: GrokActivityLogKind) => void;

let logSeq = 0;

function nextLogId(): string {
  logSeq += 1;
  return `log-${Date.now()}-${logSeq}`;
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
  const liveLog: GrokActivityLogEntry[] = [];
  if (options?.initialLog) {
    liveLog.push({ id: nextLogId(), at: startedAt, message: options.initialLog, kind: 'info' });
  }
  return {
    headline,
    subhead: options?.subhead,
    currentAction: options?.initialLog ?? headline,
    startedAt,
    liveLog,
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
    liveLog: [
      ...prev.liveLog,
      { id: nextLogId(), at, message, kind },
    ].slice(-80),
  };
}

/** Update the pulsing “now” line and append to the live log. */
export function setGrokActivityAction(
  prev: GrokActivityStatus,
  action: string,
  kind: GrokActivityLogKind = 'info',
): GrokActivityStatus {
  const last = prev.liveLog[prev.liveLog.length - 1];
  if (last?.message === action && last.kind === kind) {
    return { ...prev, currentAction: action };
  }
  return appendGrokActivityLog({ ...prev, currentAction: action }, action, kind);
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
    next = setGrokActivityAction(next, patch.log.message, patch.log.kind ?? 'info');
  } else if (patch?.currentAction) {
    next = { ...next, currentAction: patch.currentAction };
  }
  return next;
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
    return appendGrokActivityLog(base, finalLog, 'success');
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
  return appendGrokActivityLog(base, detail, 'error');
}

/** Call `onTick` every `intervalMs` while `active`; returns stop function. */
export function startGrokActivityWaitTicker(
  label: string,
  onTick: GrokActivityProgressFn,
  intervalMs = 2500,
): () => void {
  const started = Date.now();
  onTick(`${label}…`, 'wait');
  const id = window.setInterval(() => {
    const elapsed = formatGrokActivityElapsed(started);
    onTick(elapsed ? `${label} (${elapsed})` : label, 'wait');
  }, intervalMs);
  return () => window.clearInterval(id);
}
