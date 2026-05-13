import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCode, RefreshCw, Search } from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';
import { withProjectQuery } from '../lib/nebulaProjectApi';

type Overview = {
  nebulaFiles: { relativePath: string; size: number; mtimeMs: number }[];
};

export function WorkspaceSearchPanel({ projectKey }: { projectKey: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const files = data?.nebulaFiles ?? [];
    if (!q) return files.slice(0, 80);
    return files.filter((f) => f.relativePath.toLowerCase().includes(q)).slice(0, 120);
  }, [data, query]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/40">
      <div className="shrink-0 border-b border-border/60 bg-muted/20 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Search</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">Filter workspace paths · {projectKey}</p>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by path…"
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none ring-ring/30 placeholder:text-muted-foreground focus:ring-2"
              aria-label="Search workspace files"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title="Refresh index"
            aria-label="Refresh index"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
        {!err && hits.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {query.trim() ? 'No paths match your search.' : 'Type to filter files.'}
          </p>
        ) : null}
        <ul className="space-y-1">
          {hits.map((f) => (
            <li
              key={f.relativePath}
              className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 font-mono text-xs text-foreground/90 hover:border-border hover:bg-muted/40"
            >
              <FileCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
              <span className="break-all">{f.relativePath}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
