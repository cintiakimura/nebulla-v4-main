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
  getBrowserProjectName,
  withProjectBody,
  withProjectQuery,
} from '../../lib/nebulaProjectApi';
import {
  buildIdeSwarmFocusFromEditor,
  IDE_SWARM_FOCUS_SNIPPET_MAX,
  syncWindowSwarmFocusFromPayload,
} from '../../lib/ideSwarmFocus';

export type EditorTab = {
  path: string;
  content: string;
  dirty: boolean;
  loading: boolean;
};

export const IDE_CHAT_MODELS = ['grok-4.1', 'grok-3'] as const;
export type IdeChatModelId = (typeof IDE_CHAT_MODELS)[number];

type IdeWorkspaceValue = {
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
  saveTab: (path: string) => Promise<void>;
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
  const [workspacePaths, setWorkspacePaths] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [chatModel, setChatModelState] = useState<IdeChatModelId>('grok-4.1');
  const [saveError, setSaveError] = useState<string | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const clearSaveError = useCallback(() => setSaveError(null), []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) ?? null,
    [tabs, activePath],
  );

  const setChatModel = useCallback((id: IdeChatModelId) => {
    setChatModelState(id);
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
    }
  }, []);

  useEffect(() => {
    void refreshTree();
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
    const path = relPath.replace(/\\/g, '/');
    setSaveError(null);
    setActivePath(path);
    const existing = tabsRef.current.find((t) => t.path === path);
    if (existing && !existing.loading) {
      return;
    }
    if (!existing) {
      setTabs((prev) => [...prev, { path, content: '', dirty: false, loading: true }]);
    } else if (existing.loading) {
      return;
    }

    try {
      const { content } = await fetchJson<{ content: string }>(
        withProjectQuery(`/api/files/content?path=${encodeURIComponent(path)}`),
      );
      setTabs((prev) =>
        prev.map((t) => (t.path === path ? { ...t, content, dirty: false, loading: false } : t)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === path
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
    async (path: string) => {
      const tab = tabsRef.current.find((t) => t.path === path);
      if (!tab || !tab.dirty) return;
      setSaveError(null);
      try {
        await fetchJson(withProjectQuery('/api/files/content'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withProjectBody({ path, content: tab.content })),
        });
        setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, dirty: false } : t)));
        void refreshTree();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSaveError(msg);
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

export function ideContextSnippetForChat(path: string | null, content: string, maxLen = IDE_SWARM_FOCUS_SNIPPET_MAX): string {
  const project = getBrowserProjectName().trim() || 'Untitled project';
  const head = `Active project: ${project}\n${path ? `Open file: ${path}\n` : 'No file open in the editor.\n'}`;
  if (!path) return head;
  const body = content.length > maxLen ? `${content.slice(0, maxLen)}\n\n… [truncated]` : content;
  return `${head}\n--- file contents ---\n${body}`;
}
