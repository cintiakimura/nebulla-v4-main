/**
 * Nebula Product — Visual UI Editor (Wix-like). NOT the workspace file `nebula-ui-studio.md`.
 *
 * SPEC (authoritative behavior — read before changing):
 * - Unlocks after first v0: immutable folder `generated-ui/v0-original-<project>-<timestamp>/` with manifest
 *   (or legacy `generated-ui/v0-base/manifest.json`), or `NEBULA_VISUAL_EDITOR_DEV_UNLOCK=true`.
 * - When ineligible, the studio still renders as a **high-fidelity mock** (local preview model + tools); disk apply is gated.
 * - Layout: LEFT pages + layers | CENTER interactive preview | RIGHT properties; top toolbar always visible.
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
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  MousePointer2,
  Move,
  PanelLeft,
  Pipette,
  RotateCcw,
  Save,
  Scaling,
  Trash2,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBrowserProjectName, withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

const V0_FETCH_TIMEOUT_MS = 180_000;

async function fetchWithTimeout(url: string, init: RequestInit, ms = V0_FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

type StudioStatus = {
  v0PromptExists?: boolean;
  v0PromptPath?: string;
  v0PromptLength?: number;
  hasRealV0?: boolean;
  hasV0ApiKey?: boolean;
  eligibilityReason?: string;
};

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

export type StudioTool = 'select' | 'move' | 'resize' | 'text' | 'color';

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
  const side = 'sidebar-1';
  const hero = 'hero-1';
  const title = 'hero-title';
  const sub = 'hero-sub';
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
            style: {
              ...defaultStyle(),
              backgroundColor: '#080A14',
              paddingTop: 0,
              paddingLeft: 0,
              paddingRight: 0,
              paddingBottom: 0,
            },
          },
          [side]: {
            id: side,
            role: 'nav-sidebar',
            type: 'container',
            children: [],
            style: {
              ...defaultStyle(),
              width: '200px',
              height: '100%',
              backgroundColor: '#0D1117',
              borderRadius: 0,
              paddingTop: 20,
              boxShadow: 'inset -1px 0 0 #21262D',
            },
          },
          [hero]: {
            id: hero,
            role: 'hero',
            type: 'container',
            children: [title, sub, btn],
            style: {
              ...defaultStyle(),
              backgroundColor: '#0D1117',
              width: '100%',
              height: '320px',
              paddingTop: 28,
              paddingLeft: 28,
              paddingRight: 28,
              paddingBottom: 24,
            },
          },
          [title]: {
            id: title,
            role: 'hero-title',
            type: 'text',
            text: 'Nebulla Workspace',
            style: {
              ...defaultStyle(),
              backgroundColor: 'transparent',
              color: '#E8EAED',
              paddingTop: 0,
              paddingBottom: 8,
              width: '100%',
              height: 'auto',
              borderRadius: 0,
              boxShadow: 'none',
            },
          },
          [sub]: {
            id: sub,
            role: 'hero-sub',
            type: 'text',
            text: 'Live preview · Cosmic Night (#080A14 / #00D4D4) — inspired by 0vgenerated-v2 shell',
            style: {
              ...defaultStyle(),
              backgroundColor: 'transparent',
              color: '#6E7681',
              paddingTop: 0,
              paddingBottom: 20,
              width: '100%',
              height: 'auto',
              borderRadius: 0,
              boxShadow: 'none',
            },
          },
          [btn]: {
            id: btn,
            role: 'cta-primary',
            type: 'button',
            text: 'Open Explorer',
            style: {
              ...defaultStyle(),
              backgroundColor: '#00D4D4',
              color: '#080A14',
              width: 'auto',
              height: 'auto',
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 20,
              paddingRight: 20,
              borderRadius: 8,
              boxShadow: '0 0 24px rgba(0,212,212,0.25)',
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
            children: ['dash-head', 'dash-grid'],
            style: { ...defaultStyle(), backgroundColor: '#080A14', paddingTop: 20, paddingLeft: 20, paddingRight: 20 },
          },
          'dash-head': {
            id: 'dash-head',
            role: 'section-title',
            type: 'text',
            text: 'Dashboard',
            style: {
              ...defaultStyle(),
              backgroundColor: 'transparent',
              color: '#E8EAED',
              paddingBottom: 16,
              borderRadius: 0,
              boxShadow: 'none',
            },
          },
          'dash-grid': {
            id: 'dash-grid',
            role: 'metrics-row',
            type: 'container',
            children: ['m1', 'm2', 'm3'],
            style: {
              ...defaultStyle(),
              backgroundColor: 'transparent',
              paddingTop: 0,
              borderRadius: 0,
              boxShadow: 'none',
            },
          },
          m1: {
            id: 'm1',
            role: 'metric-card',
            type: 'box',
            style: { ...defaultStyle(), backgroundColor: '#0D1117', width: '32%', height: '100px', borderRadius: 10 },
          },
          m2: {
            id: 'm2',
            role: 'metric-card',
            type: 'box',
            style: { ...defaultStyle(), backgroundColor: '#0D1117', width: '32%', height: '100px', borderRadius: 10 },
          },
          m3: {
            id: 'm3',
            role: 'metric-card',
            type: 'box',
            style: { ...defaultStyle(), backgroundColor: '#0D1117', width: '32%', height: '100px', borderRadius: 10 },
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
            children: ['set-title', 'set-row-a', 'set-row-b'],
            style: { ...defaultStyle(), backgroundColor: '#080A14', paddingTop: 20, paddingLeft: 20, paddingRight: 20 },
          },
          'set-title': {
            id: 'set-title',
            role: 'section-title',
            type: 'text',
            text: 'Settings',
            style: {
              ...defaultStyle(),
              backgroundColor: 'transparent',
              color: '#E8EAED',
              paddingBottom: 16,
              borderRadius: 0,
              boxShadow: 'none',
            },
          },
          'set-row-a': {
            id: 'set-row-a',
            role: 'settings-row',
            type: 'text',
            text: 'API keys · Grok & v0',
            style: {
              ...defaultStyle(),
              backgroundColor: '#0D1117',
              color: '#B8BCC2',
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: 16,
              marginBottom: 8,
              borderRadius: 8,
            },
          },
          'set-row-b': {
            id: 'set-row-b',
            role: 'settings-row',
            type: 'text',
            text: 'Theme · Cosmic Night (default)',
            style: {
              ...defaultStyle(),
              backgroundColor: '#0D1117',
              color: '#B8BCC2',
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: 16,
              borderRadius: 8,
            },
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
  const baselineRef = useRef<EditorModel | null>(null);
  const [studioTool, setStudioTool] = useState<StudioTool>('select');
  const [leftTab, setLeftTab] = useState<'pages' | 'layers'>('pages');
  const [mockNotice, setMockNotice] = useState('');
  const [hasV0ApiKey, setHasV0ApiKey] = useState<boolean | null>(null);
  const [studioStatus, setStudioStatus] = useState<StudioStatus | null>(null);
  const v0RunningRef = useRef(false);
  const autoV0StartedRef = useRef(false);
  const runV0GenerationRef = useRef<() => Promise<void>>(async () => {});
  const v0StorageKey = `nebulla-v0-chat-${projectLabel.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
  const [v0ChatId, setV0ChatId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(v0StorageKey);
    } catch {
      return null;
    }
  });

  const pageIds = useMemo(() => Object.keys(model.pages), [model.pages]);
  const page = model.pages[activePage];
  const selected = selectedId && page ? page.nodes[selectedId] : null;

  const persistHeaders = (): Record<string, string> => {
    return { 'Content-Type': 'application/json' };
  };

  const pushUndo = useCallback(() => {
    setUndoStack((s) => [...s.slice(-49), cloneModel(model)]);
  }, [model]);

  const loadStudioStatus = useCallback(async () => {
    try {
      const r = await fetch(withProjectQuery('/api/nebula-ui-studio/status'));
      const d = (await r.json()) as StudioStatus & { error?: string };
      if (r.ok) setStudioStatus(d);
    } catch {
      /* ignore */
    }
  }, []);

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
    await loadStudioStatus();
  }, [loadStudioStatus]);

  useEffect(() => {
    void loadEligibility();
  }, [loadEligibility]);

  useEffect(() => {
    const onArtifacts = () => void loadEligibility();
    const onV0Complete = () => void loadEligibility();
    window.addEventListener('nebula-files-applied', onArtifacts);
    window.addEventListener('nebula-mind-map-updated', onArtifacts);
    window.addEventListener('nebula-ui-studio-v0-complete', onV0Complete);
    return () => {
      window.removeEventListener('nebula-files-applied', onArtifacts);
      window.removeEventListener('nebula-mind-map-updated', onArtifacts);
      window.removeEventListener('nebula-ui-studio-v0-complete', onV0Complete);
    };
  }, [loadEligibility]);

  useEffect(() => {
    const onRunV0 = () => void runV0GenerationRef.current();
    window.addEventListener('nebula-ui-studio-run-v0', onRunV0);
    return () => window.removeEventListener('nebula-ui-studio-run-v0', onRunV0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/config');
        const cfg = (await r.json()) as { hasV0ApiKey?: boolean };
        if (!cancelled) setHasV0ApiKey(Boolean(cfg.hasV0ApiKey));
      } catch {
        if (!cancelled) setHasV0ApiKey(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (eligible === null) return;
    if (!eligible) {
      baselineRef.current = cloneModel(model);
      return;
    }
    void (async () => {
      try {
        const r = await fetch(withProjectQuery('/api/visual-ui-editor/preview-model'));
        if (!r.ok) {
          baselineRef.current = cloneModel(model);
          return;
        }
        const d = (await r.json()) as { model?: EditorModel | null };
        if (d.model && typeof d.model === 'object' && d.model.pages) {
          setModel(d.model);
          baselineRef.current = cloneModel(d.model);
        } else {
          baselineRef.current = cloneModel(model);
        }
      } catch {
        baselineRef.current = cloneModel(model);
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

  const collectSubtreeIds = (pg: PageModel, rootId: string, acc: Set<string>) => {
    acc.add(rootId);
    const n = pg.nodes[rootId];
    if (!n?.children) return;
    for (const c of n.children) collectSubtreeIds(pg, c, acc);
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

  const deleteSelectedNode = () => {
    if (!selectedId || !page || selectedId === page.rootId) return;
    pushUndo();
    setModel((m) => {
      const next = cloneModel(m);
      const pg = next.pages[activePage];
      const toRemove = new Set<string>();
      collectSubtreeIds(pg, selectedId, toRemove);
      const parent = Object.values(pg.nodes).find((n) => n.children?.includes(selectedId));
      if (parent?.children) {
        parent.children = parent.children.filter((id) => id !== selectedId);
      }
      for (const id of toRemove) delete pg.nodes[id];
      return next;
    });
    clearSelection();
  };

  const revertVisualToBaseline = () => {
    if (!baselineRef.current) return;
    pushUndo();
    setModel(cloneModel(baselineRef.current));
    clearSelection();
    setMockNotice('');
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

  const ensureEligibleForApply = async (): Promise<boolean> => {
    try {
      const check = await fetch(withProjectQuery('/api/visual-ui-editor/eligibility'));
      const gate = (await check.json()) as { eligible?: boolean };
      if (check.ok && gate.eligible) {
        setEligible(true);
        setEligibilityReason(undefined);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const r = await fetch(withProjectQuery('/api/visual-ui-editor/unlock-from-workspace'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(withProjectBody({ projectName: projectLabel })),
      });
      const d = (await r.json()) as { eligible?: boolean };
      if (r.ok && d.eligible) {
        setEligible(true);
        setEligibilityReason(undefined);
        return true;
      }
    } catch {
      /* fall through */
    }
    await loadEligibility();
    return false;
  };

  const runApplyToCode = async () => {
    setBusy(true);
    setError('');
    const canApply = await ensureEligibleForApply();
    if (!canApply) {
      setMockNotice(
        hasV0ApiKey
          ? 'Run **Generate UI with v0** once to register the first UI generation, then Save Changes & Update Code will write to the workspace.'
          : 'Add V0_API_KEY and run v0 generation, or complete Grok coding with an app/ folder first.',
      );
      setApplyConfirmOpen(false);
      setBusy(false);
      return;
    }
    try {
      await persistModelRemote();
      const res = await fetch(withProjectQuery('/api/visual-ui-editor/apply-visual-changes'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            pageId: activePage,
            previewModel: model,
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
          if (d.model && typeof d.model === 'object' && d.model.pages) {
            setModel(d.model);
            baselineRef.current = cloneModel(d.model);
          }
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
          if (d.model && typeof d.model === 'object' && d.model.pages) {
            setModel(d.model);
            baselineRef.current = cloneModel(d.model);
          }
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

  const runV0Generation = async () => {
    if (v0RunningRef.current) return;
    v0RunningRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (hasV0ApiKey === false) {
        try {
          const fb = await fetch(withProjectQuery('/api/nebula-ui-studio/basic-scaffold'), {
            method: 'POST',
            headers: persistHeaders(),
            body: JSON.stringify(withProjectBody({ projectDisplayName: projectLabel })),
          });
          const fbData = (await fb.json()) as { written?: string[]; hint?: string };
          if (fb.ok && (fbData.written?.length ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('nebula-files-applied'));
            window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
            setMockNotice(
              fbData.hint ||
                `No V0_API_KEY — Nebula wrote a basic HTML preview (${fbData.written!.join(', ')}).`,
            );
            await loadEligibility();
            return;
          }
        } catch {
          /* fall through */
        }
        setError('Add V0_API_KEY for full v0 UI, or use Preview for the basic HTML shell.');
        return;
      }

      const res = await fetchWithTimeout(withProjectQuery('/api/nebula-ui-studio/v0-generate'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            projectDisplayName: projectLabel,
          }),
        ),
      });
      const data = (await res.json()) as {
        error?: string;
        hint?: string;
        chatId?: string;
        written?: string[];
        demoUrl?: string;
        source?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.hint || data.error || 'v0 generation failed');
      }
      if (data.source === 'basic-scaffold') {
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
        window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
        setMockNotice(data.hint || 'Basic UI preview shell written (V0 credits unavailable).');
        await loadEligibility();
        return;
      }
      if (typeof data.chatId === 'string') {
        setV0ChatId(data.chatId);
        try {
          sessionStorage.setItem(v0StorageKey, data.chatId);
        } catch {
          /* ignore */
        }
      }
      try {
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      } catch {
        /* ignore */
      }
      const n = data.written?.length ?? 0;
      setMockNotice(
        n > 0
          ? `v0 wrote ${n} file(s) to the workspace. Open Preview or continue in the visual editor.`
          : 'v0 generation finished.',
      );
      await loadEligibility();
      window.dispatchEvent(new CustomEvent('nebula-ui-studio-v0-complete'));
      window.dispatchEvent(new CustomEvent('nebula-open-ui-studio', { detail: { tab: 'design' } }));
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.name === 'AbortError'
          ? 'v0 request timed out (3 min). Check V0_API_KEY and try again.'
          : e instanceof Error
            ? e.message
            : 'v0 generation failed';
      const creditsLike = /credit|quota|billing/i.test(msg);
      if (creditsLike || msg.includes('V0 unavailable')) {
        try {
          const fb = await fetch(withProjectQuery('/api/nebula-ui-studio/basic-scaffold'), {
            method: 'POST',
            headers: persistHeaders(),
            body: JSON.stringify(withProjectBody({ projectDisplayName: projectLabel })),
          });
          const fbData = (await fb.json()) as { written?: string[] };
          if (fb.ok && (fbData.written?.length ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('nebula-files-applied'));
            window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
            setMockNotice(
              `V0 unavailable — Nebula applied a basic HTML preview (${fbData.written!.join(', ')}). Open Preview in the explorer.`,
            );
            setError('');
            await loadEligibility();
            return;
          }
        } catch {
          /* fall through */
        }
      }
      setError(msg.includes('V0_API_KEY') ? 'Please add your V0_API_KEY in .env' : msg);
    } finally {
      v0RunningRef.current = false;
      setBusy(false);
    }
  };

  runV0GenerationRef.current = runV0Generation;

  useEffect(() => {
    if (eligible !== false || hasV0ApiKey !== true || !studioStatus?.v0PromptExists) return;
    if (studioStatus.hasRealV0 || autoV0StartedRef.current || busy) return;
    autoV0StartedRef.current = true;
    void runV0GenerationRef.current();
  }, [eligible, hasV0ApiKey, studioStatus, busy]);

  const runV0Refine = async () => {
    if (!v0ChatId) {
      setError('Run “Generate UI with v0” first so a v0 chat session exists.');
      return;
    }
    const message = window.prompt('Describe how to refine the v0 UI (e.g. darker theme, add sidebar):');
    if (!message?.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(withProjectQuery('/api/nebula-ui-studio/v0-update'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            chatId: v0ChatId,
            message: message.trim(),
            projectDisplayName: projectLabel,
          }),
        ),
      });
      const data = (await res.json()) as {
        error?: string;
        hint?: string;
        chatId?: string;
        written?: string[];
      };
      if (!res.ok) throw new Error(data.hint || data.error || 'v0 update failed');
      if (typeof data.chatId === 'string') {
        setV0ChatId(data.chatId);
        try {
          sessionStorage.setItem(v0StorageKey, data.chatId);
        } catch {
          /* ignore */
        }
      }
      const n = data.written?.length ?? 0;
      setMockNotice(n > 0 ? `v0 refined ${n} file(s) in the workspace.` : 'v0 refine finished.');
      await loadEligibility();
      try {
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
      } catch {
        /* ignore */
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'v0 refine failed');
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
      opacity: st.opacity,
      cursor:
        studioTool === 'move'
          ? 'move'
          : studioTool === 'resize'
            ? 'nwse-resize'
            : studioTool === 'text'
              ? 'text'
              : studioTool === 'color'
                ? 'crosshair'
                : node.type === 'container'
                  ? 'default'
                  : 'pointer',
      position: 'relative',
      boxShadow:
        selectedId === id
          ? `0 0 0 2px #2563eb, 0 0 0 4px rgba(37,99,235,0.35)${st.boxShadow ? `, ${st.boxShadow}` : ''}`
          : st.boxShadow,
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
      ) : node.type === 'box' ? (
        <div className="h-full min-h-[48px] w-full rounded-md border border-white/10 bg-gradient-to-br from-cyan-500/10 to-transparent" aria-hidden />
      ) : null;

    const isRoot = node.id === page.rootId;
    const rowClass =
      node.role === 'metrics-row'
        ? 'flex w-full flex-row flex-wrap items-stretch justify-between gap-3'
        : isRoot
          ? 'flex min-h-[200px] w-full flex-1 flex-row items-stretch gap-0'
          : 'flex w-full flex-col gap-2';
    const kids = node.children?.length ? (
      <div className={rowClass}>
        {node.children.map((cid, i) => (
          <div
            key={cid}
            className={
              isRoot && node.role !== 'metrics-row'
                ? i === 0
                  ? 'shrink-0 self-stretch'
                  : 'min-w-0 flex-1 self-stretch'
                : node.role === 'metrics-row'
                  ? 'min-w-0 flex-1'
                  : ''
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

  const renderLayerRows = (nodeId: string, depth: number): React.ReactNode => {
    if (!page) return null;
    const node = page.nodes[nodeId];
    if (!node) return null;
    return (
      <React.Fragment key={nodeId}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(nodeId);
            setMenuPos({ top: 12, left: 12 });
          }}
          className={`mb-0.5 w-full rounded-md py-1.5 text-left text-[11px] ${
            selectedId === nodeId ? 'bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-500/40' : 'text-slate-400 hover:bg-white/5'
          }`}
          style={{ paddingLeft: 8 + depth * 10 }}
        >
          <span className="text-slate-500">{node.type}</span> · {node.role}
        </button>
        {node.children?.map((cid) => renderLayerRows(cid, depth + 1))}
      </React.Fragment>
    );
  };

  if (eligible === null) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050a14] text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#050a14] text-slate-200 shadow-[inset_0_1px_0_rgba(34,211,238,0.06)]"
    >
      {!eligible ? (
        <div
          className={cn(
            'flex shrink-0 flex-col gap-2 border-b px-3 py-2 text-[11px] sm:flex-row sm:items-center sm:justify-between',
            hasV0ApiKey
              ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-50/95'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-50/95',
          )}
        >
          <div className="flex items-start gap-2">
            <PanelLeft className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
            <div>
              <span className="font-headline text-xs">
                {hasV0ApiKey ? 'First v0 generation' : 'UI Studio setup'}
              </span>
              <p className="mt-0.5 text-[11px] opacity-80">
                {hasV0ApiKey
                  ? studioStatus?.v0PromptExists
                    ? `v0 is the primary UI generator. Prompt: ${studioStatus.v0PromptPath ?? 'nebula-ui-studio/v0-prompt.md'} (${studioStatus.v0PromptLength ?? 0} chars). Run v0 once to unlock Save to disk.`
                    : 'Waiting for v0-prompt.md from Master Plan §4+§5 — save or update the Master Plan first.'
                  : eligibilityReason}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || hasV0ApiKey === false}
              onClick={() => void runV0Generation()}
              className="rounded border border-cyan-400/50 bg-cyan-500/15 px-2 py-1 text-[10px] font-headline text-cyan-50 hover:bg-cyan-500/25 disabled:opacity-40"
            >
              {busy ? 'Running v0…' : 'Generate UI with v0'}
            </button>
            {v0ChatId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runV0Refine()}
                className="rounded border border-violet-400/40 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-100 disabled:opacity-40"
              >
                Refine with v0
              </button>
            ) : null}
            {hasV0ApiKey === false ? (
              <span className="text-[10px] opacity-90">Add V0_API_KEY in My services</span>
            ) : null}
            {import.meta.env.DEV ? (
              <button
                type="button"
                onClick={() => void simulateV0CompleteDev()}
                className="rounded border border-white/20 bg-black/20 px-2 py-1 text-[10px]"
              >
                Dev: simulate v0 manifest
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {mockNotice ? (
        <div className="border-b border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-50">
          {mockNotice}{' '}
          <button type="button" className="underline" onClick={() => setMockNotice('')}>
            Dismiss
          </button>
        </div>
      ) : null}

      <header className="flex shrink-0 flex-col gap-2 border-b border-cyan-500/25 bg-[#040d18] px-2 py-2 sm:px-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-headline text-xs tracking-wide text-cyan-100">Nebula UI Studio</span>
            <span className="hidden text-[10px] text-slate-500 sm:inline">
              Cosmic Night · {eligible ? 'visual editor' : 'editing tools active'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="rounded border border-white/15 p-1.5 text-slate-300"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => void sessionUndo()}
              className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-300"
              title="Undo last visual edit batch"
            >
              <RotateCcw className="mr-1 inline h-3 w-3" />
              Undo
            </button>
            <button
              type="button"
              onClick={() => setRevertConfirmOpen(true)}
              className="hidden rounded border border-rose-500/30 px-2 py-1 text-[10px] text-rose-200 sm:inline"
              title="Undo last code apply (from backups)"
            >
              Undo last apply
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'select' as const, Icon: MousePointer2, label: 'Select' },
                { id: 'move' as const, Icon: Move, label: 'Drag / Move' },
                { id: 'resize' as const, Icon: Scaling, label: 'Resize' },
                { id: 'text' as const, Icon: Type, label: 'Text Edit' },
                { id: 'color' as const, Icon: Pipette, label: 'Color Picker' },
              ] as const
            ).map(({ id, Icon, label }) => (
              <button
                key={id}
                type="button"
                title={label}
                onClick={() => setStudioTool(id)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] ${
                  studioTool === id
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-50'
                    : 'border-white/10 bg-black/20 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={!selected}
              onClick={() => applySimilarAllPages()}
              className="rounded-md border border-violet-500/35 bg-violet-500/10 px-2 py-1.5 text-[10px] text-violet-100 disabled:opacity-40"
              title="Apply selected element style to matching roles on every page"
            >
              Apply to All Pages
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasV0ApiKey ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runV0Generation()}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"
                >
                  {busy ? 'v0…' : eligible ? 'Regenerate with v0' : 'Generate UI with v0'}
                </button>
                {v0ChatId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runV0Refine()}
                    className="rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 py-2 text-xs text-violet-100 disabled:opacity-40"
                  >
                    Refine with v0
                  </button>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => setApplyConfirmOpen(true)}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-headline text-black shadow-[0_0_18px_rgba(34,211,238,0.35)] hover:bg-cyan-400 disabled:opacity-40 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              <Save className="mr-1.5 inline h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Save Changes &amp; Update Code
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!eligible) {
                  revertVisualToBaseline();
                  return;
                }
                setRestoreOriginalConfirmOpen(true);
              }}
              className="rounded-lg border border-white/15 px-3 py-2 text-[11px] text-slate-300 hover:bg-white/5 sm:text-xs"
              title={eligible ? 'Restore immutable v0 copy into workspace' : 'Reset preview to the snapshot from when this session loaded'}
            >
              Revert to Original
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-52 shrink-0 flex-col border-r border-cyan-500/20 bg-[#040d18]">
          <div className="flex border-b border-white/10">
            <button
              type="button"
              onClick={() => setLeftTab('pages')}
              className={`flex-1 py-2 text-center text-[10px] font-headline uppercase tracking-wider ${
                leftTab === 'pages' ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-500 hover:bg-white/5'
              }`}
            >
              Pages
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('layers')}
              className={`flex flex-1 items-center justify-center gap-1 py-2 text-center text-[10px] font-headline uppercase tracking-wider ${
                leftTab === 'layers' ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-500 hover:bg-white/5'
              }`}
            >
              <Layers className="h-3 w-3" />
              Layers
            </button>
          </div>
          {leftTab === 'pages' ? (
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
          ) : (
            <div className="flex-1 overflow-y-auto p-1">
              {page ? renderLayerRows(page.rootId, 0) : null}
            </div>
          )}
        </aside>

        <main
          ref={previewRef}
          className="relative min-w-0 flex-1 overflow-auto bg-[#020617] p-4"
          onClick={() => clearSelection()}
        >
          <div className="mx-auto max-w-5xl rounded-xl border border-cyan-500/20 bg-[#0a1628] p-4 shadow-[0_0_48px_rgba(34,211,238,0.12)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-cyan-500/80">
              <span>Live preview · {activePage}</span>
              <span className="text-slate-500 normal-case">0vgenerated-v2–style shell (mock)</span>
            </div>
            {page ? renderNode(page.rootId) : null}
          </div>
          {selectedId && menuPos ? (
            <div
              className="pointer-events-auto absolute z-20 flex min-w-[180px] flex-col overflow-hidden rounded-lg border border-blue-500/50 bg-[#0c1a2e] py-1 text-[11px] shadow-xl"
              style={{ top: menuPos.top, left: menuPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="px-2 py-1 text-[10px] text-slate-500">Element</span>
              <button
                type="button"
                className="px-3 py-1.5 text-left hover:bg-white/10"
                onClick={() => {
                  const n = selected;
                  if (!n || (n.type !== 'text' && n.type !== 'button')) return;
                  const nv = window.prompt('Edit text', n.text || '');
                  if (nv !== null && selectedId) updateNodeText(selectedId, nv);
                }}
              >
                <Type className="mr-1 inline h-3 w-3" /> Edit Text
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-left hover:bg-white/10"
                onClick={() => {
                  setStudioTool('color');
                  const v = window.prompt('Background color (hex)', selected?.style.backgroundColor || '#0D1117');
                  if (v && selectedId) updateSelectedStyle({ backgroundColor: v });
                }}
              >
                <Pipette className="mr-1 inline h-3 w-3" /> Color
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-left hover:bg-white/10"
                onClick={() => {
                  const v = window.prompt('Width (CSS)', selected?.style.width || 'auto');
                  if (v != null && selectedId) updateSelectedStyle({ width: v });
                }}
              >
                <Scaling className="mr-1 inline h-3 w-3" /> Size
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-left text-rose-200 hover:bg-rose-500/15"
                onClick={() => deleteSelectedNode()}
              >
                <Trash2 className="mr-1 inline h-3 w-3" /> Delete
              </button>
              <div className="my-1 border-t border-white/10" />
              <button type="button" className="px-3 py-1.5 text-left hover:bg-white/10" onClick={() => moveSelectedInParent(-1)}>
                <ArrowUp className="mr-1 inline h-3 w-3" /> Move up
              </button>
              <button type="button" className="px-3 py-1.5 text-left hover:bg-white/10" onClick={() => moveSelectedInParent(1)}>
                <ArrowDown className="mr-1 inline h-3 w-3" /> Move down
              </button>
              <button type="button" className="px-3 py-1.5 text-left hover:bg-white/10" onClick={() => applySimilarOnPage()}>
                <Copy className="mr-1 inline h-3 w-3" /> Match style (page)
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

      <footer className="shrink-0 border-t border-cyan-500/20 bg-[#040d18] px-3 py-2">
        <p className="text-center text-[10px] text-slate-500">
          Edit layout here, then <strong className="text-slate-400">Save Changes &amp; Update Code</strong> — Grok writes real files under{' '}
          <code className="text-cyan-300/80">src/</code>. Use <strong className="text-slate-400">Mockups</strong> for SVG directions; v0 generates the first React UI.
        </p>
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
                  never modified. Grok produces the file contents.
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
