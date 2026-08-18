import { useCallback, useEffect, useMemo, useState } from 'react';
import { TerminalPanel } from '@/components/ide/TerminalPanel';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Github,
  GitCommit,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { IdeFileEditor } from '@/components/ide/IdeFileEditor';
import { useIdeShellNav } from '@/components/ide/shell/IdeShellNavContext';
import { buildWorkspaceFileTree, type WorkspaceTreeNode } from '../../../lib/workspaceFileTree';
import { readResponseJson } from '../../../lib/apiFetch';
import { withProjectQuery } from '../../../lib/nebulaProjectApi';
import { fetchSessionUser, type NebulaSessionUser } from '../../../lib/nebulaCloud';
import { fetchNebulaPublicConfig } from '../../../lib/nebulaPublicConfig';
import { formatGithubConnectionStatus } from '../../../lib/githubDisplay';
import { tryGuidedCommitSuccessToPlan } from '../../../lib/guidedFunnel';
import { subscribeGrokActivity } from '../../../lib/nebulaGrokActivityBus';

type GitEntry = { status: string; path: string };

const TERMINAL_COLLAPSED_KEY = 'nebula_code_terminal_collapsed_v1';

function readTerminalCollapsed(): boolean {
  try {
    return sessionStorage.getItem(TERMINAL_COLLAPSED_KEY) !== '0';
  } catch {
    return true;
  }
}

