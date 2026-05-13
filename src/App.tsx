import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  Globe,
  GripVertical,
  Key,
  LayoutGrid,
  LogOut,
  Network,
  Palette,
  Server,
  Terminal,
  User,
} from 'lucide-react';
import { LandingPage } from './components/LandingPage.tsx';
import { LoginScreen } from './components/LoginScreen';
import { MasterPlan } from './components/MasterPlan';
import { MindMap } from './components/MindMap';
import { PencilStudio } from './components/PencilStudio';
import { Dashboard, type DashboardTab } from './components/Dashboard';
import { AssistantSidebar } from './components/AssistantSidebar';
import { ModelSettingsProvider } from './components/settings/ModelSettingsContext';
import { ExecutionRulesViewer } from './components/ExecutionRulesViewer';
import { Logo } from './components/Logo';
import { SourceControlPanel } from './components/SourceControlPanel';
import { UserProfilePage } from './components/UserProfilePage';
import { AppPreviewPanel } from './components/AppPreviewPanel';
import { WorkspaceSwarmButton } from './components/workspace/WorkspaceSwarmButton';
import { Button } from '@/components/ui/button';
import { readResponseJson } from './lib/apiFetch';
import { fetchSessionUser, listCloudProjects, logoutNebula, type CloudProjectRow, type NebulaSessionUser } from './lib/nebulaCloud';
import { setBrowserProjectKey, setBrowserProjectName, withProjectQuery, withProjectBody } from './lib/nebulaProjectApi';
import { normalizeUserTier } from '@/lib/user-tier';

type MainPanel =
  | 'nebula-ui-studio'
  | 'mind-map'
  | 'master-plan'
  | 'project-rules'
  | 'source-control'
  | 'my-projects'
  | 'secrets'
  | 'project-settings'
  | 'dns'
  | 'user-profile';

const PANEL_LABEL: Record<MainPanel, string> = {
  'nebula-ui-studio': 'UI Studio',
  'mind-map': 'Mind Map',
  'master-plan': 'Master Plan',
  'project-rules': 'Execution Rules',
  'source-control': 'Source Control',
  'my-projects': 'My Projects',
  secrets: 'Secrets',
  'project-settings': 'Project Settings',
  dns: 'DNS & Domains',
  'user-profile': 'Account',
};

const seedPages: Node[] = [
  {
    id: '1',
    type: 'pageNode',
    data: {
      label: 'Authentication',
      isCritical: true,
      isCreated: true,
      description: 'Sign-in and session handling.',
    },
    position: { x: 50, y: 220 },
  },
  {
    id: '2',
    type: 'pageNode',
    data: {
      label: 'Dashboard',
      isCritical: true,
      isCreated: false,
      description: 'Main workspace after login.',
    },
    position: { x: 380, y: 220 },
  },
  {
    id: '3',
    type: 'pageNode',
    data: {
      label: 'Settings',
      isCritical: false,
      isCreated: false,
      description: 'Preferences and integrations.',
    },
    position: { x: 710, y: 220 },
  },
];

const seedEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#00ffff' } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#00ffff' } },
];

function cloudDiskKeyFromRow(r: CloudProjectRow): string {
  const w = r.workspace_id != null ? String(r.workspace_id).trim() : '';
  if (!w) return 'default';
  const cleaned = w.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || 'default';
}

function cloneGraphPages(raw: unknown): Node[] {
  if (Array.isArray(raw)) return JSON.parse(JSON.stringify(raw)) as Node[];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) return JSON.parse(JSON.stringify(p)) as Node[];
    } catch {
      /* ignore */
    }
  }
  return JSON.parse(JSON.stringify(seedPages)) as Node[];
}

function cloneGraphEdges(raw: unknown): Edge[] {
  if (Array.isArray(raw)) return JSON.parse(JSON.stringify(raw)) as Edge[];
  if (typeof raw === 'string') {
    try {
      const e = JSON.parse(raw) as unknown;
      if (Array.isArray(e)) return JSON.parse(JSON.stringify(e)) as Edge[];
    } catch {
      /* ignore */
    }
  }
  return JSON.parse(JSON.stringify(seedEdges)) as Edge[];
}

type AppStage = 'landing' | 'sign-in' | 'studio';

