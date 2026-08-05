import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderOpen,
  Github,
  Globe2,
  LayoutTemplate,
  Loader2,
  MessageCircle,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  setBrowserProjectKey,
  setBrowserProjectName,
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
import {
  setPendingStartMode,
  type IdeStartMode,
} from '../../lib/ideStartMode';
import { resetProjectFromScratch } from '../../lib/ideProjectReset';
import { shortNameFromIdea } from '../../lib/projectNameFromIdea';
import { ChatFilePreview } from './ChatFilePreview';
import { openGitHubFile, openLocalFile } from '../../lib/fileOperations';
import type { SmartChatFilePreview } from '../../lib/smartChatHandler';
import { useIdeWorkspace } from './IdeWorkspaceContext';

export { shortNameFromIdea } from '../../lib/projectNameFromIdea';

type ListedProject = {
  key: string;
  name: string;
  updatedAt: string;
  source: 'guest' | 'cloud' | 'current';
};

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
 * Default post-login home — My Projects + quick actions.
 */
export function MyProjectsHome() {
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
  const [ideaError, setIdeaError] = useState('');
  const [startingIdea, setStartingIdea] = useState(false);
  /** Inference-first (default) vs Full architecture interview (opt-in). */
  const [startMode, setStartMode] = useState<IdeStartMode>('fast_prototype');

  const busyStarting = Boolean(startingType) || startingIdea;
  const activeKey = getBrowserProjectKey();
  /** Existing workspace → demote New Project hero so it doesn't fight Code / explorer. */
  const hasExistingWork =
    workspacePaths.length > 0 ||
    openFileTabs.length > 0 ||
    (Boolean(activeKey) && activeKey !== 'default' && projects.length > 0);

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

  const onOpenProject = useCallback(async (p: ListedProject) => {
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
    window.location.reload();
  }, []);

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
      try {
        // Type chips: inference-first with platform pre-set (Guided is opt-in via the other card).
        setPendingStartMode('fast_prototype');
        markGuidedStartOnReady();
        await resetProjectFromScratch(type);
        await ensureProjectOrReuse(type);
        // Persist after reset/create so projectKey is current (UI Studio device framing).
        setPendingProjectType(type);
        window.location.reload();
      } catch (err) {
        console.error('[MyProjectsHome] start typed project failed', err);
        setStartingType(null);
        const msg = err instanceof Error ? err.message : 'Could not start the project.';
        window.alert(msg);
      }
    },
    [busyStarting, ensureProjectOrReuse],
  );

  const onStartFromIdea = useCallback(async () => {
    if (busyStarting) return;
    const idea = ideaInput.trim();
    if (idea.length < 8) {
      setIdeaError(
        startMode === 'fast_prototype'
          ? 'Add a short goal (what the app does) — Fast Prototype needs at least one clear sentence.'
          : 'Describe your idea in a sentence or two (at least a few words).',
      );
      return;
    }
    setIdeaError('');
    setStartingIdea(true);
    try {
      const label = shortNameFromIdea(idea);
      // Idea + mode before reset (reset clears pending project type only).
      setPendingProjectIdea(idea);
      setPendingStartMode(startMode);
      markGuidedStartOnReady();
      await resetProjectFromScratch(label);
      await ensureProjectOrReuse(label);
      // After reset/create so projectKey is current (same order as typed-chip start).
      if (ideaType) setPendingProjectType(ideaType);
      window.location.reload();
    } catch (err) {
      console.error('[MyProjectsHome] start from idea failed', err);
      setStartingIdea(false);
      const msg = err instanceof Error ? err.message : 'Could not start the project. Try again.';
      setIdeaError(msg);
    }
  }, [busyStarting, ideaInput, ideaType, ensureProjectOrReuse, startMode]);

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
      <section className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-base font-normal tracking-tight text-foreground">
            {hasExistingWork ? 'Start another project' : 'New Project'}
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {hasExistingWork
              ? 'Create a separate project when you are ready. Your current workspace stays in the explorer and Code tab.'
              : 'Choose how to start, then describe what you want to build.'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-black p-5">
          <p className="text-sm text-foreground">How do you want to start?</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busyStarting}
              aria-pressed={startMode === 'fast_prototype'}
              onClick={() => setStartMode('fast_prototype')}
              className={cn(
                'rounded-xl border px-3 py-3 text-left transition',
                startMode === 'fast_prototype'
                  ? 'border-foreground/40 bg-[#111111] text-foreground'
                  : 'border-border text-muted-foreground hover:bg-[#111111] hover:text-foreground',
              )}
            >
              <span className="block text-xs font-medium text-foreground">
                Inference-first (default)
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed">
                Categorize, research, draft Master Plan, then build. Edit assumptions after the draft.
              </span>
            </button>
            <button
              type="button"
              disabled={busyStarting}
              aria-pressed={startMode === 'guided'}
              onClick={() => setStartMode('guided')}
              className={cn(
                'rounded-xl border px-3 py-3 text-left transition',
                startMode === 'guided'
                  ? 'border-foreground/40 bg-[#111111] text-foreground'
                  : 'border-border text-muted-foreground hover:bg-[#111111] hover:text-foreground',
              )}
            >
              <span className="block text-xs font-medium text-foreground">Full architecture interview</span>
              <span className="mt-1 block text-[11px] leading-relaxed">
                Opt-in: guided Master Plan questions one at a time when you want to brainstorm.
              </span>
            </button>
          </div>

          <label htmlFor="nebula-project-idea" className="mt-5 flex items-center gap-2 text-sm text-foreground">
            <Sparkles className="h-4 w-4 text-foreground/60" aria-hidden />
            {startMode === 'fast_prototype' ? 'Short goal / brief' : 'Start with a prompt'}
          </label>
          <textarea
            id="nebula-project-idea"
            value={ideaInput}
            onChange={(e) => {
              setIdeaInput(e.target.value);
              if (ideaError) setIdeaError('');
            }}
            rows={hasExistingWork ? 3 : 4}
            disabled={busyStarting}
            placeholder={
              startMode === 'fast_prototype'
                ? 'e.g. A mobile education app for kids to practice reading…'
                : 'e.g. A mobile app for freelancers to track invoices and get paid reminders…'
            }
            className="mt-3 w-full resize-y rounded-xl border border-border bg-[#0a0a0a] px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none ring-primary/25 placeholder:text-muted-foreground/70 focus:ring disabled:opacity-60"
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {startMode === 'fast_prototype'
              ? 'Fast Prototype will infer industry standards and generate a first draft. Optional platform chip below.'
              : 'Continue moves your prompt into chat for the guided interview. Optional type so we skip that question later:'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROJECT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busyStarting}
                onClick={() => setIdeaType((prev) => (prev === t.id ? null : t.id))}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition',
                  ideaType === t.id
                    ? 'border-foreground/40 bg-[#111111] text-foreground'
                    : 'border-border text-muted-foreground hover:bg-[#111111] hover:text-foreground',
                )}
              >
                {t.title}
              </button>
            ))}
          </div>
          {ideaError ? <p className="mt-2 text-xs text-rose-300">{ideaError}</p> : null}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={busyStarting || ideaInput.trim().length < 8}
              onClick={() => void onStartFromIdea()}
              className="btn-cyan inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {startingIdea ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Continue
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-normal text-foreground">
            {hasExistingWork ? 'Or choose a type for a new project' : 'Or choose a type'}
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Pick a platform and start inference-first (goal asked once if missing). For guided Q&A, choose Full architecture interview above.
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
                className="inline-flex items-center gap-2 rounded-full border border-border bg-black px-3 py-2 text-xs font-normal text-foreground transition hover:bg-[#111111] disabled:cursor-wait disabled:opacity-60"
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
    </>
  );

  const continueSection = (
    <section className="space-y-3">
      <h2 className="text-base font-normal text-foreground">
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
              title={action.blurb}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-transparent px-3 py-2 text-xs font-normal text-muted-foreground transition hover:bg-[#111111] hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {action.title}
            </button>
          );
        })}
      </div>
    </section>
  );

  const projectsSection = (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-normal text-foreground">Your projects</h2>
        {loadingList ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-xs text-muted-foreground">{projects.length} total</span>
        )}
      </div>

      {listNote ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
          {listNote}
        </p>
      ) : null}

      {projects.length === 0 && !loadingList ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            No projects yet. Start with a prompt above, or pick{' '}
            <span className="text-foreground">Web App</span>,{' '}
            <span className="text-foreground">Mobile App</span>, or{' '}
            <span className="text-foreground">Landing Page</span>.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {projects.map((p) => {
            const isActive = p.key === activeKey || p.name === getBrowserProjectName();
            return (
              <li
                key={`${p.source}-${p.key}`}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 px-5 py-4',
                  isActive && 'bg-[#111111]',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-normal text-foreground">
                    {p.name}
                    {isActive ? (
                      <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                        Active
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Last modified {formatWhen(p.updatedAt)}
                    {p.source === 'cloud' ? ' · Cloud' : p.source === 'guest' ? ' · Local' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onOpenProject(p)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-normal text-foreground hover:bg-[#111111]"
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-4 sm:px-10 sm:py-6">
        {hasExistingWork ? (
          <>
            {projectsSection}
            {continueSection}
            {newProjectSection}
          </>
        ) : (
          <>
            {newProjectSection}
            {continueSection}
            {projectsSection}
          </>
        )}
      </div>

      {fileModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-[#0a0a0a] p-5 shadow-2xl">
            <h3 className="text-base font-normal text-foreground">
              {fileModal === 'github' ? 'Open from GitHub' : 'Open existing file'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
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
              className="mt-4 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-foreground outline-none ring-primary/25 focus:ring"
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
                className="rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
              <button
                type="button"
                disabled={fileBusy}
                onClick={() => void submitFileModal()}
                className="btn-cyan inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
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
