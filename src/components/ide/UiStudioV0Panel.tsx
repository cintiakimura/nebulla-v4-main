import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Sparkles, Square, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V0ReadinessResult } from '../../lib/v0Readiness';
import { isV0GenerationInFlight } from '../../lib/v0GenerationClient';

export type UiStudioV0PanelProps = {
  busy: boolean;
  cancelBusy: boolean;
  readiness: V0ReadinessResult;
  studioStatus: {
    v0PromptLength?: number;
    v0PendingChatId?: string;
    v0Starting?: boolean;
    v0StartError?: string;
    hasRealV0?: boolean;
    v0DemoUrl?: string;
  } | null;
  progressLine: string;
  errorLine: string;
  chatId: string | null;
  hasV0ApiKey: boolean | null;
  onGenerate: () => void;
  onResume: () => void;
  onCancel: () => void;
  onClearSession: () => void;
  onRefreshStatus: () => void;
  onDismissProgress: () => void;
};

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

export function UiStudioV0Panel({
  busy,
  cancelBusy,
  readiness,
  studioStatus,
  progressLine,
  errorLine,
  chatId,
  hasV0ApiKey,
  onGenerate,
  onResume,
  onCancel,
  onClearSession,
  onRefreshStatus,
  onDismissProgress,
}: UiStudioV0PanelProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  const running =
    busy ||
    Boolean(studioStatus?.v0Starting) ||
    isV0GenerationInFlight();

  const phase = useMemo(() => {
    if (studioStatus?.hasRealV0) return 'complete' as const;
    if (errorLine || (studioStatus?.v0StartError && !studioStatus?.v0PendingChatId)) return 'error' as const;
    if (running) return 'running' as const;
    if (!readiness.ready && hasV0ApiKey !== false) return 'blocked' as const;
    return 'ready' as const;
  }, [studioStatus, errorLine, running, readiness.ready, hasV0ApiKey]);

  useEffect(() => {
    if (!running) {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => setElapsedMs(Date.now() - start), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const displayChatId =
    chatId?.trim() || studioStatus?.v0PendingChatId?.trim() || '';

  const statusLine =
    progressLine.trim() ||
    (phase === 'complete'
      ? 'v0 UI applied — switch preview to “v0 live” when demo URL is available.'
      : phase === 'error'
        ? errorLine || studioStatus?.v0StartError || 'v0 failed — clear session and try again.'
        : phase === 'running'
          ? 'v0 generating on server — polling for files (typically 1–4 min)…'
          : phase === 'blocked'
            ? readiness.blockReason || 'Complete checklist below before Generate.'
            : 'Ready — click Generate v0 once (avoid double-clicks).');

  const canGenerate =
    hasV0ApiKey !== false &&
    !running &&
    !cancelBusy &&
    (readiness.ready || Boolean(studioStatus?.v0StartError));
  const canResume =
    hasV0ApiKey !== false &&
    !running &&
    !cancelBusy &&
    (readiness.resumeOnly ||
      Boolean(displayChatId) ||
      Boolean(studioStatus?.v0Starting));
  const canCancel = running || cancelBusy || readiness.resumeOnly || Boolean(studioStatus?.v0StartError);
  const canClear =
    !running &&
    !cancelBusy &&
    (readiness.resumeOnly ||
      Boolean(studioStatus?.v0StartError) ||
      Boolean(displayChatId) ||
      Boolean(studioStatus?.v0Starting));

  return (
    <section
      className="shrink-0 border-b border-white/10 bg-[#060a12]/95 px-3 py-2.5"
      aria-label="v0 generation controls"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-cyan-400/90">
              v0 UI generation
            </span>
            {phase === 'complete' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                Complete
              </span>
            ) : phase === 'running' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-100">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Running {formatElapsed(elapsedMs)}
              </span>
            ) : phase === 'error' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-200">
                <AlertCircle className="h-3 w-3" aria-hidden />
                Error
              </span>
            ) : phase === 'blocked' ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-100">Not ready</span>
            ) : (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">Ready</span>
            )}
            {displayChatId ? (
              <span className="truncate font-mono text-[10px] text-slate-500" title={displayChatId}>
                chat {displayChatId.slice(0, 10)}…
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              'text-[11px] leading-relaxed',
              phase === 'error' ? 'text-rose-100/90' : 'text-slate-300',
            )}
          >
            {statusLine}
          </p>
          {progressLine.trim() ? (
            <button
              type="button"
              className="text-[10px] text-slate-500 underline hover:text-slate-300"
              onClick={onDismissProgress}
            >
              Dismiss message
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={!canGenerate}
            title={readiness.blockReason ?? 'Start a new v0 chat (one charge)'}
            onClick={onGenerate}
            className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Generate v0
          </button>
          <button
            type="button"
            disabled={!canResume}
            title="Poll existing v0 chat — no new charge"
            onClick={onResume}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-50 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Resume
          </button>
          <button
            type="button"
            disabled={!canCancel}
            title="Stop client polling and cancel server v0 job"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cancelBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
            Cancel
          </button>
          <button
            type="button"
            disabled={!canClear || cancelBusy}
            title="Clear v0 pending state on server (after errors or stale sessions)"
            onClick={onClearSession}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-50 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
          <button
            type="button"
            disabled={cancelBusy}
            title="Refresh v0 status from server"
            onClick={onRefreshStatus}
            className="inline-flex items-center rounded-md border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {phase === 'blocked' || !readiness.ready ? (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {readiness.checks.map((c) => (
            <li
              key={c.id}
              className={cn(
                'flex items-start gap-2 rounded-md border px-2 py-1 text-[10px]',
                c.ok ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100/90' : 'border-rose-500/20 bg-rose-500/5 text-rose-100/90',
              )}
            >
              <span className="mt-0.5 shrink-0">{c.ok ? '✓' : '○'}</span>
              <span>
                {c.label}
                {c.hint ? <span className="mt-0.5 block text-[9px] opacity-80">{c.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasV0ApiKey === false ? (
        <p className="mt-2 text-[10px] text-amber-200/90">
          Add <code className="text-amber-100">V0_API_KEY</code> on Render or in My services → v0 API key.
        </p>
      ) : null}
    </section>
  );
}
