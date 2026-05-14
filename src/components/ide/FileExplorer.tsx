import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
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
import { useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'ts':
      return <FileCode className="h-4 w-4 shrink-0 text-[#3FB950]" />;
    case 'json':
      return <FileJson className="h-4 w-4 shrink-0 text-[#D29922]" />;
    case 'css':
      return <FileCode className="h-4 w-4 shrink-0 text-[#58A6FF]" />;
    case 'md':
      return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
    default:
      return <File className="h-4 w-4 shrink-0 text-muted-foreground" />;
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
          'btn-secondary-surface flex w-full items-center gap-1.5 rounded px-2 py-1 text-left transition-colors duration-300 ease-out',
          isSelected && !isFolder && 'active-tab-sheen',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-primary/90" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
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
            'truncate',
            isFolder ? 'type-label-sm text-muted-foreground' : cn('type-title-sm', isSelected ? 'text-primary' : 'text-foreground'),
          )}
        >
          {node.name}
        </span>
      </button>
      {isFolder && isOpen && node.children.length > 0 && (
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
      )}
    </div>
  );
}

export function FileExplorer() {
  const { workspacePaths, overviewLoading, overviewError, refreshTree, openFile, activePath } = useIdeWorkspace();
  const [explorerHint, setExplorerHint] = useState<string | null>(null);
  const tree = useMemo(() => buildWorkspaceFileTree(workspacePaths), [workspacePaths]);

  return (
    <div className="surface-active flex h-full flex-col">
      <div className="tonal-seam-b flex h-8 items-center justify-between px-3">
        <span className="type-label-sm tracking-[0.12em] uppercase">Explorer</span>
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
              setExplorerHint('Files load from the active cloud workspace (source control overview).');
              window.setTimeout(() => setExplorerHint(null), 3200);
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {explorerHint ? (
        <p className="type-label-sm border-b border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-cyan-100/90" role="status">
          {explorerHint}
        </p>
      ) : null}
      {overviewError ? (
        <p className="type-label-sm border-b border-red-500/25 bg-red-500/10 px-3 py-2 text-red-100/90" role="alert">
          {overviewError}
        </p>
      ) : null}
      <div className="flex-1 overflow-auto py-1">
        {overviewLoading && tree.length === 0 ? (
          <p className="type-label-sm px-3 py-2 text-muted-foreground">Loading workspace…</p>
        ) : tree.length === 0 ? (
          <p className="type-label-sm px-3 py-2 text-muted-foreground">No files in this workspace yet.</p>
        ) : (
          tree.map((node) => (
            <FileTreeNode
              key={node.path || node.name}
              node={node}
              selectedPath={activePath}
              onOpenFile={openFile}
            />
          ))
        )}
      </div>
    </div>
  );
}
