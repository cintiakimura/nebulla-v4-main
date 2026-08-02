import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { withProjectBody, withProjectQuery, getBrowserProjectName } from '../../lib/nebulaProjectApi';
import { useIdeCenterTabs } from './IdeCenterTabsContext';
import type {
  SecurityFinding,
  SecurityScanReport,
  SecuritySeverity,
} from '../../../lib/securityScan/types';
import { SECURITY_SCAN_DISCLAIMER } from '../../../lib/securityScan/types';

const DISMISS_LS = 'nebulla_security_scan_dismissed_v1';

type DismissMap = Record<string, string[]>; // projectKey → finding ids

function readDismissals(projectKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_LS);
    if (!raw) return new Set();
    const map = JSON.parse(raw) as DismissMap;
    return new Set(map[projectKey] || []);
  } catch {
    return new Set();
  }
}

function writeDismissal(projectKey: string, findingId: string): void {
  try {
    const raw = localStorage.getItem(DISMISS_LS);
    const map = (raw ? JSON.parse(raw) : {}) as DismissMap;
    const list = new Set(map[projectKey] || []);
    list.add(findingId);
    map[projectKey] = [...list];
    localStorage.setItem(DISMISS_LS, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

const SEVERITY_ORDER: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

function severityClass(s: SecuritySeverity): string {
  switch (s) {
    case 'critical':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'high':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'medium':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
    case 'low':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function IdeSecurityScan() {
  const { t } = useLanguage();
  const { focusFile, openPanel } = useIdeCenterTabs();
  const projectName = getBrowserProjectName().trim() || 'Untitled project';

  const [report, setReport] = useState<SecurityScanReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeNpmAudit, setIncludeNpmAudit] = useState(false);
  const [filter, setFilter] = useState<SecuritySeverity | 'all'>('all');
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [projectKey, setProjectKey] = useState('default');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withProjectQuery('/api/security-scan/latest'));
        if (!res.ok) return;
        const data = (await res.json()) as SecurityScanReport & { empty?: boolean };
        if (!cancelled && data?.ok && !data.empty && Array.isArray(data.findings)) {
          setReport(data);
          setProjectKey(data.projectKey);
          setDismissed(readDismissals(data.projectKey));
        }
      } catch {
        /* no cache yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withProjectQuery('/api/security-scan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withProjectBody({
            includeNpmAudit,
            includeAuthHeuristics: true,
            includeHeadersConfig: true,
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `Scan failed (${res.status})`);
      }
      const next = data as SecurityScanReport;
      setReport(next);
      setProjectKey(next.projectKey);
      setDismissed(readDismissals(next.projectKey));
      try {
        window.dispatchEvent(
          new CustomEvent('nebula-security-scan-updated', { detail: { report: next } }),
        );
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Security scan failed');
    } finally {
      setLoading(false);
    }
  }, [includeNpmAudit]);

  const visibleFindings = useMemo(() => {
    const list = report?.findings || [];
    return list.filter((f) => {
      if (dismissed.has(f.id)) return false;
      if (filter !== 'all' && f.severity !== filter) return false;
      return true;
    });
  }, [report, dismissed, filter]);

  const unresolvedHigh = useMemo(() => {
    const list = report?.findings || [];
    return list.filter(
      (f) => !dismissed.has(f.id) && (f.severity === 'critical' || f.severity === 'high'),
    ).length;
  }, [report, dismissed]);

  const dismiss = (id: string) => {
    writeDismissal(projectKey, id);
    setDismissed(readDismissals(projectKey));
    try {
      window.dispatchEvent(new CustomEvent('nebula-security-scan-updated'));
    } catch {
      /* ignore */
    }
  };

  const openFinding = (f: SecurityFinding) => {
    if (f.fixKind === 'open-secrets' || f.category === 'credentials') {
      if (f.path) focusFile(f.path);
      openPanel('secrets');
      return;
    }
    if (f.path) focusFile(f.path);
  };

  const copyFinding = async (f: SecurityFinding) => {
    const text = [
      `[${f.severity}] ${f.title}`,
      f.description,
      f.path ? `Path: ${f.path}${f.line != null ? `:${f.line}` : ''}` : '',
      f.evidence ? `Evidence: ${f.evidence}` : '',
      `Recommendation: ${f.recommendation}`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <div className="flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-primary" aria-hidden />
              <h1 className="text-lg font-medium tracking-tight">{t('ide.security.title')}</h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {t('ide.security.subtitle')}
            </p>
            <p className="mt-2 text-xs text-muted-foreground/90 leading-relaxed">
              {SECURITY_SCAN_DISCLAIMER}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => void runScan()}
              disabled={loading}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60',
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              {loading ? t('ide.security.scanning') : t('ide.security.run')}
            </button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeNpmAudit}
                onChange={(e) => setIncludeNpmAudit(e.target.checked)}
                className="rounded border-border"
              />
              {t('ide.security.includeNpm')}
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            {t('ide.security.project')}: <span className="text-foreground">{projectName}</span>
          </span>
          {report ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {t('ide.security.lastRun')}: {new Date(report.scannedAt).toLocaleString()} (
                {report.durationMs}ms)
              </span>
              {unresolvedHigh > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-orange-300">
                    {unresolvedHigh} {t('ide.security.unresolvedHigh')}
                  </span>
                </>
              ) : null}
            </>
          ) : null}
        </div>

        {report ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={t('ide.security.filterAll')} />
            {SEVERITY_ORDER.map((s) => (
              <FilterChip
                key={s}
                active={filter === s}
                onClick={() => setFilter(s)}
                label={`${s} (${report.summary[s]})`}
                className={severityClass(s)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">{t('ide.security.error')}</p>
              <p className="mt-1 text-red-200/80">{error}</p>
            </div>
          </div>
        ) : null}

        {report?.warnings?.length ? (
          <ul className="mb-4 space-y-1 text-xs text-amber-200/90">
            {report.warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        ) : null}

        {!report && !loading && !error ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card/30 px-5 py-8 text-sm text-muted-foreground">
            <p>{t('ide.security.emptyPrompt')}</p>
          </div>
        ) : null}

        {report && visibleFindings.length === 0 && !loading ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card/30 px-5 py-8">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              {t('ide.security.noneFound')}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
              {t('ide.security.noneFoundHint')}
            </p>
          </div>
        ) : null}

        <ul className="space-y-3">
          {visibleFindings.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-border bg-card/20 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                        severityClass(f.severity),
                      )}
                    >
                      {f.severity}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {f.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground/80">
                      {f.confidence} confidence
                    </span>
                  </div>
                  <h2 className="mt-1.5 text-sm font-medium text-foreground">{f.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                  {f.path ? (
                    <p className="mt-1.5 font-mono text-[11px] text-foreground/80">
                      {f.path}
                      {f.line != null ? `:${f.line}` : ''}
                    </p>
                  ) : null}
                  {f.evidence ? (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {f.evidence}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-foreground/90 leading-relaxed">
                    <span className="text-muted-foreground">{t('ide.security.fix')}: </span>
                    {f.recommendation}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {f.path ? (
                  <ActionBtn
                    icon={<ExternalLink className="h-3 w-3" />}
                    label={t('ide.security.openFile')}
                    onClick={() => focusFile(f.path!)}
                  />
                ) : null}
                {(f.fixKind === 'open-secrets' || f.category === 'credentials') && (
                  <ActionBtn
                    icon={<KeyRound className="h-3 w-3" />}
                    label={t('ide.security.openSecrets')}
                    onClick={() => openFinding(f)}
                  />
                )}
                <ActionBtn
                  icon={<Copy className="h-3 w-3" />}
                  label={t('ide.security.copy')}
                  onClick={() => void copyFinding(f)}
                />
                <ActionBtn
                  icon={<X className="h-3 w-3" />}
                  label={t('ide.security.dismiss')}
                  onClick={() => dismiss(f.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[11px] capitalize transition-colors',
        active ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {label}
    </button>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {icon}
      {label}
    </button>
  );
}
