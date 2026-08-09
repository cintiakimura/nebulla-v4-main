import { useCallback, useRef, useState } from 'react';
import { Mic, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  readStoredShellGoal,
  readStoredStartType,
  writeStoredStartType,
  type IdeStartProjectType,
} from '../lib/ideShellScreens';
import { continueFromLandingGoal } from '../lib/landingGoalHandoff';

const TYPES: { id: NonNullable<IdeStartProjectType>; label: string }[] = [
  { id: 'Web App', label: 'Web app' },
  { id: 'Mobile App', label: 'Mobile' },
  { id: 'Landing Page', label: 'Landing' },
];

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/**
 * Hero goal composer — layout restored; Continue still runs agent handoff.
 */
export function LandingHeroPrompt({ className }: { className?: string }) {
  const [draft, setDraft] = useState(() => readStoredShellGoal());
  const [startType, setStartType] = useState<IdeStartProjectType>(() => readStoredStartType());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const onContinue = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await continueFromLandingGoal(draft, startType);
      if (!result.ok) setError(result.error);
    } catch {
      setError('Could not continue. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, draft, startType]);

  const toggleType = useCallback((id: NonNullable<IdeStartProjectType>) => {
    setStartType((prev) => {
      const next = prev === id ? null : id;
      writeStoredStartType(next);
      return next;
    });
  }, []);

  const toggleMic = useCallback(() => {
    const w = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setError('Voice input is not supported in this browser.');
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
      if (transcript) {
        setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setError('');
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    setError('');
    rec.start();
  }, [listening]);

  return (
    <div className={cn('mx-auto flex w-full max-w-3xl flex-col items-center gap-5', className)}>
      <div className="ide-glass-card w-full overflow-hidden rounded-2xl">
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void onContinue();
            }
          }}
          rows={5}
          placeholder="Describe what you want to build…"
          disabled={busy}
          className="ide-glass-input min-h-[9rem] w-full resize-none border-0 bg-transparent px-5 py-5 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 md:min-h-[11rem] md:px-6 md:py-6 md:text-lg"
          aria-label="Project goal"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={startType === t.id}
                onClick={() => toggleType(t.id)}
                className={cn(
                  'btn-cyan rounded-lg px-3 py-1.5 text-xs',
                  startType === t.id ? 'opacity-100' : 'opacity-65',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              title={listening ? 'Stop listening' : 'Voice input'}
              aria-label={listening ? 'Stop listening' : 'Voice input'}
              onClick={toggleMic}
              disabled={busy}
              className={cn(
                'btn-secondary-surface inline-flex h-10 w-10 items-center justify-center rounded-lg',
                listening && 'text-cyan-300',
              )}
            >
              <Mic className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              title="Build"
              aria-label="Build"
              disabled={busy}
              onClick={() => void onContinue()}
              className="btn-cyan inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden />
              {busy ? 'Starting…' : 'Build'}
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="text-center text-xs text-muted-foreground">{error}</p> : null}
    </div>
  );
}
