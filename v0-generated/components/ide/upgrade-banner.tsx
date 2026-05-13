"use client";

import { X, Sparkles, Zap } from "lucide-react";
import { useState } from "react";

export function UpgradeBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="relative flex items-center justify-between gap-4 border-b border-primary/30 bg-gradient-to-r from-primary/12 via-accent/12 to-primary/12 px-4 py-2 backdrop-blur-md shadow-lg shadow-primary/10">
      <div className="flex items-center gap-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/40">
          <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Free Tier
          </span>
          <span className="text-sm text-foreground">
            <span className="text-muted-foreground">You&apos;ve used</span>{" "}
            <span className="font-semibold text-primary">847</span>{" "}
            <span className="text-muted-foreground">of 1,000 AI requests this month.</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="group flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary via-primary/90 to-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/35 hover:shadow-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98]">
          <Zap className="h-3.5 w-3.5" />
          Upgrade to Pro
        </button>
        <button
          onClick={() => setIsVisible(false)}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
