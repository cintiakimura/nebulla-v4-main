import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  GitBranch,
  GitCommit,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  nebulaFiles?: { relativePath: string; size: number; mtimeMs: number }[];
  git: {
    branch: string;
    entries: GitEntry[];
    error?: string;
    latestCommit?: LatestCommit | null;
  } | null;
};

type TreeNode = {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
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

function statusLetter(status: string): string {
  const label = statusLabel(status);
  if (label === 'Untracked') return 'U';
  if (label === 'Added') return 'A';
  if (label === 'Deleted') return 'D';
  if (label === 'Renamed') return 'R';
  if (label === 'Modified') return 'M';
  return 'C';
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

function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFile: false, children: [] };
  const byPath = new Map<string, TreeNode>();
  byPath.set('', root);
  for (const fullPath of [...new Set(paths)].sort((a, b) => a.localeCompare(b))) {
    const clean = fullPath.replace(/^\/+|\/+$/g, '');
    if (!clean) continue;
    const parts = clean.split('/').filter(Boolean);
    let acc = '';
    let parent = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = byPath.get(acc);
      if (!node) {
        node = { name: part, path: acc, isFile, children: [] };
        byPath.set(acc, node);
        parent.children.push(node);
      } else if (isFile) {
        node.isFile = true;
      }
      parent = node;
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root.children);
  return root.children;
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

function StatusTreeRows({
  nodes,
  depth,
  expanded,
  toggle,
  statusByPath,
  onOpen,
}: {
  nodes: TreeNode[];
  depth: number;
  expanded: Record<string, boolean>;
  toggle: (path: string) => void;
  statusByPath: Map<string, string>;
  onOpen: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => {
        const st = statusByPath.get(n.path);
        const folderHasChanges =
          !n.isFile &&
          [...statusByPath.keys()].some((p) => p === n.path || p.startsWith(`${n.path}/`));
        return (
          <div key={n.path} className="select-none">
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded-md py-0.5 text-left text-[11px] text-foreground/90 hover:bg-secondary/50"
              style={{ paddingLeft: 6 + depth * 12 }}
              onClick={() => {
                if (n.isFile) onOpen(n.path);
                else toggle(n.path);
              }}
              title={n.path}
            >
              {!n.isFile ? (
                expanded[n.path] ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                )
              ) : (
                <span className="w-3 shrink-0" />
              )}
              {n.isFile ? (
                <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <Folder className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{n.name}</span>
              {st ? (
                <span className={cn('shrink-0 font-mono text-[10px] font-semibold', statusTone(st))}>
                  {statusLetter(st)}
                </span>
              ) : folderHasChanges ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">•</span>
              ) : null}
            </button>
            {!n.isFile && expanded[n.path] ? (
              <StatusTreeRows
                nodes={n.children}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                statusByPath={statusByPath}
                onOpen={onOpen}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function SourceControlPanel({
  projectKey = 'default',
  projectName = '',
  compact = false,
}: {
  projectKey?: string;
  projectName?: string;
  /** Tighter chrome for the left IDE sidebar. */
  compact?: boolean;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const [commitOpen, setCommitOpen] = useState(!compact);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [commitMessage, setCommitMessage] = useState('');
  const [actionBusy, setActionBusy] = useState<'stage' | 'commit' | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(withProjectQuery('/api/source-control/overview'));
      const j = await readResponseJson<Overview & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${res.status}`);
      }
      setData({
        nebulaProjectRoot: j.nebulaProjectRoot,
        nebulaFiles: j.nebulaFiles,
        git: j.git ?? null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load source control');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectKey, projectName]);

  const stageAll = useCallback(async () => {
    setActionBusy('stage');
    setActionMsg(null);
    setErr(null);
    try {
      const res = await fetch(withProjectQuery('/api/source-control/stage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const j = await readResponseJson<{ ok?: boolean; staged?: number; error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${res.status}`);
      }
      setActionMsg(j.staged ? `Staged ${j.staged} file${j.staged === 1 ? '' : 's'}` : 'Nothing to stage');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Stage failed');
    } finally {
      setActionBusy(null);
    }
  }, [load]);

  const commitStaged = useCallback(async () => {
    const message = commitMessage.trim();
    if (!message) {
      setErr('Enter a commit message first');
      return;
    }
    setActionBusy('commit');
    setActionMsg(null);
    setErr(null);
    try {
      const res = await fetch(withProjectQuery('/api/source-control/commit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });
      const j = await readResponseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${res.status}`);
      }
      setCommitMessage('');
      setActionMsg('Committed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Commit failed');
    } finally {
      setActionBusy(null);
    }
  }, [commitMessage, load]);

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

  const statusByPath = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.path.replace(/\\/g, '/'), e.status);
    return m;
  }, [entries]);

  const treePaths = useMemo(() => {
    const fromFiles = (data?.nebulaFiles ?? []).map((f) => f.relativePath.replace(/\\/g, '/'));
    const fromGit = entries.map((e) => e.path.replace(/\\/g, '/'));
    return [...new Set([...fromFiles, ...fromGit])];
  }, [data?.nebulaFiles, entries]);

  const fileTree = useMemo(() => buildFileTree(treePaths), [treePaths]);

  useEffect(() => {
    // Auto-expand top-level folders so the tree is useful immediately.
    if (fileTree.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const n of fileTree) {
        if (!n.isFile && next[n.path] === undefined) next[n.path] = true;
      }
      return next;
    });
  }, [fileTree]);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div
        className={cn(
          'tonal-seam-b flex shrink-0 items-center justify-between gap-2 border-b border-white/5',
          compact ? 'px-2 py-1.5' : 'px-3 py-2',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
          <div className="min-w-0">
            <h2 className={cn('text-foreground', compact ? 'text-xs font-semibold' : 'type-title-sm')}>
              Source Control
            </h2>
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

      <div className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-1 py-1' : 'px-2 py-2')}>
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

            <div className={cn('mb-2 space-y-2', compact ? 'px-1' : 'px-1.5')}>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Message (required for commit)"
                rows={compact ? 2 : 3}
                className="w-full resize-none rounded-md border border-white/10 bg-transparent px-2 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-cyan-500/35"
                aria-label="Commit message"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void stageAll()}
                  disabled={actionBusy !== null || unstaged.length === 0}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-white/15 bg-transparent px-2.5 text-[11px] text-foreground/90 transition-colors hover:border-cyan-500/35 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Stage all unstaged changes"
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  {actionBusy === 'stage' ? 'Staging…' : 'Stage'}
                </button>
                <button
                  type="button"
                  onClick={() => void commitStaged()}
                  disabled={actionBusy !== null || staged.length === 0 || !commitMessage.trim()}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-white/15 bg-transparent px-2.5 text-[11px] text-foreground/90 transition-colors hover:border-cyan-500/35 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Commit staged changes"
                >
                  <GitCommit className="h-3 w-3" aria-hidden />
                  {actionBusy === 'commit' ? 'Committing…' : 'Commit'}
                </button>
              </div>
              {actionMsg ? (
                <p className="text-[10px] text-emerald-400/90">{actionMsg}</p>
              ) : null}
            </div>

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
              title="Files"
              open={treeOpen}
              onToggle={() => setTreeOpen((v) => !v)}
              count={treePaths.length}
              className="mb-1"
            >
              {fileTree.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">No project files yet.</p>
              ) : (
                <div className="pb-2">
                  <StatusTreeRows
                    nodes={fileTree}
                    depth={0}
                    expanded={expanded}
                    toggle={toggleFolder}
                    statusByPath={statusByPath}
                    onOpen={openFile}
                  />
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
