import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  Github,
  Globe2,
  LayoutTemplate,
  Loader2,
  MessageCircle,
  Mic,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  setBrowserProjectKey,
  setBrowserProjectName,
  withProjectQuery,
} from '../../lib/nebulaProjectApi';
import {
  readGuestIndex,
  writeActiveGuestProjectId,
} from '../../lib/nebulaProjectStore';
import {
  createProjectForCurrentSession,
  fetchSessionUser,
  listCloudProjectsDetailed,
  renameActiveProjectDisplayName,
  selectCloudProjectByName,
  setWorkspaceModePreference,
} from '../../lib/nebulaCloud';
import {
  dispatchChatOpenFile,
  dispatchStartFreeChat,
  markGuidedStartOnReady,
  setPendingProjectIdea,
  setPendingProjectType,
  type NebulaProjectType,
} from '../../lib/ideHomeEvents';
import { setPendingStartMode } from '../../lib/ideStartMode';
import { resetProjectFromScratch } from '../../lib/ideProjectReset';
import { inferProductName } from '../../lib/projectNameFromIdea';
import { persistProductIdentityClient } from '../../lib/productIdentityClient';
import { ChatFilePreview } from './ChatFilePreview';
import { openGitHubFile, openLocalFile } from '../../lib/fileOperations';
import type { SmartChatFilePreview } from '../../lib/smartChatHandler';
import { useIdeWorkspace } from './IdeWorkspaceContext';
import { markEnterBuildScreen } from '../../lib/ideShellScreens';
import { readStoredWorkspaceLiveUrl } from '../../lib/workspaceLiveUrl';
import { resetGuidedCycle } from '../../lib/guidedFunnel';

export { shortNameFromIdea } from '../../lib/projectNameFromIdea';

