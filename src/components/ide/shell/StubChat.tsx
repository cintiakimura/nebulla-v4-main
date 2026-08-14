import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

/**
 * Layout-friendly chat for the Build screen (UI lab).
 * Seeds with the Start goal; no API required when keys are missing.
 */
export function StubChat({
  seedGoal,
  className,
}: {
  seedGoal?: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const seededRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const goal = seedGoal?.trim();
    if (!goal || seededRef.current === goal) return;
    seededRef.current = goal;
    setMessages([
      {
        id: `goal-${Date.now()}`,
        role: 'user',
        content: goal,
      },
      {
        id: `ack-${Date.now()}`,
        role: 'assistant',
        content:
          'Got it — that is your goal for this workspace. (Stub chat on this UI lab branch — connect Grok later for live replies.)',
      },
    ]);
  }, [seedGoal]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: text },
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: 'Noted. Stub reply — layout only on this branch.',
      },
    ]);
  }, [input]);

  const toggleMic = useCallback(() => {
    type Rec = {
      lang: string;
      interimResults: boolean;
      onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const w = window as Window & {
      SpeechRecognition?: new () => Rec;
      webkitSpeechRecognition?: new () => Rec;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setInput((v) => (v ? v : '[Voice not supported in this browser]'));
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript?.trim();
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }, [listening]);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Message Nebulla about your build…</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'type-body-md max-w-[95%] rounded-lg px-3 py-2',
                m.role === 'user'
                  ? 'ml-auto border border-border text-foreground'
                  : 'mr-auto text-muted-foreground',
              )}
            >
              {m.content}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="ide-glass-chrome shrink-0 border-t border-border p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Message Nebulla…"
            className="ide-glass-input min-h-[2.75rem] w-full resize-none rounded-md px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            title={listening ? 'Stop listening' : 'Voice input'}
            aria-label={listening ? 'Stop listening' : 'Voice input'}
            onClick={toggleMic}
            className={cn(
              'btn-secondary-surface btn-icon shrink-0',
              listening && 'border-[var(--shell-border-strong)] text-foreground',
            )}
          >
            <Mic className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            title="Send"
            aria-label="Send"
            onClick={send}
            className="btn-cyan btn-icon shrink-0"
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
