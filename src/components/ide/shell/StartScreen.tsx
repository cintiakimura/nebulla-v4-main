import { useCallback, useRef, useState } from 'react';
import { FolderOpen, Github, MessageCircle, Mic, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIdeShellNav } from './IdeShellNavContext';
import type { IdeStartProjectType } from '../../../lib/ideShellScreens';

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

export function StartScreen({
  onOpenLocalFile,
  onOpenGitHub,
}: {
  onOpenLocalFile?: () => void;
  onOpenGitHub?: () => void;
}) {
  const { goal, startType, setStartType, submitGoal, goToBuild } = useIdeShellNav();
  const [draft, setDraft] = useState(goal);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const onSend = useCallback(() => {
    const ok = submitGoal(draft);
    if (!ok) {
      setError('Add a short goal to continue.');
      return;
    }
    setError('');
  }, [draft, submitGoal]);

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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 sm:px-8">
      <div className="ide-glass-card w-full max-w-2xl space-y-5 rounded-2xl p-6 sm:p-8">
        <div className="space-y-2 text-center sm:text-left">
          <h1 className="font-headline text-2xl font-normal text-foreground sm:text-3xl">
            What are we building?
          </h1>
          <p className="text-sm text-muted-foreground">
            Just goal of your idea is enough — type in a few words or brainstorm using the mic
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={startType === t.id}
              onClick={() => setStartType(startType === t.id ? null : t.id)}
              className={cn(
                'btn-cyan rounded-lg px-3 py-1.5 text-xs',
                startType === t.id ? 'opacity-100' : 'opacity-70',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={5}
          placeholder="e.g. A mobile education app for kids to practice reading…"
          className="ide-glass-input w-full resize-y rounded-xl px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
          aria-label="Project goal"
        />

        {error ? <p className="text-xs text-rose-300">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Open existing file"
              aria-label="Open existing file"
              onClick={onOpenLocalFile}
              className="btn-cyan inline-flex h-9 w-9 items-center justify-center rounded-lg"
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              title="Open from GitHub"
              aria-label="Open from GitHub"
              onClick={onOpenGitHub}
              className="btn-cyan inline-flex h-9 w-9 items-center justify-center rounded-lg"
            >
              <Github className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              title="Just chat"
              aria-label="Just chat"
              onClick={() => {
                if (draft.trim()) submitGoal(draft);
                else goToBuild();
              }}
              className="btn-cyan inline-flex h-9 w-9 items-center justify-center rounded-lg"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title={listening ? 'Stop listening' : 'Voice input'}
              aria-label={listening ? 'Stop listening' : 'Voice input'}
              onClick={toggleMic}
              className={cn(
                'btn-secondary-surface inline-flex h-10 w-10 items-center justify-center rounded-lg',
                listening && 'text-cyan-300',
              )}
            >
              <Mic className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              title="Continue to Build"
              aria-label="Continue to Build"
              onClick={onSend}
              className="btn-cyan inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm"
            >
              <Send className="h-4 w-4" aria-hidden />
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
