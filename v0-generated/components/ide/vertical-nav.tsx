"use client";

import { useState } from "react";
import {
  Copy,
  LayoutGrid,
  MessageCircle,
  Network,
  BookOpen,
  Layers,
  Settings,
  Sliders,
  Globe,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

type NavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  section?: string;
  onClick?: () => void;
  isActive?: boolean;
};

export function VerticalNav() {
  const [activeItem, setActiveItem] = useState("agents");

  const items: NavItem[] = [
    // Section 1
    { id: "snippets", icon: <Copy className="h-5 w-5" />, label: "Snippets", section: "1" },
    { id: "components", icon: <LayoutGrid className="h-5 w-5" />, label: "Components", section: "1" },
    { id: "chat", icon: <MessageCircle className="h-5 w-5" />, label: "Chat", section: "1" },
    
    // Section 2 (Agents - highlighted)
    { id: "agents", icon: <Network className="h-5 w-5" />, label: "Agents", section: "2", isActive: true },
    
    // Section 3
    { id: "docs", icon: <BookOpen className="h-5 w-5" />, label: "Docs", section: "3" },
    
    // Section 4
    { id: "layers", icon: <Layers className="h-5 w-5" />, label: "Layers", section: "4" },
    { id: "grid", icon: <LayoutGrid className="h-5 w-5" />, label: "Grid", section: "4" },
    
    // Section 5
    { id: "sliders", icon: <Sliders className="h-5 w-5" />, label: "Controls", section: "5" },
    { id: "settings", icon: <Settings className="h-5 w-5" />, label: "Settings", section: "5" },
    
    // Section 6
    { id: "world", icon: <Globe className="h-5 w-5" />, label: "World", section: "6" },
    
    // Section 7
    { id: "profile", icon: <User className="h-5 w-5" />, label: "Profile", section: "7" },
  ];

  // Group items by section
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.section!]) {
      acc[item.section!] = [];
    }
    acc[item.section!].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  const sections = Object.entries(groupedItems);

  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-border bg-sidebar py-4">
      {/* Logo */}
      <div className="mb-4 flex items-center justify-center">
        <Image
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/remove_the_white_background_and_make_it_completely_transparent._keep_only_the-1pg6kruCIHQfV8QOCTqPuyHhugp3iJ.png"
          alt="Nebulla"
          width={28}
          height={28}
          className="h-7 w-7 object-contain drop-shadow-lg"
          priority
        />
      </div>

      {/* Nav Items with Section Dividers */}
      <div className="flex flex-1 flex-col gap-0 overflow-y-auto">
        {sections.map(([section, sectionItems], idx) => (
          <div key={section}>
            {/* Divider before section (except first) */}
            {idx > 0 && <div className="my-2 h-px w-6 bg-border" />}
            
            {/* Section Items */}
            <div className="flex flex-col gap-1">
              {sectionItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveItem(item.id)}
                  title={item.label}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200",
                    activeItem === item.id
                      ? "bg-primary/20 text-primary shadow-lg shadow-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  {item.icon}
                  {/* Active state highlight */}
                  {activeItem === item.id && (
                    <div className="absolute inset-0 rounded-lg border border-primary/30" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom divider */}
      <div className="my-2 h-px w-6 bg-border" />
    </div>
  );
}
