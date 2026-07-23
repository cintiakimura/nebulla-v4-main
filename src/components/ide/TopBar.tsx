import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, MonitorPlay, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { getBrowserProjectName } from '../../lib/nebulaProjectApi';
import { useClickOutside } from '../../lib/useClickOutside';
import { type IdeChatModelId, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { AI_CHAT_MODELS, AI_PROVIDER_LABELS } from '../../lib/aiProvider';

const models: { id: IdeChatModelId; name: string; badge: string | null }[] = AI_CHAT_MODELS.map(
  (m) => ({
    id: m.id,
    name: `${m.label}`,
    badge: m.provider === 'xai' && m.id === 'grok-4.1' ? 'Default' : AI_PROVIDER_LABELS[m.provider],
  }),
);

export function TopBar({
  workspaceLabel,
  onSwitchWorkspace,
  onOpenAccount,
}: {
  /** Active cloud/local project name from workspace gate. */
  workspaceLabel?: string;
  /** Re-open project picker (sign-in / switch project). */
  onSwitchWorkspace?: () => void;
  /** Opens My services (API keys, GitHub, etc.). */
  onOpenAccount?: () => void;
}) {
  const { chatModel, setChatModel, activePath, activeTab, updateActiveContent, saveTab } =
    useIdeWorkspace();
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [projectCopied, setProjectCopied] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [replaceMsg, setReplaceMsg] = useState<string | null>(null);
  const modelWrapRef = useRef<HTMLDivElement>(null);
  const findWrapRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  const projectName = workspaceLabel?.trim() || getBrowserProjectName().trim() || 'Untitled project';

  const closeModelMenu = useCallback(() => setIsModelOpen(false), []);
  useClickOutside(modelWrapRef, closeModelMenu, isModelOpen);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setReplaceMsg(null);
  }, []);
  useClickOutside(findWrapRef, closeFind, findOpen);

  useEffect(() => {
    if (!findOpen) return;
    const t = window.setTimeout(() => findInputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [findOpen]);

  const matchCount = useMemo(() => {
    const q = findQuery;
    const content = activeTab?.content ?? '';
    if (!q || !content) return 0;
    let count = 0;
    let idx = 0;
    while (idx < content.length) {
      const found = content.indexOf(q, idx);
      if (found < 0) break;
      count += 1;
      idx = found + Math.max(q.length, 1);
    }
    return count;
  }, [findQuery, activeTab?.content]);

  const applyReplace = useCallback(async () => {
    setReplaceMsg(null);
    const q = findQuery;
    if (!q) {
      setReplaceMsg('Enter text to find.');
      return;
    }
    if (!activePath || !activeTab) {
      setReplaceMsg('Open a file first.');
      return;
    }
    const content = activeTab.content ?? '';
    if (!content.includes(q)) {
      setReplaceMsg('No matches in this file.');
      return;
    }
    const next = content.split(q).join(replaceQuery);
    const replacements = matchCount;
    updateActiveContent(next);
    try {
      await saveTab(activePath, next);
      setReplaceMsg(`Replaced ${replacements} in ${activePath.split('/').pop()}`);
    } catch {
      setReplaceMsg(`Replaced ${replacements} (kept in editor — save failed)`);
    }
  }, [findQuery, replaceQuery, activePath, activeTab, matchCount, updateActiveContent, saveTab]);

  const copyProjectName = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(projectName);
      setProjectCopied(true);
      window.setTimeout(() => setProjectCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [projectName]);

  return (
    <div className="surface-active tonal-seam-b flex h-12 flex-col">
      <div className="flex h-12 items-center justify-between px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Logo className="h-[22px] w-[22px] shrink-0 opacity-95" />
            <span className="app-logotype text-foreground">Nebulla.beta</span>
          </div>

          <button
            type="button"
            onClick={() => (onSwitchWorkspace ? onSwitchWorkspace() : void copyProjectName())}
            title={
              onSwitchWorkspace
                ? 'Switch or create project'
                : projectCopied
                  ? 'Copied!'
                  : 'Active project — click to copy name'
            }
            className="btn-secondary-surface type-title-sm hidden max-w-[220px] items-center gap-1.5 truncate rounded-md px-2 py-1 text-muted-foreground sm:flex"
          >
            <span className="truncate">{projectName}</span>
            {onSwitchWorkspace ? (
              <span className="shrink-0 text-[10px] text-primary/80">Switch</span>
            ) : projectCopied ? (
              <span className="shrink-0 text-[10px] text-primary">Copied</span>
            ) : (
              <Copy className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
            )}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            title="Open live app preview"
            onClick={() => window.dispatchEvent(new CustomEvent('nebula-open-app-preview'))}
            className="btn-secondary-surface type-label-sm hidden h-9 items-center gap-1.5 rounded-md px-2.5 text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden />
            Preview
          </button>

          <div className="relative" ref={findWrapRef}>
            <button
              type="button"
              onClick={() => {
                setFindOpen((v) => !v);
                setReplaceMsg(null);
              }}
              title="Find & replace in open file"
              aria-label="Find and replace"
              aria-expanded={findOpen}
              className={cn(
                'btn-secondary-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground',
                findOpen && 'active-tab-sheen text-primary',
              )}
            >
              <Search className="h-4 w-4" aria-hidden />
            </button>

            {findOpen ? (
              <div className="elevation-popover absolute right-0 top-full z-50 mt-1 w-[260px] rounded-lg border border-white/10 bg-[#0a0e14] p-2.5 shadow-xl">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-slate-200">Find & replace</p>
                  <button
                    type="button"
                    onClick={closeFind}
                    className="rounded p-0.5 text-slate-500 hover:text-slate-200"
                    aria-label="Close find"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  ref={findInputRef}
                  type="search"
                  value={findQuery}
                  onChange={(e) => {
                    setFindQuery(e.target.value);
                    setReplaceMsg(null);
                  }}
                  placeholder="Find in open file…"
                  className="mb-1.5 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 outline-none ring-cyan-500/30 placeholder:text-slate-600 focus:ring"
                  aria-label="Find"
                />
                <input
                  type="text"
                  value={replaceQuery}
                  onChange={(e) => {
                    setReplaceQuery(e.target.value);
                    setReplaceMsg(null);
                  }}
                  placeholder="Replace with…"
                  className="mb-2 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 outline-none ring-cyan-500/30 placeholder:text-slate-600 focus:ring"
                  aria-label="Replace"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-slate-500">
                    {activePath
                      ? findQuery
                        ? `${matchCount} match${matchCount === 1 ? '' : 'es'}`
                        : activePath.split('/').pop()
                      : 'No file open'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void applyReplace()}
                    disabled={!findQuery || !activePath || matchCount === 0}
                    className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
                    title="Apply replacement in the open file"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Replace
                  </button>
                </div>
                {replaceMsg ? (
                  <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{replaceMsg}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="relative" ref={modelWrapRef}>
            <button
              type="button"
              onClick={() => setIsModelOpen(!isModelOpen)}
              className="btn-secondary-surface type-label-sm flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
              {models.find((m) => m.id === chatModel)?.name}
              <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', isModelOpen && 'rotate-180')} />
            </button>

            {isModelOpen && (
              <div className="elevation-popover absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-md p-1">
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setChatModel(model.id);
                      setIsModelOpen(false);
                    }}
                    className={cn(
                      'btn-secondary-surface type-label-sm flex w-full items-center justify-between rounded px-2.5 py-1.5',
                      chatModel === model.id && 'active-tab-sheen text-primary',
                    )}
                  >
                    <span>{model.name}</span>
                    {model.badge && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] text-primary" style={{ fontWeight: 500 }}>
                        {model.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenAccount}
            title="Settings — GitHub and API keys"
            aria-label="Open Settings"
            className="surface-float flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={!onOpenAccount}
          >
            <span className="text-[10px] tracking-wide text-foreground" style={{ fontWeight: 500 }}>
              NB
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