function statusLetter(status: string): string {
  const idx = status[0] ?? ' ';
  const wt = status[1] ?? ' ';
  if (idx === '?' || wt === '?') return 'U';
  if (idx === 'A' || wt === 'A') return 'A';
  if (idx === 'D' || wt === 'D') return 'D';
  if (idx === 'M' || wt === 'M') return 'M';
  return 'C';
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onOpen,
}: {
  node: WorkspaceTreeNode;
  depth: number;
  selectedPath: string | null;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isFolder = !node.isFile;
  const selected = selectedPath === node.path;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isFolder) setOpen((v) => !v);
          else onOpen(node.path);
        }}
        className={cn(
          'flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs hover:bg-[#1a1a1a]',
          selected && !isFolder && 'bg-[#1a1a1a] text-foreground',
        )}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        {isFolder ? (
          <>
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {open ? (
              <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className="h-3 w-3 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate text-foreground/90">{node.name}</span>
      </button>
      {isFolder && open
        ? node.children.map((c) => (
            <TreeNode
              key={c.path}
              node={c}
              depth={depth + 1}
              selectedPath={selectedPath}
              onOpen={onOpen}
            />
          ))
        : null}
    </div>
  );
}

/**
 * Code page: explorer + file view + compact commit dropdown + Deploy.
 */
export function CodeScreen() {
  const { activeScreen } = useIdeShellNav();
  const {
    workspacePaths,
    overviewLoading,
    overviewError,
    refreshTree,
    activePath,
    activeTab,
    openFile,
  } = useIdeWorkspace();

  const tree = useMemo(() => buildWorkspaceFileTree(workspacePaths), [workspacePaths]);

  const [changes, setChanges] = useState<GitEntry[]>([]);
  const [changesLoading, setChangesLoading] = useState(true);
  const [changesError, setChangesError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [busy, setBusy] = useState<'commit' | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<NebulaSessionUser | null>(null);
  const [githubOAuthReady, setGithubOAuthReady] = useState(false);
  const [codingBusy, setCodingBusy] = useState(false);
  const [terminalCollapsed, setTerminalCollapsed] = useState(readTerminalCollapsed);

  const hasChanges = changes.length > 0;
  const githubConnected = sessionUser?.provider === 'github';

  const loadChanges = useCallback(async () => {
    setChangesLoading(true);
    setChangesError(null);
    try {
      const res = await fetch(withProjectQuery('/api/source-control/overview'), {
        credentials: 'include',
        cache: 'no-store',
      });
      const j = await readResponseJson<{
        git?: { entries?: GitEntry[]; error?: string } | null;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.git?.error) setChangesError(j.git.error);
      setChanges(Array.isArray(j.git?.entries) ? j.git!.entries! : []);
    } catch (e) {
      setChanges([]);
      setChangesError(e instanceof Error ? e.message : 'Could not load changes');
    } finally {
      setChangesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  useEffect(
    () =>
      subscribeGrokActivity((snap) => {
        setCodingBusy(snap.activity.tone === 'work');
      }),
    [],
  );

  useEffect(() => {
    const refresh = () => void loadChanges();
    window.addEventListener('nebula-files-applied', refresh);
    return () => window.removeEventListener('nebula-files-applied', refresh);
  }, [loadChanges]);

  useEffect(() => {
    void Promise.all([fetchSessionUser(), fetchNebulaPublicConfig()]).then(([u, cfg]) => {
      setSessionUser(u);
      setGithubOAuthReady(Boolean(cfg.githubOAuthReady));
    });
    const onOAuth = (ev: MessageEvent) => {
      if (ev.data?.type !== 'OAUTH_AUTH_SUCCESS') return;
      void fetchSessionUser().then(setSessionUser);
    };
    window.addEventListener('message', onOAuth);
    return () => window.removeEventListener('message', onOAuth);
  }, []);

  useEffect(() => {
    const onOpenCommit = () => {
      setCommitOpen(true);
      void loadChanges();
    };
    window.addEventListener('nebula-open-commit', onOpenCommit);
    return () => window.removeEventListener('nebula-open-commit', onOpenCommit);
  }, [loadChanges]);

  useEffect(() => {
    if (!commitOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setCommitOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [commitOpen]);

  const onOpenFile = useCallback(
    (path: string) => {
      void openFile(path);
    },
    [openFile],
  );

  const onCommit = useCallback(async () => {
    const message = commitMessage.trim();
    if (!message) {
      setStatusLine('Enter a commit message first.');
      return;
    }
    setBusy('commit');
    setStatusLine(null);
    try {
      const stageRes = await fetch(withProjectQuery('/api/source-control/stage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!stageRes.ok) {
        const j = await readResponseJson<{ error?: string }>(stageRes);
        throw new Error(j.error || `Stage failed (${stageRes.status})`);
      }
      const commitRes = await fetch(withProjectQuery('/api/source-control/commit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });
      const cj = await readResponseJson<{ ok?: boolean; error?: string }>(commitRes);
      if (!commitRes.ok) throw new Error(cj.error || `Commit failed (${commitRes.status})`);
      setCommitMessage('');
      setStatusLine('Committed.');
      setCommitOpen(false);
      await loadChanges();
      void refreshTree();
      // T4 — successful commit only → Plan + pulse Deploy
      tryGuidedCommitSuccessToPlan();
    } catch (e) {
      setStatusLine(e instanceof Error ? e.message : 'Commit failed');
    } finally {
      setBusy(null);
    }
  }, [commitMessage, loadChanges, refreshTree]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Left: explorer (list scrolls) */}
      <aside className="ide-glass-chrome flex w-56 shrink-0 flex-col overflow-hidden border-r border-border md:w-64">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
          <span className="type-label-sm">Files</span>
          <button
            type="button"
            title="Refresh"
            aria-label="Refresh file tree"
            disabled={overviewLoading}
            onClick={() => void refreshTree()}
            className="btn-secondary-surface btn-icon text-muted-foreground"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', overviewLoading && 'animate-spin')} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {codingBusy ? (
            <p className="px-3 py-2 text-[11px] leading-snug text-amber-100/90">
              Coding still running — product files appear here when this pass finishes. An empty
              explorer does not mean the job stopped.
            </p>
          ) : null}
          {overviewError ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{overviewError}</p>
          ) : null}
          {tree.length === 0 && !overviewLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No files yet.</p>
          ) : (
            tree.map((n) => (
              <TreeNode
                key={n.path}
                node={n}
                depth={0}
                selectedPath={activePath}
                onOpen={onOpenFile}
              />
            ))
          )}
        </div>
      </aside>

      {/* Center: code view — Commit / Deploy live in the shell header */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="type-body-dense min-w-0 flex-1 truncate text-muted-foreground">
            {activePath || 'Select a file'}
            {activeTab?.dirty ? ' · unsaved' : ''}
          </span>

          {statusLine ? (
            <span className="type-micro max-w-[14rem] truncate" role="status">
              {statusLine}
            </span>
          ) : null}
          {hasChanges && !statusLine ? (
            <span className="type-micro shrink-0">{changes.length} change{changes.length === 1 ? '' : 's'}</span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <IdeFileEditor active={activeScreen === 'code'} />
        </div>
        <div
          className={
            terminalCollapsed
              ? 'h-8 shrink-0'
              : 'flex h-[38%] min-h-[10rem] max-h-[18rem] shrink-0 flex-col overflow-hidden'
          }
          data-testid="code-terminal-dock"
        >
          <TerminalPanel
            collapsed={terminalCollapsed}
            onToggleCollapse={() => {
              setTerminalCollapsed((prev) => {
                const next = !prev;
                try {
                  sessionStorage.setItem(TERMINAL_COLLAPSED_KEY, next ? '1' : '0');
                } catch {
                  /* ignore */
                }
                return next;
              });
            }}
          />
        </div>
      </main>

      {/* T3 — Commit modal (does not navigate until Commit succeeds) */}
      {commitOpen ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 p-4">
          <div
            className="ide-glass-card w-full max-w-md rounded-lg border border-border p-5 shadow-none"
            role="dialog"
            aria-modal="true"
            aria-label="Commit changes"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="type-section">Commit</p>
              <button
                type="button"
                title="Refresh changes"
                aria-label="Refresh changes"
                onClick={() => void loadChanges()}
                className="btn-secondary-surface rounded p-1 text-muted-foreground"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', changesLoading && 'animate-spin')} />
              </button>
            </div>

            <div className="mb-3 space-y-2 rounded-lg border border-border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">GitHub</p>
              <p className="text-xs text-foreground">{formatGithubConnectionStatus(sessionUser)}</p>
              {!githubConnected ? (
                <>
                  <button
                    type="button"
                    disabled={!githubOAuthReady}
                    onClick={() => {
                      window.open(
                        '/api/auth/github?remember=1',
                        'nebulla_github_oauth',
                        'width=520,height=720,scrollbars=yes',
                      );
                    }}
                    className="btn-secondary-surface inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs disabled:opacity-40"
                  >
                    <Github className="h-3.5 w-3.5" aria-hidden />
                    Connect GitHub
                  </button>
                  {!githubOAuthReady ? (
                    <p className="text-[11px] text-muted-foreground">
                      GitHub OAuth is not fully configured on this deployment.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            {changesError ? (
              <p className="mb-2 text-[11px] text-muted-foreground">{changesError}</p>
            ) : null}

            <ul className="mb-3 max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-border/60 px-2 py-1">
              {!changesLoading && changes.length === 0 ? (
                <li className="px-0.5 py-1 text-[11px] text-muted-foreground">No files to commit.</li>
              ) : (
                changes.map((e) => (
                  <li key={`${e.status}-${e.path}`}>
                    <button
                      type="button"
                      onClick={() => onOpenFile(e.path)}
                      className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-[#1a1a1a]"
                    >
                      <span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">
                        {statusLetter(e.status)}
                      </span>
                      <span className="min-w-0 truncate text-foreground/90">{e.path}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={3}
              placeholder="Commit message"
              className="ide-glass-input mb-3 w-full resize-none rounded-md px-2.5 py-2 text-xs outline-none"
              aria-label="Commit message"
            />

            {statusLine ? (
              <p className="mb-3 text-[11px] text-muted-foreground" role="status">
                {statusLine}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCommitOpen(false)}
                className="btn-secondary-surface h-9 rounded-md px-3 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                title="Commit"
                aria-label="Commit"
                disabled={busy !== null || !commitMessage.trim() || !hasChanges}
                onClick={() => void onCommit()}
                className="btn-cyan inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs disabled:opacity-40"
              >
                {busy === 'commit' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitCommit className="h-3.5 w-3.5" />
                )}
                Commit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
