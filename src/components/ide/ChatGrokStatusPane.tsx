import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '../Logo';
import {
  formatGrokActivityElapsed,
  type GrokActivityLogKind,
  type GrokActivityStatus,
} from '../../lib/ideGrokActivityStatus';

function statusKindClass(kind?: GrokActivityLogKind): string {
  switch (kind) {
    case 'success':
      return 'text-emerald-300/90';
    case 'error':
      return 'text-red-300/95';
    case 'warn':
      return 'text-amber-200/90';
    case 'file':
      return 'text-primary/90';
    case 'wait':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground/90';
  }
}

/**
 * Full activity log in the chat column — never more than half the chat field.
 */
export function ChatGrokStatusPane({
  activity,
  v0Live = false,
}: {
  activity: GrokActivityStatus;
  v0Live?: boolean;
}) {
  const isWork = activity.tone === 'work';
  const isError = activity.tone === 'error';
  const applying = /Applying \d+ file|Writing files to cloud workspace|Code pass/i.test(
    `${activity.currentAction || ''} ${activity.liveLog[activity.liveLog.length - 1]?.message || ''}`,
  );
  const busy = isWork || v0Live || applying;
  const hasLog = activity.liveLog.length > 0 || Boolean(activity.currentAction?.trim());
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy || !activity.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy, activity.startedAt]);

  useEffect(() => {
    if (busy || isError) setExpanded(true);
  }, [busy, isError]);

  useEffect(() => {
    const el = logRef.current;
    if (!el || !expanded) return;
    el.scrollTop = el.scrollHeight;
  }, [activity.liveLog, activity.currentAction, expanded]);

  if (!busy && !isError && !hasLog) return null;

  const statusLine = (
    activity.currentAction?.trim() ||
    activity.subhead?.trim() ||
    activity.headline?.trim() ||
    (busy ? 'Working…' : isError ? 'Something went wrong' : 'Ready')
  );
  const elapsed = formatGrokActivityElapsed(activity.startedAt, now);
  const steps = activity.steps ?? [];
  const activeStep = activity.activeStepIndex ?? 0;

  return (
    <section
      className={cn(
        'flex max-h-[50%] min-h-0 shrink-0 flex-col overflow-hidden border-b border-border bg-background/80',
        isError && 'border-red-500/25 bg-red-500/[0.04]',
      )}
      data-testid="chat-grok-status-pane"
      aria-label="Build status"
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden>
          {busy ? (
            <span className="nebulla-throbber inline-flex h-6 w-6 items-center justify-center">
              <Logo className="h-5 w-5" alt="" />
            </span>
          ) : isError ? (
            <XCircle className="h-4 w-4 text-red-300" />
          ) : (
            <Logo className="h-4 w-4 opacity-70" alt="" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-[12px] leading-snug',
              isError ? 'text-red-100' : 'text-foreground/90',
            )}
            title={statusLine}
          >
            {statusLine}
          </p>
          {activity.subhead && activity.subhead !== statusLine ? (
            <p className="truncate text-[10px] text-muted-foreground">{activity.subhead}</p>
          ) : null}
        </div>
        {busy && elapsed ? (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
            {elapsed}
          </span>
        ) : null}
        <button
          type="button"
          className="btn-secondary-surface rounded p-1 text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse status' : 'Expand status'}
          title={expanded ? 'Collapse status' : 'Expand status'}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !expanded && '-rotate-90')} />
        </button>
      </div>

      {expanded ? (
        <div className="min-h-0 flex-1 overflow-hidden px-3 pb-2">
          {steps.length > 0 ? (
            <ol className="mb-2 space-y-0.5">
              {steps.map((step, i) => {
                const done = i < activeStep;
                const current = i === activeStep;
                return (
                  <li
                    key={`${step.label}-${i}`}
                    className={cn(
                      'flex items-start gap-1.5 text-[10px] leading-snug',
                      current
                        ? isError
                          ? 'text-red-100'
                          : 'text-foreground/90'
                        : done
                          ? 'text-emerald-300/80'
                          : 'text-muted-foreground/70',
                    )}
                  >
                    <span className="mt-0.5 w-3 shrink-0 font-mono tabular-nums">{i + 1}.</span>
                    <span className="min-w-0">
                      <span className={current ? 'font-medium' : undefined}>{step.label}</span>
                      {step.detail ? (
                        <span className="mt-0.5 block text-muted-foreground">{step.detail}</span>
                      ) : null}
                    </span>
                    {current && busy ? (
                      <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-muted-foreground/70" />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
          <div
            ref={logRef}
            className="max-h-full min-h-0 space-y-0.5 overflow-y-auto rounded-md border border-border/50 bg-black/20 px-2 py-1.5"
            role="log"
            aria-live="polite"
          >
            {activity.liveLog.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">Waiting for the next status line…</p>
            ) : (
              activity.liveLog.map((entry) => (
                <p
                  key={entry.id}
                  className={cn('text-[10px] leading-snug', statusKindClass(entry.kind))}
                >
                  {entry.message}
                </p>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
