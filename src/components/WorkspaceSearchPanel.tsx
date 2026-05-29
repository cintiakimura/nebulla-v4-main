import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCode, RefreshCw, Search, X } from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';
import { getBrowserProjectName, withProjectQuery } from '../lib/nebulaProjectApi';
import { IdeCollapsibleSection } from './ide/IdeCollapsibleSection';

type Overview = {
  nebulaFiles: { relativePath: string; size: number; mtimeMs: number }[];
};

export function WorkspaceSearchPanel({ projectKey }: { projectKey: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [include, setInclude] = useState('**/*');
  const [exclude, setExclude] = useState('**/node_modules/**');

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
      setErr(e instanceof Error ? e.message : 'Failed to load file list');
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
    return () => window.removeEventListener('nebula-files-applied', refresh);
  }, [load]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const files = data?.nebulaFiles ?? [];
    const inc = include.trim() || '**/*';
    const exc = exclude.trim();

    const matchGlob = (path: string, pattern: string): boolean => {
      if (pattern === '**/*' || pattern === '*') return true;
      const p = pattern.replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*');
      try {
        return new RegExp(`^${p}$`).test(path);
      } catch {
        return path.includes(pattern.replace(/\*/g, ''));
      }
    };

    let filtered = files.filter((f) => matchGlob(f.relativePath, inc));
    if (exc) {
      filtered = filtered.filter((f) => !matchGlob(f.relativePath, exc));
    }
    if (!q) return filtered.slice(0, 60);
    return filtered.filter((f) => f.relativePath.toLowerCase().includes(q)).slice(0, 120);
  }, [data, query, include, exclude]);

  const openFile = (path: string) => {
    try {
      window.dispatchEvent(new CustomEvent('nebula-center-focus-file', { detail: { path } }));
    } catch {
      /* ignore */
    }
  };

  const projectLabel = getBrowserProjectName().trim() || projectKey;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="tonal-seam-b flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
          <div>
            <h2 className="type-title-sm text-foreground">Search</h2>
            <p className="text-[10px] text-muted-foreground">{projectLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="btn-secondary-surface inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Refresh file index"
          aria-label="Refresh file index"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <IdeCollapsibleSection
          title="Search"
          open={searchOpen}
          onToggle={() => setSearchOpen((v) => !v)}
          count={query.trim() ? hits.length : undefined}
        >
          <div className="space-y-2 px-1 pb-2">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by file path…"
                  className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-7 text-xs text-foreground outline-none ring-ring/30 placeholder:text-muted-foreground focus:ring-2"
                  aria-label="Search workspace files"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Replace</span>
              <input
                type="text"
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                placeholder="Replace (preview only — apply in editor)"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none ring-ring/30 placeholder:text-muted-foreground focus:ring-2"
                aria-label="Replace text"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Files to include
              </span>
              <input
                type="text"
                value={include}
                onChange={(e) => setInclude(e.target.value)}
                placeholder="**/*"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none ring-ring/30 focus:ring-2"
                aria-label="Files to include"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Files to exclude
              </span>
              <input
                type="text"
                value={exclude}
                onChange={(e) => setExclude(e.target.value)}
                placeholder="**/node_modules/**"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none ring-ring/30 focus:ring-2"
                aria-label="Files to exclude"
              />
            </label>
          </div>
        </IdeCollapsibleSection>

        <div className="mt-2 px-1">
          <p className="mb-1 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {query.trim() ? `${hits.length} result(s)` : 'Matching files'}
          </p>
          {err ? <p className="px-1 text-xs text-destructive">{err}</p> : null}
          {!err && hits.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              {query.trim() ? 'No paths match your search.' : 'Enter a search term or browse recent paths.'}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {hits.map((f) => (
              <li key={f.relativePath}>
                <button
                  type="button"
                  onClick={() => openFile(f.relativePath)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs text-foreground/90 hover:bg-secondary/50"
                >
                  <FileCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
                  <span className="break-all">{f.relativePath}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