type ListedProject = {
  key: string;
  name: string;
  updatedAt: string;
  source: 'guest' | 'cloud' | 'current';
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'N';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Recently';
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

type FileModalMode = 'local' | 'github' | null;

const PROJECT_TYPES: {
  id: NebulaProjectType;
  title: string;
  blurb: string;
  icon: typeof Globe2;
}[] = [
  {
    id: 'Web App',
    title: 'Web App',
    blurb: 'Multi-page product in the browser — dashboards, accounts, workflows.',
    icon: Globe2,
  },
  {
    id: 'Mobile App',
    title: 'Mobile App',
    blurb: 'Mobile-first experience — touch UI, compact layouts, app-like flows.',
    icon: Smartphone,
  },
  {
    id: 'Landing Page',
    title: 'Landing Page',
    blurb: 'Marketing or launch site — hero, story, and conversion-focused sections.',
    icon: LayoutTemplate,
  },
];

/**
 * My Projects — IDE center pane (`ide`) or client Dashboard (`dashboard`).
 */
export function MyProjectsHome({
  variant = 'ide',
}: {
  /** `dashboard` = projects home (new project + list). `ide` keeps file/chat continue actions. */
  variant?: 'ide' | 'dashboard';
}) {
  const isDashboard = variant === 'dashboard';
  const { workspacePaths, tabs: openFileTabs } = useIdeWorkspace();
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listNote, setListNote] = useState<string | null>(null);
  const [fileModal, setFileModal] = useState<FileModalMode>(null);
  const [fileInput, setFileInput] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState<SmartChatFilePreview | null>(null);
  const [startingType, setStartingType] = useState<NebulaProjectType | null>(null);
  const [ideaInput, setIdeaInput] = useState('');
  const [ideaType, setIdeaType] = useState<NebulaProjectType | null>(null);
  const [startError, setStartError] = useState('');
  const [startingIdea, setStartingIdea] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const busyStarting = Boolean(startingType) || startingIdea;

  const toggleMic = useCallback(() => {
    const w = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setStartError('Voice input is not supported in this browser.');
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setIdeaInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setStartError('');
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    setStartError('');
    rec.start();
  }, [listening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);
  const activeKey = getBrowserProjectKey();
  const activeName = getBrowserProjectName().trim();
  /** Empty free-tier / default shell — keep Start prompt as the primary action. */
  const isPlaceholderWorkspace = /^untitled(\s+project)?$/i.test(activeName || '');
  /** Real product work in progress → demote New Project so Code / explorer stay primary. */
  const hasExistingWork =
    !isDashboard &&
    !isPlaceholderWorkspace &&
    (workspacePaths.length > 0 ||
      openFileTabs.length > 0 ||
      (Boolean(activeKey) && activeKey !== 'default' && projects.length > 0));
  /** Always show goal-first hero for Untitled shells (deployed fix is behavioral + this UX). */
  const showStartHeroFirst = isDashboard || !hasExistingWork || isPlaceholderWorkspace;
  const activeLiveUrl = readStoredWorkspaceLiveUrl();

  const enterBuild = useCallback(() => {
    resetGuidedCycle();
    markEnterBuildScreen();
    window.location.reload();
  }, []);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    setListNote(null);
    try {
      const guest = readGuestIndex().map((e) => ({
        key: e.id,
        name: e.name,
        updatedAt: e.updatedAt,
        source: 'guest' as const,
      }));

      let cloud: ListedProject[] = [];
      try {
        const user = await fetchSessionUser();
        if (user?.uid) {
          const listed = await listCloudProjectsDetailed();
          if (!listed.ok) {
            setListNote(
              listed.error === 'unauthorized'
                ? 'Session expired — sign in again to see cloud projects.'
                : listed.error === 'unavailable'
                  ? 'Cloud database is unavailable right now. Local projects still show below.'
                  : 'Could not load cloud projects. Local projects still show below.',
            );
          } else {
            cloud = listed.projects.map((r) => ({
              key: `cloud:${r.name}`,
              name: r.name,
              updatedAt: r.updated_at || new Date().toISOString(),
              source: 'cloud' as const,
            }));
          }
        }
      } catch {
        /* guest-only is fine */
      }

      const ck = getBrowserProjectKey();
      const currentName = getBrowserProjectName().trim() || ck;
      const merged = [...cloud, ...guest];
      if (
        currentName &&
        ck &&
        ck !== 'default' &&
        !merged.some((p) => p.key === ck || p.name === currentName || p.key === `cloud:${currentName}`)
      ) {
        merged.unshift({
          key: ck,
          name: currentName,
          updatedAt: new Date().toISOString(),
          source: 'current',
        });
      }

      merged.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      setProjects(merged);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const onOpenProject = useCallback(
    async (p: ListedProject) => {
      if (p.source === 'cloud') {
        const ok = await selectCloudProjectByName(p.name);
        if (!ok) {
          setBrowserProjectName(p.name);
          setWorkspaceModePreference('cloud');
          try {
            localStorage.setItem('nebula_active_cloud_project_name_v1', p.name);
          } catch {
            /* ignore */
          }
        }
      } else {
        setWorkspaceModePreference('guest');
        setBrowserProjectKey(p.key);
        writeActiveGuestProjectId(p.key);
        setBrowserProjectName(p.name);
      }
      enterBuild();
    },
    [enterBuild],
  );

  /** Free plan: 1 project — if create fails, reuse + rename so the idea isn't stuck as Untitled. */
  const ensureProjectOrReuse = useCallback(async (label: string) => {
    const wanted = label.trim() || 'New Project';
    try {
      await createProjectForCurrentSession(wanted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/1 project|upgrade|Pricing/i.test(msg)) throw err;
      const existing = getBrowserProjectName().trim();
      if (existing) {
        try {
          await selectCloudProjectByName(existing);
        } catch {
          /* guest / already bound */
        }
      }
      try {
        const user = await fetchSessionUser();
        await renameActiveProjectDisplayName(wanted, user?.uid ? 'cloud' : 'guest');
      } catch {
        setBrowserProjectName(wanted);
      }
    }
  }, []);

  const onStartTypedProject = useCallback(
    async (type: NebulaProjectType) => {
      if (busyStarting) return;
      setStartingType(type);
      setStartError('');
      try {
        // Platform chip → inference-first; chat asks for the goal if still missing.
        setPendingStartMode('fast_prototype');
        markGuidedStartOnReady();
        const label = inferProductName('', type);
        await resetProjectFromScratch(label, { projectType: type });
        await ensureProjectOrReuse(label);
        void persistProductIdentityClient({ projectName: label, projectType: type });
        // Persist after reset/create so projectKey is current (UI Studio device framing).
        setPendingProjectType(type);
        enterBuild();
      } catch (err) {
        console.error('[MyProjectsHome] start typed project failed', err);
        setStartingType(null);
        const msg = err instanceof Error ? err.message : 'Could not start the project.';
        setStartError(msg);
      }
    },
    [busyStarting, ensureProjectOrReuse, enterBuild],
  );

  const onStartFromIdea = useCallback(async () => {
    if (busyStarting) return;
    const idea = ideaInput.trim();
    setStartError('');
    setStartingIdea(true);
    try {
      const label = idea
        ? inferProductName(idea, ideaType)
        : inferProductName('', ideaType || '');
      // Prompt optional — missing goal/platform is asked in chat after Continue.
      if (idea) setPendingProjectIdea(idea);
      setPendingStartMode('fast_prototype');
      markGuidedStartOnReady();
      await resetProjectFromScratch(label, { goal: idea, projectType: ideaType });
      await ensureProjectOrReuse(label);
      void persistProductIdentityClient({
        projectName: label,
        goal: idea,
        projectType: ideaType,
      });
      // After reset/create so projectKey is current (same order as typed-chip start).
      if (ideaType) setPendingProjectType(ideaType);
      enterBuild();
    } catch (err) {
      console.error('[MyProjectsHome] start from idea failed', err);
      setStartingIdea(false);
      const msg = err instanceof Error ? err.message : 'Could not start the project. Try again.';
      setStartError(msg);
    }
  }, [busyStarting, ideaInput, ideaType, ensureProjectOrReuse, enterBuild]);

  const onJustChat = useCallback(() => {
    dispatchStartFreeChat();
  }, []);

  const submitFileModal = useCallback(async () => {
    const value = fileInput.trim();
    if (!value) {
      setFileError(
        fileModal === 'github'
          ? 'Paste a public GitHub file link to continue.'
          : 'Enter a file path in your project (for example nebulla-project/full-bug-database.md).',
      );
      return;
    }
    setFileBusy(true);
    setFileError('');
    setPreview(null);
    try {
      if (fileModal === 'github') {
        dispatchChatOpenFile({ url: value });
        const opened = await openGitHubFile(value);
        if (opened.success === false) {
          setFileError(opened.userMessage);
          return;
        }
        setPreview({
          title: opened.url?.split('/').slice(-2).join('/') || 'GitHub file',
          source: 'github',
          pathOrUrl: opened.url || value,
          language: opened.language,
          content: opened.content,
        });
      } else {
        dispatchChatOpenFile({ path: value });
        const opened = await openLocalFile(value);
        if (opened.success === false) {
          setFileError(opened.userMessage);
          return;
        }
        setPreview({
          title: opened.path?.split('/').slice(-2).join('/') || value,
          source: 'local',
          pathOrUrl: opened.path || value,
          language: opened.language,
          content: opened.content,
        });
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not open that file.');
    } finally {
      setFileBusy(false);
    }
  }, [fileInput, fileModal]);

  const continueActions = useMemo(
    () => [
      {
        id: 'local' as const,
        title: 'Open existing file',
        blurb: 'Jump into a path already in this workspace.',
        icon: FolderOpen,
        onClick: () => {
          setFileModal('local');
          setFileInput('');
          setFileError('');
          setPreview(null);
        },
      },
      {
        id: 'github' as const,
        title: 'Open from GitHub',
        blurb: 'Paste a public GitHub file link and we will open it for you.',
        icon: Github,
        onClick: () => {
          setFileModal('github');
          setFileInput('');
          setFileError('');
          setPreview(null);
        },
      },
      {
        id: 'chat' as const,
        title: 'Just chat / Ask anything',
        blurb: 'Free mode — ask questions, explore ideas, no interview required.',
        icon: MessageCircle,
        onClick: onJustChat,
      },
    ],
    [onJustChat],
  );

  const newProjectSection = (
    <>
      <section className="space-y-3">
        <div className="space-y-1.5">
          <h2 className="type-section">
            {isDashboard
              ? 'New project'
              : isPlaceholderWorkspace
                ? 'Start with a prompt'
                : hasExistingWork
                  ? 'Start another project'
                  : 'New Project'}
          </h2>
          <p className="type-body-md max-w-xl text-muted-foreground">
            {isDashboard
              ? 'Describe what you want to build, pick a type, then Start — opens Build for that workspace.'
              : isPlaceholderWorkspace
                ? 'This workspace is still an empty Untitled shell. Add a prompt (optional platform), then Continue — research → Master Plan → UI mockup → code. Anything missing is asked in chat. Free plan reuses this project slot and renames it.'
                : hasExistingWork
                  ? 'Create a separate project when you are ready. Your current workspace stays in the explorer and Code tab.'
                  : 'Describe what you want to build. Missing details are asked in chat.'}
          </p>
        </div>

        <div className="ide-glass-card overflow-hidden rounded-lg border border-border">
          <label htmlFor="nebula-project-idea" className="type-label-sm flex items-center gap-2 px-4 pt-4">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-foreground">{isDashboard ? 'Goal / brief' : 'Prompt'}</span>
          </label>
          <p
            id="nebula-project-idea-tip"
            className="px-4 pt-1 text-[10px] italic leading-snug text-muted-foreground"
          >
            Pro tip: Add industry + who it’s for (education / kids & teachers, e-commerce / small shops…) for better research and speed.
          </p>
          <textarea
            id="nebula-project-idea"
            value={ideaInput}
            onChange={(e) => {
              setIdeaInput(e.target.value);
              if (startError) setStartError('');
            }}
            rows={hasExistingWork ? 3 : 4}
            disabled={busyStarting}
            aria-describedby="nebula-project-idea-tip"
            placeholder="e.g. Education app for kids and teachers to practice reading and track progress"
            className="ide-glass-input mt-2 w-full resize-y border-0 bg-transparent px-4 py-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5 md:px-4">
            <div className="flex flex-wrap gap-2">
              {PROJECT_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busyStarting}
                  aria-pressed={ideaType === t.id}
                  onClick={() => setIdeaType((prev) => (prev === t.id ? null : t.id))}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50',
                    ideaType === t.id ? 'btn-cyan' : 'btn-secondary-surface text-muted-foreground',
                  )}
                >
                  {t.title === 'Landing Page' ? 'Landing' : t.title}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                title={listening ? 'Stop listening' : 'Voice input'}
                aria-label={listening ? 'Stop listening' : 'Voice input'}
                disabled={busyStarting}
                onClick={toggleMic}
                className={cn(
                  'btn-secondary-surface btn-icon',
                  listening && 'border-[var(--shell-border-strong)] text-foreground',
                )}
              >
                <Mic className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={busyStarting}
                onClick={() => void onStartFromIdea()}
                className="btn-cyan inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {startingIdea ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {isDashboard ? 'Start' : 'Continue'}
              </button>
            </div>
          </div>
          {startError ? (
            <p className="type-label-sm border-t border-border px-4 py-2 text-muted-foreground">{startError}</p>
          ) : null}
        </div>
      </section>

      {!isDashboard ? (
        <section className="ide-glass-card space-y-3 rounded-lg border border-border p-4">
          <div className="space-y-1">
            <h2 className="type-section">
              {hasExistingWork ? 'Or choose a type for a new project' : 'Or choose a type'}
            </h2>
            <p className="type-body-md max-w-xl text-muted-foreground">
              Pick a platform to start. Chat asks for the goal if you have not written a prompt yet.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PROJECT_TYPES.map((action) => {
              const Icon = action.icon;
              const busy = startingType === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={busyStarting}
                  title={action.blurb}
                  onClick={() => void onStartTypedProject(action.id)}
                  className="btn-cyan inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs disabled:cursor-wait disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 text-foreground/60" />
                  )}
                  {action.title}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );

  const continueSection = (
    <section className="ide-glass-card space-y-3 rounded-lg border border-border p-4">
      <h2 className="type-section">
        {hasExistingWork ? 'Continue this workspace' : 'Or continue'}
      </h2>
      <div className="flex flex-wrap gap-2">
        {continueActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              title={action.title}
              aria-label={action.title}
              className="btn-secondary-surface btn-icon"
            >
              <Icon className="h-4 w-4" aria-hidden />
            </button>
          );
        })}
      </div>
    </section>
  );

  const projectsSection = (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-section">Your projects</h2>
        {loadingList ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span className="type-label-sm">{projects.length} total</span>
        )}
      </div>

      {listNote ? (
        <p className="type-label-sm rounded-md border border-border px-3 py-2">
          {listNote}
        </p>
      ) : null}

      {projects.length === 0 && !loadingList ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="type-body-md text-muted-foreground">
            No projects yet. Start with a prompt above, or pick{' '}
            <span className="text-foreground">Web App</span>,{' '}
            <span className="text-foreground">Mobile App</span>, or{' '}
            <span className="text-foreground">Landing Page</span>.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {projects.map((p) => {
            const isActive = p.key === activeKey || p.name === getBrowserProjectName();
            const previewSrc = isActive
              ? withProjectQuery(`/api/app-preview/bootstrap?_thumb=${encodeURIComponent(p.key)}`)
              : '';
            return (
              <li key={`${p.source}-${p.key}`}>
                <button
                  type="button"
                  onClick={() => void onOpenProject(p)}
                  className={cn(
                    'group flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors',
                    isActive
                      ? 'border-[var(--shell-border-strong)]'
                      : 'border-border hover:border-[var(--shell-border-strong)]',
                  )}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-[#1a1a1a]">
                    {isActive && previewSrc ? (
                      <div className="pointer-events-none absolute inset-0 overflow-hidden">
                        <iframe
                          title={`${p.name} preview`}
                          src={previewSrc}
                          tabIndex={-1}
                          className="absolute left-0 top-0 border-0 bg-transparent"
                          style={{
                            width: '400%',
                            height: '400%',
                            transform: 'scale(0.25)',
                            transformOrigin: 'top left',
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-full w-full flex-col items-center justify-center gap-2"
                        aria-hidden
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border text-sm text-foreground">
                          {projectInitials(p.name)}
                        </div>
                        <div className="h-px w-10 bg-border" />
                        <div className="flex w-3/5 flex-col gap-1.5 opacity-40">
                          <div className="h-1.5 rounded-full bg-border" />
                          <div className="h-1.5 w-4/5 rounded-full bg-border" />
                          <div className="h-1.5 w-2/3 rounded-full bg-border" />
                        </div>
                      </div>
                    )}
                    {isActive ? (
                      <span className="type-micro absolute left-2 top-2 rounded-md border border-border bg-[var(--shell-bg)]/90 px-1.5 py-0.5 uppercase tracking-wide">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1 border-t border-border px-3 py-2.5">
                    <p className="type-body-dense truncate text-foreground">{p.name}</p>
                    <p className="type-micro truncate">
                      {formatWhen(p.updatedAt)}
                      {p.source === 'cloud' ? ' · Cloud' : ' · Local'}
                    </p>
                    {isDashboard &&
                    activeLiveUrl &&
                    (p.key === activeKey || p.name === activeName) ? (
                      <a
                        href={activeLiveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="type-micro block truncate font-mono underline-offset-2 hover:underline"
                        title={activeLiveUrl}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Live URL
                      </a>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-transparent">
      <div
        className={cn(
          'mx-auto flex w-full flex-col gap-6 px-5 py-5 sm:px-6',
          isDashboard ? 'max-w-3xl' : 'max-w-3xl',
        )}
      >
        {showStartHeroFirst ? (
          <>
            {newProjectSection}
            {!isDashboard ? continueSection : null}
            {projectsSection}
          </>
        ) : (
          <>
            {projectsSection}
            {!isDashboard ? continueSection : null}
            {newProjectSection}
          </>
        )}
      </div>

      {!isDashboard && fileModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="ide-glass-card w-full max-w-md rounded-lg border border-border p-5">
            <h3 className="type-section">
              {fileModal === 'github' ? 'Open from GitHub' : 'Open existing file'}
            </h3>
            <p className="type-label-sm mt-1">
              {fileModal === 'github'
                ? 'Paste a public raw or blob GitHub URL.'
                : 'Example: nebulla-project/full-bug-database.md'}
            </p>
            <input
              value={fileInput}
              onChange={(e) => setFileInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitFileModal();
              }}
              placeholder={
                fileModal === 'github'
                  ? 'https://raw.githubusercontent.com/…'
                  : 'path/to/file.md'
              }
              className="ide-glass-input mt-4 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground outline-none"
              autoFocus
            />
            {fileError ? <p className="mt-2 text-xs text-rose-300">{fileError}</p> : null}
            {preview ? (
              <div className="mt-3 max-h-64 overflow-auto">
                <ChatFilePreview preview={preview} />
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFileModal(null)}
                className="btn-cyan inline-flex items-center rounded-lg px-4 py-2 text-xs opacity-80"
              >
                Close
              </button>
              <button
                type="button"
                disabled={fileBusy}
                onClick={() => void submitFileModal()}
                className="btn-cyan inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs disabled:opacity-50"
              >
                {fileBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Open
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
