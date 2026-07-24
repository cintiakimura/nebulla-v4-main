import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildWorkspaceFileTree, type WorkspaceTreeNode } from '../../lib/workspaceFileTree';
import { getBrowserProjectName } from '../../lib/nebulaProjectApi';
import { useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { useIdeCenterTabs } from '@/components/ide/IdeCenterTabsContext';
import { IdeCollapsibleSection } from '@/components/ide/IdeCollapsibleSection';
import { fileTabLabel } from '../../lib/ideCenterTabs';

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'ts':
      return <FileCode className="h-3 w-3 shrink-0 text-[#3FB950]" />;
    case 'json':
      return <FileJson className="h-3 w-3 shrink-0 text-[#D29922]" />;
    case 'css':
      return <FileCode className="h-3 w-3 shrink-0 text-[#58A6FF]" />;
    case 'md':
      return <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />;
    default:
      return <File className="h-3 w-3 shrink-0 text-muted-foreground" />;
  }
}

function FileTreeNode({
  node,
  depth = 0,
  selectedPath,
  onOpenFile,
}: {
  node: WorkspaceTreeNode;
  depth?: number;
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isFolder = !node.isFile;
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen);
          } else {
            void onOpenFile(node.path);
          }
        }}
        className={cn(
          'flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs transition-colors duration-200 ease-out hover:bg-secondary/50',
          isSelected && !isFolder && 'active-tab-sheen',
        )}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/80" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/80" />
            )}
            {isOpen ? (
              <FolderOpen className="h-3 w-3 shrink-0 text-primary/85" />
            ) : (
              <Folder className="h-3 w-3 shrink-0 text-muted-foreground/80" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            {getFileIcon(node.name)}
          </>
        )}
        <span
          className={cn(
            'truncate text-xs leading-tight',
            isFolder
              ? 'font-medium text-muted-foreground/90'
              : cn('font-normal', isSelected ? 'text-primary' : 'text-foreground/90'),
          )}
        >
          {node.name}
        </span>
      </button>
      {isFolder && isOpen && node.children.length > 0 ? (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FileExplorer() {
  const { workspacePaths, overviewLoading, overviewError, refreshTree, activePath, tabs } =
    useIdeWorkspace();
  const { focusFile } = useIdeCenterTabs();
  const [explorerHint, setExplorerHint] = useState<string | null>(null);
  const [editorsOpen, setEditorsOpen] = useState(true);
  const [projectOpen, setProjectOpen] = useState(true);
  const tree = useMemo(() => buildWorkspaceFileTree(workspacePaths), [workspacePaths]);
  const projectLabel = getBrowserProjectName().trim() || 'Project';

  return (
    <div className="surface-active flex h-full flex-col">
      <div className="flex h-8 items-center justify-between border-b border-border px-3">
        <span className="text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground/80">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Refresh file tree"
            aria-label="Refresh file tree"
            className="btn-secondary-surface rounded p-0.5 text-muted-foreground disabled:opacity-40"
            disabled={overviewLoading}
            onClick={() => {
              void refreshTree();
              setExplorerHint('Refreshing workspace…');
              window.setTimeout(() => setExplorerHint(null), 1600);
            }}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', overviewLoading && 'animate-spin')} />
          </button>
          <button
            type="button"
            title="Explorer actions"
            aria-label="Explorer actions"
            className="btn-secondary-surface rounded p-0.5 text-muted-foreground"
            onClick={() => {
              setExplorerHint('Project files from your workspace (src/, app/, public/, etc.).');
              window.setTimeout(() => setExplorerHint(null), 3200);
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {explorerHint ? (
        <p
          className="type-label-sm border-b border-primary/20 bg-primary/10 px-3 py-1.5 text-primary/90"
          role="status"
        >
          {explorerHint}
        </p>
      ) : null}
      {overviewError ? (
        <p
          className="type-label-sm border-b border-red-500/25 bg-red-500/10 px-3 py-2 text-red-100/90"
          role="alert"
        >
          {overviewError}
        </p>
      ) : null}
      <div className="flex-1 overflow-auto px-1 py-1">
        {tabs.length > 0 ? (
          <IdeCollapsibleSection
            title="Open Editors"
            open={editorsOpen}
            onToggle={() => setEditorsOpen((v) => !v)}
            count={tabs.length}
            className="mb-1"
          >
            <ul className="space-y-0.5 pb-1">
              {tabs.map((t) => (
                <li key={t.path}>
                  <button
                    type="button"
                    onClick={() => void focusFile(t.path)}
                    className={cn(
                      'flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight hover:bg-secondary/50',
                      activePath === t.path && 'active-tab-sheen text-primary',
                    )}
                  >
                    {getFileIcon(t.path.split('/').pop() ?? t.path)}
                    <span className="min-w-0 flex-1 truncate">{fileTabLabel(t.path)}</span>
                    {t.dirty ? (
                      <Circle className="h-1.5 w-1.5 shrink-0 fill-primary text-primary" aria-label="Unsaved" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </IdeCollapsibleSection>
        ) : null}

        <IdeCollapsibleSection
          title={projectLabel}
          open={projectOpen}
          onToggle={() => setProjectOpen((v) => !v)}
          count={workspacePaths.length}
        >
          {overviewLoading && tree.length === 0 ? (
            <p className="type-label-sm px-2 py-2 text-muted-foreground">Loading workspace…</p>
          ) : tree.length === 0 ? (
            <p className="type-label-sm px-2 py-2 text-muted-foreground">No project files yet.</p>
          ) : (
            tree.map((node) => (
              <FileTreeNode
                key={node.path || node.name}
                node={node}
                selectedPath={activePath}
                onOpenFile={(path) => focusFile(path)}
              />
            ))
          )}
        </IdeCollapsibleSection>
      </div>
    </div>
  );
}
