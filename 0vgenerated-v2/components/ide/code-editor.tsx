"use client";

import { useState } from "react";
import { X, Circle, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "page.tsx", modified: false },
  { name: "useAuth.ts", modified: true },
  { name: "api.ts", modified: false },
];

const codeContent = `import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  })

  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
      })
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState({
          user: session?.user ?? null,
          session,
          loading: false,
        })
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return {
    ...state,
    signIn,
    signOut,
  }
}`;

function highlightSyntax(code: string) {
  const lines = code.split("\n");
  return lines.map((line, lineIndex) => {
    let highlighted = line;

    // Keywords
    highlighted = highlighted.replace(
      /\b(import|from|export|default|function|const|let|var|if|else|return|async|await|type|interface|throw|new)\b/g,
      '<span class="text-[#FF7B72]">$1</span>'
    );

    // Strings
    highlighted = highlighted.replace(
      /(['"`])((?:\\.|[^\\])*?)\1/g,
      '<span class="text-[#A5D6FF]">$1$2$1</span>'
    );

    // Functions
    highlighted = highlighted.replace(
      /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
      '<span class="text-[#D2A8FF]">$1</span>'
    );

    // Types
    highlighted = highlighted.replace(
      /:\s*([A-Z][a-zA-Z0-9<>|]*)/g,
      ': <span class="text-[#79C0FF]">$1</span>'
    );

    // Comments
    highlighted = highlighted.replace(
      /(\/\/.*$)/g,
      '<span class="text-[#6E7681] italic">$1</span>'
    );

    // Null/undefined/true/false
    highlighted = highlighted.replace(
      /\b(null|undefined|true|false)\b/g,
      '<span class="text-[#79C0FF]">$1</span>'
    );

    return (
      <div key={lineIndex} className="flex hover:bg-muted/30 transition-colors">
        <span className="inline-block w-12 pr-4 text-right text-muted-foreground/40 select-none shrink-0 text-xs">
          {lineIndex + 1}
        </span>
        <span className="flex-1" dangerouslySetInnerHTML={{ __html: highlighted || "&nbsp;" }} />
      </div>
    );
  });
}

export function CodeEditor() {
  const [activeTab, setActiveTab] = useState("useAuth.ts");
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tabs */}
      <div className="flex h-9 items-center border-b border-border bg-card">
        <div className="flex items-center overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={cn(
                "group flex h-9 items-center gap-2 border-r border-border px-3 text-xs transition-colors",
                activeTab === tab.name
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.modified && <Circle className="h-1.5 w-1.5 fill-primary text-primary" />}
              <span>{tab.name}</span>
              <X className="h-3 w-3 opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity" />
            </button>
          ))}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex h-7 items-center gap-1 border-b border-border bg-card/50 px-3 text-xs text-muted-foreground">
        <span>src</span>
        <ChevronRight className="h-3 w-3" />
        <span>hooks</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{activeTab}</span>
      </div>

      {/* Code */}
      <div className="relative flex-1 overflow-auto">
        <pre className="p-3 font-mono text-[13px] leading-5 text-foreground">
          <code>{highlightSyntax(codeContent)}</code>
        </pre>

        {/* AI Suggestion */}
        {showAiSuggestion && (
          <div className="absolute bottom-3 right-3 left-3 max-w-sm ml-auto">
            <div className="rounded-lg border border-primary/30 bg-card/95 backdrop-blur p-2.5 shadow-lg">
              <div className="flex items-start gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/20">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-primary font-medium">Grok:</span> Add try/catch to signIn for better error handling
                  </p>
                  <div className="flex items-center gap-2">
                    <button className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      Apply
                    </button>
                    <button
                      onClick={() => setShowAiSuggestion(false)}
                      className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
