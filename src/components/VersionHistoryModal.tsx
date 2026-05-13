import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, X } from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';
import { withProjectQuery, withProjectBody } from '../lib/nebulaProjectApi';

type SnapshotRow = { id: string; createdAt: string; label: string; fileCount: number };

export function VersionHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailJson, setDetailJson] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withProjectQuery('/api/version-history/list'));
      const data = await readResponseJson<{ snapshots?: SnapshotRow[]; error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to list versions');
      }
      setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadList();
    setSelectedId(null);
    setDetailJson(null);
  }, [open, loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailJson(null);
    try {
      const res = await fetch(withProjectQuery(`/api/version-history/read?id=${encodeURIComponent(id)}`));
      const text = await res.text();
      if (!res.ok) {
        let msg = text.slice(0, 200);
        try {
          const j = JSON.parse(text) as { error?: string };
          if (typeof j.error === 'string') msg = j.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(msg);
      }
      try {
        const raw = JSON.parse(text) as { files?: Record<string, string> };
        const slim: Record<string, unknown> = { ...raw };
        if (raw.files && typeof raw.files === 'object') {
          slim.files = Object.fromEntries(
            Object.entries(raw.files).map(([k, v]) => [k, `(${String(v).length} chars)`]),
          );
        }
        setDetailJson(JSON.stringify(slim, null, 2));
      } catch {
        setDetailJson(text.slice(0, 80_000));
      }
    } catch (e) {
      setDetailJson(e instanceof Error ? e.message : 'Read failed');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetailJson(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const saveSnapshot = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(withProjectQuery('/api/version-history/snapshot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withProjectBody({ label: '' })),
      });
      const data = await readResponseJson<{ ok?: boolean; id?: string; error?: string }>(res);
      if (!res.ok || !data.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Snapshot failed');
      }
      await loadList();
      if (typeof data.id === 'string') setSelectedId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot failed');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-cyan-500/25 bg-[#040f1a] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h2 id="version-history-title" className="text-sm font-headline text-cyan-200 flex items-center gap-2">
            <History className="w-4 h-4" />
            Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/25"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="px-4 py-2 text-[11px] text-slate-500 border-b border-white/5">
          Snapshots are stored under{' '}
          <code className="text-cyan-600/90">nebulla-version-history/snapshots/</code> in your cloud workspace (text
          sources only).
        </p>
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">
          <div className="sm:w-2/5 border-b sm:border-b-0 sm:border-r border-white/10 flex flex-col min-h-[140px] max-h-[40vh] sm:max-h-none">
            <div className="p-2 border-b border-white/5 shrink-0">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveSnapshot()}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 py-2 text-xs font-headline text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save snapshot now
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <p className="text-xs text-slate-500 flex items-center gap-2 p-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </p>
              ) : snapshots.length === 0 ? (
                <p className="text-xs text-slate-500 p-2">No snapshots yet. Save one to capture the current workspace.</p>
              ) : (
                <ul className="space-y-1">
                  {snapshots.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={`w-full text-left rounded-lg px-2 py-2 text-[11px] border ${
                          selectedId === s.id
                            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                            : 'border-transparent text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="font-mono text-[10px] text-slate-500 block truncate">{s.id}</span>
                        {s.label ? <span className="text-slate-200">{s.label}</span> : null}
                        <span className="text-slate-500 block text-[10px]">
                          {s.createdAt ? new Date(s.createdAt).toLocaleString() : ''} · {s.fileCount} files
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col p-3 bg-black/20">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-2">Snapshot summary</p>
            <div className="flex-1 min-h-0 rounded-lg border border-white/10 bg-black/40 overflow-auto">
              {detailLoading ? (
                <p className="p-4 text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </p>
              ) : detailJson ? (
                <pre className="p-3 text-[10px] font-mono text-slate-400 whitespace-pre-wrap break-words">{detailJson}</pre>
              ) : (
                <p className="p-4 text-xs text-slate-600">Select a snapshot to inspect file paths (content sizes only).</p>
              )}
            </div>
          </div>
        </div>
        {error ? <p className="px-4 py-2 text-xs text-red-400 border-t border-white/5 shrink-0">{error}</p> : null}
      </div>
    </div>
  );
}
