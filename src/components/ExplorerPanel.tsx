import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode, Folder, RefreshCw } from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';
import { getBrowserProjectName, withProjectQuery } from '../lib/nebulaProjectApi';

type Overview = {
  nebulaFiles: { relativePath: string; size: number; mtimeMs: number }[];
};

type TreeNode = { name: string; path: string; children: TreeNode[]; isFile: boolean };

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

function TreeRows({
  nodes,
  depth,
  expanded,
  toggle,
  onOpenFile,
}: {
  nodes: TreeNode[];
  depth: number;
  expanded: Record<string, boolean>;
  toggle: (path: string) => void;
  onOpenFile?: (relativePath: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.path} className="select-none">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-foreground/90 hover:bg-muted/60"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => {
              if (n.isFile) {
                onOpenFile?.(n.path);
                return;
              }
              toggle(n.path);
            }}
          >
            {!n.isFile ? (
              expanded[n.path] ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )
            ) : (
              <span className="inline-block w-3.5 shrink-0" aria-hidden />
            )}
            {n.isFile ? (
              <FileCode className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="truncate font-mono text-xs">{n.name}</span>
          </button>
          {!n.isFile && expanded[n.path] && n.children.length > 0 ? (
            <TreeRows
              nodes={n.children}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              onOpenFile={onOpenFile}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}

export function ExplorerPanel({
  projectKey,
  onOpenFile,
}: {
  projectKey: string;
  /** When set, clicking a file row opens it in the IDE editor (or other host). */
  onOpenFile?: (relativePath: string) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '': true });

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(withProjectQuery('/api/source-control/overview'));
      const j = await readResponseJson<Overview & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${res.status}`);
      }
      setData({ nebulaFiles: j.nebulaFiles || [] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load files');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('nebula-files-applied', refresh);
    window.addEventListener('nebula-workspace-context-synced', refresh);
    return () => {
      window.removeEventListener('nebula-files-applied', refresh);
      window.removeEventListener('nebula-workspace-context-synced', refresh);
    };
  }, [load]);

  const tree = useMemo(() => {
    const paths = (data?.nebulaFiles ?? []).map((f) => f.relativePath);
    return buildTree(paths);
  }, [data]);

  const toggle = (path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/40">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Files</h2>
          <p className="text-[11px] text-muted-foreground">
            Workspace tree · {getBrowserProjectName().trim() || projectKey}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          title="Refresh"
          aria-label="Refresh file tree"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {err ? <p className="px-2 py-4 text-sm text-destructive">{err}</p> : null}
        {!err && !loading && tree.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No files in workspace yet.</p>
        ) : null}
        {tree.length > 0 ? (
          <TreeRows nodes={tree} depth={0} expanded={expanded} toggle={toggle} onOpenFile={onOpenFile} />
        ) : null}
      </div>
    </div>
  );
}
