import { useEffect, useMemo, useState } from 'react';
import { XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '../Logo';
import {
  formatGrokActivityElapsed,
  normalizeActivityMessage,
  type GrokActivityStatus,
} from '../../lib/ideGrokActivityStatus';

/**
 * Compact Live Activity throbber — Nebulla logo + one status line.
 * Never expands into a half-panel card (log/steps stay out of the default chrome).
 */
export function IdeGrokActivityPanel({
  activity,
  v0Live = false,
}: {
  activity: GrokActivityStatus;
  v0Live?: boolean;
}) {
  const isWork = activity.tone === 'work';
  const isError = activity.tone === 'error';
  const busy = isWork || v0Live;
  const [now, setNow] = useState(() => Date.now());

  const latestLog = useMemo(() => {
    const currentNorm = activity.currentAction
      ? normalizeActivityMessage(activity.currentAction)
      : '';
    for (let i = activity.liveLog.length - 1; i >= 0; i--) {
      const entry = activity.liveLog[i];
      const norm = normalizeActivityMessage(entry.message);
      if (currentNorm && norm === currentNorm) continue;
      return entry;
    }
    return null;
  }, [activity.liveLog, activity.currentAction]);

  const statusLine = (
    activity.currentAction?.trim() ||
    activity.subhead?.trim() ||
    latestLog?.message?.trim() ||
    activity.headline?.trim() ||
    (busy ? 'Working…' : isError ? 'Something went wrong' : 'Ready')
  ).slice(0, 96);

  useEffect(() => {
    if (!busy || !activity.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy, activity.startedAt]);

  const elapsed = formatGrokActivityElapsed(activity.startedAt, now);

  // Idle success with nothing to say — stay invisible-height minimal
  if (!busy && !isError) {
    return (
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-1.5"
        role="status"
        aria-live="polite"
        aria-busy={false}
      >
        <Logo className="h-4 w-4 opacity-70" alt="" />
        <p className="truncate text-[11px] text-muted-foreground">{statusLine}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2',
        isError && 'border-red-500/25 bg-red-500/[0.05]',
      )}
      role="status"
      aria-live="polite"
      aria-busy={busy}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
        {busy ? (
          <span className="nebulla-throbber inline-flex h-7 w-7 items-center justify-center">
            <Logo className="h-6 w-6" alt="" />
          </span>
        ) : (
          <XCircle className="h-5 w-5 text-red-300" />
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
      </div>

      {busy && elapsed ? (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
          {elapsed}
        </span>
      ) : null}
    </div>
  );
}
