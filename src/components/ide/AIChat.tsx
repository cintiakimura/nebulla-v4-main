import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  ChevronDown,
  Hand,
  Mic,
  Paperclip,
  Rocket,
  Send,
  User,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUserCapabilities } from '@/lib/user-tier';
import { fetchSessionUser } from '../../lib/nebulaCloud';
import { getBrowserProjectName } from '../../lib/nebulaProjectApi';
import { sendIdeAssistantGrokTurn } from '../../lib/ideAssistantGrokChat';
import { ideContextSnippetForChat, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { buildIdeSwarmFocusFromEditor } from '../../lib/ideSwarmFocus';
import { useSwarm } from '../swarm/SwarmProvider';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

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
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="btn-secondary-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[background-color,box-shadow,color] duration-300 ease-out hover:text-foreground hover:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)] disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const modelLabel: Record<string, string> = {
  'grok-4.1': 'Grok 4.1',
  'grok-3': 'Grok 3',
};

export function AIChat() {
  const { chatModel, activePath, activeTab } = useIdeWorkspace();
  const swarm = useSwarm();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [swarmOpen, setSwarmOpen] = useState(true);
  const [accessoryHint, setAccessoryHint] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    setSendError(null);
  }, [activePath]);

  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setSendError(null);

    const projectName = getBrowserProjectName().trim() || 'Untitled project';
    const ideAppendix = ideContextSnippetForChat(activePath, activeTab?.content ?? '');

    const historyForApi = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    })) as { role: 'user' | 'assistant'; content: string }[];

    const session = await fetchSessionUser();
    const userId = session?.uid?.trim() || 'anonymous';
    const agentsEnabledForTier = getUserCapabilities({ tier: session?.billingTier }).agentsEnabled;

    const swarmFocus = buildIdeSwarmFocusFromEditor(
      activePath,
      activeTab?.content ?? '',
      Boolean(activeTab?.loading),
    );

    try {
      const { assistantContent } = await sendIdeAssistantGrokTurn({
        textToSend: text,
        history: historyForApi,
        userId,
        projectName,
        chatModel,
        ideAppendix,
        agentsEnabledForTier,
        swarmFocus,
        swarm: {
          isEnabled: swarm.isEnabled,
          currentPhase: swarm.currentPhase,
          intensity: swarm.intensity,
          startSwarm: swarm.startSwarm,
          addActivity: swarm.addActivity,
          setCurrentPhase: swarm.setCurrentPhase,
          finishSwarm: swarm.finishSwarm,
        },
      });
      const raw = assistantContent.trim();
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: raw || '(Empty response)',
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSendError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: `Request failed: ${msg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, chatModel, activePath, activeTab?.content, activeTab?.loading, swarm]);

  const handleGo = () => {
    void sendChat();
  };

  return (
    <div className="surface-active tonal-seam-l flex h-full flex-col">
      <div className="tonal-seam-b flex h-9 shrink-0 flex-wrap items-center gap-2 px-3">
        <div className="type-label-sm flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
          Model: <span className="text-foreground">{modelLabel[chatModel] ?? chatModel}</span>
          <span className="text-muted-foreground/80">(top bar)</span>
        </div>

        <div className="type-label-sm flex items-center gap-1.5 rounded px-2 py-1 text-muted-foreground">
          <Zap className="h-3 w-3 text-primary/80" />
          <span>Lean swarm · planning in chat</span>
        </div>
      </div>

      {accessoryHint ? (
        <p className="type-label-sm border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-amber-100/95" role="status">
          {accessoryHint}
        </p>
      ) : null}

      {sendError ? (
        <p className="type-label-sm border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-100/95" role="alert">
          {sendError}
        </p>
      ) : null}

      <div className="tonal-seam-b shrink-0">
        <button
          type="button"
          onClick={() => setSwarmOpen(!swarmOpen)}
          className="btn-secondary-surface type-label-sm flex h-8 w-full items-center justify-between px-3 text-muted-foreground"
        >
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
            Quality agent
          </div>
          <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', swarmOpen && 'rotate-180')} />
        </button>

        {swarmOpen && (
          <div className="type-label-sm space-y-1.5 px-3 pb-2 leading-relaxed text-muted-foreground">
            <p>
              One support agent — <span className="text-foreground">Quality</span> (code review + test suggestions). It runs when
              you click <span className="text-foreground">Run and Test</span> in the top bar, scoped to the active editor file.
            </p>
            <p>IDE chat below uses Grok with the model selected in the top bar.</p>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 && !sending ? (
          <p className="type-body-md text-muted-foreground leading-relaxed">
            Partner chat: same workflow as Nebula (Master Plan discovery, then coding and UI Studio). The open file and
            master plan are sent automatically. Add your Grok key under <span className="text-foreground/90">Account</span>{' '}
            (top bar) or <span className="text-foreground/90">My Projects → Secrets</span> if chat fails to send.
          </p>
        ) : null}

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

        {sending ? (
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
        ) : null}
      </div>

      <div className="tonal-seam-t shrink-0 p-3">
        <div className="surface-float rounded-lg border border-transparent p-2 ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[box-shadow,background-color] duration-300 ease-out focus-within:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendChat();
              }
            }}
            placeholder="Message Nebula Partner…"
            rows={3}
            disabled={sending}
            className="type-body-md min-h-[4.5rem] w-full resize-y bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <ChatRoundButton
                label="Voice activity"
                onClick={() => {
                  setAccessoryHint('Voice pipeline is handled in the full Nebula Partner assistant.');
                  window.setTimeout(() => setAccessoryHint(null), 3200);
                }}
              >
                <SoundWaveIcon />
              </ChatRoundButton>
              <ChatRoundButton
                label="Raise hand"
                onClick={() => {
                  setAccessoryHint('Hands raised are shown to operators when live session mode is enabled.');
                  window.setTimeout(() => setAccessoryHint(null), 3200);
                }}
              >
                <Hand className="h-[18px] w-[18px]" />
              </ChatRoundButton>
              <ChatRoundButton
                label="Microphone"
                onClick={() => {
                  setAccessoryHint('Mic capture is wired in Nebula Partner (browser permissions).');
                  window.setTimeout(() => setAccessoryHint(null), 3200);
                }}
              >
                <Mic className="h-[18px] w-[18px]" />
              </ChatRoundButton>
            </div>

            <div className="flex items-center gap-1.5">
              <ChatRoundButton
                label="Attach file"
                onClick={() => {
                  setAccessoryHint('Attach files from the full Assistant sidebar in Nebula Partner.');
                  window.setTimeout(() => setAccessoryHint(null), 3200);
                }}
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </ChatRoundButton>
              <button
                type="button"
                onClick={handleGo}
                disabled={!input.trim() || sending}
                className="btn-primary-cta flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] disabled:opacity-40"
              >
                <Rocket className="h-3.5 w-3.5" />
                Go
              </button>
              <ChatRoundButton label="Send message" onClick={() => void sendChat()} disabled={!input.trim() || sending}>
                <Send className="h-[18px] w-[18px]" />
              </ChatRoundButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
