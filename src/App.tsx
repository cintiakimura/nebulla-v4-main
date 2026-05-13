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
  Save,
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
import { ExecutionRulesViewer } from './components/ExecutionRulesViewer';
import { Logo } from './components/Logo';
import { SourceControlPanel } from './components/SourceControlPanel';
import { UserProfilePage } from './components/UserProfilePage';
import { AppPreviewPanel } from './components/AppPreviewPanel';
import { readResponseJson } from './lib/apiFetch';
import { fetchSessionUser, listCloudProjects, logoutNebula, type CloudProjectRow, type NebulaSessionUser } from './lib/nebulaCloud';
import { setBrowserProjectKey, setBrowserProjectName, withProjectQuery, withProjectBody } from './lib/nebulaProjectApi';

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
  'nebula-ui-studio': 'Nebulla UI Studio',
  'mind-map': 'Mind Map',
  'master-plan': 'Master Plan',
  'project-rules': 'Project execution rules (code mode)',
  'source-control': 'Source control',
  'my-projects': 'My Projects',
  secrets: 'Secrets',
  'project-settings': 'Project Settings',
  dns: 'DNS',
  'user-profile': 'User profile',
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
      if (!d) return;
      const delta = d.startX - e.clientX;
      const next = Math.min(560, Math.max(260, d.startW + delta));
      assistantWidthRef.current = next;
      setAssistantWidth(next);
    };
    const onUp = () => {
      if (resizeDrag.current) {
        try {
          localStorage.setItem('nebulla_assistant_width', String(assistantWidthRef.current));
        } catch {
          /* ignore */
        }
      }
      resizeDrag.current = null;
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
      className={`p-2 rounded-lg transition-colors ${
        mainPanel === panel ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-cyan-300'
      }`}
    >
      {children}
    </button>
  );

  if (appStage === 'landing') {
    return <LandingPage onEnter={() => setAppStage('sign-in')} />;
  }

  if (appStage === 'sign-in') {
    return <LoginScreen onAuthenticated={handleAuthenticated} onBack={() => setAppStage('landing')} />;
  }

  return (
    <div className="h-screen min-h-0 flex flex-col overflow-hidden bg-[#020C17] text-slate-100">
      <header className="h-16 shrink-0 border-b border-white/10 bg-[#040f1a]/70 backdrop-blur flex items-center gap-4 px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Logo className="w-9 h-9" />
          <div className="min-w-0">
            <p className="font-headline text-lg leading-tight text-cyan-300">nebulla beta</p>
            <p className="text-xs leading-tight text-slate-400">
              IDE Workspace
              <span
                className="ml-2 font-mono text-[10px] text-slate-600 tabular-nums"
                title="Client bundle build id — if this does not match your latest deploy, clear cache or hard-refresh"
              >
                · {__NEBULLA_BUILD_ID__}
              </span>
            </p>
          </div>
        </div>
        <div className="min-w-0 flex-1 flex justify-center px-2">
          <p
            className="truncate text-center text-sm text-slate-400 tabular-nums"
            title={projectName}
          >
            <span className="text-slate-500">Project</span>{' '}
            <span className="text-slate-200">{projectName}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {sessionUser ? (
            <span
              className="text-xs text-slate-500 max-w-[200px] truncate hidden sm:inline"
              title={sessionUser.email || sessionUser.displayName || undefined}
            >
              {sessionUser.email || sessionUser.displayName || 'Signed in'}
            </span>
          ) : null}
          <a
            href={withProjectQuery('/api/cloud-project/download')}
            className="text-xs px-3 py-1.5 rounded-md border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10"
            download
          >
            Download project
          </a>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-xs px-3 py-1.5 rounded-md border border-white/15 text-slate-300 hover:text-white hover:border-white/30 inline-flex items-center gap-1.5"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden />
            Sign out
          </button>
          <button
            type="button"
            onClick={() => setAppStage('landing')}
            className="text-xs px-3 py-1.5 rounded-md border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
          >
            Home
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden bg-gradient-to-b from-[#0d0824] via-[#060c18] to-[#020810]">
        <aside
          className={`relative shrink-0 border-r border-white/10 bg-[#040f1a]/40 flex flex-col items-center py-4 gap-3 transition-[width,opacity] duration-200 overflow-hidden ${
            navCollapsed ? 'w-0 border-transparent opacity-0 pointer-events-none' : 'w-16 opacity-100'
          }`}
        >
          {!navCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setNavCollapsed(true)}
                className="absolute top-2 right-0 z-10 translate-x-1/2 rounded-full border border-white/15 bg-[#040f1a] p-1 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40"
                title="Collapse navigation"
                aria-label="Collapse navigation"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </button>
              <NavBtn panel="source-control" title="Source control">
                <FolderGit2 className="w-5 h-5" />
              </NavBtn>
              <button
                type="button"
                title="Save / Commit"
                aria-label="Save / Commit"
                onClick={() => setMainPanel('source-control')}
                className={`p-2 rounded-lg transition-colors ${
                  mainPanel === 'source-control' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-cyan-300'
                }`}
              >
                <Save className="w-5 h-5" />
              </button>
              <NavBtn panel="nebula-ui-studio" title="Nebulla UI Studio">
                <Palette className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="mind-map" title="Mind Map">
                <Network className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="master-plan" title="Master Plan">
                <BookOpen className="w-5 h-5" />
              </NavBtn>
              <div className="w-8 h-px bg-white/10 my-1" />
              <NavBtn panel="my-projects" title="My Projects">
                <LayoutGrid className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="secrets" title="Secrets">
                <Key className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="project-settings" title="Project Settings">
                <Server className="w-5 h-5" />
              </NavBtn>
              <NavBtn panel="dns" title="DNS">
                <Globe className="w-5 h-5" />
              </NavBtn>
              <div className="w-8 h-px bg-white/10 my-1" />
              <NavBtn panel="user-profile" title="User profile">
                <User className="w-5 h-5" />
              </NavBtn>
            </>
          ) : null}
        </aside>
        {navCollapsed ? (
          <button
            type="button"
            onClick={() => setNavCollapsed(false)}
            className="shrink-0 w-7 border-r border-white/10 bg-[#040f1a]/60 flex flex-col items-center justify-center text-slate-500 hover:text-cyan-300 hover:bg-white/5"
            title="Show navigation"
            aria-label="Show navigation"
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        ) : null}

        <section className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <div className="h-10 shrink-0 border-b border-white/10 bg-[#060a14]/80 px-4 flex items-center text-sm text-cyan-200">
            {PANEL_LABEL[mainPanel]}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden relative min-h-0">
            {/* Reserve w-10 for vertical App preview rail; main IDE fills the rest */}
            <div className="absolute inset-0 left-10 overflow-hidden">{renderCenter()}</div>
            <AppPreviewPanel pages={pages} />
          </div>

          <div className="h-36 min-h-[6rem] max-h-[45vh] shrink-0 border-t border-white/10 bg-[#040f1a]/70 flex flex-col resize-y overflow-auto">
            <div className="h-8 border-b border-white/10 px-3 flex items-center gap-2 text-xs text-cyan-300">
              <Terminal className="w-4 h-4" />
              Terminal
            </div>
            <div className="flex-1 p-3 font-mono text-xs text-slate-400 overflow-y-auto whitespace-pre-wrap">
              {terminalOutput.map((line, i) => (
                <div key={i} className={line.startsWith('$ ') ? 'text-cyan-400' : ''}>
                  {line}
                </div>
              ))}
            </div>
            <form
              className="h-9 border-t border-white/10 px-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!terminalInput.trim()) return;
                const cmd = terminalInput;
                setTerminalInput('');
                void runTerminalCommand(cmd);
              }}
            >
              <span className="text-cyan-400 font-mono text-xs">$</span>
              <input
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                disabled={terminalBusy}
                placeholder={terminalBusy ? 'Running…' : 'Type a command and press Enter (cloud workspace)'}
                className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={terminalBusy || !terminalInput.trim()}
                className="text-[10px] px-2 py-1 rounded border border-white/15 text-slate-300 disabled:opacity-40"
              >
                Run
              </button>
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-500 hover:text-slate-300"
                onClick={() => setTerminalOutput([])}
              >
                Clear
              </button>
            </form>
            <div className="h-6 border-t border-white/5 px-3 flex items-center text-[10px] text-slate-500">
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
          className="w-1.5 shrink-0 cursor-col-resize hover:bg-cyan-500/35 bg-white/5 flex items-center justify-center group"
        >
          <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 pointer-events-none" aria-hidden />
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
  );
}

export default App;