function App() {
  const [appStage, setAppStage] = useState<AppStage>('landing');
  const [sessionUser, setSessionUser] = useState<NebulaSessionUser | null>(null);
  const [mainPanel, setMainPanel] = useState<MainPanel>('master-plan');

  const [pages, setPages] = useState<Node[]>(() => JSON.parse(JSON.stringify(seedPages)) as Node[]);
  const [edges, setEdges] = useState<Edge[]>(() => JSON.parse(JSON.stringify(seedEdges)) as Edge[]);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [projects, setProjects] = useState<{ key: string; name: string; updatedAt: string }[]>([
    { key: 'default', name: 'Untitled Project', updatedAt: new Date().toISOString() },
  ]);
  const [activeProjectKey, setActiveProjectKey] = useState('default');

  const [apiConfig, setApiConfig] = useState<{
    pencilMockupsReady?: boolean;
    nebulaUiStudioDemo?: boolean;
  }>({});

  const [codeMode, setCodeMode] = useState(false);
  const [executionRulesPath, setExecutionRulesPath] = useState('project-execution-rules.md');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    '$ npm run dev',
    'Ready — use the left sidebar to switch views.',
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(() => {
    try {
      const raw = localStorage.getItem('nebulla_assistant_width');
      const n = raw ? parseInt(raw, 10) : 340;
      if (Number.isNaN(n)) return 340;
      return Math.min(560, Math.max(260, n));
    } catch {
      return 340;
    }
  });
  const resizeDrag = useRef<{ startX: number; startW: number } | null>(null);
  const assistantWidthRef = useRef(assistantWidth);
  assistantWidthRef.current = assistantWidth;

  const [previewToolRailPx, setPreviewToolRailPx] = useState(() => {
    try {
      const raw = localStorage.getItem('nebulla_preview_tool_rail_px');
      const n = raw ? parseInt(raw, 10) : 40;
      if (Number.isNaN(n)) return 40;
      return Math.min(56, Math.max(36, n));
    } catch {
      return 40;
    }
  });
  const previewRailDrag = useRef<{ startX: number; startW: number } | null>(null);
  const previewToolRailPxRef = useRef(previewToolRailPx);
  previewToolRailPxRef.current = previewToolRailPx;

  const [terminalHeightPx, setTerminalHeightPx] = useState(() => {
    try {
      const raw = localStorage.getItem('nebulla_terminal_height_px');
      const n = raw ? parseInt(raw, 10) : 144;
      if (Number.isNaN(n)) return 144;
      return Math.min(480, Math.max(120, n));
    } catch {
      return 144;
    }
  });
  const terminalHeightRef = useRef(terminalHeightPx);
  terminalHeightRef.current = terminalHeightPx;
  const terminalResizeDrag = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    (window as unknown as { openMasterPlan?: () => void }).openMasterPlan = () => {
      setMainPanel('master-plan');
    };
    (window as unknown as { openMasterPlanTab?: (n: number) => void }).openMasterPlanTab = (tabNumber: number) => {
      setMainPanel('master-plan');
      try {
        localStorage.setItem('nebula_master_plan_open_tab', String(tabNumber));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('nebula-open-master-plan-tab', { detail: { tabNumber } }));
    };
    (window as unknown as { openCodingMode?: (relPath?: string) => void }).openCodingMode = (relPath?: string) => {
      setCodeMode(true);
      if (relPath && typeof relPath === 'string' && relPath.trim()) {
        setExecutionRulesPath(relPath.trim());
      } else {
        setExecutionRulesPath('project-execution-rules.md');
      }
      setMainPanel('project-rules');
    };
    return () => {
      const w = window as unknown as {
        openMasterPlan?: () => void;
        openMasterPlanTab?: (n: number) => void;
        openCodingMode?: (p?: string) => void;
      };
      delete w.openMasterPlan;
      delete w.openMasterPlanTab;
      delete w.openCodingMode;
    };
  }, []);

  useEffect(() => {
    fetch(withProjectQuery('/api/config'))
      .then((r) => r.json())
      .then((d) => setApiConfig(d))
      .catch(() => setApiConfig({}));
  }, [activeProjectKey, projectName]);

  useEffect(() => {
    if (appStage !== 'studio') return;
    let cancelled = false;
    void (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      setSessionUser(user);
      if (!user) {
        setAppStage('sign-in');
        return;
      }
      const rows = await listCloudProjects();
      if (cancelled || rows.length === 0) return;
      const mapped = rows.map((r) => ({
        key: cloudDiskKeyFromRow(r),
        name: r.name,
        updatedAt: r.updated_at,
      }));
      setProjects(mapped);
      const primary = rows[0];
      setActiveProjectKey(cloudDiskKeyFromRow(primary));
      setProjectName(primary.name);
      setPages(cloneGraphPages(primary.pages));
      setEdges(cloneGraphEdges(primary.edges));
    })();
    return () => {
      cancelled = true;
    };
  }, [appStage]);

  const handleAuthenticated = useCallback(() => {
    setAppStage('studio');
  }, []);

  const handleSignOut = useCallback(() => {
    void (async () => {
      await logoutNebula();
      setSessionUser(null);
      setAppStage('sign-in');
    })();
  }, []);

  const handleAccountDeleted = useCallback(() => {
    setSessionUser(null);
    setAppStage('sign-in');
    setMainPanel('my-projects');
  }, []);

  useLayoutEffect(() => {
    setBrowserProjectKey(activeProjectKey);
    setBrowserProjectName(projectName);
  }, [activeProjectKey, projectName]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = resizeDrag.current;
      if (d) {
        const delta = d.startX - e.clientX;
        const next = Math.min(560, Math.max(260, d.startW + delta));
        assistantWidthRef.current = next;
        setAssistantWidth(next);
      }
      const tr = terminalResizeDrag.current;
      if (tr) {
        const deltaY = tr.startY - e.clientY;
        const maxH = Math.round(typeof window !== 'undefined' ? window.innerHeight * 0.5 : 480);
        const nextH = Math.min(maxH, Math.max(120, tr.startH + deltaY));
        terminalHeightRef.current = nextH;
        setTerminalHeightPx(nextH);
      }
      const pr = previewRailDrag.current;
      if (pr) {
        const deltaX = e.clientX - pr.startX;
        const nextW = Math.min(56, Math.max(36, pr.startW + deltaX));
        previewToolRailPxRef.current = nextW;
        setPreviewToolRailPx(nextW);
      }
    };
    const onUp = () => {
      if (resizeDrag.current) {
        try {
          localStorage.setItem('nebulla_assistant_width', String(assistantWidthRef.current));
        } catch {
          /* ignore */
        }
      }
      if (terminalResizeDrag.current) {
        try {
          localStorage.setItem('nebulla_terminal_height_px', String(terminalHeightRef.current));
        } catch {
          /* ignore */
        }
      }
      if (previewRailDrag.current) {
        try {
          localStorage.setItem('nebulla_preview_tool_rail_px', String(previewToolRailPxRef.current));
        } catch {
          /* ignore */
        }
      }
      resizeDrag.current = null;
      terminalResizeDrag.current = null;
      previewRailDrag.current = null;
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

  useEffect(() => {
    if (appStage !== 'studio') {
      document.title = 'Nebulla IDE';
      return;
    }
    document.title = `${PANEL_LABEL[mainPanel]} — ${projectName}`;
  }, [appStage, mainPanel, projectName]);

  const pagesText = useMemo(() => {
    const sorted = [...pages].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
    const lines = sorted.map((p, i) => {
      const d = (p.data || {}) as { label?: string; description?: string };
      const label = typeof d.label === 'string' ? d.label : 'Page';
      const desc = typeof d.description === 'string' ? d.description : '';
      return `${i + 1}. ${label}: ${desc}`;
    });
    return `PAGES & NAVIGATION\n\n${lines.join('\n')}`;
  }, [pages]);

  const runTerminalCommand = useCallback(
    async (command: string) => {
      const cmd = command.trim();
      if (!cmd || terminalBusy) return;
      setTerminalBusy(true);
      setTerminalOutput((prev) => [...prev, `$ ${cmd}`]);
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withProjectBody({ command: cmd })),
        });
        const data = await readResponseJson<{ output?: string; error?: string }>(res);
        if (!res.ok) {
          setTerminalOutput((prev) => [...prev, data.error || `Command failed (${res.status})`]);
        } else {
          const out = typeof data.output === 'string' ? data.output.trimEnd() : '';
          setTerminalOutput((prev) => [...prev, out || '[ok]']);
        }
      } catch (e) {
        setTerminalOutput((prev) => [...prev, e instanceof Error ? e.message : 'Terminal request failed']);
      } finally {
        setTerminalBusy(false);
      }
    },
    [terminalBusy, activeProjectKey, projectName],
  );

  const handleSaveToMasterPlan = useCallback(() => {
    try {
      localStorage.setItem(
        'nebula_project_default',
        JSON.stringify({ pages, edges, projectName }),
      );
    } catch {
      /* ignore */
    }
  }, [pages, edges, projectName]);

  const onProjectNameChange = (name: string) => {
    setProjectName(name);
    setProjects((prev) =>
      prev.map((p) =>
        p.key === activeProjectKey ? { ...p, name, updatedAt: new Date().toISOString() } : p,
      ),
    );
  };

  const onOpenProject = (key: string) => {
    setActiveProjectKey(key);
    const row = projects.find((p) => p.key === key);
    if (row) setProjectName(row.name);
  };

  const onDeleteProject = (key: string) => {
    if (!window.confirm('Remove this project from the list?')) return;
    setProjects((prev) => {
      const next = prev.filter((p) => p.key !== key);
      if (next.length === 0) {
        setActiveProjectKey('default');
        setProjectName('Untitled Project');
        return [{ key: 'default', name: 'Untitled Project', updatedAt: new Date().toISOString() }];
      }
      if (key === activeProjectKey) {
        const first = next[0];
        setActiveProjectKey(first.key);
        setProjectName(first.name);
      }
      return next;
    });
  };

  const onStartFlow = async (_kind: 'quick' | 'devpartner' | 'github' | 'prompt' | 'upload') => {
    /* Flows stay in-dashboard; optional hook for later */
  };

  const dashboardTab: DashboardTab =
    mainPanel === 'my-projects'
      ? 'projects'
      : mainPanel === 'secrets'
        ? 'secrets'
        : mainPanel === 'project-settings'
          ? 'project-settings'
          : mainPanel === 'dns'
            ? 'dns'
            : 'projects';

  const syncDashboardTabToPanel = (tab: DashboardTab) => {
    if (tab === 'projects') setMainPanel('my-projects');
    else if (tab === 'secrets') setMainPanel('secrets');
    else if (tab === 'project-settings') setMainPanel('project-settings');
    else if (tab === 'dns') setMainPanel('dns');
  };

  const renderCenter = () => {
    switch (mainPanel) {
      case 'nebula-ui-studio':
        return (
          <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
            <PencilStudio
              onLock={() => setMainPanel('master-plan')}
              pagesText={pagesText}
              pencilMockupsReady={Boolean(apiConfig.pencilMockupsReady)}
              nebulaUiStudioDemo={Boolean(apiConfig.nebulaUiStudioDemo)}
            />
          </div>
        );
      case 'mind-map':
        return (
          <div className="flex-1 min-h-0 h-full p-4 overflow-hidden flex flex-col">
            <MindMap
              pages={pages}
              setPages={setPages}
              edges={edges}
              setEdges={setEdges}
              onSaveToMasterPlan={handleSaveToMasterPlan}
            />
          </div>
        );
      case 'master-plan':
        return (
          <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
            <MasterPlan onClose={() => setMainPanel('mind-map')} projectKey={activeProjectKey} />
          </div>
        );
      case 'project-rules':
        return (
          <div className="flex-1 min-h-0 h-full p-4 overflow-hidden flex flex-col">
            <ExecutionRulesViewer
              filePath={executionRulesPath}
              projectKey={activeProjectKey}
              projectName={projectName}
              onExitCodeMode={() => {
                setCodeMode(false);
                setMainPanel('master-plan');
              }}
            />
          </div>
        );
      case 'source-control':
        return (
          <div className="flex-1 min-h-0 h-full p-4 overflow-hidden flex flex-col">
            <SourceControlPanel projectKey={activeProjectKey} projectName={projectName} />
          </div>
        );
      case 'user-profile':
        return (
          <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
            <UserProfilePage onAccountDeleted={handleAccountDeleted} />
          </div>
        );
      case 'my-projects':
      case 'secrets':
      case 'project-settings':
      case 'dns':
        return (
          <div className="flex-1 min-h-0 h-full p-4 overflow-hidden flex flex-col">
            <Dashboard
              activeTab={dashboardTab}
              onTabChange={syncDashboardTabToPanel}
              projectName={projectName}
              onProjectNameChange={onProjectNameChange}
              projects={projects}
              activeProjectKey={activeProjectKey}
              onOpenProject={onOpenProject}
              onDeleteProject={onDeleteProject}
              onStartFlow={onStartFlow}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const NavBtn = ({
    panel,
    title,
    children,
  }: {
    panel: MainPanel;
    title: string;
    children: ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={mainPanel === panel}
      onClick={() => setMainPanel(panel)}
      className={`p-2 rounded-lg transition-all duration-200 ${
        mainPanel === panel
          ? 'bg-primary/20 text-primary shadow-lg shadow-primary/20 ring-1 ring-ring/25'
          : 'text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground'
      }`}
    >
      <span className="inline-flex items-center justify-center" aria-hidden>
        {children}
      </span>
    </button>
  );

  if (appStage === 'landing') {
    return <LandingPage onEnter={() => setAppStage('sign-in')} />;
  }

  if (appStage === 'sign-in') {
    return <LoginScreen onAuthenticated={handleAuthenticated} onBack={() => setAppStage('landing')} />;
  }

  return (
    <ModelSettingsProvider billingTier={normalizeUserTier(sessionUser?.billingTier)}>
      <div className="h-screen min-h-0 flex flex-col overflow-hidden bg-background text-foreground">
      <header className="ide-shell-header flex h-14 shrink-0 items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Logo className="w-9 h-9" />
          <div className="min-w-0">
            <p className="font-headline text-lg leading-tight text-primary">nebulla beta</p>
            <p className="text-xs leading-tight text-muted-foreground">
              IDE Workspace
              <span
                className="ml-2 font-mono text-[10px] text-muted-foreground/80 tabular-nums"
                title="Client bundle build id — if this does not match your latest deploy, clear cache or hard-refresh"
              >
                · {__NEBULLA_BUILD_ID__}
              </span>
            </p>
          </div>
        </div>
        <div className="min-w-0 flex-1 flex justify-center px-2">
          <p
            className="truncate text-center text-sm text-muted-foreground tabular-nums"
            title={projectName}
          >
            <span className="text-muted-foreground/80">Project</span>{' '}
            <span className="text-foreground">{projectName}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <WorkspaceSwarmButton onOpenProjectSettings={() => setMainPanel('project-settings')} />
          {sessionUser ? (
            <span
              className="text-xs text-muted-foreground max-w-[200px] truncate hidden sm:inline"
              title={sessionUser.email || sessionUser.displayName || undefined}
            >
              {sessionUser.email || sessionUser.displayName || 'Signed in'}
            </span>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <a href={withProjectQuery('/api/cloud-project/download')} download>
              Download project
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSignOut()}
            title="Sign out"
            className="inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden />
            Sign out
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAppStage('landing')}>
            Home
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden bg-gradient-to-b from-background via-muted/15 to-background">
        <aside
          className={`ide-nav-rail relative shrink-0 flex flex-col items-center gap-3 border-r transition-[width,opacity] duration-200 overflow-hidden ${
            navCollapsed ? 'w-0 border-transparent opacity-0 pointer-events-none' : 'w-16 opacity-100 py-4'
          }`}
        >
          {!navCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setNavCollapsed(true)}
                className="absolute top-2 right-0 z-10 translate-x-1/2 rounded-full border border-border bg-sidebar p-1 text-muted-foreground hover:text-primary hover:border-ring/40"
                title="Collapse navigation"
                aria-label="Collapse navigation"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </button>
              <NavBtn panel="source-control" title="Source Control">
                <FolderGit2 className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="nebula-ui-studio" title="UI Studio">
                <Palette className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="mind-map" title="Mind Map">
                <Network className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="master-plan" title="Master Plan">
                <BookOpen className="w-5 h-5" />
              </NavBtn>
              <div className="my-1 h-px w-8 bg-border" />
              <NavBtn panel="my-projects" title="My Projects">
                <LayoutGrid className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="secrets" title="Secrets">
                <Key className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="project-settings" title="Project Settings">
                <Server className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="dns" title="DNS & Domains">
                <Globe className="w-5 h-5" />
              </NavBtn>
              <div className="my-1 h-px w-8 bg-border" />
              <NavBtn panel="user-profile" title="User Profile">
                <User className="w-5 h-5" />
              </NavBtn>
            </>
          ) : null}
        </aside>
        {navCollapsed ? (
          <button
            type="button"
            onClick={() => setNavCollapsed(false)}
            className="ide-nav-rail flex shrink-0 w-7 flex-col items-center justify-center border-r text-muted-foreground hover:bg-sidebar-accent/60 hover:text-primary"
            title="Show navigation"
            aria-label="Show navigation"
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        ) : null}

        <section className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <div className="ide-panel-strip flex h-10 shrink-0 items-center border-b px-4 text-sm font-medium text-foreground">
            {PANEL_LABEL[mainPanel]}
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ left: previewToolRailPx }}
            >
              {renderCenter()}
            </div>
            <AppPreviewPanel
              pages={pages}
              toolRailWidthPx={previewToolRailPx}
              sourceControlActive={mainPanel === 'source-control'}
              onOpenSourceControl={() => setMainPanel('source-control')}
              onToolRailResizeMouseDown={(e) => {
                e.preventDefault();
                previewRailDrag.current = {
                  startX: e.clientX,
                  startW: previewToolRailPxRef.current,
                };
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
            />
          </div>

          <button
            type="button"
            aria-label="Resize terminal height"
            title="Drag to resize terminal"
            onMouseDown={(e) => {
              e.preventDefault();
              terminalResizeDrag.current = {
                startY: e.clientY,
                startH: terminalHeightRef.current,
              };
              document.body.style.cursor = 'row-resize';
              document.body.style.userSelect = 'none';
            }}
            className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center border-t border-border bg-border/30 hover:bg-primary/25"
          >
            <span className="h-0.5 w-10 rounded-full bg-muted-foreground/40 group-hover:bg-primary/60" />
          </button>

          <div
            className="ide-terminal-shell flex shrink-0 flex-col overflow-hidden border-t"
            style={{ height: terminalHeightPx }}
          >
            <div className="ide-panel-strip flex h-8 items-center gap-2 border-b px-3 text-xs font-medium text-foreground">
              <Terminal className="w-4 h-4" />
              Terminal
            </div>
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap p-3 font-mono text-xs text-muted-foreground">
              {terminalOutput.map((line, i) => (
                <div key={i} className={line.startsWith('$ ') ? 'text-primary' : ''}>
                  {line}
                </div>
              ))}
            </div>
            <form
              className="h-9 border-t border-border px-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!terminalInput.trim()) return;
                const cmd = terminalInput;
                setTerminalInput('');
                void runTerminalCommand(cmd);
              }}
            >
              <span className="font-mono text-xs text-primary">$</span>
              <input
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                disabled={terminalBusy}
                placeholder={terminalBusy ? 'Running…' : 'Type a command and press Enter (cloud workspace)'}
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
              />
              <button
                type="submit"
                disabled={terminalBusy || !terminalInput.trim()}
                className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground disabled:opacity-40 hover:bg-muted/50"
              >
                Run
              </button>
              <button
                type="button"
                className="rounded border border-border/80 px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/40"
                onClick={() => setTerminalOutput([])}
              >
                Clear
              </button>
            </form>
            <div className="flex h-6 items-center border-t border-border/60 px-3 text-[10px] text-muted-foreground/80">
              cloud workspace: {activeProjectKey}
            </div>
          </div>
        </section>

        <button
          type="button"
          aria-label="Resize assistant panel"
          title="Drag to resize chat"
          onMouseDown={(e) => {
            e.preventDefault();
            resizeDrag.current = { startX: e.clientX, startW: assistantWidth };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border/40 hover:bg-primary/35"
        >
          <GripVertical className="pointer-events-none h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden />
        </button>

        <AssistantSidebar
          width={assistantWidth}
          userId={sessionUser?.uid ?? 'anonymous'}
          projectName={projectName}
          activeProjectKey={activeProjectKey}
          codeMode={codeMode}
          onExitCodeMode={() => {
            setCodeMode(false);
            setMainPanel('master-plan');
          }}
        />
      </main>
    </div>
    </ModelSettingsProvider>
  );
}

export default App;
