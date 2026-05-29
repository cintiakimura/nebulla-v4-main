import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  GitBranch,
  GitCommit,
  RefreshCw,
} from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';
import { withProjectQuery } from '../lib/nebulaProjectApi';
import { IdeCollapsibleSection } from './ide/IdeCollapsibleSection';

type GitEntry = { status: string; path: string };

type LatestCommit = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
};

type Overview = {
  nebulaProjectRoot: string;
  git: {
    branch: string;
    entries: GitEntry[];
    error?: string;
    latestCommit?: LatestCommit | null;
  } | null;
};

function statusLabel(status: string): string {
  const idx = status[0] ?? ' ';
  const wt = status[1] ?? ' ';
  if (idx === '?' || wt === '?') return 'Untracked';
  if (idx === 'A' || wt === 'A') return 'Added';
  if (idx === 'D' || wt === 'D') return 'Deleted';
  if (idx === 'R') return 'Renamed';
  if (idx === 'M' || wt === 'M') return 'Modified';
  return 'Changed';
}

function statusTone(status: string): string {
  const u = statusLabel(status);
  if (u === 'Untracked') return 'text-amber-400/90';
  if (u === 'Added') return 'text-emerald-400/90';
  if (u === 'Deleted') return 'text-red-400/90';
  if (u === 'Modified') return 'text-cyan-400/90';
  return 'text-muted-foreground';
}

function isStaged(status: string): boolean {
  const idx = status[0] ?? ' ';
  return idx !== ' ' && idx !== '?';
}

function isUnstaged(status: string): boolean {
  const wt = status[1] ?? ' ';
  return wt !== ' ';
}

function fmtCommitDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function ChangeRow({ entry, onOpen }: { entry: GitEntry; onOpen: (path: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.path)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-secondary/50"
      title={`Open ${entry.path}`}
    >
      <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90">{entry.path}</span>
      <span className={`shrink-0 font-mono text-[10px] ${statusTone(entry.status)}`}>
        {statusLabel(entry.status)}
      </span>
    </button>
  );
}

export function SourceControlPanel({
  projectKey = 'default',
  projectName = '',
}: {
  projectKey?: string;
  projectName?: string;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(true);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const [commitOpen, setCommitOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(withProjectQuery('/api/source-control/overview'));
      const j = await readResponseJson<Overview & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${res.status}`);
      }
      setData({ nebulaProjectRoot: j.nebulaProjectRoot, git: j.git ?? null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load source control');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectKey, projectName]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('nebula-files-applied', refresh);
    window.addEventListener('nebula-master-plan-updated', refresh);
    window.addEventListener('nebula-workspace-context-synced', refresh);
    return () => {
      window.removeEventListener('nebula-files-applied', refresh);
      window.removeEventListener('nebula-master-plan-updated', refresh);
      window.removeEventListener('nebula-workspace-context-synced', refresh);
    };
  }, [load]);

  const openFile = (path: string) => {
    try {
      window.dispatchEvent(new CustomEvent('nebula-center-focus-file', { detail: { path } }));
    } catch {
      /* ignore */
    }
  };

  const entries = data?.git?.entries ?? [];
  const staged = useMemo(() => entries.filter((e) => isStaged(e.status)), [entries]);
  const unstaged = useMemo(() => entries.filter((e) => isUnstaged(e.status)), [entries]);
  const changeCount = entries.length;
  const latest = data?.git?.latestCommit ?? null;
  const branch = data?.git?.branch ?? '—';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="tonal-seam-b flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
          <div className="min-w-0">
            <h2 className="type-title-sm text-foreground">Source Control</h2>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {branch !== '—' ? (
                <>
                  <span className="text-primary/90">{branch}</span>
                  {projectName ? ` · ${projectName}` : ''}
                </>
              ) : (
                projectName || data?.nebulaProjectRoot || projectKey
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="btn-secondary-surface inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Refresh git status"
          aria-label="Refresh git status"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>

      {err ? (
        <p className="shrink-0 border-b border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-300">{err}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && !data ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">Loading git status…</p>
        ) : null}

        {!data?.git ? (
          <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-4 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground/90">No git repository</p>
            <p>
              This workspace has no <code className="text-primary/80">.git</code> folder. Connect GitHub or run{' '}
              <code className="text-primary/80">git init</code> in the project to track changes here.
            </p>
          </div>
        ) : (
          <>
            {data.git.error ? (
              <p className="mb-2 rounded-md border border-amber-500/25 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-200/90">
                {data.git.error}
              </p>
            ) : null}

            <IdeCollapsibleSection
              title="Changes"
              open={changesOpen}
              onToggle={() => setChangesOpen((v) => !v)}
              count={changeCount}
              className="mb-1"
            >
              {changeCount === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">No uncommitted changes — working tree clean.</p>
              ) : (
                <div className="space-y-2 pb-2">
                  {staged.length > 0 ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setStagedOpen((v) => !v)}
                        className="flex w-full items-center gap-1 px-2 py-0.5 text-left hover:bg-secondary/40"
                        aria-expanded={stagedOpen}
                      >
                        {stagedOpen ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Staged Changes
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{staged.length}</span>
                      </button>
                      {stagedOpen ? (
                        <div className="mt-0.5 space-y-0.5">
                          {staged.map((e) => (
                            <ChangeRow key={`s-${e.path}-${e.status}`} entry={e} onOpen={openFile} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {unstaged.length > 0 ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setUnstagedOpen((v) => !v)}
                        className="flex w-full items-center gap-1 px-2 py-0.5 text-left hover:bg-secondary/40"
                        aria-expanded={unstagedOpen}
                      >
                        {unstagedOpen ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Changes
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                          {unstaged.length}
                        </span>
                      </button>
                      {unstagedOpen ? (
                        <div className="mt-0.5 space-y-0.5">
                          {unstaged.map((e) => (
                            <ChangeRow key={`u-${e.path}-${e.status}`} entry={e} onOpen={openFile} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </IdeCollapsibleSection>

            <IdeCollapsibleSection
              title="Latest commit"
              open={commitOpen}
              onToggle={() => setCommitOpen((v) => !v)}
            >
              {latest ? (
                <div className="space-y-2 px-2 pb-3">
                  <div className="flex items-start gap-2 rounded-md border border-border/50 bg-card/30 p-2.5">
                    <GitCommit className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground">{latest.subject}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        <span className="text-primary/80">{latest.shortHash}</span>
                        {' · '}
                        {latest.author}
                        {' · '}
                        {fmtCommitDate(latest.date)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="px-2 pb-3 text-xs text-muted-foreground">No commits yet on this branch.</p>
              )}
            </IdeCollapsibleSection>
          </>
        )}
      </div>
    </div>
  );
}
