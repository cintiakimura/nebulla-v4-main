"use client";

import { useState } from "react";
import {
  Send,
  Sparkles,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  Circle,
  Check,
  Loader2,
  Zap,
  AudioWaveform,
  Hand,
  Mic,
  Paperclip,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type Agent = {
  id: string;
  name: string;
  status: "idle" | "running" | "completed";
  task?: string;
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
    content:
      "I'd be happy to help you add authentication! I notice you already have a useAuth hook. Let me analyze your current setup and suggest the best approach.\n\nBased on your code, I recommend:\n1. Adding session management\n2. Implementing protected routes\n3. Creating login/signup forms\n\nWould you like me to start implementing these?",
    timestamp: "2:34 PM",
  },
  {
    id: 3,
    role: "user",
    content: "Yes, please start with the session management",
    timestamp: "2:35 PM",
  },
];

const agents: Agent[] = [
  { id: "1", name: "Code Analyzer", status: "completed", task: "Analyzed codebase structure" },
  { id: "2", name: "Auth Expert", status: "running", task: "Implementing session logic" },
  { id: "3", name: "Security Agent", status: "idle" },
  { id: "4", name: "Test Generator", status: "idle" },
];

function SwarmStatus() {
  const [isExpanded, setIsExpanded] = useState(true);
  const activeAgents = agents.filter((a) => a.status !== "idle").length;

  return (
    <div className="border-t border-sidebar-border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Swarm Status
          </span>
          <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
            {activeAgents} active
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="space-y-1 px-3 pb-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                agent.status === "running" && "bg-primary/10"
              )}
            >
              <div className="relative">
                <Circle
                  className={cn(
                    "h-2 w-2",
                    agent.status === "idle" && "fill-muted-foreground/30 text-muted-foreground/30",
                    agent.status === "running" && "fill-primary text-primary animate-pulse",
                    agent.status === "completed" && "fill-accent text-accent"
                  )}
                />
              </div>
              <span
                className={cn(
                  "flex-1 truncate",
                  agent.status === "idle" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {agent.name}
              </span>
              {agent.status === "running" && (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              )}
              {agent.status === "completed" && (
                <Check className="h-3 w-3 text-accent" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;

    const newMessage: Message = {
      id: messages.length + 1,
      role: "user",
      content: input,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
    };

    setMessages([...messages, newMessage]);
    setInput("");
  };

  return (
    <div className="flex h-full flex-col bg-sidebar border-l border-sidebar-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3 backdrop-blur-md bg-sidebar/80">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent shadow-md shadow-primary/40">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">Chat with Grok</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-accent shadow-md shadow-accent/50 animate-pulse" />
          <span className="text-xs text-accent">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                message.role === "user"
                  ? "bg-primary/20"
                  : "bg-gradient-to-br from-primary to-accent"
              )}
            >
              {message.role === "user" ? (
                <User className="h-4 w-4 text-primary" />
              ) : (
                <Bot className="h-4 w-4 text-primary-foreground shadow-sm" />
              )}
            </div>
            <div
              className={cn(
                "max-w-[85%] space-y-1",
                message.role === "user" ? "text-right" : "text-left"
              )}
            >
              <div
                className={cn(
                  "inline-block rounded-lg px-3 py-2 text-sm shadow-md",
                  message.role === "user"
                    ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-primary/20"
                    : "bg-muted/60 text-foreground shadow-primary/10 backdrop-blur-sm"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">{message.timestamp}</p>
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        <div className="flex gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Swarm Status */}
      <SwarmStatus />

      {/* Input */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-lg border border-input bg-input/50 px-3 py-2 focus-within:border-primary transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Grok anything..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        
        {/* Action Buttons Row */}
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Voice input"
          >
            <AudioWaveform className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Hand raise"
          >
            <Hand className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Microphone"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border-2 border-primary bg-secondary/50 px-4 text-primary hover:bg-primary/10 transition-colors font-medium text-sm"
            title="Quick action"
          >
            <Rocket className="h-4 w-4" />
            Go
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Grok can make mistakes. Review important info.
        </p>
      </div>
    </div>
  );
}
