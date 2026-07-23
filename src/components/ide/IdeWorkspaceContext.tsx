import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchJson } from '../../lib/apiFetch';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  withProjectBody,
  withProjectQuery,
} from '../../lib/nebulaProjectApi';
import {
  buildIdeSwarmFocusFromEditor,
  IDE_SWARM_FOCUS_SNIPPET_MAX,
  syncWindowSwarmFocusFromPayload,
} from '../../lib/ideSwarmFocus';
import {
  AI_CHAT_MODELS,
  DEFAULT_AI_CHAT_MODEL,
  normalizeAiChatModelId,
  type AiChatModelId,
} from '../../lib/aiProvider';

export type EditorTab = {
  path: string;
  content: string;
  dirty: boolean;
  loading: boolean;
};

/** IDE chat model catalog (Grok default; Claude / OpenAI via ModelSelector + TopBar). */
export const IDE_CHAT_MODELS = AI_CHAT_MODELS.map((m) => m.id);
export type IdeChatModelId = AiChatModelId;

type IdeWorkspaceValue = {
  /** Browser/server disk scope for APIs (guest UUID, `default`, etc.) — bumps after `refreshTree`. */
  diskProjectKey: string;
  workspacePaths: string[];
  /** Current git branch from `/api/source-control/overview`, when repo exists. */
  gitBranch: string | null;
  overviewLoading: boolean;
  overviewError: string | null;
  refreshTree: () => Promise<void>;
  tabs: EditorTab[];
  activePath: string | null;
  chatModel: IdeChatModelId;
  setChatModel: (id: IdeChatModelId) => void;
  openFile: (relativePath: string) => Promise<void>;
  setActivePath: (path: string | null) => void;
  updateActiveContent: (text: string) => void;
  /** Optional `contentOverride` when saving immediately after an in-memory edit (find/replace). */
  saveTab: (path: string, contentOverride?: string) => Promise<void>;
  /** Returns false if user cancelled (dirty tab). */
  closeTab: (path: string) => boolean;
  activeTab: EditorTab | null;
  saveError: string | null;
  clearSaveError: () => void;
};

const IdeWorkspaceContext = createContext<IdeWorkspaceValue | null>(null);

export function useIdeWorkspace(): IdeWorkspaceValue {
  const ctx = useContext(IdeWorkspaceContext);
  if (!ctx) throw new Error('useIdeWorkspace must be used within IdeWorkspaceProvider');
  return ctx;
}

