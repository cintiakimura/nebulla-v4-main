"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  Image,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

type FileNode = {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
};

const fileTree: FileNode[] = [
  {
    name: "src",
    type: "folder",
    children: [
      {
        name: "components",
        type: "folder",
        children: [
          { name: "Button.tsx", type: "file" },
          { name: "Card.tsx", type: "file" },
          { name: "Modal.tsx", type: "file" },
        ],
      },
      {
        name: "hooks",
        type: "folder",
        children: [
          { name: "useAuth.ts", type: "file" },
          { name: "useTheme.ts", type: "file" },
        ],
      },
      {
        name: "lib",
        type: "folder",
        children: [
          { name: "utils.ts", type: "file" },
          { name: "api.ts", type: "file" },
        ],
      },
      { name: "App.tsx", type: "file" },
      { name: "main.tsx", type: "file" },
    ],
  },
  {
    name: "public",
    type: "folder",
    children: [
      { name: "favicon.ico", type: "file" },
      { name: "logo.svg", type: "file" },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "tsconfig.json", type: "file" },
  { name: "README.md", type: "file" },
];

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "tsx":
    case "ts":
    case "jsx":
    case "js":
      return <FileCode className="h-4 w-4 text-primary" />;
    case "json":
      return <FileJson className="h-4 w-4 text-yellow-500" />;
    case "md":
      return <FileText className="h-4 w-4 text-muted-foreground" />;
    case "svg":
    case "png":
    case "jpg":
    case "ico":
      return <Image className="h-4 w-4 text-accent" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
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

  const isFolder = node.type === "folder";
  const isSelected = selectedFile === node.name;

  return (
    <div>
      <button
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen);
          } else {
            onSelect(node.name);
          }
        }}
        className={cn(
          "flex w-full items-center gap-1.5 py-1 px-2 text-sm hover:bg-muted/50 rounded-sm transition-colors",
          isSelected && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-primary shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5" />
            {getFileIcon(node.name)}
          </>
        )}
        <span className="truncate text-sidebar-foreground">{node.name}</span>
      </button>
      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FileTreeNode
              key={i}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer() {
  const [selectedFile, setSelectedFile] = useState<string | null>("App.tsx");

  return (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <button className="p-1 hover:bg-muted rounded transition-colors">
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 overflow-auto py-2">
        {fileTree.map((node, i) => (
          <FileTreeNode
            key={i}
            node={node}
            selectedFile={selectedFile}
            onSelect={setSelectedFile}
          />
        ))}
      </div>
    </div>
  );
}
