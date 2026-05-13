import { useState } from 'react';
import { ChevronRight, Circle, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { name: 'page.tsx', modified: false },
  { name: 'useAuth.ts', modified: true },
  { name: 'api.ts', modified: false },
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
  const lines = code.split('\n');
  return lines.map((line, lineIndex) => {
    let highlighted = line;

    highlighted = highlighted.replace(
      /\b(import|from|export|default|function|const|let|var|if|else|return|async|await|type|interface|throw|new)\b/g,
      '<span class="text-[#FF7B72]">$1</span>',
    );

    highlighted = highlighted.replace(
      /(['"`])((?:\\.|[^\\])*?)\1/g,
      '<span class="text-[#A5D6FF]">$1$2$1</span>',
    );

    highlighted = highlighted.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, '<span class="text-[#D2A8FF]">$1</span>');

    highlighted = highlighted.replace(/:\s*([A-Z][a-zA-Z0-9<>|]*)/g, ': <span class="text-[#79C0FF]">$1</span>');

    highlighted = highlighted.replace(/(\/\/.*$)/g, '<span class="text-[#6E7681] italic">$1</span>');

    highlighted = highlighted.replace(/\b(null|undefined|true|false)\b/g, '<span class="text-[#79C0FF]">$1</span>');

    return (
      <div key={lineIndex} className="flex transition-colors hover:bg-muted/30">
        <span className="type-label-sm inline-block w-12 shrink-0 select-none pr-4 text-right opacity-50">
          {lineIndex + 1}
        </span>
        <span className="flex-1" dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }} />
      </div>
    );
  });
}

export function CodeEditor() {
  const [activeTab, setActiveTab] = useState('useAuth.ts');
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="surface-active tonal-seam-b flex h-9 items-center">
        <div className="flex items-center overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setActiveTab(tab.name)}
              className={cn(
                'group flex h-9 items-center gap-2 px-3 transition-colors duration-300 ease-out',
                activeTab === tab.name
                  ? 'active-tab-sheen type-title-sm text-primary'
                  : 'type-title-sm text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.modified && <Circle className="h-1.5 w-1.5 fill-primary text-primary" />}
              <span>{tab.name}</span>
              <X className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground" />
            </button>
          ))}
        </div>
      </div>

      <div className="surface-active flex h-7 items-center gap-1 px-3">
        <span className="type-label-sm">src</span>
        <ChevronRight className="type-label-sm h-3 w-3" />
        <span className="type-label-sm">hooks</span>
        <ChevronRight className="type-label-sm h-3 w-3" />
        <span className="type-title-sm text-primary">{activeTab}</span>
      </div>

      <div className="relative flex-1 overflow-auto">
        <pre className="type-body-md p-3 font-mono leading-relaxed text-foreground">
          <code>{highlightSyntax(codeContent)}</code>
        </pre>

        {showAiSuggestion && (
          <div className="absolute bottom-3 left-3 right-3 ml-auto max-w-sm">
            <div className="surface-float rounded-lg p-2.5">
              <div className="flex items-start gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/15">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="type-body-md text-muted-foreground">
                    <span className="text-primary" style={{ fontWeight: 500 }}>
                      Grok:
                    </span>{' '}
                    Add try/catch to signIn for better error handling
                  </p>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn-primary-cta rounded-md px-2.5 py-1 text-[10px]">
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAiSuggestion(false)}
                      className="btn-secondary-surface rounded-md px-2 py-1 text-[10px] text-muted-foreground"
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
