import { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

type FileNode = {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
};

const fileTree: FileNode[] = [
  {
    name: 'src',
    type: 'folder',
    children: [
      {
        name: 'app',
        type: 'folder',
        children: [
          { name: 'layout.tsx', type: 'file' },
          { name: 'page.tsx', type: 'file' },
          { name: 'globals.css', type: 'file' },
        ],
      },
      {
        name: 'components',
        type: 'folder',
        children: [
          { name: 'Button.tsx', type: 'file' },
          { name: 'Card.tsx', type: 'file' },
        ],
      },
      {
        name: 'hooks',
        type: 'folder',
        children: [
          { name: 'useAuth.ts', type: 'file' },
          { name: 'useTheme.ts', type: 'file' },
        ],
      },
      {
        name: 'lib',
        type: 'folder',
        children: [
          { name: 'supabase.ts', type: 'file' },
          { name: 'utils.ts', type: 'file' },
        ],
      },
    ],
  },
  { name: 'package.json', type: 'file' },
  { name: 'tsconfig.json', type: 'file' },
];

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
  selectedFile,
  onSelect,
}: {
  node: FileNode;
  depth?: number;
  selectedFile: string | null;
  onSelect: (name: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isFolder = node.type === 'folder';
  const isSelected = selectedFile === node.name;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen);
          } else {
            onSelect(node.name);
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
      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FileTreeNode key={i} node={child} depth={depth + 1} selectedFile={selectedFile} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer() {
  const [selectedFile, setSelectedFile] = useState<string | null>('useAuth.ts');

  return (
    <div className="surface-active flex h-full flex-col">
      <div className="tonal-seam-b flex h-8 items-center justify-between px-3">
        <span className="type-label-sm tracking-[0.12em] uppercase">Explorer</span>
        <button
          type="button"
          className="btn-secondary-surface rounded p-0.5 text-muted-foreground"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {fileTree.map((node, i) => (
          <FileTreeNode key={i} node={node} selectedFile={selectedFile} onSelect={setSelectedFile} />
        ))}
      </div>
    </div>
  );
}
