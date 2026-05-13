"use client";

import { useState } from "react";
import { Terminal, X, ChevronDown, Plus, Play, Square, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const terminalOutput = [
  { type: "command", text: "$ pnpm dev" },
  { type: "info",    text: "" },
  { type: "success", text: "  ▲ Next.js 15.1.0" },
  { type: "info",    text: "  - Local:        http://localhost:3000" },
  { type: "muted",   text: "  - Network:      http://192.168.1.5:3000" },
  { type: "info",    text: "" },
  { type: "success", text: " ✓ Starting..." },
  { type: "success", text: " ✓ Ready in 1.2s" },
  { type: "info",    text: "" },
  { type: "info",    text: " ○ Compiling /page ..." },
  { type: "success", text: " ✓ Compiled /page in 234ms" },
  { type: "warning", text: " ⚠ ./src/hooks/useAuth.ts" },
  { type: "muted",   text: "   Exported 'validateToken' is unused" },
  { type: "info",    text: "" },
];

export function TerminalPanel() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [verbose, setVerbose] = useState(false);

  if (isMinimized) {
    return (
      <div className="flex h-8 items-center justify-between border-t border-border bg-card px-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Terminal</span>
        </div>
        <button
          onClick={() => setIsMinimized(false)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-4 w-4 rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-t border-border bg-card">
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        {/* Tab */}
        <div className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-foreground bg-background">
          <Terminal className="h-3 w-3" />
          Terminal
        </div>
        <button className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Plus className="h-3 w-3" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Run / Stop / Verbose */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsRunning(!isRunning)}
            title={isRunning ? "Stop" : "Run"}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded transition-colors",
              isRunning
                ? "text-destructive hover:bg-destructive/10"
                : "text-primary hover:bg-primary/10"
            )}
          >
            {isRunning ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>

          <button
            onClick={() => setVerbose(!verbose)}
            title="Verbose output"
            className={cn(
              "flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium transition-colors",
              verbose
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <AlignLeft className="h-3 w-3" />
            Verbose
          </button>

          <div className="mx-1 h-4 w-px bg-border" />

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
      <div className="flex-1 overflow-auto bg-background p-3 font-mono text-xs leading-5">
        {terminalOutput.map((line, i) => (
          <div
            key={i}
            className={cn(
              line.type === "command" && "text-foreground",
              line.type === "success" && "text-[#3FB950]",
              line.type === "warning" && "text-[#D29922]",
              line.type === "error"   && "text-destructive",
              line.type === "muted"   && "text-muted-foreground",
              line.type === "info"    && "text-foreground"
            )}
          >
            {line.text || "\u00A0"}
          </div>
        ))}
        <div className="flex items-center gap-1 text-foreground">
          <span className="text-primary">$</span>
          <span className="animate-pulse">▋</span>
        </div>
      </div>
    </div>
  );
}
