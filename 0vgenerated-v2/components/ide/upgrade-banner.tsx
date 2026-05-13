"use client";

import { X, Zap } from "lucide-react";
import { useState } from "react";

export function UpgradeBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="flex h-8 items-center justify-between border-b border-border bg-primary/5 px-4">
      <div className="flex items-center gap-3 text-xs">
        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">FREE</span>
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">847</span> / 1,000 requests used
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Zap className="h-3 w-3" />
          Upgrade
        </button>
        <button
          onClick={() => setIsVisible(false)}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
