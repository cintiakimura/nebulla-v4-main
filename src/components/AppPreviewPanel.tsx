import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node as FlowNode } from '@xyflow/react';
import {
  ChevronDown,
  Eye,
  EyeOff,
  FileStack,
  GripVertical,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  Smartphone,
  UserRound,
  Wrench,
} from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';
import { withProjectQuery } from '../lib/nebulaProjectApi';

const PREVIEW_WIDTH_LS = 'nebulla_app_preview_width_px';

type ViewportMode = 'desktop' | 'mobile';

function pageSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'page'
  );
}

function extractReferencedPaths(html: string): string[] {
  const paths = new Set<string>();
  const re = /(?:src|href)\s*=\s*(["'])([^"']+?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let p = m[2].trim();
    if (
      !p ||
      p.startsWith('http:') ||
      p.startsWith('https:') ||
      p.startsWith('data:') ||
      p.startsWith('#') ||
      p.startsWith('mailto:')
    ) {
      continue;
    }
    if (p.startsWith('//')) continue;
    if (p.startsWith('/')) p = p.slice(1);
    const cut = p.split(/[?#]/)[0];
    if (cut) paths.add(cut);
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function buildPreviewUrl(rev: number): string {
  const base = withProjectQuery('/api/app-preview/bootstrap');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}_rev=${rev}`;
}

function readStoredPreviewWidth(): number {
  try {
    const n = parseInt(localStorage.getItem(PREVIEW_WIDTH_LS) || '', 10);
    if (Number.isFinite(n)) return Math.min(720, Math.max(260, n));
  } catch {
    /* ignore */
  }
  return 400;
}

export function AppPreviewPanel({ pages }: { pages: FlowNode[] }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(readStoredPreviewWidth);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [fullscreen, setFullscreen] = useState(false);
  const [actAsUser, setActAsUser] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedPageLabel, setSelectedPageLabel] = useState<string | null>(null);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [previewRev, setPreviewRev] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const previewUrl = useMemo(() => buildPreviewUrl(previewRev), [previewRev]);

  const pageOptions = useMemo(() => {
    const sorted = [...pages].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
    return sorted.map((n) => {
      const d = (n.data || {}) as { label?: string };
      const label = typeof d.label === 'string' ? d.label : 'Page';
      return { id: n.id, label };
    });
  }, [pages]);

  const pathDisplay = useMemo(() => {
    if (!selectedPageLabel) return '/';
    return `/${pageSlug(selectedPageLabel)}`;
  }, [selectedPageLabel]);

  const loadFileRefs = useCallback(async () => {
    setFilesError(null);
    try {
      const res = await fetch(withProjectQuery('/api/files/content?path=index.html'));
      const data = await readResponseJson<{ content?: string; error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Could not read index.html');
      }
      const html = typeof data.content === 'string' ? data.content : '';
      setFilePaths(extractReferencedPaths(html));
    } catch (e) {
      setFilePaths([]);
      setFilesError(e instanceof Error ? e.message : 'Failed to load file list');
    }
  }, []);

  useEffect(() => {
    if (panelOpen) void loadFileRefs();
  }, [panelOpen, loadFileRefs, previewRev]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (ev: MouseEvent) => {
      const t = ev.target;
      if (menuRef.current && t instanceof Element && !menuRef.current.contains(t)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = panelWidth;
    let lastW = startW;
    const onMove = (ev: MouseEvent) => {
      lastW = Math.min(720, Math.max(260, startW + (ev.clientX - startX)));
      setPanelWidth(lastW);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(PREVIEW_WIDTH_LS, String(lastW));
      } catch {
        /* ignore */
      }
      setPanelWidth(lastW);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const connectPreviewWindow = useCallback(
    (win: Window | null) => {
      if (!win) return;
      try {
        win.postMessage(
          { source: 'nebulla-ide', type: 'preview-mode', actAsUser, role: actAsUser ? 'end-user' : 'builder' },
          '*',
        );
      } catch {
        /* ignore */
      }
    },
    [actAsUser],
  );

  const applyPageHash = useCallback((win: Window | null, label: string | null) => {
    if (!win || !label) return;
    try {
      win.location.hash = `nebulla-page=${encodeURIComponent(label)}`;
    } catch {
      /* ignore */
    }
  }, []);

  const onIframeLoad = useCallback(() => {
    const w = iframeRef.current?.contentWindow ?? null;
    connectPreviewWindow(w);
    applyPageHash(w, selectedPageLabel);
  }, [connectPreviewWindow, applyPageHash, selectedPageLabel]);

  useEffect(() => {
    connectPreviewWindow(iframeRef.current?.contentWindow ?? null);
  }, [actAsUser, connectPreviewWindow]);

  useEffect(() => {
    applyPageHash(iframeRef.current?.contentWindow ?? null, selectedPageLabel);
  }, [selectedPageLabel, applyPageHash, previewUrl]);

  /** Compact browser-style chrome (~2 short rows), inspired by segmented + address bar layouts */
  const previewChrome = (
    <div className="shrink-0 border-b border-white/10 bg-[#080d14]">
      <div className="flex items-center gap-2 px-2 pt-2">
        <span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[12px] font-medium text-cyan-200/95">
          Preview
        </span>
        <span className="flex-1" />
      </div>
      <div className="flex items-center gap-1.5 px-2 py-2">
        <div
          ref={menuRef}
          className="relative flex min-w-0 flex-1 items-stretch rounded-lg border border-white/10 bg-black/25"
        >
          <button
            type="button"
            title="Reload preview"
            aria-label="Reload preview"
            onClick={() => {
              void loadFileRefs();
              setPreviewRev((n) => n + 1);
            }}
            className="flex shrink-0 items-center border-r border-white/10 px-2 text-slate-400 hover:bg-white/5 hover:text-cyan-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-left hover:bg-white/[0.04]"
            title="Page, files, and preview options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="truncate font-mono text-[11px] text-slate-400">{pathDisplay}</span>
            <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 text-slate-500 ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen ? (
            <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#0a0f18] py-2 text-[11px] shadow-xl">
              <p className="px-3 py-1 text-[9px] font-headline uppercase tracking-wider text-slate-500">Viewport</p>
              <div className="flex gap-1 px-2 pb-2">
                <button
                  type="button"
                  className={`flex-1 rounded border px-2 py-1 text-[10px] ${
                    viewport === 'desktop'
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                  onClick={() => {
                    setViewport('desktop');
                  }}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded border px-2 py-1 text-[10px] ${
                    viewport === 'mobile'
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                  onClick={() => {
                    setViewport('mobile');
                  }}
                >
                  Mobile
                </button>
              </div>
              <p className="px-3 py-1 text-[9px] font-headline uppercase tracking-wider text-slate-500">Preview as</p>
              <div className="flex gap-1 px-2 pb-2">
                <button
                  type="button"
                  className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] ${
                    !actAsUser
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                  onClick={() => setActAsUser(false)}
                >
                  <Wrench className="h-3 w-3" /> Builder
                </button>
                <button
                  type="button"
                  className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] ${
                    actAsUser
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                      : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                  onClick={() => setActAsUser(true)}
                >
                  <UserRound className="h-3 w-3" /> User
                </button>
              </div>
              <div className="my-1 border-t border-white/10" />
              <p className="px-3 py-1 text-[9px] font-headline uppercase tracking-wider text-slate-500">Pages</p>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-slate-400 hover:bg-white/5"
                onClick={() => {
                  setSelectedPageLabel(null);
                  setMenuOpen(false);
                  try {
                    iframeRef.current?.contentWindow?.location.replace(previewUrl.split('#')[0]);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Default (home)
              </button>
              {pageOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full truncate px-3 py-1.5 text-left text-slate-200 hover:bg-white/5"
                  onClick={() => {
                    setSelectedPageLabel(p.label);
                    setMenuOpen(false);
                  }}
                >
                  {p.label}
                  <span className="block font-mono text-[9px] text-slate-500">#{pageSlug(p.label)}</span>
                </button>
              ))}
              <div className="my-1 border-t border-white/10" />
              <p className="flex items-center gap-1 px-3 py-1 text-[9px] font-headline uppercase tracking-wider text-slate-500">
                <FileStack className="h-3 w-3" /> Files ({filePaths.length})
              </p>
              {filesError ? (
                <p className="px-3 py-1 text-amber-300/90">{filesError}</p>
              ) : filePaths.length === 0 ? (
                <p className="px-3 py-1 text-slate-500">No references in index.html</p>
              ) : (
                filePaths.map((fp) => (
                  <div key={fp} className="break-all px-3 py-0.5 font-mono text-[10px] text-cyan-200/80">
                    {fp}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          title={viewport === 'desktop' ? 'Desktop — click for mobile' : 'Mobile — click for desktop'}
          aria-label="Toggle device width"
          onClick={() => setViewport((v) => (v === 'desktop' ? 'mobile' : 'desktop'))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:border-cyan-500/35 hover:text-cyan-300"
        >
          {viewport === 'desktop' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={() => setFullscreen((x) => !x)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:border-cyan-500/35 hover:text-cyan-300"
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );

  const frameWrapClass =
    viewport === 'mobile'
      ? 'mx-auto w-full max-w-[390px] border-x border-white/10 bg-black shadow-xl'
      : 'w-full border-x border-transparent';

  const iframeBlock = (
    <div className={`flex min-h-0 flex-1 flex-col bg-black/40 ${frameWrapClass}`}>
      <iframe
        ref={iframeRef}
        title="App preview"
        src={previewUrl}
        onLoad={onIframeLoad}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        className="h-full min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-[#020810]">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#060a14] px-3 py-2">
          <span className="font-headline text-xs text-cyan-300">App preview</span>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
          >
            <Minimize2 className="h-4 w-4" />
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {previewChrome}
          <div className="flex min-h-0 flex-1 justify-center overflow-auto p-2">
            <div
              className={
                viewport === 'mobile'
                  ? 'flex min-h-0 w-full max-w-[390px] flex-1 flex-col'
                  : 'flex min-h-0 w-full max-w-6xl flex-1 flex-col'
              }
            >
              {iframeBlock}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[50]">
      <div
        className="pointer-events-auto absolute left-0 top-0 z-[52] flex h-full w-10 flex-col items-center gap-2 border-r border-white/10 bg-[#040f1a]/90 py-3"
        aria-label="App preview controls"
      >
        <button
          type="button"
          title={panelOpen ? 'Hide app preview' : 'Show app preview'}
          aria-pressed={panelOpen}
          onClick={() => setPanelOpen((o) => !o)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-cyan-500/25 bg-[#060a14]/80 p-2 text-cyan-300 hover:bg-cyan-500/10"
        >
          {panelOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="text-[8px] font-headline uppercase tracking-wider text-slate-500 [writing-mode:vertical-rl] rotate-180">
            Preview
          </span>
        </button>
      </div>

      {panelOpen ? (
        <>
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 z-[50] bg-black/30"
            aria-label="Close preview backdrop"
            onClick={() => setPanelOpen(false)}
          />
          <div
            className="pointer-events-auto absolute left-10 top-0 z-[51] flex h-full flex-col overflow-visible border-r border-white/10 bg-[#020810]/98 shadow-[4px_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm"
            style={{ width: panelWidth, maxWidth: 'min(100%, 720px)' }}
          >
            <div
              className={`relative flex min-h-0 w-full flex-1 flex-col ${menuOpen ? 'overflow-visible' : 'overflow-hidden'}`}
            >
              {previewChrome}
              {iframeBlock}
            </div>
            <button
              type="button"
              aria-label="Resize preview panel"
              title="Drag to resize preview"
              onMouseDown={onResizeMouseDown}
              className="absolute -right-1.5 top-0 z-[55] flex h-full w-3 cursor-col-resize items-center justify-center border-0 bg-transparent text-slate-600 hover:text-cyan-400/90"
            >
              <GripVertical className="h-7 w-3.5 opacity-70" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
