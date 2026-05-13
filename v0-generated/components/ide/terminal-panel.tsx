"use client";

import { useState } from "react";
import {
  Terminal,
  Eye,
  X,
  ChevronUp,
  ChevronDown,
  Plus,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const terminalOutput = [
  { type: "info", text: "$ pnpm dev" },
  { type: "info", text: "" },
  { type: "success", text: "  VITE v5.4.2  ready in 342 ms" },
  { type: "info", text: "" },
  { type: "info", text: "  ➜  Local:   http://localhost:5173/" },
  { type: "muted", text: "  ➜  Network: use --host to expose" },
  { type: "info", text: "" },
  { type: "success", text: "✓ 23 modules transformed." },
  { type: "info", text: "[HMR] Hot Module Replacement enabled." },
  { type: "warning", text: "[WARN] ./src/hooks/useAuth.ts: exported function 'validateToken' is unused" },
  { type: "info", text: "" },
  { type: "success", text: "✓ Built in 1.2s" },
  { type: "info", text: "[watch] Watching for file changes..." },
];

type Tab = "terminal" | "preview";

export function TerminalPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("terminal");
  const [isMinimized, setIsMinimized] = useState(false);

  if (isMinimized) {
    return (
      <div className="flex h-8 items-center justify-between border-t border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("terminal")}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              activeTab === "terminal" ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
            Terminal
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              activeTab === "preview" ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
        </div>
        <button
          onClick={() => setIsMinimized(false)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-t border-border bg-card">
      {/* Header */}
      <div className="flex h-9 items-center justify-between border-b border-border px-2">
        <div className="flex items-center">
          <button
            onClick={() => setActiveTab("terminal")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              activeTab === "terminal"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
            Terminal
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              activeTab === "preview"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
            <span className="ml-1 flex h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-background">
        {activeTab === "terminal" ? (
          <div className="p-3 font-mono text-xs leading-5">
            {terminalOutput.map((line, i) => (
              <div
                key={i}
                className={cn(
                  line.type === "success" && "text-accent",
                  line.type === "warning" && "text-yellow-500",
                  line.type === "error" && "text-destructive",
                  line.type === "muted" && "text-muted-foreground",
                  line.type === "info" && "text-foreground"
                )}
              >
                {line.text || "\u00A0"}
              </div>
            ))}
            <div className="flex items-center gap-1 text-foreground">
              <span className="text-accent">$</span>
              <span className="animate-pulse">▋</span>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
            <div className="relative w-full max-w-2xl aspect-video rounded-lg border border-border bg-muted/30 overflow-hidden">
              {/* Mock Preview */}
              <div className="absolute inset-0 p-4">
                <div className="h-full rounded-md bg-background border border-border p-4">
                  <div className="space-y-3">
                    <div className="h-8 w-32 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-48 rounded bg-muted/50" />
                    <div className="mt-6 grid grid-cols-3 gap-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="aspect-square rounded-lg bg-muted/30 border border-border" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">localhost:5173</span>
              <button className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
                <ExternalLink className="h-3 w-3" />
                Open in Browser
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
