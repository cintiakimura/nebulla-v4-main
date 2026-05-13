"use client";

import { useState } from "react";
import { Send, Bot, User, ChevronDown, Paperclip, Mic, Zap, Circle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

const initialMessages: Message[] = [
  {
    id: 1,
    role: "user",
    content: "Can you help me add authentication to this app?",
    timestamp: "2:34 PM",
  },
  {
    id: 2,
    role: "assistant",
    content: "I'd be happy to help! I notice you already have a useAuth hook. Let me analyze your setup and suggest the best approach.\n\nI recommend:\n1. Adding session management\n2. Implementing protected routes\n3. Creating login/signup forms",
    timestamp: "2:34 PM",
  },
  {
    id: 3,
    role: "user",
    content: "Yes, please start with session management",
    timestamp: "2:35 PM",
  },
];

const models = [
  { id: "grok-4.1", name: "Grok 4.1" },
  { id: "grok-3",   name: "Grok 3"   },
];

type AgentStatus = "idle" | "running" | "done";

type Agent = {
  id: string;
  name: string;
  task: string;
  status: AgentStatus;
};

const swarmAgents: Agent[] = [
  { id: "a1", name: "Planner",    task: "Analyzing auth requirements",   status: "done"    },
  { id: "a2", name: "Coder",      task: "Generating session middleware",  status: "running" },
  { id: "a3", name: "Reviewer",   task: "Waiting for code output",       status: "idle"    },
  { id: "a4", name: "Tester",     task: "Waiting for review",            status: "idle"    },
];

function AgentStatusIcon({ status }: { status: AgentStatus }) {
  if (status === "done")    return <Check    className="h-3 w-3 text-[#3FB950]" />;
  if (status === "running") return <Loader2  className="h-3 w-3 animate-spin text-primary" />;
  return                           <Circle   className="h-3 w-3 text-muted-foreground/40" />;
}

export function AIChat() {
  const [messages, setMessages]       = useState<Message[]>(initialMessages);
  const [input, setInput]             = useState("");
  const [selectedModel, setSelectedModel] = useState("grok-4.1");
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [agentsEnabled, setAgentsEnabled] = useState(true);
  const [isAgentsOpen, setIsAgentsOpen]   = useState(false);
  const [swarmOpen, setSwarmOpen]     = useState(true);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        role: "user",
        content: input,
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      },
    ]);
    setInput("");
  };

  return (
    <div className="flex h-full flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        {/* Model Selector */}
        <div className="relative">
          <button
            onClick={() => setIsModelOpen(!isModelOpen)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            {models.find((m) => m.id === selectedModel)?.name}
            <ChevronDown className={cn("h-3 w-3 transition-transform", isModelOpen && "rotate-180")} />
          </button>
          {isModelOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[120px] rounded border border-border bg-popover p-1 shadow-lg">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => { setSelectedModel(model.id); setIsModelOpen(false); }}
                  className={cn(
                    "flex w-full rounded px-2 py-1 text-xs hover:bg-muted transition-colors",
                    selectedModel === model.id && "bg-primary/10 text-primary"
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Agents Toggle — same size as model selector */}
        <div className="relative">
          <button
            onClick={() => setIsAgentsOpen(!isAgentsOpen)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              agentsEnabled
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Zap className="h-3 w-3" />
            Agents
            <ChevronDown className={cn("h-3 w-3 transition-transform", isAgentsOpen && "rotate-180")} />
          </button>
          {isAgentsOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded border border-border bg-popover p-1 shadow-lg">
              <button
                onClick={() => { setAgentsEnabled(true); setIsAgentsOpen(false); }}
                className={cn("flex w-full rounded px-2 py-1 text-xs hover:bg-muted transition-colors", agentsEnabled && "bg-primary/10 text-primary")}
              >
                Enable Agents
              </button>
              <button
                onClick={() => { setAgentsEnabled(false); setIsAgentsOpen(false); }}
                className={cn("flex w-full rounded px-2 py-1 text-xs hover:bg-muted transition-colors", !agentsEnabled && "bg-primary/10 text-primary")}
              >
                Disable Agents
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Swarm Status — collapsible */}
      {agentsEnabled && (
        <div className="shrink-0 border-b border-border">
          <button
            onClick={() => setSwarmOpen(!swarmOpen)}
            className="flex h-8 w-full items-center justify-between px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Swarm Status
            </div>
            <ChevronDown className={cn("h-3 w-3 transition-transform", swarmOpen && "rotate-180")} />
          </button>

          {swarmOpen && (
            <div className="flex flex-col gap-0.5 pb-2 px-3">
              {swarmAgents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2 py-1">
                  <AgentStatusIcon status={agent.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-foreground">{agent.name}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-px text-[9px] font-medium",
                          agent.status === "done"    && "bg-[#3FB950]/15 text-[#3FB950]",
                          agent.status === "running" && "bg-primary/15 text-primary",
                          agent.status === "idle"    && "bg-muted text-muted-foreground"
                        )}
                      >
                        {agent.status}
                      </span>
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground">{agent.task}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex gap-2", message.role === "user" ? "flex-row-reverse" : "flex-row")}
          >
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                message.role === "user"
                  ? "bg-muted"
                  : "bg-gradient-to-br from-primary to-accent"
              )}
            >
              {message.role === "user" ? (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-primary-foreground" />
              )}
            </div>
            <div className={cn("max-w-[85%]", message.role === "user" ? "text-right" : "text-left")}>
              <div
                className={cn(
                  "inline-block rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{message.timestamp}</p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        <div className="flex gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <Bot className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-primary/50 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Grok..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <div className="flex items-center gap-1">
            <button className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Paperclip className="h-4 w-4" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Mic className="h-4 w-4" />
            </button>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
