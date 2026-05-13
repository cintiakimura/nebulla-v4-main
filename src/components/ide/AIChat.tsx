import { useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  Circle,
  Hand,
  Loader2,
  Mic,
  Paperclip,
  Rocket,
  Send,
  User,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

const initialMessages: Message[] = [
  {
    id: 1,
    role: 'user',
    content: 'Can you help me add authentication to this app?',
    timestamp: '2:34 PM',
  },
  {
    id: 2,
    role: 'assistant',
    content:
      "I'd be happy to help! I notice you already have a useAuth hook. Let me analyze your setup and suggest the best approach.\n\nI recommend:\n1. Adding session management\n2. Implementing protected routes\n3. Creating login/signup forms",
    timestamp: '2:34 PM',
  },
  {
    id: 3,
    role: 'user',
    content: 'Yes, please start with session management',
    timestamp: '2:35 PM',
  },
];

const models = [
  { id: 'grok-4.1', name: 'Grok 4.1' },
  { id: 'grok-3', name: 'Grok 3' },
];

type AgentStatus = 'idle' | 'running' | 'done';

type Agent = {
  id: string;
  name: string;
  task: string;
  status: AgentStatus;
};

const swarmAgents: Agent[] = [
  { id: 'a1', name: 'Planner', task: 'Analyzing auth requirements', status: 'done' },
  { id: 'a2', name: 'Coder', task: 'Generating session middleware', status: 'running' },
  { id: 'a3', name: 'Reviewer', task: 'Waiting for code output', status: 'idle' },
  { id: 'a4', name: 'Tester', task: 'Waiting for review', status: 'idle' },
];

function AgentStatusIcon({ status }: { status: AgentStatus }) {
  if (status === 'done') return <Check className="h-3 w-3 text-[#3FB950]" />;
  if (status === 'running') return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
  return <Circle className="h-3 w-3 text-muted-foreground/40" />;
}

function SoundWaveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-[18px] w-[18px]', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 9v6" />
      <path d="M12 6v12" />
      <path d="M16 10v4" />
    </svg>
  );
}

function ChatRoundButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="btn-secondary-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[background-color,box-shadow,color] duration-300 ease-out hover:text-foreground hover:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)]"
    >
      {children}
    </button>
  );
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('grok-4.1');
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [agentsEnabled, setAgentsEnabled] = useState(true);
  const [isAgentsOpen, setIsAgentsOpen] = useState(false);
  const [swarmOpen, setSwarmOpen] = useState(true);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        role: 'user',
        content: input.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      },
    ]);
    setInput('');
  };

  const handleGo = () => {
    handleSend();
  };

  return (
    <div className="surface-active tonal-seam-l flex h-full flex-col">
      <div className="tonal-seam-b flex h-9 shrink-0 items-center gap-2 px-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsModelOpen(!isModelOpen)}
            className="btn-secondary-surface type-label-sm flex items-center gap-1.5 rounded px-2 py-1 text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
            {models.find((m) => m.id === selectedModel)?.name}
            <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', isModelOpen && 'rotate-180')} />
          </button>
          {isModelOpen && (
            <div className="elevation-popover absolute left-0 top-full z-50 mt-1 min-w-[120px] rounded-md p-1">
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    setSelectedModel(model.id);
                    setIsModelOpen(false);
                  }}
                  className={cn(
                    'btn-secondary-surface type-label-sm flex w-full rounded px-2 py-1 text-left',
                    selectedModel === model.id && 'active-tab-sheen text-primary',
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsAgentsOpen(!isAgentsOpen)}
            className={cn(
              'btn-secondary-surface type-label-sm flex items-center gap-1.5 rounded px-2 py-1 transition-colors duration-300 ease-out',
              agentsEnabled ? 'active-tab-sheen text-primary' : 'text-muted-foreground',
            )}
          >
            <Zap className="h-3 w-3" />
            Agents
            <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', isAgentsOpen && 'rotate-180')} />
          </button>
          {isAgentsOpen && (
            <div className="elevation-popover absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-md p-1">
              <button
                type="button"
                onClick={() => {
                  setAgentsEnabled(true);
                  setIsAgentsOpen(false);
                }}
                className={cn(
                  'btn-secondary-surface type-label-sm flex w-full rounded px-2 py-1 text-left',
                  agentsEnabled && 'active-tab-sheen text-primary',
                )}
              >
                Enable Agents
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgentsEnabled(false);
                  setIsAgentsOpen(false);
                }}
                className={cn(
                  'btn-secondary-surface type-label-sm flex w-full rounded px-2 py-1 text-left',
                  !agentsEnabled && 'active-tab-sheen text-primary',
                )}
              >
                Disable Agents
              </button>
            </div>
          )}
        </div>
      </div>

      {agentsEnabled && (
        <div className="tonal-seam-b shrink-0">
          <button
            type="button"
            onClick={() => setSwarmOpen(!swarmOpen)}
            className="btn-secondary-surface type-label-sm flex h-8 w-full items-center justify-between px-3 text-muted-foreground"
          >
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/80" />
              Swarm Status
            </div>
            <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', swarmOpen && 'rotate-180')} />
          </button>

          {swarmOpen && (
            <div className="flex flex-col gap-0.5 px-3 pb-2">
              {swarmAgents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2 py-1">
                  <AgentStatusIcon status={agent.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="type-label-sm text-foreground" style={{ fontWeight: 500 }}>
                        {agent.name}
                      </span>
                      <span
                        className={cn(
                          'type-label-sm rounded-full px-1.5 py-px',
                          agent.status === 'done' && 'bg-[#3FB950]/15 text-[#3FB950]',
                          agent.status === 'running' && 'active-tab-sheen text-primary',
                          agent.status === 'idle' && 'text-muted-foreground',
                        )}
                      >
                        {agent.status}
                      </span>
                    </div>
                    <p className="type-label-sm truncate opacity-90">{agent.task}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-auto p-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex gap-2', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
          >
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                message.role === 'user' ? 'surface-float' : 'active-tab-sheen text-primary',
              )}
            >
              {message.role === 'user' ? (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <div className={cn('max-w-[85%]', message.role === 'user' ? 'text-right' : 'text-left')}>
              <div
                className={cn(
                  'type-body-md inline-block rounded-lg px-3 py-2',
                  message.role === 'user' ? 'surface-float text-primary' : 'surface-active text-foreground',
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              <p className="type-label-sm mt-0.5 opacity-80">{message.timestamp}</p>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <div className="active-tab-sheen flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="surface-active flex items-center gap-1 rounded-lg px-3 py-2">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </div>
        </div>
      </div>

      <div className="tonal-seam-t shrink-0 p-3">
        <div className="surface-float rounded-lg border border-transparent p-2 ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[box-shadow,background-color] duration-300 ease-out focus-within:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message Nebula Partner..."
            rows={3}
            className="type-body-md min-h-[4.5rem] w-full resize-y bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <ChatRoundButton label="Voice activity">
                <SoundWaveIcon />
              </ChatRoundButton>
              <ChatRoundButton label="Stop / raise hand">
                <Hand className="h-[18px] w-[18px]" />
              </ChatRoundButton>
              <ChatRoundButton label="Microphone">
                <Mic className="h-[18px] w-[18px]" />
              </ChatRoundButton>
            </div>

            <div className="flex items-center gap-1.5">
              <ChatRoundButton label="Attach file">
                <Paperclip className="h-[18px] w-[18px]" />
              </ChatRoundButton>
              <button
                type="button"
                onClick={handleGo}
                disabled={!input.trim()}
                className="btn-primary-cta flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.8125rem]"
              >
                <Rocket className="h-3.5 w-3.5" />
                Go
              </button>
              <ChatRoundButton label="Send message" onClick={handleSend}>
                <Send className="h-[18px] w-[18px]" />
              </ChatRoundButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
