import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Circle, Loader2, Square, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatGrokActivityElapsed,
  normalizeActivityMessage,
  type GrokActivityLogEntry,
  type GrokActivityStatus,
} from '../../lib/ideGrokActivityStatus';
import {
  dispatchCancelV0,
  dispatchClearV0Session,
  dispatchRunV0Generate,
} from '../../lib/nebulaUiStudioEvents';

function formatLogTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function logKindClass(kind: GrokActivityLogEntry['kind']): string {
  switch (kind) {
    case 'success':
      return 'text-foreground/80';
    case 'error':
      return 'text-red-300/90';
    case 'warn':
      return 'text-[color:var(--misc)]';
    case 'file':
      return 'text-[color:var(--subtitle)]';
    default:
      return 'text-muted-foreground/85';
  }
}

export function IdeGrokActivityPanel({
  activity,
  v0Live = false,
}: {
  activity: GrokActivityStatus;
  /** True while v0 is starting/polling — shows Cancel. */
  v0Live?: boolean;
}) {
  const isWork = activity.tone === 'work';
  const isError = activity.tone === 'error';
  const logEndRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [v0Busy, setV0Busy] = useState(false);

  const history = useMemo(() => {
    const currentNorm = activity.currentAction
      ? normalizeActivityMessage(activity.currentAction)
      : '';
    return activity.liveLog.filter((entry, i, arr) => {
      const norm = normalizeActivityMessage(entry.message);
      if (i === arr.length - 1 && currentNorm && norm === currentNorm) return false;
      return true;
    });
  }, [activity.liveLog, activity.currentAction]);

  const showV0Controls = Boolean(activity.v0Status) || v0Live;
  const statusLower = (activity.v0Status || '').toLowerCase();
  const canResume =
    !v0Live &&
    (statusLower.includes('session active') ||
      statusLower.includes('resume') ||
      statusLower.includes('error') ||
      statusLower.includes('cancelled') ||
      statusLower.includes('stuck'));
  const canClear =
    !v0Live &&
    (canResume || statusLower.includes('error') || statusLower.includes('cleared'));

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activity.currentAction, history.length]);

  useEffect(() => {
    if (!isWork || !activity.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isWork, activity.startedAt]);

  const elapsed = formatGrokActivityElapsed(activity.startedAt, now);

  const runV0Action = (fn: () => void) => {
    setV0Busy(true);
    try {
      fn();
    } finally {
      window.setTimeout(() => setV0Busy(false), 800);
    }
  };

  return (
    <div
      className={cn(
        'shrink-0 border-b px-3 py-3',
        isError
          ? 'border-red-500/20 bg-red-500/[0.06]'
          : isWork || v0Live
            ? 'border-border bg-[#0a0a0a]'
            : 'border-border bg-[#0a0a0a]',
      )}
      role="status"
      aria-live="polite"
      aria-busy={isWork || v0Live}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            isError
              ? 'bg-red-500/15 text-red-300'
              : isWork || v0Live
                ? 'bg-[#111111] text-primary'
                : 'bg-[#111111] text-foreground/70',
          )}
        >
          {isWork || v0Live ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : isError ? (
            <XCircle className="h-4 w-4" aria-hidden />
          ) : (
            <Check className="h-4 w-4" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p
              className={cn(
                'type-label-sm font-headline tracking-wide',
                isError ? 'text-red-100' : 'text-muted-foreground',
              )}
            >
              {v0Live && !isWork ? 'v0 generating' : activity.headline}
            </p>
            {(isWork || v0Live) && elapsed ? (
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground/80">{elapsed}</span>
            ) : null}
          </div>

          {activity.currentAction ? (
            <p className="type-body-md font-normal leading-snug text-foreground">{activity.currentAction}</p>
          ) : activity.subhead ? (
            <p className="type-body-md leading-relaxed text-muted-foreground">{activity.subhead}</p>
          ) : null}

          {activity.v0Status ? (
            <div
              className={cn(
                'rounded-xl border px-2.5 py-1.5 text-[11px] leading-snug',
                isError
                  ? 'border-border bg-black text-muted-foreground'
                  : 'border-border bg-[#111111] text-foreground/85',
              )}
            >
              <p className="font-normal tracking-wide">
                <span className="text-[10px] uppercase text-muted-foreground/80">v0 · </span>
                {activity.v0Status}
              </p>
              {activity.v0StatusDetail ? (
                <p className="mt-0.5 text-[10px] text-muted-foreground/85">{activity.v0StatusDetail}</p>
              ) : null}
              {showV0Controls ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {v0Live ? (
                    <button
                      type="button"
                      disabled={v0Busy}
                      title="Stop client polling and cancel server v0 job"
                      onClick={() => runV0Action(() => dispatchCancelV0())}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-foreground/80 hover:bg-[#111111] disabled:opacity-40"
                    >
                      <Square className="h-3 w-3" />
                      Cancel
                    </button>
                  ) : null}
                  {canResume ? (
                    <button
                      type="button"
                      disabled={v0Busy}
                      title="Poll existing v0 chat — no new charge"
                      onClick={() => runV0Action(() => dispatchRunV0Generate({ resumeOnly: true }))}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-[#111111] px-2 py-1 text-[10px] text-foreground hover:bg-[#161616] disabled:opacity-40"
                    >
                      Resume
                    </button>
                  ) : null}
                  {canClear ? (
                    <button
                      type="button"
                      disabled={v0Busy}
                      title="Clear v0 pending state on server"
                      onClick={() => runV0Action(() => dispatchClearV0Session())}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {history.length > 0 ? (
            <div className="rounded-xl border border-border bg-black px-2.5 py-1.5">
              <p className="mb-1 text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground/70">
                Live activity
              </p>
              <ul className="space-y-0.5 font-mono text-[10px] leading-relaxed">
                {history.slice(-8).map((entry) => (
                  <li key={entry.id} className="flex gap-2">
                    <span className="shrink-0 tabular-nums text-muted-foreground/50">{formatLogTime(entry.at)}</span>
                    <span className={cn('min-w-0 break-words', logKindClass(entry.kind))}>{entry.message}</span>
                  </li>
                ))}
              </ul>
              <div ref={logEndRef} className="h-px" aria-hidden />
            </div>
          ) : null}

          {activity.steps.length > 0 && !isWork ? (
            <ol className="space-y-1 rounded-xl border border-border bg-black px-2.5 py-2">
              {activity.steps.map((step, i) => {
                const done = i < activity.activeStepIndex;
                const failed = isError && i === activity.activeStepIndex;
                return (
                  <li key={`${step.label}-${i}`} className="flex gap-2 text-left">
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {done ? (
                        <Check className="h-3 w-3 text-foreground/55" />
                      ) : failed ? (
                        <XCircle className="h-3 w-3 text-red-400" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground/35" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="type-label-sm text-muted-foreground">{step.label}</p>
                      {step.detail ? (
                        <p className="type-body-md mt-0.5 text-muted-foreground/80">{step.detail}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {activity.footer && !isWork && !v0Live ? (
            <p className="type-body-md leading-relaxed text-muted-foreground/90">{activity.footer}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
