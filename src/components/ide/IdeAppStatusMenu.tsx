import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
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

/**
 * Inline App Status (document flow — does not overlay chat greeting).
 * Healthy: shows label only (no separate action button). Issues: auto-expands + voice nudge.
 */
export function IdeAppStatusMenuButton({
  onFixWithAgent,
  onVoiceNudge,
  rideStatus,
}: {
  onFixWithAgent: (debugMessage: string) => void;
  onVoiceNudge?: (text: string) => void;
  /** Optional ride / UI Gen line shown with App Status (not in header strip). */
  rideStatus?: string | null;
}) {
  const { t } = useLanguage();
  const snap = useAppRuntimeSnapshot();
  const [open, setOpen] = useState(false);
  const errorCount = snap.issues.filter((i) => i.severity !== 'info').length;
  const healthy = errorCount === 0;

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
      setOpen(true);
      markAppRuntimeSeen();
      onVoiceNudge?.(t('appStatus.voiceNudge'));
    };
    window.addEventListener(APP_STATUS_EVENTS.issue, onIssue);
    return () => window.removeEventListener(APP_STATUS_EVENTS.issue, onIssue);
  }, [onVoiceNudge, t]);

  const handleFix = useCallback(
    (issue: AppRuntimeIssue) => {
      setOpen(false);
      const { primary, related } = getAppStatusDebugIssues(3);
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
    <div className="shrink-0 border-b border-border/70">
      <div
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5',
          healthy ? 'text-emerald-200/90' : 'bg-red-500/10 text-red-100',
        )}
      >
        {healthy ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" aria-hidden />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-300/90" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-normal">{statusLabel}</p>
          {rideStatus ? (
            <p className="truncate text-[10px] text-muted-foreground">{rideStatus}</p>
          ) : null}
        </div>
        {!healthy ? (
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              markAppRuntimeSeen();
            }}
            className="shrink-0 rounded-md px-2 py-0.5 text-[10px] text-red-100/90 ring-1 ring-red-500/30 hover:bg-red-500/15"
          >
            {open ? t('common.close') : t('appStatus.title')}
          </button>
        ) : null}
      </div>

      {open && !healthy ? (
        <div
          className="border-t border-border/70 bg-[#0a0a0a]/90 px-2.5 py-2"
          role="region"
          aria-label={t('appStatus.title')}
        >
          <p className="type-label-sm mb-2 text-muted-foreground">{t('appStatus.issuesDetail')}</p>
          <div className="max-h-[min(40vh,14rem)] space-y-2 overflow-y-auto">
            {snap.issues.slice(0, 3).map((issue) => (
              <IssueCard key={issue.id} issue={issue} onFix={handleFix} t={t} />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
            <button
              type="button"
              onClick={() => {
                const latest = snap.issues[0];
                if (latest) handleFix(latest);
              }}
              className="type-label-sm rounded-md px-2 py-1 font-medium text-primary"
            >
              {t('appStatus.askAgentFix')}
            </button>
            <button
              type="button"
              onClick={() => clearAppRuntimeIssues()}
              className="type-label-sm rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              {t('appStatus.clear')}
            </button>
          </div>
        </div>
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