export function IdeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [diskProjectKey, setDiskProjectKey] = useState(() => getBrowserProjectKey());
  const [workspacePaths, setWorkspacePaths] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [chatModel, setChatModelState] = useState<IdeChatModelId>(() => {
    try {
      return normalizeAiChatModelId(localStorage.getItem('nebula-chat-model-family'));
    } catch {
      return DEFAULT_AI_CHAT_MODEL;
    }
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const clearSaveError = useCallback(() => setSaveError(null), []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) ?? null,
    [tabs, activePath],
  );

  const setChatModel = useCallback((id: IdeChatModelId) => {
    const next = normalizeAiChatModelId(id);
    setChatModelState(next);
    try {
      localStorage.setItem('nebula-chat-model-family', next);
      window.dispatchEvent(new CustomEvent('nebula-chat-model-changed', { detail: { modelId: next } }));
    } catch {
      /* ignore */
    }
  }, []);

  const refreshTree = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await fetchJson<{
        nebulaFiles?: { relativePath: string }[];
        git?: { branch?: string } | null;
      }>(withProjectQuery('/api/source-control/overview'));
      const paths = (data.nebulaFiles ?? [])
        .map((f) => f.relativePath.replace(/\\/g, '/'))
        .sort((a, b) => a.localeCompare(b));
      setWorkspacePaths(paths);
      const b = data.git?.branch?.trim();
      setGitBranch(b && b !== 'unknown' && b !== '?' ? b : null);
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : String(e));
      setWorkspacePaths([]);
      setGitBranch(null);
    } finally {
      setOverviewLoading(false);
      setDiskProjectKey(getBrowserProjectKey());
    }
  }, []);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  useEffect(() => {
    const onRefresh = () => void refreshTree();
    window.addEventListener('nebula-files-applied', onRefresh);
    window.addEventListener('nebula-workspace-context-synced', onRefresh);
    return () => {
      window.removeEventListener('nebula-files-applied', onRefresh);
      window.removeEventListener('nebula-workspace-context-synced', onRefresh);
    };
  }, [refreshTree]);

  useEffect(() => {
    const payload = buildIdeSwarmFocusFromEditor(
      activePath,
      activeTab?.content ?? '',
      Boolean(activeTab?.loading),
    );
    syncWindowSwarmFocusFromPayload(payload);
  }, [activePath, activeTab]);

  const openFile = useCallback(async (relPath: string) => {
    const normalized = relPath.replace(/\\/g, '/');
    setSaveError(null);
    setActivePath(normalized);

    const existing = tabsRef.current.find((t) => t.path === normalized);
    if (existing && !existing.loading) {
      return;
    }
    if (!existing) {
      setTabs((prev) => {
        if (prev.some((t) => t.path === normalized)) return prev;
        return [...prev, { path: normalized, content: '', dirty: false, loading: true }];
      });
    } else if (existing.loading) {
      return;
    }

    try {
      const { content } = await fetchJson<{ content: string }>(
        withProjectQuery(`/api/files/content?path=${encodeURIComponent(normalized)}`),
      );
      setTabs((prev) =>
        prev.map((t) =>
          t.path === normalized ? { ...t, content, dirty: false, loading: false } : t,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === normalized
            ? { ...t, content: `// Load failed: ${msg}\n`, dirty: false, loading: false }
            : t,
        ),
      );
    }
  }, []);

  const updateActiveContent = useCallback(
    (text: string) => {
      if (!activePath) return;
      setTabs((prev) =>
        prev.map((t) => (t.path === activePath ? { ...t, content: text, dirty: true } : t)),
      );
    },
    [activePath],
  );

  const saveTab = useCallback(
    async (path: string, contentOverride?: string) => {
      const tab = tabsRef.current.find((t) => t.path === path);
      if (!tab && contentOverride === undefined) return;
      const content = contentOverride !== undefined ? contentOverride : tab?.content;
      if (content === undefined) return;
      if (contentOverride === undefined && !tab?.dirty) return;
      setSaveError(null);
      try {
        await fetchJson(withProjectQuery('/api/files/content'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withProjectBody({ path, content })),
        });
        setTabs((prev) =>
          prev.map((t) =>
            t.path === path ? { ...t, content, dirty: false } : t,
          ),
        );
        void refreshTree();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSaveError(msg);
        throw e;
      }
    },
    [refreshTree],
  );

  const closeTab = useCallback((path: string) => {
    const prev = tabsRef.current;
    const tab = prev.find((t) => t.path === path);
    if (tab?.dirty) {
      const ok = window.confirm(`Discard unsaved changes to ${path}?`);
      if (!ok) return false;
    }
    const idx = prev.findIndex((t) => t.path === path);
    const next = prev.filter((t) => t.path !== path);
    setTabs(next);
    setActivePath((cur) => {
      if (cur !== path) return cur;
      const pick = next[idx - 1] ?? next[idx] ?? next[0];
      return pick?.path ?? null;
    });
    return true;
  }, []);

  const value = useMemo<IdeWorkspaceValue>(
    () => ({
      diskProjectKey,
      workspacePaths,
      gitBranch,
      overviewLoading,
      overviewError,
      refreshTree,
      tabs,
      activePath,
      chatModel,
      setChatModel,
      openFile,
      setActivePath,
      updateActiveContent,
      saveTab,
      closeTab,
      activeTab,
      saveError,
      clearSaveError,
    }),
    [
      diskProjectKey,
      workspacePaths,
      gitBranch,
      overviewLoading,
      overviewError,
      refreshTree,
      tabs,
      activePath,
      chatModel,
      setChatModel,
      openFile,
      updateActiveContent,
      saveTab,
      closeTab,
      activeTab,
      saveError,
      clearSaveError,
    ],
  );

  return <IdeWorkspaceContext.Provider value={value}>{children}</IdeWorkspaceContext.Provider>;
}

export function ideContextSnippetForChat(
  path: string | null,
  content: string,
  maxLen = IDE_SWARM_FOCUS_SNIPPET_MAX,
  workspaceRootLabel?: string,
  extras?: { gitBranch?: string | null; openTabPaths?: string[] },
): string {
  const project = getBrowserProjectName().trim() || 'Untitled project';
  const key = getBrowserProjectKey();
  const root = workspaceRootLabel?.trim() || `data/cloud-projects/${key}`;
  const headLines = [
    `Active project: ${project}`,
    `Project key: ${key}`,
    `Workspace root: ${root}`,
    extras?.gitBranch ? `Git branch: ${extras.gitBranch}` : null,
    extras?.openTabPaths?.length
      ? `Open editor tabs: ${extras.openTabPaths.join(', ')}`
      : null,
    path ? `Active file: ${path}` : 'No file open in the editor.',
  ].filter(Boolean);
  const head = headLines.join('\n');
  if (!path) return `${head}\n`;
  const body = content.length > maxLen ? `${content.slice(0, maxLen)}\n\n… [truncated]` : content;
  return `${head}\n--- file contents ---\n${body}`;
}
