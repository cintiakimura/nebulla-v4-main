"use client";

import { useState } from "react";
import { Files, GitBranch, Search, Settings, Layers, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

type NavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  position?: "top" | "bottom";
};

export function VerticalNav() {
  const [activeItem, setActiveItem] = useState("explorer");

  const items: NavItem[] = [
    { id: "explorer", icon: <Files className="h-5 w-5" />, label: "Explorer" },
    { id: "search", icon: <Search className="h-5 w-5" />, label: "Search" },
    { id: "git", icon: <GitBranch className="h-5 w-5" />, label: "Source Control" },
    { id: "masterplan", icon: <Layers className="h-5 w-5" />, label: "Master Plan" },
    { id: "chat", icon: <MessageSquare className="h-5 w-5" />, label: "Chat" },
    { id: "settings", icon: <Settings className="h-5 w-5" />, label: "Settings", position: "bottom" },
  ];

  const topItems = items.filter((i) => i.position !== "bottom");
  const bottomItems = items.filter((i) => i.position === "bottom");

  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-border bg-card py-3">
      {/* Logo */}
      <div className="mb-4 flex items-center justify-center bg-transparent">
        <Image
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/remove_the_white_background_and_make_it_completely_transparent._keep_only_the-1pg6kruCIHQfV8QOCTqPuyHhugp3iJ.png"
          alt="Nebulla"
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
          style={{ background: "none", backgroundColor: "transparent" }}
          priority
        />
      </div>

      {/* Top Items */}
      <div className="flex flex-col items-center gap-1">
        {topItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveItem(item.id)}
            title={item.label}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              activeItem === item.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {item.icon}
            {activeItem === item.id && (
              <div className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom Items */}
      <div className="flex flex-col items-center gap-1">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveItem(item.id)}
            title={item.label}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              activeItem === item.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
