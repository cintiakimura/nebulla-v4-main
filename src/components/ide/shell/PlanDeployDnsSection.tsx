import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Globe, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBrowserProjectKey } from '../../../lib/nebulaProjectApi';
import { fetchRunnableStatus } from '../../../lib/workspaceDeployClient';
import {
  readStoredCustomDomain,
  readStoredWorkspaceLiveUrl,
  writeStoredCustomDomain,
  type DnsDomainStatus,
} from '../../../lib/workspaceLiveUrl';

function statusLabel(status: DnsDomainStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'pending') return 'Pending';
  return 'Not configured';
}

/**
 * Plan page bottom: temporary live URL + DNS / custom domain (stub save).
 */
export function PlanDeployDnsSection({ className }: { className?: string }) {
  const projectKey = getBrowserProjectKey();
  const [liveUrl, setLiveUrl] = useState(() => readStoredWorkspaceLiveUrl());
  const [copied, setCopied] = useState(false);
  const [domainDraft, setDomainDraft] = useState(() => readStoredCustomDomain(projectKey)?.domain || '');
  const [dnsStatus, setDnsStatus] = useState<DnsDomainStatus>(
    () => readStoredCustomDomain(projectKey)?.status || 'not_configured',
  );
  const [dnsHint, setDnsHint] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredWorkspaceLiveUrl();
    if (stored) setLiveUrl(stored);
    // Runnable status may confirm deployability; it does not invent a URL.
    void fetchRunnableStatus()
      .then(() => {
        const again = readStoredWorkspaceLiveUrl();
        if (again) setLiveUrl(again);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  useEffect(() => {
    const onLiveUrl = (ev: Event) => {
      const detailUrl = (ev as CustomEvent<{ url?: string }>).detail?.url?.trim();
      if (detailUrl && /^https?:\/\//i.test(detailUrl)) {
        setLiveUrl(detailUrl);
        return;
      }
      const again = readStoredWorkspaceLiveUrl();
      if (again) setLiveUrl(again);
    };
    window.addEventListener('nebula-workspace-live-url', onLiveUrl);
    return () => window.removeEventListener('nebula-workspace-live-url', onLiveUrl);
  }, []);

  const onCopy = useCallback(async () => {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [liveUrl]);

  const onSaveDomain = useCallback(() => {
    const trimmed = domainDraft.trim();
    if (!trimmed) {
      const cleared = writeStoredCustomDomain(projectKey, '', 'not_configured');
      setDnsStatus(cleared.status);
      setDnsHint('Domain cleared (local stub).');
      return;
    }
    // Stub: mark pending — no DNS provider call in this pass.
    const saved = writeStoredCustomDomain(projectKey, trimmed, 'pending');
    setDomainDraft(saved.domain);
    setDnsStatus(saved.status);
    setDnsHint('Saved locally. DNS provider wiring comes later.');
  }, [domainDraft, projectKey]);

  return (
    <section
      className={cn(
        'ide-glass-chrome shrink-0 border-t border-border px-4 py-3 md:px-5 md:py-4',
        className,
      )}
      aria-label="Live URL and custom domain"
    >
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        {/* Temporary / live URL */}
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Temporary URL
          </div>
          {liveUrl ? (
            <div className="flex min-w-0 items-center gap-2">
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate font-mono text-xs text-foreground underline-offset-2 hover:underline"
                title={liveUrl}
              >
                {liveUrl}
              </a>
              <button
                type="button"
                title="Copy URL"
                aria-label="Copy URL"
                onClick={() => void onCopy()}
                className="btn-secondary-surface inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Deploy from Code to get a live URL
            </p>
          )}
        </div>

        {/* DNS / custom domain */}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
              DNS / custom domain
            </div>
            <span className="text-[10px] text-muted-foreground">{statusLabel(dnsStatus)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              placeholder="app.yourdomain.com"
              className="ide-glass-input min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-xs outline-none"
              aria-label="Custom domain"
            />
            <button
              type="button"
              title="Save domain"
              aria-label="Save domain"
              onClick={onSaveDomain}
              className="btn-cyan h-8 shrink-0 rounded-md px-3 text-xs"
            >
              Save domain
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Without a custom domain, the app uses the Render URL.
          </p>
          {dnsHint ? (
            <p className="text-[11px] text-muted-foreground" role="status">
              {dnsHint}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
