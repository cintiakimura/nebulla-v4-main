/**
 * Nebula Product — Visual UI Editor (Wix-like). NOT the workspace file `nebula-ui-studio.md`.
 *
 * SPEC (authoritative behavior — read before changing):
 * - Unlocks after first v0: immutable folder `generated-ui/v0-original-<project>-<timestamp>/` with manifest
 *   (or legacy `generated-ui/v0-base/manifest.json`), or `NEBULA_VISUAL_EDITOR_DEV_UNLOCK=true`.
 * - Layout: LEFT pages | CENTER interactive preview from structured model | RIGHT properties when selection exists.
 * - Grok chat stays in the main Assistant sidebar — no chat column here.
 * - Safe files: original v0 copy is never modified. On "Save Changes & Update Code", server backs up only paths
 *   Grok will touch under `generated-ui/versions/<timestamp>/`, then writes `src/` (etc.). Preview model lives in
 *   `generated-ui/visual-editor/preview-model.json`.
 * - "Undo last code apply" restores from the last per-file version folder. "Restore Original v0 Generation" copies
 *   from the immutable v0-original folder back into `src/` (etc.).
 * - Selection: blue ring + floating quick-actions; properties panel; inline text (double-click); colors/spacing/typography controls;
 *   apply-to-similar; session undo (move up/down for reorder).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeft,
  RotateCcw,
  Save,
  Type,
} from 'lucide-react';
import { getStoredGrokApiKey } from '../../lib/grokKey';
import { getBrowserProjectName, withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

export type VisualStyle = {
  backgroundColor: string;
  color: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  width: string;
  height: string;
  borderRadius: number;
  boxShadow: string;
  opacity: number;
};

export type VisualNode = {
  id: string;
  /** Used for "apply to similar" matching on the page / across pages. */
  role: string;
  type: 'container' | 'text' | 'button' | 'box';
  children?: string[];
  text?: string;
  style: VisualStyle;
};

export type PageModel = {
  rootId: string;
  nodes: Record<string, VisualNode>;
};

export type EditorModel = {
  pages: Record<string, PageModel>;
};

const defaultStyle = (): VisualStyle => ({
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
  paddingTop: 16,
  paddingRight: 16,
  paddingBottom: 16,
  paddingLeft: 16,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  width: '100%',
  height: 'auto',
  borderRadius: 8,
  boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
  opacity: 1,
});

function buildDefaultModel(): EditorModel {
  const root = 'root-home';
  const hero = 'hero-1';
  const side = 'sidebar-1';
  const btn = 'btn-1';
  return {
    pages: {
      Home: {
        rootId: root,
        nodes: {
          [root]: {
            id: root,
            role: 'page-root',
            type: 'container',
            children: [side, hero],
            style: { ...defaultStyle(), backgroundColor: '#020617', paddingTop: 0, paddingLeft: 0, paddingRight: 0, paddingBottom: 0 },
          },
          [side]: {
            id: side,
            role: 'nav-sidebar',
            type: 'container',
            children: [],
            style: {
              ...defaultStyle(),
              width: '220px',
              height: '100%',
              backgroundColor: '#0c1222',
              borderRadius: 0,
            },
          },
          [hero]: {
            id: hero,
            role: 'hero',
            type: 'container',
            children: [btn],
            style: { ...defaultStyle(), backgroundColor: '#082f49', width: '100%', height: '240px' },
          },
          [btn]: {
            id: btn,
            role: 'cta-primary',
            type: 'button',
            text: 'Get started',
            style: {
              ...defaultStyle(),
              backgroundColor: '#06b6d4',
              color: '#020617',
              width: 'auto',
              height: 'auto',
            },
          },
        },
      },
      Dashboard: {
        rootId: 'root-dash',
        nodes: {
          'root-dash': {
            id: 'root-dash',
            role: 'page-root',
            type: 'container',
            children: [],
            style: { ...defaultStyle(), backgroundColor: '#020617' },
          },
        },
      },
      Settings: {
        rootId: 'root-set',
        nodes: {
          'root-set': {
            id: 'root-set',
            role: 'page-root',
            type: 'container',
            children: [],
            style: { ...defaultStyle(), backgroundColor: '#020617' },
          },
        },
      },
    },
  };
}

function cloneModel(m: EditorModel): EditorModel {
  return JSON.parse(JSON.stringify(m)) as EditorModel;
}

