import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Wrench, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  APP_STATUS_EVENTS,
  clearAppRuntimeIssues,
  formatAppStatusDebugMessage,
  formatLatestAppStatusDebugMessage,
  getAppRuntimeErrorCount,
  getAppRuntimeSnapshot,
  getAppStatusDebugIssues,
  mapRuntimeToFriendly,
  markAppRuntimeSeen,
  openAppStatusMenu,
  relativeAppStatusTime,
  subscribeAppRuntime,
  type AppRuntimeIssue,
} from '../../lib/ideAppRuntimeStatus';
import { useLanguage } from '@/components/i18n/LanguageProvider';

function useAppRuntimeSnapshot() {
  const [snap, setSnap] = useState(getAppRuntimeSnapshot);
  useEffect(() => subscribeAppRuntime(() => setSnap(getAppRuntimeSnapshot())), []);
  return snap;
}

function IssueCard({
  issue,
  onFix,
  t,
}: {
  issue: AppRuntimeIssue;
  onFix: (issue: AppRuntimeIssue) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [techOpen, setTechOpen] = useState(false);
  // Re-map so IDE locale changes refresh friendly copy without clearing issues.
  const friendly = mapRuntimeToFriendly({
    technicalMessage: issue.technicalMessage,
    source: issue.source,
    route: issue.route,
  });
  return (
    <div className="rounded-lg border border-border/80 bg-black/40 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <AlertCircle
          className={cn(
            'mt-0.5 h-3.5 w-3.5 shrink-0',
            issue.severity === 'warn' ? 'text-amber-300/90' : 'text-red-300/90',
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="type-label-sm font-medium text-foreground">{friendly.friendlyTitle}</p>
          <p className="type-label-sm mt-0.5 text-muted-foreground">{friendly.friendlyBody}</p>
          <p className="type-label-sm mt-1 text-muted-foreground/70">
            {relativeAppStatusTime(issue.at)}
            {issue.route ? ` · ${issue.route}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onFix(issue)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25"
            >
              <Wrench className="h-3 w-3" aria-hidden />
              {t('appStatus.fixWithAgent')}
            </button>
            <button
              type="button"
              onClick={() => setTechOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {techOpen ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden />
              )}
              {t('appStatus.technicalDetails')}
            </button>
          </div>
          {techOpen ? (
            <pre className="mt-2 max-h-28 overflow-auto rounded bg-black/60 p-2 text-[10px] leading-snug text-muted-foreground whitespace-pre-wrap break-words">
              {issue.technicalMessage}
              {issue.stack ? `\n\n${issue.stack}` : ''}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Cursor-style App Status control for the chat header. */
export function IdeAppStatusMenuButton({
  onFixWithAgent,
  onVoiceNudge,
}: {
  onFixWithAgent: (debugMessage: string) => void;
  /** Optional debounced TTS when a new issue arrives (parent gates Open talk). */
  onVoiceNudge?: (text: string) => void;
}) {
  const { t } = useLanguage();
  const snap = useAppRuntimeSnapshot();
  const [open, setOpen] = useState(false);
  const errorCount = snap.issues.filter((i) => i.severity !== 'info').length;
  const healthy = errorCount === 0;
  const badge = snap.unreadCount > 0 ? snap.unreadCount : errorCount > 0 ? errorCount : 0;

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      markAppRuntimeSeen();
    };
    window.addEventListener(APP_STATUS_EVENTS.openMenu, onOpen);
    return () => window.removeEventListener(APP_STATUS_EVENTS.openMenu, onOpen);
  }, []);

  useEffect(() => {
    const onIssue = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { issue?: AppRuntimeIssue; deduped?: boolean } | undefined;
      if (!detail?.issue || detail.deduped) return;
      if (detail.issue.severity === 'info') return;
      onVoiceNudge?.(t('appStatus.voiceNudge'));
    };
    window.addEventListener(APP_STATUS_EVENTS.issue, onIssue);
    return () => window.removeEventListener(APP_STATUS_EVENTS.issue, onIssue);
  }, [onVoiceNudge, t]);

  const handleFix = useCallback(
    (issue: AppRuntimeIssue) => {
      setOpen(false);
      const { primary, related } = getAppStatusDebugIssues(3);
      // Prefer multi-issue payload; fall back to the clicked card as primary.
      const payload = primary
        ? formatAppStatusDebugMessage({
            primary: primary.id === issue.id ? primary : issue,
            related:
              primary.id === issue.id
                ? related
                : [primary, ...related.filter((r) => r.id !== issue.id)].slice(0, 2),
          })
        : formatAppStatusDebugMessage(issue);
      onFixWithAgent(payload || formatLatestAppStatusDebugMessage() || formatAppStatusDebugMessage(issue));
    },
    [onFixWithAgent],
  );

  const statusLabel = healthy
    ? t('appStatus.looksOk')
    : errorCount === 1
      ? t('appStatus.somethingBroke')
      : t('appStatus.nIssues', { count: errorCount });

  return (
    <div className="relative">
      <button
        type="button"
        title={t('appStatus.titleAttr')}
        aria-label={t('appStatus.title')}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markAppRuntimeSeen();
        }}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-full ring-1 transition',
          healthy
            ? 'text-muted-foreground ring-[color-mix(in_srgb,var(--outline-variant)_18%,transparent)] hover:text-foreground'
            : 'text-red-200 ring-red-500/35 bg-red-500/10 hover:bg-red-500/15',
        )}
      >
        {healthy ? (
          <Activity className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        )}
        {badge > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] cursor-default"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full z-[80] mt-1.5 w-[min(100vw-1.5rem,20rem)] rounded-xl border border-border bg-[#0a0a0a] p-2.5 shadow-xl ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_14%,transparent)]"
            role="dialog"
            aria-label={t('appStatus.title')}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                {healthy ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" aria-hidden />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-300/90" aria-hidden />
                )}
                <span className="type-label-sm truncate font-medium text-foreground">{statusLabel}</span>
              </div>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={t('common.close')}
                onClick={() => setOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="type-label-sm mb-2 px-0.5 text-muted-foreground">
              {healthy ? t('appStatus.healthyDetail') : t('appStatus.issuesDetail')}
            </p>

            <div className="max-h-[min(40vh,16rem)] space-y-2 overflow-y-auto">
              {snap.issues.slice(0, 3).map((issue) => (
                <IssueCard key={issue.id} issue={issue} onFix={handleFix} t={t} />
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
              <button
                type="button"
                disabled={healthy}
                onClick={() => {
                  const latest = snap.issues[0];
                  if (latest) handleFix(latest);
                }}
                className="type-label-sm rounded-md px-2 py-1 font-medium text-primary disabled:opacity-40"
              >
                {t('appStatus.askAgentFix')}
              </button>
              <button
                type="button"
                disabled={snap.issues.length === 0}
                onClick={() => clearAppRuntimeIssues()}
                className="type-label-sm rounded-md px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {t('appStatus.clear')}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Compact status dot for the preview dock chrome. */
export function IdeAppStatusPreviewBadge() {
  const { t } = useLanguage();
  const snap = useAppRuntimeSnapshot();
  const count = getAppRuntimeErrorCount();
  const healthy = count === 0;
  return (
    <button
      type="button"
      title={
        healthy
          ? t('appStatus.previewOk')
          : t('appStatus.previewIssues', { count })
      }
      onClick={() => openAppStatusMenu()}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-white/5"
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          healthy ? 'bg-emerald-400/90' : 'bg-red-400 animate-pulse',
        )}
        aria-hidden
      />
      {!healthy ? (
        <span className="text-[10px] tabular-nums text-red-200/90">{count}</span>
      ) : (
        <span className="text-[10px] text-slate-500">OK</span>
      )}
    </button>
  );
}
