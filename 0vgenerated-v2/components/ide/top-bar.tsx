"use client";

import { useState } from "react";
import { ChevronDown, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

const models = [
  { id: "grok-4.1", name: "Grok 4.1", badge: "Latest" },
  { id: "grok-3", name: "Grok 3", badge: null },
];

export function TopBar() {
  const [selectedModel, setSelectedModel] = useState("grok-4.1");
  const [isModelOpen, setIsModelOpen] = useState(false);

  return (
    <div className="flex h-12 items-center justify-between border-b border-border bg-card px-3">
      {/* Left - Logo + Project + Branch */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Image
            src="/nebulla-logo.png"
            alt="Nebulla"
            width={22}
            height={22}
            className="object-contain"
            style={{ width: 22, height: 22, background: "transparent" }}
            priority
          />
          <span className="text-sm font-semibold text-foreground">Nebulla</span>
        </div>

        <div className="h-4 w-px bg-border" />

        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          my-awesome-app
          <ChevronDown className="h-3 w-3" />
        </button>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <GitBranch className="h-3 w-3" />
          <span>main</span>
        </div>
      </div>

      {/* Right - Model + Avatar */}
      <div className="flex items-center gap-3">
        {/* Model Selector */}
        <div className="relative">
          <button
            onClick={() => setIsModelOpen(!isModelOpen)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary transition-colors"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            {models.find((m) => m.id === selectedModel)?.name}
            <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", isModelOpen && "rotate-180")} />
          </button>

          {isModelOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-xl">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => { setSelectedModel(model.id); setIsModelOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs hover:bg-muted transition-colors",
                    selectedModel === model.id && "bg-primary/10 text-primary"
                  )}
                >
                  <span>{model.name}</span>
                  {model.badge && (
                    <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {model.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-semibold text-primary-foreground">
          JD
        </div>
      </div>
    </div>
  );
}
