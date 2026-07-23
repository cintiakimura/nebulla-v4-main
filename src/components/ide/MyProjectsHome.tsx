import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderOpen,
  Github,
  Loader2,
  MessageCircle,
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
  fetchSessionUser,
  listCloudProjectsDetailed,
  selectCloudProjectByName,
  setWorkspaceModePreference,
} from '../../lib/nebulaCloud';
import {
  dispatchChatOpenFile,
  dispatchStartFreeChat,
} from '../../lib/ideHomeEvents';
import { ChatFilePreview } from './ChatFilePreview';
import { openGitHubFile, openLocalFile } from '../../lib/fileOperations';
import type { SmartChatFilePreview } from '../../lib/smartChatHandler';

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

/**
 * Default post-login home — My Projects + quick actions.
 */
export function MyProjectsHome() {
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listNote, setListNote] = useState<string | null>(null);
  const [fileModal, setFileModal] = useState<FileModalMode>(null);
  const [fileInput, setFileInput] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState<SmartChatFilePreview | null>(null);

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

  const activeKey = getBrowserProjectKey();

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
    } finally {
      setFileBusy(false);
    }
  }, [fileInput, fileModal]);

  const quickActions = useMemo(
    () => [
      {
        id: 'local' as const,
        title: 'Open existing file',
        blurb: 'Look at a file already in your project — great when you know where to start.',
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

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-12 sm:px-10 sm:py-16">
        <header className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
            Nebulla
          </p>
          <h1 className="font-headline text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            My Projects
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
            Welcome back. Open something you already started, or pick a simple way to begin.
          </p>
        </header>

        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="font-headline text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              New Project
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Choose how you want to start. No rush — each option is a clear next step.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  className="flex min-h-[11.5rem] flex-col items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:border-cyan-500/35 hover:bg-cyan-500/5"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="space-y-1.5">
                    <span className="block text-sm font-semibold text-foreground">
                      {action.title}
                    </span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {action.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Your projects</h2>
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
            <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
              <p className="text-sm leading-relaxed text-muted-foreground">
                No projects yet. Pick an option under{' '}
                <span className="text-foreground">New Project</span> to get started.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
              {projects.map((p) => {
                const isActive = p.key === activeKey || p.name === getBrowserProjectName();
                return (
                  <li
                    key={`${p.source}-${p.key}`}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 px-5 py-4',
                      isActive && 'bg-cyan-500/[0.06]',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {p.name}
                        {isActive ? (
                          <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-cyan-400/90">
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
                      className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/5"
                    >
                      Open
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {fileModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">
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
              className="mt-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground outline-none ring-cyan-500/40 focus:ring"
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
                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
              <button
                type="button"
                disabled={fileBusy}
                onClick={() => void submitFileModal()}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
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
