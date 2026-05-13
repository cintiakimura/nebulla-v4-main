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
    <div className="flex h-12 items-center justify-between border-b border-border bg-card/80 backdrop-blur-md px-4">
      {/* Left — Logo + project */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center">
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/remove_the_white_background_and_make_it_completely_transparent._keep_only_the-1pg6kruCIHQfV8QOCTqPuyHhugp3iJ.png"
              alt="Nebulla"
              width={28}
              height={28}
              className="h-7 w-7 object-contain drop-shadow-lg"
              priority
            />
          </div>
          <span className="font-semibold text-foreground tracking-wide">Nebulla</span>
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Project:</span>
          <button className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors">
            my-awesome-app
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          <span>main</span>
        </div>
      </div>

      {/* Right — Model selector + avatar */}
      <div className="flex items-center gap-4">
        {/* Model Selector */}
        <div className="relative">
          <button
            onClick={() => setIsModelOpen(!isModelOpen)}
            className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            <div className="h-2 w-2 rounded-full bg-accent animate-pulse shadow-sm shadow-accent/50" />
            {models.find((m) => m.id === selectedModel)?.name}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                isModelOpen && "rotate-180"
              )}
            />
          </button>

          {isModelOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-xl">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model.id);
                    setIsModelOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors",
                    selectedModel === model.id && "bg-primary/10 text-primary"
                  )}
                >
                  <span>{model.name}</span>
                  {model.badge && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                      {model.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* User Avatar */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/40">
          JD
        </div>
      </div>
    </div>
  );
}
