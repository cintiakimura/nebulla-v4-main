"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { FileExplorer } from "@/components/ide/file-explorer";
import { TopBar } from "@/components/ide/top-bar";
import { VerticalNav } from "@/components/ide/vertical-nav";
import { CodeEditor } from "@/components/ide/code-editor";
import { AIChat } from "@/components/ide/ai-chat";
import { TerminalPanel } from "@/components/ide/terminal-panel";
import { cn } from "@/lib/utils";

const EXPLORER_MIN = 160;
const EXPLORER_MAX = 480;
const EXPLORER_DEFAULT = 224;

const CHAT_MIN = 240;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 320;

const TERMINAL_MIN = 80;
const TERMINAL_MAX = 560;
const TERMINAL_DEFAULT = 192;

function useDragResize(
  initial: number,
  min: number,
  max: number,
  direction: "horizontal-right" | "horizontal-left" | "vertical"
) {
  const [size, setSize] = useState(initial);
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(initial);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === "vertical" ? e.clientY : e.clientX;
      startSize.current = size;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta =
          direction === "vertical"
            ? ev.clientY - startPos.current
            : direction === "horizontal-right"
            ? ev.clientX - startPos.current
            : startPos.current - ev.clientX;
        const next = Math.min(max, Math.max(min, startSize.current + delta));
        setSize(next);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [size, min, max, direction]
  );

  return { size, onMouseDown };
}

function ResizeHandle({
  onMouseDown,
  orientation,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  orientation: "vertical" | "horizontal";
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "group relative z-10 shrink-0 bg-border transition-colors hover:bg-primary/60 active:bg-primary",
        orientation === "horizontal"
          ? "w-px cursor-col-resize hover:w-[3px]"
          : "h-px cursor-row-resize hover:h-[3px]"
      )}
    >
      {/* Hit-area expander */}
      <div
        className={cn(
          "absolute",
          orientation === "horizontal"
            ? "inset-y-0 -left-1 -right-1"
            : "inset-x-0 -top-1 -bottom-1"
        )}
      />
    </div>
  );
}

export default function NebullaIDE() {
  const explorer = useDragResize(EXPLORER_DEFAULT, EXPLORER_MIN, EXPLORER_MAX, "horizontal-right");
  const chat = useDragResize(CHAT_DEFAULT, CHAT_MIN, CHAT_MAX, "horizontal-left");
  const terminal = useDragResize(TERMINAL_DEFAULT, TERMINAL_MIN, TERMINAL_MAX, "vertical");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Far-left vertical icon nav */}
        <VerticalNav />

        {/* Left Sidebar - File Explorer */}
        <div
          className="hidden shrink-0 md:block overflow-hidden"
          style={{ width: explorer.size }}
        >
          <FileExplorer />
        </div>

        {/* Resize: explorer ↔ editor */}
        <ResizeHandle onMouseDown={explorer.onMouseDown} orientation="horizontal" />

        {/* Center - Editor + Terminal */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-hidden">
            <CodeEditor />
          </div>

          {/* Resize: editor ↕ terminal */}
          <ResizeHandle onMouseDown={terminal.onMouseDown} orientation="vertical" />

          <div
            className="shrink-0 overflow-hidden"
            style={{ height: terminal.size }}
          >
            <TerminalPanel />
          </div>
        </div>

        {/* Resize: editor ↔ chat */}
        <ResizeHandle onMouseDown={chat.onMouseDown} orientation="horizontal" />

        {/* Right Sidebar - AI Chat */}
        <div
          className="hidden shrink-0 lg:block overflow-hidden"
          style={{ width: chat.size }}
        >
          <AIChat />
        </div>
      </div>
    </div>
  );
}
