import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, GitBranch, Globe, Link2, Server, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBrowserProjectKey } from '../../../lib/nebulaProjectApi';
import { fetchRunnableStatus } from '../../../lib/workspaceDeployClient';
import {
  readStoredCustomDomain,
  readStoredDnsRecords,
  readStoredRepoUrl,
  readStoredWorkspaceLiveUrl,
  writeStoredCustomDomain,
  writeStoredDnsRecords,
  writeStoredRepoUrl,
  writeStoredWorkspaceLiveUrl,
  type StoredDnsRecord,
} from '../../../lib/workspaceLiveUrl';

function FieldLabel({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="type-label-sm mb-1.5 flex items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </div>
  );
}

/**
 * Plan page bottom: temporary URL, own domain, repo URL, and DNS record fields.
 */
export function PlanDeployDnsSection({ className }: { className?: string }) {
  const projectKey = getBrowserProjectKey();
  const [tempUrl, setTempUrl] = useState(() => readStoredWorkspaceLiveUrl());
  const [ownDomain, setOwnDomain] = useState(
    () => readStoredCustomDomain(projectKey)?.domain || '',
  );
  const [repoUrl, setRepoUrl] = useState(() => readStoredRepoUrl(projectKey));
  const [dnsRecords, setDnsRecords] = useState<StoredDnsRecord[]>(() =>
    readStoredDnsRecords(projectKey),
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredWorkspaceLiveUrl();
    if (stored) setTempUrl(stored);
    void fetchRunnableStatus()
      .then(() => {
        const again = readStoredWorkspaceLiveUrl();
        if (again) setTempUrl(again);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  useEffect(() => {
    const onLiveUrl = (ev: Event) => {
      const detailUrl = (ev as CustomEvent<{ url?: string }>).detail?.url?.trim();
      if (detailUrl && /^https?:\/\//i.test(detailUrl)) {
        setTempUrl(detailUrl);
        return;
      }
      const again = readStoredWorkspaceLiveUrl();
      if (again) setTempUrl(again);
    };
    window.addEventListener('nebula-workspace-live-url', onLiveUrl);
    return () => window.removeEventListener('nebula-workspace-live-url', onLiveUrl);
  }, []);

  const flash = useCallback((key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  }, []);

  const copyText = useCallback(
    async (key: string, value: string) => {
      if (!value.trim()) return;
      try {
        await navigator.clipboard.writeText(value.trim());
        flash(key);
      } catch {
        /* ignore */
      }
    },
    [flash],
  );

  const persistTempUrl = useCallback(() => {
    const t = tempUrl.trim();
    if (t && /^https?:\/\//i.test(t)) {
      writeStoredWorkspaceLiveUrl(t);
      setHint('Temporary URL saved.');
    } else if (!t) {
      setHint('Temporary URL cleared locally when empty after deploy.');
    } else {
      setHint('Temporary URL should start with https://');
    }
    window.setTimeout(() => setHint(null), 4000);
  }, [tempUrl]);

  const persistOwnDomain = useCallback(() => {
    writeStoredCustomDomain(projectKey, ownDomain.trim(), ownDomain.trim() ? 'pending' : 'not_configured');
    setHint(ownDomain.trim() ? 'Your domain saved locally.' : 'Your domain cleared.');
    window.setTimeout(() => setHint(null), 4000);
  }, [ownDomain, projectKey]);

  const persistRepo = useCallback(() => {
    writeStoredRepoUrl(projectKey, repoUrl);
    setHint(repoUrl.trim() ? 'Repository URL saved.' : 'Repository URL cleared.');
    window.setTimeout(() => setHint(null), 4000);
  }, [projectKey, repoUrl]);

  const updateDns = useCallback(
    (index: number, patch: Partial<StoredDnsRecord>) => {
      setDnsRecords((prev) => {
        const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
        writeStoredDnsRecords(projectKey, next);
        return next;
      });
    },
    [projectKey],
  );

  return (
    <section
      className={cn('shrink-0 border-t border-border px-5 py-6 md:px-8 md:py-8', className)}
      aria-label="Domain, repository, and DNS"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="type-section">Deploy &amp; domain</h2>
            <p className="type-label-sm mt-1 max-w-xl">
              Temporary hostname, your domain, repository, and DNS records for this project.
            </p>
          </div>
          {hint ? (
            <p className="type-label-sm text-foreground" role="status">
              {hint}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="min-w-0">
            <FieldLabel icon={Link2}>Temporary domain URL</FieldLabel>
            <div className="flex gap-2">
              <input
                type="url"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                onBlur={persistTempUrl}
                placeholder="https://your-app.onrender.com"
                className="ide-glass-input min-w-0 flex-1 rounded-md px-3 py-2 font-mono text-xs outline-none"
                aria-label="Temporary domain URL"
              />
              <button
                type="button"
                title="Copy"
                aria-label="Copy temporary URL"
                onClick={() => void copyText('temp', tempUrl)}
                className="btn-secondary-surface btn-icon shrink-0 text-muted-foreground"
              >
                {copied === 'temp' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <FieldLabel icon={Globe}>Your domain URL</FieldLabel>
            <div className="flex gap-2">
              <input
                type="text"
                value={ownDomain}
                onChange={(e) => setOwnDomain(e.target.value)}
                onBlur={persistOwnDomain}
                placeholder="app.yourdomain.com"
                className="ide-glass-input min-w-0 flex-1 rounded-md px-3 py-2 font-mono text-xs outline-none"
                aria-label="Your domain URL"
              />
              <button
                type="button"
                title="Copy"
                aria-label="Copy your domain"
                onClick={() => void copyText('own', ownDomain)}
                className="btn-secondary-surface btn-icon shrink-0 text-muted-foreground"
              >
                {copied === 'own' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <FieldLabel icon={GitBranch}>Repository URL</FieldLabel>
            <div className="flex gap-2">
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onBlur={persistRepo}
                placeholder="https://github.com/org/repo"
                className="ide-glass-input min-w-0 flex-1 rounded-md px-3 py-2 font-mono text-xs outline-none"
                aria-label="Repository URL"
              />
              <button
                type="button"
                title="Copy"
                aria-label="Copy repository URL"
                onClick={() => void copyText('repo', repoUrl)}
                className="btn-secondary-surface btn-icon shrink-0 text-muted-foreground"
              >
                {copied === 'repo' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>

        <div>
          <FieldLabel icon={Server}>DNS records</FieldLabel>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="type-micro px-3 py-2.5 font-normal">Type</th>
                  <th className="type-micro px-3 py-2.5 font-normal">Host</th>
                  <th className="type-micro px-3 py-2.5 font-normal">Value</th>
                  <th className="type-micro w-24 px-3 py-2.5 font-normal">TTL</th>
                </tr>
              </thead>
              <tbody>
                {dnsRecords.map((row, index) => (
                  <tr key={`${row.type}-${index}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 align-middle">
                      <select
                        value={row.type}
                        onChange={(e) =>
                          updateDns(index, {
                            type: e.target.value as StoredDnsRecord['type'],
                          })
                        }
                        className="ide-glass-input h-8 w-[5.5rem] rounded-md px-2 text-xs outline-none"
                        aria-label={`DNS type row ${index + 1}`}
                      >
                        <option value="A">A</option>
                        <option value="CNAME">CNAME</option>
                        <option value="TXT">TXT</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="text"
                        value={row.host}
                        onChange={(e) => updateDns(index, { host: e.target.value })}
                        placeholder="@"
                        className="ide-glass-input h-8 w-full min-w-[5rem] rounded-md px-2 font-mono text-xs outline-none"
                        aria-label={`DNS host row ${index + 1}`}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateDns(index, { value: e.target.value })}
                        placeholder={
                          row.type === 'TXT'
                            ? 'verification token'
                            : row.type === 'CNAME'
                              ? 'target.host.com'
                              : 'IP address'
                        }
                        className="ide-glass-input h-8 w-full min-w-[10rem] rounded-md px-2 font-mono text-xs outline-none"
                        aria-label={`DNS value row ${index + 1}`}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="text"
                        value={row.ttl}
                        onChange={(e) => updateDns(index, { ttl: e.target.value })}
                        placeholder="3600"
                        className="ide-glass-input h-8 w-full rounded-md px-2 font-mono text-xs outline-none"
                        aria-label={`DNS TTL row ${index + 1}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="type-label-sm mt-2">
            Values save locally until DNS provider wiring is connected.
          </p>
        </div>
      </div>
    </section>
  );
}
