"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, FileCode, FileJson, FileText, MoreHorizontal } from "lucide-react";
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
        name: "app",
        type: "folder",
        children: [
          { name: "layout.tsx", type: "file" },
          { name: "page.tsx", type: "file" },
          { name: "globals.css", type: "file" },
        ],
      },
      {
        name: "components",
        type: "folder",
        children: [
          { name: "Button.tsx", type: "file" },
          { name: "Card.tsx", type: "file" },
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
          { name: "supabase.ts", type: "file" },
          { name: "utils.ts", type: "file" },
        ],
      },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "tsconfig.json", type: "file" },
];

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "tsx":
    case "ts":
      return <FileCode className="h-4 w-4 text-[#3FB950]" />;
    case "json":
      return <FileJson className="h-4 w-4 text-[#D29922]" />;
    case "css":
      return <FileCode className="h-4 w-4 text-[#58A6FF]" />;
    case "md":
      return <FileText className="h-4 w-4 text-muted-foreground" />;
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
          "flex w-full items-center gap-1.5 py-1 px-2 text-xs hover:bg-muted/50 rounded transition-colors",
          isSelected && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            {getFileIcon(node.name)}
          </>
        )}
        <span className={cn("truncate", isSelected ? "text-primary" : "text-foreground")}>{node.name}</span>
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
  const [selectedFile, setSelectedFile] = useState<string | null>("useAuth.ts");

  return (
    <div className="flex h-full flex-col bg-card border-r border-border">
      <div className="flex h-8 items-center justify-between px-3 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Explorer</span>
        <button className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
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
