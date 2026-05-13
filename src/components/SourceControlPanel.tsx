import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode, FolderGit2, FolderOpen, RefreshCw } from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';
import { withProjectQuery } from '../lib/nebulaProjectApi';

type Overview = {
  nebulaProjectRoot: string;
  nebulaFiles: { relativePath: string; size: number; mtimeMs: number }[];
  git: { branch: string; entries: { status: string; path: string }[]; error?: string } | null;
};

const PREVIEW_MAX_BYTES = 96 * 1024;
type FileMeta = { size: number; mtimeMs: number; status?: string };
type TreeNode = { name: string; path: string; children: TreeNode[]; isFile: boolean };

function statusLabel(status: string): string {
  const s = status.replace(/\s/g, '');
  if (s.includes('?')) return 'Untracked';
  if (s === 'M' || s === 'MM' || status.includes('M')) return 'Modified';
  if (s.includes('A')) return 'Added';
  if (s.includes('D')) return 'Deleted';
  if (s.includes('R')) return 'Renamed';
  return 'Changed';
}

function statusTone(status: string): string {
  const u = statusLabel(status);
  if (u === 'Untracked') return 'text-amber-300/90';
  if (u === 'Added') return 'text-emerald-300/90';
  if (u === 'Deleted') return 'text-red-300/90';
  if (u === 'Modified') return 'text-cyan-300/90';
  return 'text-slate-400';
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [], isFile: false };
  const byPath = new Map<string, TreeNode>();
  byPath.set('', root);

  const sorted = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  for (const fullPath of sorted) {
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
        node = { name: part, path: acc, children: [], isFile };
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

export function SourceControlPanel({
  projectKey = 'default',
  projectName = '',
}: {
  projectKey?: string;
  projectName?: string;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [renderWorkspaceApiReady, setRenderWorkspaceApiReady] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [leftPanePct, setLeftPanePct] = useState(42);
  const splitDragRef = useRef<{ startX: number; startPct: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [overviewRes, cfgRes] = await Promise.all([
        fetch(withProjectQuery('/api/source-control/overview')),
        fetch('/api/config'),
      ]);
      const j = await readResponseJson<Overview & { error?: string }>(overviewRes);
      if (!overviewRes.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${overviewRes.status}`);
      }
      setData(j);
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as { renderWorkspaceApiReady?: boolean };
        setRenderWorkspaceApiReady(Boolean(cfg.renderWorkspaceApiReady));
      } else {
        setRenderWorkspaceApiReady(null);
      }
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
    const onRefresh = () => void load();
    window.addEventListener('nebula-master-plan-updated', onRefresh);
    return () => window.removeEventListener('nebula-master-plan-updated', onRefresh);
  }, [load]);

  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      const d = splitDragRef.current;
      if (!d) return;
      const deltaPx = ev.clientX - d.startX;
      const win = window.innerWidth || 1;
      const deltaPct = (deltaPx / win) * 100;
      const next = Math.min(70, Math.max(25, d.startPct + deltaPct));
      setLeftPanePct(next);
    };
    const onUp = () => {
      if (!splitDragRef.current) return;
      splitDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const openPreview = async (relativePath: string, size: number) => {
    setSelectedPath(relativePath);
    if (size > PREVIEW_MAX_BYTES) {
      setPreview(
        `[Preview skipped: file is ${(size / 1024).toFixed(0)} KB — open locally or raise limit (max ${PREVIEW_MAX_BYTES / 1024} KB in browser).]`,
      );
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch(
        withProjectQuery(`/api/files/content?path=${encodeURIComponent(relativePath)}`),
      );
      const j = await readResponseJson<{ content?: string; error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : 'Read failed');
      }
      setPreview(typeof j.content === 'string' ? j.content : '');
    } catch (e) {
      setPreview(e instanceof Error ? e.message : 'Could not read file');
    } finally {
      setPreviewLoading(false);
    }
  };

  const fmtTime = (ms: number) => {
    try {
      return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '';
    }
  };

  const gitStatusByPath = new Map((data?.git?.entries ?? []).map((e) => [e.path, e.status]));
  const fileMeta = new Map(
    (data?.nebulaFiles ?? []).map((f) => [
      f.relativePath,
      { size: f.size, mtimeMs: f.mtimeMs, status: gitStatusByPath.get(f.relativePath) } as FileMeta,
    ]),
  );
  const filesTree = buildTree((data?.nebulaFiles ?? []).map((f) => f.relativePath));

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderTree = (nodes: TreeNode[], meta: Map<string, FileMeta>, depth = 0) => (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        if (!node.isFile) {
          const expanded = expandedFolders[node.path] ?? depth < 1;
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => toggleFolder(node.path)}
                className="w-full text-left rounded-md px-2 py-1 flex gap-2 items-center hover:bg-white/5 border border-transparent"
              >
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
                )}
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-cyan-300/80" aria-hidden />
                <span className="text-xs text-slate-300 truncate flex-1">{node.name}</span>
              </button>
              {expanded ? <div className="pl-4">{renderTree(node.children, meta, depth + 1)}</div> : null}
            </li>
          );
        }
        const m = meta.get(node.path);
        const status = m?.status;
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => void openPreview(node.path, m?.size ?? 0)}
              className={`w-full text-left rounded-md px-2 py-1 flex gap-2 items-center hover:bg-white/5 ${
                selectedPath === node.path ? 'bg-cyan-500/10 border border-cyan-500/20' : 'border border-transparent'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
              <span className="text-xs text-slate-300 truncate flex-1 font-mono">{node.name}</span>
              {status ? (
                <span className={`text-[10px] font-mono shrink-0 ${statusTone(status)}`} title={statusLabel(status)}>
                  {status}
                </span>
              ) : (
                <span className="text-[10px] text-slate-600 shrink-0 tabular-nums" title={m?.mtimeMs ? fmtTime(m.mtimeMs) : ''}>
                  {typeof m?.size === 'number' ? `${m.size} B` : ''}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col bg-[#040f1a]/40 border border-white/5 rounded-lg overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-cyan-200">
          <FolderGit2 className="w-5 h-5 shrink-0" aria-hidden />
          <div>
            <h2 className="text-sm font-headline tracking-wide">Source control</h2>
            <p className="text-[10px] text-slate-500 font-mono">
              App product: <span className="text-cyan-500/80">{data?.nebulaProjectRoot ?? 'not set'}</span>
              <span className="block text-slate-600 normal-case mt-0.5">
                Code and assets Grok writes (e.g. src/, public/). Nebula planning docs are hidden here.
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-500/35 hover:bg-cyan-500/10 hover:text-cyan-100 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </div>

      {err ? (
        <div className="p-4 text-sm text-red-300/90 border-b border-red-500/20 bg-red-950/20">{err}</div>
      ) : null}

      {projectKey.startsWith('local-') ? (
        <div className="shrink-0 px-4 py-2.5 text-xs text-amber-200/95 border-b border-amber-500/25 bg-amber-950/25 leading-relaxed">
          This project’s ID starts with <code className="text-amber-100/90">local-</code> — the server could not create
          a <strong>Render project</strong> via the API, so files live in an isolated on-disk sandbox instead.
          {renderWorkspaceApiReady === false ? (
            <>
              {' '}
              On Render, set <code className="text-slate-300">RENDER_API_KEY</code> (Account → API Keys) and{' '}
              <code className="text-slate-300">RENDER_OWNER_ID</code> (Workspace Settings → id like{' '}
              <code className="text-slate-400">tea-…</code> or <code className="text-slate-400">usr-…</code>), redeploy,
              then sign up again or add a new project. Alias: <code className="text-slate-300">RENDER_WORKSPACE_ID</code>{' '}
              is accepted instead of <code className="text-slate-300">RENDER_OWNER_ID</code>.
            </>
          ) : renderWorkspaceApiReady === true ? (
            <>
              {' '}
              Check server logs for <code className="text-slate-300">Render project provisioning failed</code> — env is
              set but the Render API rejected the request (see status and body in logs).
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div
          className="min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 overflow-hidden"
          style={{ width: `min(100%, ${leftPanePct}%)` }}
        >
          <div className="flex-1 overflow-y-auto p-3 space-y-6">
            {loading && !data ? (
              <p className="text-xs text-slate-500">Loading repository state…</p>
            ) : null}

            {data ? (
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-2">Project files</h3>
                {data.nebulaFiles.length === 0 ? (
                  <p className="text-xs text-slate-500">No app product files yet — run codegen / Grok to create src/, index.html, etc.</p>
                ) : (
                  renderTree(filesTree, fileMeta)
                )}
              </section>
            ) : null}

            {data?.git ? (
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-2">
                  Git · branch <span className="text-cyan-400/90">{data.git.branch}</span>
                </h3>
                {data.git.error ? (
                  <p className="text-xs text-amber-300/90">{data.git.error}</p>
                ) : data.git.entries.length === 0 ? (
                  <p className="text-xs text-slate-500">Working tree clean — no local changes.</p>
                ) : (
                  <p className="text-xs text-slate-400">Git changes are marked in the workspace tree using status badges.</p>
                )}
              </section>
            ) : (
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-2">Git</h3>
                <p className="text-xs text-slate-500">
                  No <code className="text-cyan-500/80">.git</code> folder in this workspace.
                </p>
              </section>
            )}
          </div>
        </div>
        <div
          className="hidden lg:block w-1 shrink-0 cursor-col-resize bg-white/5 hover:bg-cyan-500/30 transition-colors"
          onMouseDown={(ev) => {
            splitDragRef.current = { startX: ev.clientX, startPct: leftPanePct };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          title="Drag to resize panels"
        />

        <div className="flex-1 min-h-0 flex flex-col bg-[#0a1628]/75">
          <div className="shrink-0 px-3 py-2 border-b border-white/10 text-[10px] text-slate-500 font-mono truncate">
            {selectedPath ? selectedPath : 'Select a file to preview'}
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            {previewLoading ? (
              <p className="text-xs text-slate-500">Reading file…</p>
            ) : preview !== null ? (
              <pre className="text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap font-mono break-words">
                {preview}
              </pre>
            ) : (
              <p className="text-xs text-slate-600">
                Click a file path under Workspace files to load contents from the server (read-only).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
