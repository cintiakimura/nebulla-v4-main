import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Circle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '../Logo';
import {
  formatGrokActivityElapsed,
  normalizeActivityMessage,
  type GrokActivityLogEntry,
  type GrokActivityStatus,
} from '../../lib/ideGrokActivityStatus';

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
  /** Kept for callers; v0 status UI removed from chat to save space. */
  v0Live?: boolean;
}) {
  const isWork = activity.tone === 'work';
  const isError = activity.tone === 'error';
  const busy = isWork || v0Live;
  const logEndRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [logOpen, setLogOpen] = useState(false);

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

  const statusLine =
    activity.currentAction?.trim() ||
    activity.subhead?.trim() ||
    activity.headline?.trim() ||
    (busy ? 'Working…' : isError ? 'Something went wrong' : 'Ready');

  useEffect(() => {
    if (!logOpen) return;
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activity.currentAction, history.length, logOpen]);

  useEffect(() => {
    if (!busy || !activity.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy, activity.startedAt]);

  // Collapse the log when work finishes so the panel stays compact.
  useEffect(() => {
    if (!busy) setLogOpen(false);
  }, [busy]);

  const elapsed = formatGrokActivityElapsed(activity.startedAt, now);
  const latestLog = history.length > 0 ? history[history.length - 1] : null;

  return (
    <div
      className={cn(
        'shrink-0 border-b border-border bg-transparent px-3 py-2',
        isError && 'border-red-500/20 bg-red-500/[0.04]',
      )}
      role="status"
      aria-live="polite"
      aria-busy={busy}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center',
            isError && 'text-red-300',
          )}
          aria-hidden
        >
          {busy ? (
            <span className="nebulla-throbber inline-flex h-7 w-7 items-center justify-center">
              <Logo className="h-6 w-6" alt="" />
            </span>
          ) : isError ? (
            <XCircle className="h-5 w-5" />
          ) : (
            <span className="inline-flex h-7 w-7 items-center justify-center opacity-80">
              <Logo className="h-5 w-5" alt="" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p
              className={cn(
                'truncate text-[12px] leading-snug',
                isError ? 'text-red-100' : 'text-foreground/90',
              )}
              title={statusLine}
            >
              {statusLine}
            </p>
            {busy && elapsed ? (
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                {elapsed}
              </span>
            ) : null}
          </div>
          {busy && latestLog && latestLog.message !== statusLine ? (
            <p
              className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70"
              title={latestLog.message}
            >
              {latestLog.message}
            </p>
          ) : null}
        </div>

        {history.length > 0 ? (
          <button
            type="button"
            onClick={() => setLogOpen((v) => !v)}
            className="btn-cyan inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px]"
            aria-expanded={logOpen}
            title={logOpen ? 'Hide activity log' : 'Show activity log'}
          >
            Log
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', logOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {logOpen && history.length > 0 ? (
        <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-border/80 bg-black/40 px-2 py-1.5">
          <ul className="space-y-0.5 font-mono text-[10px] leading-relaxed">
            {history.slice(-12).map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-muted-foreground/50">
                  {formatLogTime(entry.at)}
                </span>
                <span className={cn('min-w-0 break-words', logKindClass(entry.kind))}>
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
          <div ref={logEndRef} className="h-px" aria-hidden />
        </div>
      ) : null}

      {!busy && activity.steps.length > 0 ? (
        <ol className="mt-2 space-y-1 border-t border-border/60 pt-2">
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
                  <p className="text-[11px] text-muted-foreground">{step.label}</p>
                  {step.detail ? (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/80">{step.detail}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