export function IdeVisualEditor({
  onLock: _onLock,
  projectDisplayName,
}: {
  onLock?: () => void;
  projectDisplayName?: string;
}) {
  const projectLabel = projectDisplayName?.trim() || getBrowserProjectName() || 'project';

  const [eligible, setEligible] = useState<boolean | null>(null);
  const [eligibilityReason, setEligibilityReason] = useState<string | undefined>();
  const [activePage, setActivePage] = useState('Home');
  const [model, setModel] = useState<EditorModel>(() => buildDefaultModel());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [undoStack, setUndoStack] = useState<EditorModel[]>([]);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [restoreOriginalConfirmOpen, setRestoreOriginalConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const pageIds = useMemo(() => Object.keys(model.pages), [model.pages]);
  const page = model.pages[activePage];
  const selected = selectedId && page ? page.nodes[selectedId] : null;

  const persistHeaders = (): Record<string, string> => {
    const k = getStoredGrokApiKey();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (k) h['x-grok-api-key'] = k;
    return h;
  };

  const pushUndo = useCallback(() => {
    setUndoStack((s) => [...s.slice(-49), cloneModel(model)]);
  }, [model]);

  const loadEligibility = useCallback(async () => {
    try {
      const r = await fetch(withProjectQuery('/api/visual-ui-editor/eligibility'));
      const d = (await r.json()) as { eligible?: boolean; reason?: string };
      setEligible(Boolean(d.eligible));
      setEligibilityReason(typeof d.reason === 'string' ? d.reason : undefined);
    } catch {
      setEligible(false);
      setEligibilityReason('Failed to read eligibility.');
    }
  }, []);

  useEffect(() => {
    void loadEligibility();
  }, [loadEligibility]);

  useEffect(() => {
    if (!eligible) return;
    void (async () => {
      try {
        const r = await fetch(withProjectQuery('/api/visual-ui-editor/preview-model'));
        if (!r.ok) return;
        const d = (await r.json()) as { model?: EditorModel | null };
        if (d.model && typeof d.model === 'object' && d.model.pages) setModel(d.model);
      } catch {
        /* keep default */
      }
    })();
  }, [eligible]);

  const updateSelectedStyle = (patch: Partial<VisualStyle>) => {
    if (!selectedId || !page) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const n = next.pages[activePage].nodes[selectedId];
      if (!n) return m;
      n.style = { ...n.style, ...patch };
      return next;
    });
  };

  const updateSelectedText = (text: string) => {
    if (!selectedId || !page) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const n = next.pages[activePage].nodes[selectedId];
      if (!n) return m;
      n.text = text;
      return next;
    });
  };

  const updateNodeText = (nodeId: string, text: string) => {
    if (!page?.nodes[nodeId]) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const n = next.pages[activePage].nodes[nodeId];
      if (!n) return m;
      n.text = text;
      return next;
    });
  };

  const applySimilarOnPage = () => {
    if (!selected) return;
    pushUndo();
    const r = selected.role;
    const sStyle = { ...selected.style };
    setModel((m) => {
      const next = cloneModel(m);
      const pg = next.pages[activePage];
      for (const node of Object.values(pg.nodes)) {
        if (node.id === selected.id) continue;
        if (node.role === r) node.style = { ...node.style, ...sStyle };
      }
      return next;
    });
  };

  const applySimilarAllPages = () => {
    if (!selected) return;
    pushUndo();
    const r = selected.role;
    const sStyle = { ...selected.style };
    setModel((m) => {
      const next = cloneModel(m);
      for (const pid of Object.keys(next.pages)) {
        const pg = next.pages[pid];
        for (const node of Object.values(pg.nodes)) {
          if (node.id === selected.id) continue;
          if (node.role === r) node.style = { ...node.style, ...sStyle };
        }
      }
      return next;
    });
  };

  const sessionUndo = () => {
    setUndoStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setModel(prev);
      return s.slice(0, -1);
    });
  };

  const moveSelectedInParent = (dir: -1 | 1) => {
    if (!selectedId || !page) return;
    const parent = Object.values(page.nodes).find((n) => n.children?.includes(selectedId));
    if (!parent || !parent.children) return;
    const idx = parent.children.indexOf(selectedId);
    const j = idx + dir;
    if (j < 0 || j >= parent.children.length) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const p = next.pages[activePage].nodes[parent.id];
      if (!p?.children) return m;
      const ch = [...p.children];
      [ch[idx], ch[j]] = [ch[j], ch[idx]];
      p.children = ch;
      return next;
    });
  };

  const onPreviewClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    const pr = previewRef.current?.getBoundingClientRect();
    if (pr) {
      setMenuPos({ top: e.clientY - pr.top + 8, left: e.clientX - pr.left + 8 });
    }
  };

  const clearSelection = () => {
    setSelectedId(null);
    setMenuPos(null);
  };

  const toggleFullscreen = async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
  };

  const persistModelRemote = async () => {
    await fetch(withProjectQuery('/api/visual-ui-editor/preview-model'), {
      method: 'PUT',
      headers: persistHeaders(),
      body: JSON.stringify(withProjectBody({ model })),
    });
  };

  const runApplyToCode = async () => {
    setBusy(true);
    setError('');
    try {
      await persistModelRemote();
      const res = await fetch(withProjectQuery('/api/visual-ui-editor/apply-visual-changes'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            pageId: activePage,
            previewModel: model,
            grokApiKey: getStoredGrokApiKey(),
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Apply failed');
      setError('');
      await loadEligibility();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setBusy(false);
      setApplyConfirmOpen(false);
    }
  };

  const runRevert = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(withProjectQuery('/api/visual-ui-editor/revert-last-coded'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(withProjectBody({})),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Revert failed');
      setRevertConfirmOpen(false);
      setError('');
      try {
        const r = await fetch(withProjectQuery('/api/visual-ui-editor/preview-model'));
        if (r.ok) {
          const d = (await r.json()) as { model?: EditorModel | null };
          if (d.model && typeof d.model === 'object' && d.model.pages) setModel(d.model);
        }
      } catch {
        /* keep local model */
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Revert failed');
    } finally {
      setBusy(false);
    }
  };

  const runRestoreOriginal = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(withProjectQuery('/api/visual-ui-editor/restore-original-v0'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(withProjectBody({})),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Restore failed');
      setRestoreOriginalConfirmOpen(false);
      setError('');
      try {
        const r = await fetch(withProjectQuery('/api/visual-ui-editor/preview-model'));
        if (r.ok) {
          const d = (await r.json()) as { model?: EditorModel | null };
          if (d.model && typeof d.model === 'object' && d.model.pages) setModel(d.model);
        }
      } catch {
        /* keep local model */
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const simulateV0CompleteDev = async () => {
    if (!import.meta.env.DEV) return;
    setBusy(true);
    try {
      await fetch(withProjectQuery('/api/visual-ui-editor/v0-first-generation-complete'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            projectDisplayName: projectLabel,
            files: { 'README.txt': 'v0 base placeholder from dev unlock\n' },
            source: 'ide-dev-simulate',
          }),
        ),
      });
      await loadEligibility();
    } finally {
      setBusy(false);
    }
  };

  const renderNode = (id: string): React.ReactNode => {
    if (!page) return null;
    const node = page.nodes[id];
    if (!node) return null;
    const st = node.style;
    const css: React.CSSProperties = {
      backgroundColor: st.backgroundColor,
      color: st.color,
      padding: `${st.paddingTop}px ${st.paddingRight}px ${st.paddingBottom}px ${st.paddingLeft}px`,
      margin: `${st.marginTop}px ${st.marginRight}px ${st.marginBottom}px ${st.marginLeft}px`,
      width: st.width as React.CSSProperties['width'],
      height: st.height as React.CSSProperties['height'],
      borderRadius: st.borderRadius,
      boxShadow: st.boxShadow,
      opacity: st.opacity,
      cursor: node.type === 'container' ? 'default' : 'pointer',
      position: 'relative',
      outline: selectedId === id ? '2px solid #2563eb' : undefined,
      outlineOffset: 2,
    };

    const inner =
      node.type === 'text' ? (
        <span
          className="min-h-[1.25em] inline-block"
          onDoubleClick={(e) => {
            e.stopPropagation();
            const nv = window.prompt('Edit text', node.text || '');
            if (nv !== null) updateNodeText(id, nv);
          }}
        >
          {node.text || 'Text'}
        </span>
      ) : node.type === 'button' ? (
        <button
          type="button"
          className="font-medium"
          style={{ backgroundColor: 'transparent', color: 'inherit', border: 'none' }}
          onClick={(e) => {
            e.stopPropagation();
            onPreviewClick(e, id);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const nv = window.prompt('Edit button label', node.text || '');
            if (nv !== null) updateNodeText(id, nv);
          }}
        >
          {node.text || 'Button'}
        </button>
      ) : null;

    const isRoot = node.id === page.rootId;
    const kids = node.children?.length ? (
      <div
        className={
          isRoot
            ? 'flex min-h-[200px] w-full flex-1 flex-row items-stretch gap-0'
            : 'flex w-full flex-col gap-2'
        }
      >
        {node.children.map((cid, i) => (
          <div
            key={cid}
            className={
              isRoot ? (i === 0 ? 'shrink-0 self-stretch' : 'min-w-0 flex-1 self-stretch') : ''
            }
          >
            {renderNode(cid)}
          </div>
        ))}
      </div>
    ) : null;

    return (
      <div
        key={id}
        role="presentation"
        style={css}
        onClick={(e) => onPreviewClick(e, id)}
        className={`border border-white/5 ${isRoot && node.type === 'container' ? 'flex min-h-[280px] w-full flex-col' : ''}`}
      >
        {inner}
        {kids}
      </div>
    );
  };

  if (eligible === null) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050a14] text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#050a14] px-8 text-center text-slate-300">
        <PanelLeft className="h-10 w-10 text-cyan-500/50" />
        <h2 className="font-headline text-lg text-cyan-100">Visual UI Editor is locked</h2>
        <p className="max-w-lg text-sm text-slate-400">{eligibilityReason}</p>
        <p className="max-w-lg text-xs text-slate-500">
          The v0 pipeline must finish once and store the full output under{' '}
          <code className="text-cyan-300">generated-ui/v0-original-&lt;project&gt;-&lt;timestamp&gt;/</code> (immutable). A pointer
          manifest may also exist at <code className="text-cyan-300">generated-ui/v0-base/manifest.json</code>. Each code apply backs
          up only the files Grok touches under <code className="text-cyan-300">generated-ui/versions/&lt;timestamp&gt;/</code> before
          writing to <code className="text-cyan-300">src/</code> (and other allowed app paths).
        </p>
        {import.meta.env.DEV ? (
          <button
            type="button"
            onClick={() => void simulateV0CompleteDev()}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-100"
          >
            Dev only: simulate v0 manifest
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#050a14] text-slate-200 shadow-[inset_0_1px_0_rgba(34,211,238,0.06)]"
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-cyan-500/25 bg-[#040d18] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-headline text-xs tracking-wide text-cyan-100">Visual UI Editor</span>
          <span className="text-[10px] text-slate-500">Wix-style · Cosmic Night</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-300"
          >
            {isFullscreen ? <Minimize2 className="inline h-3 w-3" /> : <Maximize2 className="inline h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => void sessionUndo()}
            className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-300"
            title="Revert last batch of visual edits (session)"
          >
            <RotateCcw className="mr-1 inline h-3 w-3" />
            Undo visual
          </button>
          <button
            type="button"
            onClick={() => setRestoreOriginalConfirmOpen(true)}
            className="rounded border border-cyan-500/35 px-2 py-1 text-[10px] text-cyan-100"
            title="Copy immutable v0 output back into src/ (and allowed paths)"
          >
            <History className="mr-1 inline h-3 w-3" />
            Restore Original v0
          </button>
          <button
            type="button"
            onClick={() => setRevertConfirmOpen(true)}
            className="rounded border border-rose-500/30 px-2 py-1 text-[10px] text-rose-200"
            title="Restore files from the last apply’s per-file backup only"
          >
            Undo last apply
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-44 shrink-0 flex-col border-r border-cyan-500/20 bg-[#040d18]">
          <div className="border-b border-white/10 px-2 py-2 text-[10px] font-headline uppercase tracking-wider text-cyan-400/90">
            Pages
          </div>
          <nav className="flex-1 overflow-y-auto p-1">
            {pageIds.map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => {
                  setActivePage(pid);
                  clearSelection();
                }}
                className={`mb-0.5 w-full rounded-md px-2 py-2 text-left text-xs ${
                  activePage === pid ? 'bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-500/40' : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                {pid}
              </button>
            ))}
          </nav>
        </aside>

        <main
          ref={previewRef}
          className="relative min-w-0 flex-1 overflow-auto bg-[#020617] p-4"
          onClick={() => clearSelection()}
        >
          <div className="mx-auto max-w-5xl rounded-xl border border-cyan-500/20 bg-[#0a1628] p-4 shadow-[0_0_48px_rgba(34,211,238,0.12)]">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-cyan-500/80">Live preview (structured model)</div>
            {page ? renderNode(page.rootId) : null}
          </div>
          {selectedId && menuPos ? (
            <div
              className="pointer-events-auto absolute z-20 flex min-w-[160px] flex-col overflow-hidden rounded-lg border border-cyan-500/40 bg-[#0c1a2e] py-1 text-[11px] shadow-xl"
              style={{ top: menuPos.top, left: menuPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="px-2 py-1 text-[10px] text-slate-500">Quick actions</span>
              <button type="button" className="px-3 py-1.5 text-left hover:bg-white/10" onClick={() => moveSelectedInParent(-1)}>
                <ArrowUp className="mr-1 inline h-3 w-3" /> Move up
              </button>
              <button type="button" className="px-3 py-1.5 text-left hover:bg-white/10" onClick={() => moveSelectedInParent(1)}>
                <ArrowDown className="mr-1 inline h-3 w-3" /> Move down
              </button>
              <button type="button" className="px-3 py-1.5 text-left hover:bg-white/10" onClick={() => applySimilarOnPage()}>
                <Copy className="mr-1 inline h-3 w-3" /> Match style (this page)
              </button>
              <button type="button" className="px-3 py-1.5 text-left hover:bg-white/10" onClick={() => applySimilarAllPages()}>
                <Copy className="mr-1 inline h-3 w-3" /> Match style (all pages)
              </button>
              <button type="button" className="px-3 py-1.5 text-left hover:bg-white/10 text-amber-100/90" onClick={() => setSelectedId(null)}>
                Close menu
              </button>
            </div>
          ) : null}
        </main>

        <aside className="flex w-80 shrink-0 flex-col border-l border-cyan-500/20 bg-[#040d18]">
          <div className="border-b border-white/10 px-2 py-2 text-[10px] font-headline uppercase tracking-wider text-cyan-400/90">
            Properties
          </div>
          {!selected ? (
            <p className="p-3 text-xs text-slate-500">Select an element in the preview. Selected elements show a blue outline.</p>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto p-3 text-[11px]">
              <div className="text-slate-400">
                <span className="text-cyan-300">role</span> {selected.role} · <span className="text-cyan-300">type</span> {selected.type}
              </div>
              <label className="block text-slate-500">
                Background
                <input
                  type="color"
                  className="mt-1 h-8 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                  value={selected.style.backgroundColor}
                  onChange={(e) => updateSelectedStyle({ backgroundColor: e.target.value })}
                />
              </label>
              <label className="block text-slate-500">
                Text color
                <input
                  type="color"
                  className="mt-1 h-8 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                  value={selected.style.color}
                  onChange={(e) => updateSelectedStyle({ color: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const).map((k) => (
                  <label key={k} className="text-slate-500">
                    {k}
                    <input
                      type="number"
                      className="mt-0.5 w-full rounded border border-white/10 bg-[#0a1628] px-1 py-1 text-slate-200"
                      value={selected.style[k]}
                      onChange={(e) => updateSelectedStyle({ [k]: Number(e.target.value) || 0 } as Partial<VisualStyle>)}
                    />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const).map((k) => (
                  <label key={k} className="text-slate-500">
                    {k}
                    <input
                      type="number"
                      className="mt-0.5 w-full rounded border border-white/10 bg-[#0a1628] px-1 py-1 text-slate-200"
                      value={selected.style[k]}
                      onChange={(e) => updateSelectedStyle({ [k]: Number(e.target.value) || 0 } as Partial<VisualStyle>)}
                    />
                  </label>
                ))}
              </div>
              <label className="block text-slate-500">
                Width
                <input
                  className="mt-1 w-full rounded border border-white/10 bg-[#0a1628] px-2 py-1 text-slate-200"
                  value={selected.style.width}
                  onChange={(e) => updateSelectedStyle({ width: e.target.value })}
                />
              </label>
              <label className="block text-slate-500">
                Height
                <input
                  className="mt-1 w-full rounded border border-white/10 bg-[#0a1628] px-2 py-1 text-slate-200"
                  value={selected.style.height}
                  onChange={(e) => updateSelectedStyle({ height: e.target.value })}
                />
              </label>
              <label className="block text-slate-500">
                Border radius
                <input
                  type="number"
                  className="mt-1 w-full rounded border border-white/10 bg-[#0a1628] px-2 py-1"
                  value={selected.style.borderRadius}
                  onChange={(e) => updateSelectedStyle({ borderRadius: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="block text-slate-500">
                Box shadow (CSS)
                <input
                  className="mt-1 w-full rounded border border-white/10 bg-[#0a1628] px-2 py-1"
                  value={selected.style.boxShadow}
                  onChange={(e) => updateSelectedStyle({ boxShadow: e.target.value })}
                />
              </label>
              <label className="block text-slate-500">
                Opacity (0–1)
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className="mt-1 w-full rounded border border-white/10 bg-[#0a1628] px-2 py-1"
                  value={selected.style.opacity}
                  onChange={(e) => updateSelectedStyle({ opacity: Math.min(1, Math.max(0, Number(e.target.value))) })}
                />
              </label>
              {(selected.type === 'text' || selected.type === 'button') && (
                <label className="block text-slate-500">
                  <Type className="mb-1 inline h-3 w-3" /> Label / text
                  <input
                    className="mt-1 w-full rounded border border-white/10 bg-[#0a1628] px-2 py-1"
                    value={selected.text || ''}
                    onChange={(e) => updateSelectedText(e.target.value)}
                  />
                </label>
              )}
              <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                <button
                  type="button"
                  className="rounded border border-cyan-500/30 bg-cyan-500/10 py-2 text-xs text-cyan-100"
                  onClick={() => applySimilarOnPage()}
                >
                  Apply style to all similar on this page
                </button>
                <button
                  type="button"
                  className="rounded border border-violet-500/30 bg-violet-500/10 py-2 text-xs text-violet-100"
                  onClick={() => applySimilarAllPages()}
                >
                  Apply style to all pages
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-cyan-500/25 bg-[#040d18] px-4 py-3">
        <p className="text-[10px] text-slate-500">
          Use the main <strong className="text-slate-400">Assistant</strong> for Grok chat. Most edits here are visual to save tokens.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => setApplyConfirmOpen(true)}
          className="rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-headline text-black shadow-[0_0_20px_rgba(34,211,238,0.35)] hover:bg-cyan-400 disabled:opacity-40"
        >
          <Save className="mr-2 inline h-4 w-4" />
          Save Changes &amp; Update Code
        </button>
      </footer>

      {applyConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-cyan-500/30 bg-[#071422] p-6 shadow-2xl">
            <div className="mb-3 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h3 className="font-headline text-sm text-cyan-50">Apply changes to code?</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Are you sure you want to apply/code these changes? The server will copy the current contents of every file Grok is
                  about to change into <code className="text-cyan-300/90">generated-ui/versions/&lt;timestamp&gt;/</code>, then write
                  updates under <code className="text-cyan-300/90">src/</code> (and other allowed paths). Your immutable v0 folder is
                  never modified. Grok 4.1 produces the file contents.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/15 px-4 py-2 text-xs text-slate-300"
                onClick={() => setApplyConfirmOpen(false)}
              >
                Continue editing
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runApplyToCode()}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-headline text-black disabled:opacity-40"
              >
                {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <Check className="inline h-4 w-4" />} Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revertConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-rose-500/30 bg-[#071422] p-6 shadow-2xl">
            <h3 className="font-headline text-sm text-rose-100">Undo last code apply?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Restores only the files that were backed up in <code className="text-cyan-300/90">generated-ui/versions/&lt;timestamp&gt;/</code>{' '}
              during your last confirmed apply. This does not reset the whole project.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/15 px-4 py-2 text-xs text-slate-300"
                onClick={() => setRevertConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runRevert()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-headline text-white disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreOriginalConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-cyan-500/30 bg-[#071422] p-6 shadow-2xl">
            <div className="mb-3 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h3 className="font-headline text-sm text-cyan-50">Restore original v0 generation?</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  This replaces current UI files under <code className="text-cyan-300/90">src/</code>, <code className="text-cyan-300/90">app/</code>,{' '}
                  <code className="text-cyan-300/90">pages/</code>, <code className="text-cyan-300/90">components/</code>, and{' '}
                  <code className="text-cyan-300/90">public/</code> with the immutable copy from{' '}
                  <code className="text-cyan-300/90">generated-ui/v0-original-…</code>. Your visual editor session model is unchanged until
                  you reload preview from disk.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/15 px-4 py-2 text-xs text-slate-300"
                onClick={() => setRestoreOriginalConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runRestoreOriginal()}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-headline text-white disabled:opacity-40"
              >
                {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <History className="inline h-4 w-4" />} Confirm restore
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
