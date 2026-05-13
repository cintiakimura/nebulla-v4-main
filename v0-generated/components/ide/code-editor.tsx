"use client";

import { useState } from "react";
import { X, Circle, MoreHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "App.tsx", modified: false },
  { name: "useAuth.ts", modified: true },
  { name: "api.ts", modified: false },
];

const codeContent = `import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { Button } from './components/Button';
import { Card } from './components/Card';

export default function App() {
  const { user, isLoading } = useAuth();
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (user) {
      fetchTasks(user.id).then(setTasks);
    }
  }, [user]);

  const handleCreateTask = async (title: string) => {
    const newTask = await createTask({ title, userId: user.id });
    setTasks(prev => [...prev, newTask]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />
      <main className="container mx-auto py-8">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">
            Welcome, {user?.name ?? 'Guest'}
          </h1>
          <TaskList tasks={tasks} />
          <Button onClick={() => handleCreateTask('New Task')}>
            Add Task
          </Button>
        </Card>
      </main>
    </div>
  );
}`;

function highlightSyntax(code: string) {
  const lines = code.split("\n");
  return lines.map((line, lineIndex) => {
    let highlighted = line;

    // Keywords
    highlighted = highlighted.replace(
      /\b(import|from|export|default|function|const|let|var|if|else|return|async|await|new)\b/g,
      '<span class="text-[#c678dd]">$1</span>'
    );

    // Strings
    highlighted = highlighted.replace(
      /(['"`])((?:\\.|[^\\])*?)\1/g,
      '<span class="text-[#98c379]">$1$2$1</span>'
    );

    // Functions
    highlighted = highlighted.replace(
      /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
      '<span class="text-[#61afef]">$1</span>'
    );

    // JSX tags
    highlighted = highlighted.replace(
      /(<\/?)([\w]+)/g,
      '$1<span class="text-[#e06c75]">$2</span>'
    );

    // Types after :
    highlighted = highlighted.replace(
      /:\s*([A-Z][a-zA-Z0-9]*)/g,
      ': <span class="text-[#e5c07b]">$1</span>'
    );

    // Comments
    highlighted = highlighted.replace(
      /(\/\/.*$)/g,
      '<span class="text-[#5c6370] italic">$1</span>'
    );

    // Brackets and operators
    highlighted = highlighted.replace(
      /([{}[\]()=>])/g,
      '<span class="text-muted-foreground">$1</span>'
    );

    return (
      <div key={lineIndex} className="flex">
        <span className="inline-block w-12 pr-4 text-right text-muted-foreground/50 select-none shrink-0">
          {lineIndex + 1}
        </span>
        <span
          className="flex-1"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </div>
    );
  });
}

export function CodeEditor() {
  const [activeTab, setActiveTab] = useState("App.tsx");
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tabs */}
      <div className="flex items-center border-b border-border bg-card">
        <div className="flex flex-1 items-center overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={cn(
                "group flex items-center gap-2 border-r border-border px-4 py-2 text-sm transition-colors",
                activeTab === tab.name
                  ? "bg-background text-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted/30"
              )}
            >
              {tab.modified && (
                <Circle className="h-2 w-2 fill-accent text-accent" />
              )}
              <span>{tab.name}</span>
              <X className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity" />
            </button>
          ))}
        </div>
        <button className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 border-b border-border bg-card/50 px-4 py-1.5 text-xs text-muted-foreground">
        <span>src</span>
        <span>/</span>
        <span className="text-foreground">{activeTab}</span>
      </div>

      {/* Code Content */}
      <div className="relative flex-1 overflow-auto">
        <pre className="p-4 font-mono text-sm leading-6 text-foreground">
          <code>{highlightSyntax(codeContent)}</code>
        </pre>

        {/* AI Suggestion Overlay */}
        {showAiSuggestion && (
          <div className="absolute bottom-4 right-4 left-4 max-w-md ml-auto">
            <div className="rounded-lg border border-primary/40 bg-gradient-to-br from-primary/8 to-accent/5 p-3 backdrop-blur-xl shadow-lg shadow-primary/20">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/30 shadow-md shadow-primary/50">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-primary font-medium">
                      Grok suggests:
                    </span>{" "}
                    Add error handling to fetchTasks to prevent silent failures
                  </p>
                  <div className="flex items-center gap-2">
                    <button className="rounded-md bg-gradient-to-r from-primary to-primary/80 px-2.5 py-1 text-xs font-medium text-primary-foreground hover:from-primary/90 hover:to-primary/70 transition-all shadow-md shadow-primary/30">
                      Apply
                    </button>
                    <button
                      onClick={() => setShowAiSuggestion(false)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
