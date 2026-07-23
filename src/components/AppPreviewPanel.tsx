import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node as FlowNode } from '@xyflow/react';
import {
  ChevronDown,
  Eye,
  EyeOff,
  GitBranch,
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
import { resolveProjectType, studioDeviceModeForType } from '../lib/nebulaProjectType';

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

export function AppPreviewPanel({
  pages,
  onOpenSourceControl,
  toolRailWidthPx = 40,
  sourceControlActive = false,
  onToolRailResizeMouseDown,
  defaultPanelOpen = false,
  onCloseDock,
  embeddedInDock = false,
  /** Hide duplicate title bar when parent provides Cursor-style tabs + Open in Browser. */
  hideChrome = false,
}: {
  pages: FlowNode[];
  onOpenSourceControl?: () => void;
  toolRailWidthPx?: number;
  sourceControlActive?: boolean;
  onToolRailResizeMouseDown?: (e: React.MouseEvent) => void;
  /** When true, preview iframe is visible immediately (IDE explorer dock). */
  defaultPanelOpen?: boolean;
  onCloseDock?: () => void;
  /** Fills parent column instead of floating tool rail (explorer dock). */
  embeddedInDock?: boolean;
  hideChrome?: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(defaultPanelOpen);
  const [panelWidth, setPanelWidth] = useState(readStoredPreviewWidth);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [viewportTouched, setViewportTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [actAsUser, setActAsUser] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedPageLabel, setSelectedPageLabel] = useState<string | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<
    { path: string; status?: string; size?: number }[]
  >([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [previewRev, setPreviewRev] = useState(0);
  const [v0DemoUrl, setV0DemoUrl] = useState<string | null>(null);
  const [preferV0Preview, setPreferV0Preview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadPreviewMeta = useCallback(async () => {
    try {
      const res = await fetch(withProjectQuery('/api/app-preview/meta'), { credentials: 'include' });
      const data = await readResponseJson<{ v0DemoUrl?: string; preferV0?: boolean }>(res);
      if (res.ok) {
        const url = typeof data.v0DemoUrl === 'string' ? data.v0DemoUrl.trim() : '';
        setV0DemoUrl(url || null);
        setPreferV0Preview(Boolean(data.preferV0 && url));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const workspacePreviewUrl = useMemo(() => buildPreviewUrl(previewRev), [previewRev]);
  const previewUrl = preferV0Preview && v0DemoUrl ? v0DemoUrl : workspacePreviewUrl;

  useEffect(() => {
    const onOpen = () => setPanelOpen(true);
    window.addEventListener('nebula-open-app-preview', onOpen);
    return () => window.removeEventListener('nebula-open-app-preview', onOpen);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applyDefault = async () => {
      if (viewportTouched) return;
      const type = await resolveProjectType();
      if (cancelled || viewportTouched) return;
      setViewport(studioDeviceModeForType(type));
    };
    void applyDefault();
    const onPlan = () => void applyDefault();
    window.addEventListener('nebula-master-plan-updated', onPlan);
    window.addEventListener('nebula-project-reset', onPlan);
    return () => {
      cancelled = true;
      window.removeEventListener('nebula-master-plan-updated', onPlan);
      window.removeEventListener('nebula-project-reset', onPlan);
    };
  }, [viewportTouched]);

  useEffect(() => {
    void loadPreviewMeta();
    const onRefresh = () => {
      void loadPreviewMeta();
      setPreviewRev((n) => n + 1);
    };
    const onDemo = (ev: Event) => {
      const url = (ev as CustomEvent<{ demoUrl?: string }>).detail?.demoUrl?.trim();
      if (url) {
        setV0DemoUrl(url);
        setPreferV0Preview(true);
        setPreviewRev((n) => n + 1);
      } else {
        onRefresh();
      }
    };
    window.addEventListener('nebula-files-applied', onRefresh);
    window.addEventListener('nebula-v0-demo-ready', onDemo);
    window.addEventListener('nebula-ui-studio-v0-complete', onRefresh);
    return () => {
      window.removeEventListener('nebula-files-applied', onRefresh);
      window.removeEventListener('nebula-v0-demo-ready', onDemo);
      window.removeEventListener('nebula-ui-studio-v0-complete', onRefresh);
    };
  }, [loadPreviewMeta]);

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

  const loadWorkspaceSourceFiles = useCallback(async () => {
    setFilesError(null);
    try {
      const res = await fetch(withProjectQuery('/api/source-control/overview'), {
        credentials: 'include',
      });
      const data = await readResponseJson<{
        nebulaFiles?: { relativePath: string; size: number }[];
        git?: { entries: { status: string; path: string }[] } | null;
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Could not load workspace files');
      }
      const gitStatus = new Map((data.git?.entries ?? []).map((e) => [e.path, e.status]));
      const productPrefixes = ['app/', 'src/', 'pages/', 'components/', 'lib/', 'public/', 'prisma/'];
      const files = (data.nebulaFiles ?? [])
        .filter((f) => {
          const p = f.relativePath.replace(/\\/g, '/');
          if (p.startsWith('nebulla-ide/') || p.startsWith('generated-ui/')) return false;
          return (
            productPrefixes.some((pre) => p.startsWith(pre)) ||
            p === 'index.html' ||
            p.endsWith('.tsx') ||
            p.endsWith('.ts') ||
            p.endsWith('.jsx') ||
            p.endsWith('.js')
          );
        })
        .map((f) => ({
          path: f.relativePath.replace(/\\/g, '/'),
          status: gitStatus.get(f.relativePath.replace(/\\/g, '/')),
          size: f.size,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
      setWorkspaceFiles(files);
    } catch (e) {
      setWorkspaceFiles([]);
      setFilesError(e instanceof Error ? e.message : 'Failed to load workspace files');
    }
  }, []);

  useEffect(() => {
    if (embeddedInDock || panelOpen) void loadWorkspaceSourceFiles();
  }, [embeddedInDock, panelOpen, loadWorkspaceSourceFiles, previewRev]);

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
              void loadPreviewMeta();
              void loadWorkspaceSourceFiles();
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
            <span className="truncate font-mono text-[11px] text-slate-400">
              {preferV0Preview && v0DemoUrl ? 'v0 live' : pathDisplay}
            </span>
            <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 text-slate-500 ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen ? (
            <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#0a0f18] py-2 text-[11px] shadow-xl">
              {v0DemoUrl ? (
                <>
                  <p className="px-3 py-1 text-[9px] font-headline uppercase tracking-wider text-slate-500">
                    Preview source
                  </p>
                  <div className="flex flex-col gap-0.5 px-2 pb-2">
                    <button
                      type="button"
                      className={`rounded px-2 py-1.5 text-left text-[10px] ${
                        preferV0Preview ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-400 hover:bg-white/5'
                      }`}
                      onClick={() => {
                        setPreferV0Preview(true);
                        setPreviewRev((n) => n + 1);
                      }}
                    >
                      v0 live (recommended)
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-1.5 text-left text-[10px] ${
                        !preferV0Preview ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-400 hover:bg-white/5'
                      }`}
                      onClick={() => {
                        setPreferV0Preview(false);
                        setPreviewRev((n) => n + 1);
                      }}
                    >
                      Workspace HTML
                    </button>
                    <a
                      href={v0DemoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded px-2 py-1.5 text-[10px] text-cyan-300 hover:bg-white/5"
                    >
                      Open v0.dev ↗
                    </a>
                  </div>
                </>
              ) : null}
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
                    setViewportTouched(true);
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
                    setViewportTouched(true);
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
                <GitBranch className="h-3 w-3" /> Source control ({workspaceFiles.length})
              </p>
              {onOpenSourceControl ? (
                <button
                  type="button"
                  className="mx-2 mb-1 w-[calc(100%-1rem)] rounded border border-white/10 px-2 py-1 text-left text-[10px] text-cyan-200/90 hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSourceControl();
                  }}
                >
                  Open full Git panel
                </button>
              ) : null}
              {filesError ? (
                <p className="px-3 py-1 text-amber-300/90">{filesError}</p>
              ) : workspaceFiles.length === 0 ? (
                <p className="px-3 py-1 text-slate-500">No Grok-generated app files yet</p>
              ) : (
                workspaceFiles.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="flex w-full flex-col gap-0.5 break-all px-3 py-1 text-left font-mono text-[10px] text-cyan-200/80 hover:bg-white/5"
                    onClick={() => {
                      setMenuOpen(false);
                      window.dispatchEvent(
                        new CustomEvent('nebula-center-focus-file', { detail: { path: f.path } }),
                      );
                    }}
                  >
                    <span>{f.path}</span>
                    {f.status ? (
                      <span className="text-[9px] text-slate-500">git {f.status.trim()}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          title={viewport === 'desktop' ? 'Desktop — click for mobile' : 'Mobile — click for desktop'}
          aria-label="Toggle device width"
          onClick={() => {
            setViewportTouched(true);
            setViewport((v) => (v === 'desktop' ? 'mobile' : 'desktop'));
          }}
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

  if (embeddedInDock) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
        {hideChrome ? null : (
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-2 py-1">
            <span className="type-label-sm text-primary">App preview</span>
            {onCloseDock ? (
              <button
                type="button"
                className="type-label-sm text-muted-foreground hover:text-foreground"
                onClick={onCloseDock}
              >
                Hide
              </button>
            ) : null}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {previewChrome}
          {iframeBlock}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[50]">
      <div
        className="pointer-events-auto absolute top-0 z-[52] flex h-full flex-col border-r border-border bg-sidebar/95 py-3"
        style={{ left: 0, width: toolRailWidthPx }}
        aria-label="Workspace tools"
      >
        <div className="relative flex h-full w-full flex-col items-center gap-2">
          <button
            type="button"
            title={panelOpen ? 'Hide live app preview' : 'Show live app preview'}
            aria-pressed={panelOpen}
            onClick={() => setPanelOpen((o) => !o)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              panelOpen
                ? 'border-primary/40 bg-primary/15 text-primary shadow-sm shadow-primary/10'
                : 'border-border bg-card/80 text-muted-foreground hover:border-ring/40 hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            {panelOpen ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
          {onOpenSourceControl ? (
            <button
              type="button"
              title="Source Control"
              aria-label="Source Control"
              aria-pressed={sourceControlActive}
              onClick={() => onOpenSourceControl()}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                sourceControlActive
                  ? 'border-primary/45 bg-primary/15 text-primary shadow-sm shadow-primary/10'
                  : 'border-border bg-card/80 text-muted-foreground hover:border-ring/40 hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <GitBranch className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {onToolRailResizeMouseDown ? (
            <button
              type="button"
              className="absolute inset-y-8 right-0 z-[54] w-1.5 translate-x-1/2 cursor-col-resize rounded-full border-0 bg-transparent p-0 hover:bg-primary/35"
              aria-label="Resize tool rail"
              title="Drag to resize tool rail"
              onMouseDown={onToolRailResizeMouseDown}
            />
          ) : null}
        </div>
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
            className="pointer-events-auto absolute top-0 z-[51] flex h-full flex-col overflow-visible border-r border-border bg-card/95 shadow-[4px_0_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
            style={{ left: toolRailWidthPx, width: panelWidth, maxWidth: 'min(100%, 720px)' }}
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
              className="absolute -right-1.5 top-0 z-[55] flex h-full w-3 cursor-col-resize items-center justify-center border-0 bg-transparent text-muted-foreground hover:bg-primary/20 hover:text-primary"
            >
              <GripVertical className="h-7 w-3.5 opacity-70" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
