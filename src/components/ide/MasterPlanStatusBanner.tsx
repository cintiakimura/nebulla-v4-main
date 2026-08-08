import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { fetchJson } from '../../lib/apiFetch';
import {
  fetchMasterPlanStatus,
  summarizeMasterPlanStatus,
  type MasterPlanStatus,
} from '../../lib/masterPlanStatus';
import { withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

/** Compact completeness banner for the Master Plan panel. */
export function MasterPlanStatusBanner() {
  const [status, setStatus] = useState<MasterPlanStatus | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptNote, setAcceptNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void fetchMasterPlanStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener('nebula-master-plan-updated', onRefresh);
    return () => window.removeEventListener('nebula-master-plan-updated', onRefresh);
  }, [refresh]);

  const acceptSecurity = useCallback(async () => {
    setAccepting(true);
    setAcceptNote(null);
    try {
      const res = await fetchJson<{ ok?: boolean; applied?: boolean; reason?: string }>(
        withProjectQuery('/api/master-plan/accept-security-baseline'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(withProjectBody({})),
        },
      );
      if (res.applied) {
        setAcceptNote('Security baseline + sign-in approach saved in Tech and Research.');
      } else if (res.reason === 'already_present') {
        setAcceptNote('Security baseline already present in Tech and Research.');
      } else {
        setAcceptNote('Security baseline checked.');
      }
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      refresh();
    } catch (e) {
      setAcceptNote(e instanceof Error ? e.message : 'Could not apply baseline');
    } finally {
      setAccepting(false);
    }
  }, [refresh]);

  if (!status) return null;

  const summary = summarizeMasterPlanStatus(status);
  // Softened SEC_* gaps are MVP warnings — don't keep screaming "blocking" polish after Go is allowed.
  const displayLines =
    status.allowGo
      ? summary.lines.filter(
          (line) =>
            !/private data stays private|how people sign in|security baseline/i.test(line),
        )
      : summary.lines;
  const tone =
    status.allowGo && summary.tone === 'block'
      ? 'warn'
      : displayLines.length === 0 && status.allowGo
        ? 'ok'
        : summary.tone;
  const title =
    tone === 'ok'
      ? 'Plan looks ready'
      : tone === 'warn'
        ? displayLines.length
          ? 'Plan works — a few polish items'
          : 'Plan looks ready'
        : summary.title;
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? Info : AlertCircle;
  const border =
    tone === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100/90'
      : tone === 'warn'
        ? 'border-amber-500/35 bg-amber-500/5 text-amber-100/90'
        : 'border-rose-500/35 bg-rose-500/5 text-rose-100/90';

  const showSecurityAccept = Boolean(status.securityProposal?.needed);

  return (
    <div className={`mx-4 mt-3 rounded-lg border px-3 py-2.5 text-[12px] leading-snug ${border}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium tracking-wide">{title}</p>
          {displayLines.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-[11px] opacity-90">
              {displayLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : tone === 'ok' ? (
            <p className="mt-1 text-[11px] opacity-90">
              Pages, research, and design tokens are in good shape for the next coding slice.
            </p>
          ) : null}
          {status.securityAutoApplied ? (
            <p className="mt-2 text-[11px] opacity-90">
              Security + sign-in assumptions were auto-added to Tech and Research (MVP). Coding does not wait on
              Accept — harden before deploy.
            </p>
          ) : null}
          {showSecurityAccept ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[11px] opacity-90">
                Optional: acknowledge the starter security baseline in §2. Foundation coding is not blocked.
              </p>
              <button
                type="button"
                disabled={accepting}
                onClick={() => void acceptSecurity()}
                className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
              >
                {accepting ? 'Adding…' : 'Acknowledge security assumptions'}
              </button>
            </div>
          ) : null}
          {acceptNote ? <p className="mt-1.5 text-[10px] opacity-80">{acceptNote}</p> : null}
          {status.mode !== 'off' ? (
            <p className="mt-1.5 text-[10px] opacity-60">
              Gate mode: {status.mode}
              {!status.allowGo ? ' · Go paused' : ''}
              {typeof status.uiBriefLength === 'number' && status.uiBriefLength > 0
                ? ` · UI brief ${status.uiBriefLength} chars`
                : ''}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
